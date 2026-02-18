#!/usr/bin/env tsx
/**
 * Scrape before/after images from Bing (no API key), verify with OpenAI vision,
 * then split into separate before/after images with transparent backgrounds.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... tsx scripts/scrape-before-after.ts botox
 *   OPENAI_API_KEY=sk-... tsx scripts/scrape-before-after.ts --missing
 *   tsx scripts/scrape-before-after.ts --list-missing
 *
 * Requirements:
 *   - OPENAI_API_KEY: OpenAI API key (for vision + image edit)
 *   - cwebp: for PNG -> WebP conversion
 */

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { GoogleGenAI } from '@google/genai'
// import OpenAI from 'openai'
import sharp from 'sharp'

// Track by content hash to avoid duplicates
// rembg used for background removal (via scripts/rembg-remove.py)

const PUBLIC_IMG_DIR = path.join(process.cwd(), 'public', 'img')
const CANDIDATES_BASE = path.join(
	PUBLIC_IMG_DIR,
	process.env.CANDIDATES_DIR ?? 'candidates',
)
const MIN_SIZE_KB = 30 // skip tiny thumbnails
const MAX_CANDIDATES = 40
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '3', 10)

/** Run async tasks with limited concurrency */
async function pMap<T, R>(
	items: T[],
	fn: (item: T, index: number) => Promise<R>,
	concurrency: number,
): Promise<R[]> {
	const results: R[] = []
	let i = 0
	async function next(): Promise<void> {
		const idx = i++
		if (idx >= items.length) return
		results[idx] = await fn(items[idx]!, idx)
		await next()
	}
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () => next()),
	)
	return results
}

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Search queries per service
const SEARCH_QUERIES: Record<string, string> = {
	botox: 'botox before and after real patient photo',
	filler: 'dermal filler before and after real patient',
	skinvive: 'skinvive juvederm before and after results',
	kybella: 'kybella double chin before and after real',
	microneedling: 'microneedling before and after acne scars real',
	semaglutide: 'semaglutide weight loss before and after real patient',
	everesse: 'skin tightening before and after jawline real',
	'laser-hair-removal': 'laser hair removal before and after',
	'skin-revitalization': 'laser skin rejuvenation before and after real',
	'pigmented-lesion-reduction': 'laser dark spot removal before and after',
	'vascular-lesion-reduction':
		'spider vein laser treatment before and after face',
	'hair-loss-prevention-regrowth':
		'microneedling hair loss before and after scalp',
	'botox-forehead-lines': 'botox forehead lines before and after real',
	'botox-frown-lines': 'botox frown lines 11 lines before and after',
	'botox-crows-feet': 'botox crows feet before and after real patient',
	'botox-lip-flip': 'botox lip flip before and after subtle',
	'botox-bunny-lines': 'botox bunny lines nose before and after',
	'botox-gummy-smile': 'botox gummy smile before and after',
	'botox-chin-dimpling': 'botox chin dimpling orange peel before and after',
	'botox-brow-lift': 'botox brow lift before and after subtle',
	'filler-lip-filler': 'lip filler before and after natural real patient',
	'filler-cheek-filler': 'cheek filler before and after real patient',
	'filler-chin-filler': 'chin filler before and after profile',
	'filler-jawline-filler': 'jawline filler before and after real',
	'filler-under-eye-filler': 'under eye filler tear trough before and after',
	'filler-nasolabial-folds': 'nasolabial fold filler before and after real',
	'microneedling-face': 'microneedling face before and after acne scars',
	'microneedling-hair-loss': 'microneedling scalp hair loss before and after',
	tirzepatide: 'tirzepatide zepbound weight loss before and after real',
	jeuveau: 'jeuveau newtox before and after real patient',
	dysport: 'dysport before and after real patient wrinkles',
}

// --- Bing HTML Scraping (no API key) ---

function extractImageUrls(html: string): string[] {
	const urls: string[] = []
	// Bing stores image metadata in m="{...}" attributes on each result.
	const regex = /m="\{[^"]*?murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g
	let match
	while ((match = regex.exec(html)) !== null) {
		const imageUrl = match[1]!
			.replace(/\\u0026/g, '&')
			.replace(/\\\//g, '/')
			.replace(/&amp;/g, '&')
		if (imageUrl.startsWith('http') && !imageUrl.includes('bing.com/th')) {
			urls.push(imageUrl)
		}
	}
	// Fallback: try the raw JSON-style murl pattern
	if (urls.length === 0) {
		const regex2 = /"murl":"(https?:[^"]+?)"/g
		while ((match = regex2.exec(html)) !== null) {
			const imageUrl = match[1]!.replace(/\\u0026/g, '&').replace(/\\\//g, '/')
			if (imageUrl.startsWith('http') && !imageUrl.includes('bing.com/th')) {
				urls.push(imageUrl)
			}
		}
	}
	return urls
}

async function scrapeBingImages(query: string): Promise<string[]> {
	const allUrls: string[] = []
	const seen = new Set<string>()

	// Fetch multiple pages to get enough results
	for (let first = 1; allUrls.length < MAX_CANDIDATES; first += 35) {
		const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&first=${first}`
		const res = await fetch(searchUrl, {
			headers: { 'User-Agent': USER_AGENT },
		})
		if (!res.ok) break
		const html = await res.text()
		const urls = extractImageUrls(html)
		if (urls.length === 0) break

		for (const url of urls) {
			if (!seen.has(url)) {
				seen.add(url)
				allUrls.push(url)
			}
			if (allUrls.length >= MAX_CANDIDATES) break
		}

		// Don't hammer Bing
		await new Promise(r => setTimeout(r, 500))
	}

	return allUrls
}

function md5(buffer: Buffer): string {
	return createHash('md5').update(buffer).digest('hex')
}

/** Hash every existing image file under public/img/ up front */
function getAllExistingHashes(): Set<string> {
	const hashes = new Set<string>()
	if (!fs.existsSync(PUBLIC_IMG_DIR)) return hashes

	function walk(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				walk(full)
			} else if (/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
				hashes.add(md5(fs.readFileSync(full)))
			}
		}
	}

	walk(PUBLIC_IMG_DIR)
	return hashes
}

// Track visited URLs per service so we don't re-fetch on subsequent runs
function getVisitedUrls(candidatesDir: string): Set<string> {
	const file = path.join(candidatesDir, '.visited-urls')
	if (!fs.existsSync(file)) return new Set()
	return new Set(fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean))
}

function markUrlVisited(candidatesDir: string, url: string): void {
	const file = path.join(candidatesDir, '.visited-urls')
	fs.appendFileSync(file, url + '\n')
}

// Global set built once at startup — deduplicates by image content
let knownHashes: Set<string>

function _getKnownHashes(candidatesDir: string): Set<string> {
	const hashFile = path.join(candidatesDir, '.hashes')
	if (!fs.existsSync(hashFile)) return new Set()
	return new Set(fs.readFileSync(hashFile, 'utf-8').split('\n').filter(Boolean))
}

function _addKnownHash(candidatesDir: string, hash: string): void {
	const hashFile = path.join(candidatesDir, '.hashes')
	fs.appendFileSync(hashFile, hash + '\n')
}

function _markUrlDownloaded(candidatesDir: string, url: string): void {
	const urlsFile = path.join(candidatesDir, '.downloaded-urls')
	fs.appendFileSync(urlsFile, url + '\n')
}

async function downloadImage(url: string): Promise<Buffer | null> {
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': USER_AGENT },
			signal: AbortSignal.timeout(15000),
		})
		if (!res.ok) return null
		const ct = res.headers.get('content-type') ?? ''
		if (!ct.includes('image')) return null
		const buf = Buffer.from(await res.arrayBuffer())
		if (buf.length < MIN_SIZE_KB * 1024) return null // too small
		return buf
	} catch {
		return null
	}
}

// --- Helpers ---

function getExistingImages(): Map<string, Set<string>> {
	const result = new Map<string, Set<string>>()
	if (!fs.existsSync(PUBLIC_IMG_DIR)) return result
	for (const dir of fs.readdirSync(PUBLIC_IMG_DIR)) {
		const dirPath = path.join(PUBLIC_IMG_DIR, dir)
		if (!fs.statSync(dirPath).isDirectory()) continue
		result.set(dir, new Set(fs.readdirSync(dirPath)))
	}
	return result
}

function getMissing(): string[] {
	const existing = getExistingImages()
	const missing: string[] = []
	for (const service of Object.keys(SEARCH_QUERIES)) {
		const files = existing.get(service) ?? new Set()
		const hasBefore = ['before.jpg', 'before.webp', 'before.png'].some(f =>
			files.has(f),
		)
		const hasAfter = ['after.jpg', 'after.webp', 'after.png'].some(f =>
			files.has(f),
		)
		if (!hasBefore || !hasAfter) missing.push(service)
	}
	return missing
}

// --- Gemini: Check if image is a before/after side-by-side ---

async function isBeforeAfterImage(
	gemini: GoogleGenAI,
	imageBuffer: Buffer,
): Promise<boolean> {
	const b64 = imageBuffer.toString('base64')

	const response = await gemini.models.generateContent({
		model: 'gemini-2.0-flash',
		contents: [
			{
				role: 'user',
				parts: [
					{
						inlineData: {
							mimeType: 'image/jpeg',
							data: b64,
						},
					},
					{
						text: 'Is this a before-and-after comparison showing two photos of the same person side by side or top/bottom? Answer ONLY "yes" or "no".',
					},
				],
			},
		],
	})

	const answer = response.text?.trim().toLowerCase() ?? ''
	return answer.startsWith('yes')
}

// --- Gemini: isolate one side using image generation ---

const _MAX_RETRIES = 5

/** Cache layout analysis per source image so we don't re-analyze for before+after */
const layoutCache = new Map<
	string,
	{
		orientation: 'horizontal' | 'vertical'
		beforeSide: 'left' | 'right' | 'top' | 'bottom'
	}
>()

/** Ask Gemini (text only, cheap) to analyze the before/after layout */
async function analyzeLayout(
	gemini: GoogleGenAI,
	imageBuffer: Buffer,
): Promise<{
	orientation: 'horizontal' | 'vertical'
	beforeSide: 'left' | 'right' | 'top' | 'bottom'
}> {
	const hash = imageBuffer.toString('base64').slice(0, 100)
	if (layoutCache.has(hash)) return layoutCache.get(hash)!

	const b64 = imageBuffer.toString('base64')

	let answer = ''
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const response = await gemini.models.generateContent({
				model: 'gemini-2.0-flash',
				contents: [
					{
						role: 'user',
						parts: [
							{ inlineData: { mimeType: 'image/jpeg', data: b64 } },
							{
								text: [
									'This is a before-and-after comparison image of a cosmetic treatment.',
									'Analyze it and answer these two questions:',
									'1. Are the two photos arranged HORIZONTALLY (left/right) or VERTICALLY (top/bottom)?',
									'2. Which side is the BEFORE photo? Look at labels, text, or visual cues (the worse-looking side is before).',
									'',
									'Reply with EXACTLY one of these four answers, nothing else:',
									'BEFORE_LEFT',
									'BEFORE_RIGHT',
									'BEFORE_TOP',
									'BEFORE_BOTTOM',
								].join('\n'),
							},
						],
					},
				],
			})
			answer = (response.text ?? '').trim().toUpperCase()
			break
		} catch (err) {
			console.error(
				`        Layout analysis failed (attempt ${attempt + 1}/3): ${(err as Error).message.slice(0, 100)}`,
			)
			if (attempt < 2) {
				await new Promise(r => setTimeout(r, 5000 * (attempt + 1)))
			}
		}
	}

	let result: {
		orientation: 'horizontal' | 'vertical'
		beforeSide: 'left' | 'right' | 'top' | 'bottom'
	}

	if (answer.includes('LEFT')) {
		result = { orientation: 'horizontal', beforeSide: 'left' }
	} else if (answer.includes('RIGHT')) {
		result = { orientation: 'horizontal', beforeSide: 'right' }
	} else if (answer.includes('TOP')) {
		result = { orientation: 'vertical', beforeSide: 'top' }
	} else if (answer.includes('BOTTOM')) {
		result = { orientation: 'vertical', beforeSide: 'bottom' }
	} else {
		// Default: assume horizontal, before on left
		result = { orientation: 'horizontal', beforeSide: 'left' }
	}

	layoutCache.set(hash, result)
	return result
}

/** Crop one half of the image using sharp (guaranteed accurate) */
async function cropHalf(
	imageBuffer: Buffer,
	which: 'left' | 'right' | 'top' | 'bottom',
): Promise<Buffer> {
	const meta = await sharp(imageBuffer).metadata()
	const w = meta.width!
	const h = meta.height!

	let region: { left: number; top: number; width: number; height: number }
	switch (which) {
		case 'left':
			region = { left: 0, top: 0, width: Math.floor(w / 2), height: h }
			break
		case 'right':
			region = {
				left: Math.floor(w / 2),
				top: 0,
				width: w - Math.floor(w / 2),
				height: h,
			}
			break
		case 'top':
			region = { left: 0, top: 0, width: w, height: Math.floor(h / 2) }
			break
		case 'bottom':
			region = {
				left: 0,
				top: Math.floor(h / 2),
				width: w,
				height: h - Math.floor(h / 2),
			}
			break
	}

	return sharp(imageBuffer).extract(region).toBuffer()
}

/** Detect logos/watermarks with Gemini Flash, remove with nano-banana if found */
async function detectAndRemoveLogos(
	gemini: GoogleGenAI,
	imageBuffer: Buffer,
	side: string,
): Promise<Buffer> {
	const b64 = imageBuffer.toString('base64')

	// Step 1: Detect logos/watermarks with cheap text-only vision call
	let hasLogos = false
	try {
		const detectResponse = await gemini.models.generateContent({
			model: 'gemini-2.0-flash',
			contents: [
				{
					role: 'user',
					parts: [
						{ inlineData: { mimeType: 'image/png', data: b64 } },
						{
							text: 'Does this image contain any logos, watermarks, text overlays, website URLs, or brand marks? Answer ONLY "yes" or "no".',
						},
					],
				},
			],
		})
		const answer = (detectResponse.text ?? '').trim().toLowerCase()
		hasLogos = answer.startsWith('yes')
	} catch (err) {
		console.error(
			`        ${side}: logo detection failed: ${(err as Error).message.slice(0, 100)}`,
		)
		return imageBuffer // Return as-is if detection fails
	}

	if (!hasLogos) {
		return imageBuffer // No logos, return unchanged
	}

	// Step 2: Remove logos with nano-banana via REST API
	console.error(`        ${side}: logos detected, removing...`)
	const apiKey = process.env.GEMINI_API_KEY!
	const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`

	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					contents: [
						{
							parts: [
								{
									text: 'Remove all logos, watermarks, text overlays, and website URLs from this image. Keep everything else exactly the same. Do not alter the person.',
								},
								{
									inlineData: { mimeType: 'image/png', data: b64 },
								},
							],
						},
					],
					generationConfig: {
						responseModalities: ['IMAGE', 'TEXT'],
					},
				}),
				signal: AbortSignal.timeout(90000),
			})

			const json = (await res.json()) as any

			if (!res.ok) {
				const msg = json?.error?.message ?? `HTTP ${res.status}`
				if (res.status === 429 && attempt < 2) {
					const wait = 30 * (attempt + 1)
					console.error(`        ${side}: rate limited, waiting ${wait}s...`)
					await new Promise(r => setTimeout(r, wait * 1000))
					continue
				}
				console.error(
					`        ${side}: logo removal API error: ${msg.slice(0, 150)}`,
				)
				return imageBuffer
			}

			const resParts = json.candidates?.[0]?.content?.parts ?? []
			for (const rp of resParts) {
				if (rp.inlineData?.data) {
					console.error(`        ${side}: logos removed`)
					return Buffer.from(rp.inlineData.data, 'base64')
				}
			}

			console.error(
				`        ${side}: logo removal returned no image (attempt ${attempt + 1})`,
			)
			if (attempt < 2) {
				await new Promise(r => setTimeout(r, 5000))
				continue
			}
		} catch (err) {
			console.error(
				`        ${side}: logo removal error: ${(err as Error).message.slice(0, 100)}`,
			)
			if (attempt < 2) {
				await new Promise(r => setTimeout(r, 5000))
				continue
			}
		}
	}

	return imageBuffer // Return as-is if removal fails
}

type SplitResult = {
	cropped: Buffer
	noBg: Buffer | null
	final: Buffer | null
}

/**
 * Isolate one side with multiple stages:
 * 1. Crop with sharp (always succeeds)
 * 2. Gemini white bg + black bg + alpha matting (may fail)
 * 3. Trim (may fail if stage 2 failed)
 */
async function isolateSide(
	gemini: GoogleGenAI,
	imageBuffer: Buffer,
	side: 'before' | 'after',
): Promise<SplitResult | null> {
	// Step 1: Analyze layout + crop
	const layout = await analyzeLayout(gemini, imageBuffer)

	let cropSide: 'left' | 'right' | 'top' | 'bottom'
	if (side === 'before') {
		cropSide = layout.beforeSide
	} else {
		const opposites = {
			left: 'right',
			right: 'left',
			top: 'bottom',
			bottom: 'top',
		} as const
		cropSide = opposites[layout.beforeSide]
	}

	const cropped = await cropHalf(imageBuffer, cropSide)

	// Step 2: Remove background with rembg (u2net_human_seg model)
	let noBg: Buffer | null = null
	let final: Buffer | null = null

	try {
		const tmpIn = path.join(
			PUBLIC_IMG_DIR,
			`_rembg_in_${Date.now()}_${side}.png`,
		)
		const tmpOut = path.join(
			PUBLIC_IMG_DIR,
			`_rembg_out_${Date.now()}_${side}.png`,
		)
		const scriptPath = path.join(process.cwd(), 'scripts', 'rembg-remove.py')

		const pngBuf = await sharp(cropped).png().toBuffer()
		fs.writeFileSync(tmpIn, pngBuf)

		execSync(`python3 "${scriptPath}" "${tmpIn}" "${tmpOut}" bria-rmbg`, {
			stdio: 'pipe',
			timeout: 120000,
		})

		noBg = fs.readFileSync(tmpOut)

		try {
			fs.unlinkSync(tmpIn)
		} catch {}
		try {
			fs.unlinkSync(tmpOut)
		} catch {}

		// Step 3: Detect and remove logos/watermarks
		if (noBg) {
			noBg = await detectAndRemoveLogos(gemini, noBg, side)
		}

		// Step 4: Trim
		if (noBg) {
			final = await sharp(noBg)
				.trim()
				.webp({ quality: 90, alphaQuality: 100 })
				.toBuffer()
		}
	} catch (err) {
		console.error(`        ${side}: rembg error: ${(err as Error).message}`)
	}

	return { cropped, noBg, final }
}

// --- Trim transparent pixels, center, and save as WebP ---

const SPLIT_OUTPUT_DIR = path.join(PUBLIC_IMG_DIR, 'split')

async function trimAndSaveAsWebp(
	pngBuffer: Buffer,
	outputPath: string,
): Promise<void> {
	await sharp(pngBuffer)
		.trim()
		.webp({ quality: 90, alphaQuality: 100 })
		.toFile(outputPath)
}

// --- Process one service ---

async function processService(service: string): Promise<boolean> {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		console.error('GEMINI_API_KEY is required')
		process.exit(1)
	}

	const query = SEARCH_QUERIES[service]
	if (!query) {
		console.error(`Unknown service: ${service}`)
		console.error(`Available:\n  ${Object.keys(SEARCH_QUERIES).join('\n  ')}`)
		process.exit(1)
	}

	const gemini = new GoogleGenAI({ apiKey: geminiKey })
	const candidatesDir = path.join(CANDIDATES_BASE, service)
	fs.mkdirSync(candidatesDir, { recursive: true })

	// Find next candidate number (in case we already have some)
	const existing = fs.existsSync(candidatesDir)
		? fs.readdirSync(candidatesDir)
		: []
	const existingNums = existing
		.map(f => f.match(/^(\d+)-source/)?.[1])
		.filter(Boolean)
		.map(Number)
	let candidateNum = existingNums.length > 0 ? Math.max(...existingNums) : 0

	const visitedUrls = getVisitedUrls(candidatesDir)

	console.log(`\n=== ${service} ===`)
	console.log(`  Candidates dir: ${candidatesDir}`)
	console.log(`  Previously visited URLs: ${visitedUrls.size}`)
	console.log(`  Searching Bing: "${query}"`)

	let imageUrls: string[]
	try {
		imageUrls = await scrapeBingImages(query)
	} catch (err) {
		console.error(`  Bing scrape failed: ${(err as Error).message}`)
		return false
	}
	console.log(`  Found ${imageUrls.length} URLs`)

	let newCandidates = 0

	for (let i = 0; i < imageUrls.length; i++) {
		const url = imageUrls[i]!
		console.log(`  [${i + 1}/${imageUrls.length}] ${url.slice(0, 80)}...`)

		// Skip URLs we've already visited
		if (visitedUrls.has(url)) {
			console.log('    Skip: already visited this URL')
			continue
		}
		markUrlVisited(candidatesDir, url)

		const buffer = await downloadImage(url)
		if (!buffer) {
			console.log('    Skip: download failed or too small')
			continue
		}

		// Skip images we already have (by content hash)
		const hash = md5(buffer)
		if (knownHashes.has(hash)) {
			console.log('    Skip: duplicate content (same image from different URL)')
			continue
		}
		knownHashes.add(hash)

		console.log(`    Downloaded ${(buffer.length / 1024).toFixed(0)}KB`)

		console.log('    Checking if before/after...')
		let isBa: boolean
		try {
			isBa = await isBeforeAfterImage(gemini, buffer)
		} catch (err) {
			console.log(`    Skip: vision error — ${(err as Error).message}`)
			continue
		}

		if (!isBa) {
			console.log('    Not a before/after.')
			continue
		}

		candidateNum++
		newCandidates++
		const pad = String(candidateNum).padStart(3, '0')

		const sourcePath = path.join(candidatesDir, `${pad}-source.jpg`)
		fs.writeFileSync(sourcePath, buffer)
		console.log(
			`    ✓ Saved candidate ${pad} (${(buffer.length / 1024).toFixed(0)}KB)`,
		)
	}

	if (newCandidates === 0) {
		console.log(`  No new candidates found for "${service}"`)
		return false
	}

	console.log(`\n  ${newCandidates} new candidates saved to ${candidatesDir}`)
	console.log(`  Review them, delete bad ones, then:`)
	console.log(`    tsx scripts/scrape-before-after.ts --split ${service}`)
	return true
}

// --- Split: isolate before/after from source candidates ---

const LOCATION_FOLDERS = ['all', 'knoxville', 'farragut'] as const

type SplitWorkItem = {
	service: string
	label: string
	srcDir: string
	outDir: string
	sourceFile: string
	num: string
}

/** Collect all unsplit work items from a directory */
function getUnsplitItems(
	service: string,
	srcDir: string,
	outDir: string,
	label: string,
): SplitWorkItem[] {
	if (!fs.existsSync(srcDir)) return []

	const srcFiles = fs.readdirSync(srcDir)
	const sourceFiles = srcFiles.filter(f => f.match(/^\d+-source\./)).sort()

	fs.mkdirSync(outDir, { recursive: true })
	const outFiles = fs.readdirSync(outDir)

	return sourceFiles
		.filter(f => {
			const num = f.match(/^(\d+)-source/)?.[1]
			if (!num) return false
			// Check for final trimmed files as completion marker
			return (
				!outFiles.includes(`${num}-before.webp`) ||
				!outFiles.includes(`${num}-after.webp`)
			)
		})
		.map(f => ({
			service,
			label,
			srcDir,
			outDir,
			sourceFile: f,
			num: f.match(/^(\d+)-source/)?.[1] ?? '000',
		}))
}

/** Collect all unsplit items across all services */
function collectAllUnsplit(): SplitWorkItem[] {
	const candidatesBase = CANDIDATES_BASE
	if (!fs.existsSync(candidatesBase)) return []

	const services = fs
		.readdirSync(candidatesBase)
		.filter(d => fs.statSync(path.join(candidatesBase, d)).isDirectory())

	const allItems: SplitWorkItem[] = []

	for (const service of services) {
		const serviceDir = path.join(candidatesBase, service)
		const hasLocationFolders = LOCATION_FOLDERS.some(loc =>
			fs.existsSync(path.join(serviceDir, loc)),
		)

		if (hasLocationFolders) {
			for (const loc of LOCATION_FOLDERS) {
				const srcLocDir = path.join(serviceDir, loc)
				const outLocDir = path.join(SPLIT_OUTPUT_DIR, service, loc)
				allItems.push(
					...getUnsplitItems(
						service,
						srcLocDir,
						outLocDir,
						`${service}/${loc}`,
					),
				)
			}
		} else {
			const outDir = path.join(SPLIT_OUTPUT_DIR, service)
			allItems.push(...getUnsplitItems(service, serviceDir, outDir, service))
		}
	}

	return allItems
}

/** Process bg removal + logo + trim from an existing cropped file */
async function processFromCropped(
	gemini: GoogleGenAI,
	croppedBuffer: Buffer,
	side: 'before' | 'after',
): Promise<{ noBg: Buffer | null; final: Buffer | null }> {
	let noBg: Buffer | null = null
	let final: Buffer | null = null

	try {
		const tmpIn = path.join(
			PUBLIC_IMG_DIR,
			`_rembg_in_${Date.now()}_${side}.png`,
		)
		const tmpOut = path.join(
			PUBLIC_IMG_DIR,
			`_rembg_out_${Date.now()}_${side}.png`,
		)
		const scriptPath = path.join(process.cwd(), 'scripts', 'rembg-remove.py')

		const pngBuf = await sharp(croppedBuffer).png().toBuffer()
		fs.writeFileSync(tmpIn, pngBuf)

		execSync(`python3 "${scriptPath}" "${tmpIn}" "${tmpOut}" bria-rmbg`, {
			stdio: 'pipe',
			timeout: 120000,
		})

		noBg = fs.readFileSync(tmpOut)
		try {
			fs.unlinkSync(tmpIn)
		} catch {}
		try {
			fs.unlinkSync(tmpOut)
		} catch {}

		if (noBg) {
			noBg = await detectAndRemoveLogos(gemini, noBg, side)
		}
		if (noBg) {
			final = await sharp(noBg)
				.trim()
				.webp({ quality: 90, alphaQuality: 100 })
				.toBuffer()
		}
	} catch (err) {
		console.error(
			`        ${side}: error: ${(err as Error).message.slice(0, 150)}`,
		)
	}

	return { noBg, final }
}

/** Process a single split work item */
async function processSplitItem(
	gemini: GoogleGenAI,
	item: SplitWorkItem,
): Promise<void> {
	const { num, outDir, label } = item
	try {
		const beforeCroppedPath = path.join(outDir, `${num}-before-cropped.webp`)
		const afterCroppedPath = path.join(outDir, `${num}-after-cropped.webp`)

		let beforeCropped: Buffer
		let afterCropped: Buffer

		// Check if crops already exist from a previous run
		if (fs.existsSync(beforeCroppedPath) && fs.existsSync(afterCroppedPath)) {
			console.log(`  [${label}/${num}] crops exist, processing bg removal...`)
			beforeCropped = fs.readFileSync(beforeCroppedPath)
			afterCropped = fs.readFileSync(afterCroppedPath)
		} else {
			// Full pipeline: analyze layout, crop, save
			const buffer = fs.readFileSync(path.join(item.srcDir, item.sourceFile))
			console.log(`  [${label}/${num}] extracting before + after...`)

			const [beforeResult, afterResult] = await Promise.all([
				isolateSide(gemini, buffer, 'before'),
				isolateSide(gemini, buffer, 'after'),
			])

			if (!beforeResult || !afterResult) {
				console.log(`  [${label}/${num}] failed to extract`)
				return
			}

			beforeCropped = beforeResult.cropped
			afterCropped = afterResult.cropped

			// Copy source
			fs.copyFileSync(
				path.join(item.srcDir, item.sourceFile),
				path.join(outDir, item.sourceFile),
			)

			// Save crops
			await sharp(beforeCropped).webp({ quality: 90 }).toFile(beforeCroppedPath)
			await sharp(afterCropped).webp({ quality: 90 }).toFile(afterCroppedPath)

			// Save nobg + final from isolateSide if it did them
			if (beforeResult.noBg) {
				await sharp(beforeResult.noBg)
					.webp({ quality: 90, alphaQuality: 100 })
					.toFile(path.join(outDir, `${num}-before-nobg.webp`))
			}
			if (afterResult.noBg) {
				await sharp(afterResult.noBg)
					.webp({ quality: 90, alphaQuality: 100 })
					.toFile(path.join(outDir, `${num}-after-nobg.webp`))
			}
			if (beforeResult.final) {
				fs.writeFileSync(
					path.join(outDir, `${num}-before.webp`),
					beforeResult.final,
				)
			}
			if (afterResult.final) {
				fs.writeFileSync(
					path.join(outDir, `${num}-after.webp`),
					afterResult.final,
				)
			}

			const stages = [
				'cropped',
				beforeResult.noBg ? 'nobg' : 'nobg:FAILED',
				beforeResult.final ? 'final' : 'final:FAILED',
			].join(', ')
			console.log(`  [${label}/${num}] done (${stages})`)
			return
		}

		// Process from existing crops (bg removal + logo + trim only)
		const [beforePost, afterPost] = await Promise.all([
			processFromCropped(gemini, beforeCropped, 'before'),
			processFromCropped(gemini, afterCropped, 'after'),
		])

		if (beforePost.noBg) {
			await sharp(beforePost.noBg)
				.webp({ quality: 90, alphaQuality: 100 })
				.toFile(path.join(outDir, `${num}-before-nobg.webp`))
		}
		if (afterPost.noBg) {
			await sharp(afterPost.noBg)
				.webp({ quality: 90, alphaQuality: 100 })
				.toFile(path.join(outDir, `${num}-after-nobg.webp`))
		}
		if (beforePost.final) {
			fs.writeFileSync(
				path.join(outDir, `${num}-before.webp`),
				beforePost.final,
			)
		}
		if (afterPost.final) {
			fs.writeFileSync(path.join(outDir, `${num}-after.webp`), afterPost.final)
		}

		const stages = [
			'cropped:cached',
			beforePost.noBg ? 'nobg' : 'nobg:FAILED',
			beforePost.final ? 'final' : 'final:FAILED',
		].join(', ')
		console.log(`  [${label}/${num}] done (${stages})`)
	} catch (err) {
		console.error(
			`  [${label}/${num}] ERROR: ${(err as Error).message.slice(0, 150)}`,
		)
		console.error(`  [${label}/${num}] Skipping, will retry on next run.`)
	}
}

async function splitAll(): Promise<void> {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		console.error('GEMINI_API_KEY is required for --split')
		process.exit(1)
	}

	const gemini = new GoogleGenAI({ apiKey: geminiKey })
	const allItems = collectAllUnsplit()

	if (allItems.length === 0) {
		console.log('Nothing to split.')
		return
	}

	console.log(
		`${allItems.length} images to split (concurrency=${CONCURRENCY})\n`,
	)

	await pMap(
		allItems,
		async item => processSplitItem(gemini, item),
		CONCURRENCY,
	)

	console.log('\nDone!')
}

async function splitService(service: string): Promise<void> {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		console.error('GEMINI_API_KEY is required for --split')
		process.exit(1)
	}

	const gemini = new GoogleGenAI({ apiKey: geminiKey })
	const serviceDir = path.join(CANDIDATES_BASE, service)

	if (!fs.existsSync(serviceDir)) {
		console.log(`  No candidates for "${service}"`)
		return
	}

	const hasLocationFolders = LOCATION_FOLDERS.some(loc =>
		fs.existsSync(path.join(serviceDir, loc)),
	)

	let items: SplitWorkItem[] = []
	if (hasLocationFolders) {
		for (const loc of LOCATION_FOLDERS) {
			const srcLocDir = path.join(serviceDir, loc)
			const outLocDir = path.join(SPLIT_OUTPUT_DIR, service, loc)
			items.push(
				...getUnsplitItems(service, srcLocDir, outLocDir, `${service}/${loc}`),
			)
		}
	} else {
		const outDir = path.join(SPLIT_OUTPUT_DIR, service)
		items.push(...getUnsplitItems(service, serviceDir, outDir, service))
	}

	if (items.length === 0) {
		console.log(`  ${service}: nothing to split`)
		return
	}

	console.log(
		`  ${service}: ${items.length} to split (concurrency=${CONCURRENCY})`,
	)
	await pMap(items, async item => processSplitItem(gemini, item), CONCURRENCY)
}

// --- Finalize: process remaining candidates into numbered final images ---

async function finalizeDir(
	srcDir: string,
	outputDir: string,
	processedDir: string,
	label: string,
): Promise<void> {
	if (!fs.existsSync(srcDir)) return

	const files = fs.readdirSync(srcDir)
	const nums = [
		...new Set(
			files
				.map(f => f.match(/^(\d+)-(?:before|after)\.webp$/)?.[1])
				.filter(Boolean),
		),
	] as string[]

	const completePairs = nums.filter(
		n =>
			files.includes(`${n}-before.webp`) && files.includes(`${n}-after.webp`),
	)

	if (completePairs.length === 0) return

	fs.mkdirSync(outputDir, { recursive: true })
	fs.mkdirSync(processedDir, { recursive: true })

	// Find next available number in output
	const existingNums = fs.existsSync(outputDir)
		? fs
				.readdirSync(outputDir)
				.map(f => f.match(/^(\d+)-(?:before|after)\.webp$/)?.[1])
				.filter(Boolean)
				.map(Number)
		: []
	let nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1

	console.log(`    ${label}: ${completePairs.length} pairs`)

	for (const srcNum of completePairs) {
		const outPad = String(nextNum).padStart(3, '0')

		const srcBefore = path.join(srcDir, `${srcNum}-before.webp`)
		const srcAfter = path.join(srcDir, `${srcNum}-after.webp`)
		const srcSource = path.join(srcDir, `${srcNum}-source.jpg`)

		const beforeBuf = fs.readFileSync(srcBefore)
		const afterBuf = fs.readFileSync(srcAfter)

		await trimAndSaveAsWebp(
			beforeBuf,
			path.join(outputDir, `${outPad}-before.webp`),
		)
		await trimAndSaveAsWebp(
			afterBuf,
			path.join(outputDir, `${outPad}-after.webp`),
		)

		// Default before.webp/after.webp (last pair wins)
		await trimAndSaveAsWebp(beforeBuf, path.join(outputDir, 'before.webp'))
		await trimAndSaveAsWebp(afterBuf, path.join(outputDir, 'after.webp'))

		console.log(`      ${srcNum} → ${outPad}`)

		// Move to processed
		for (const src of [srcBefore, srcAfter, srcSource]) {
			if (fs.existsSync(src)) {
				fs.renameSync(src, path.join(processedDir, path.basename(src)))
			}
		}

		nextNum++
	}
}

async function finalizeService(service: string): Promise<void> {
	const serviceDir = path.join(CANDIDATES_BASE, service)

	if (!fs.existsSync(serviceDir)) {
		console.log(`  No candidates for "${service}"`)
		return
	}

	console.log(`  ${service}:`)

	const hasLocationFolders = LOCATION_FOLDERS.some(loc =>
		fs.existsSync(path.join(serviceDir, loc)),
	)

	if (hasLocationFolders) {
		for (const loc of LOCATION_FOLDERS) {
			const srcDir = path.join(serviceDir, loc)
			// Output: public/img/{service}/{loc}/ (e.g. public/img/botox/knoxville/)
			const outputDir = path.join(PUBLIC_IMG_DIR, service, loc)
			const processedDir = path.join(PUBLIC_IMG_DIR, 'processed', service, loc)
			await finalizeDir(srcDir, outputDir, processedDir, loc)
		}
	} else {
		// Legacy flat structure
		const outputDir = path.join(PUBLIC_IMG_DIR, service)
		const processedDir = path.join(PUBLIC_IMG_DIR, 'processed', service)
		await finalizeDir(serviceDir, outputDir, processedDir, 'flat')
	}

	// Clean up empty candidates dir
	try {
		const remaining = fs.readdirSync(serviceDir)
		const isEmpty = remaining.every(
			f => f === '.DS_Store' || f === '.visited-urls',
		)
		if (isEmpty) fs.rmSync(serviceDir, { recursive: true })
	} catch {}
}

async function finalizeAll(): Promise<void> {
	const candidatesBase = CANDIDATES_BASE
	if (!fs.existsSync(candidatesBase)) {
		console.log('No candidates directory found.')
		return
	}
	const services = fs
		.readdirSync(candidatesBase)
		.filter(d => fs.statSync(path.join(candidatesBase, d)).isDirectory())

	if (services.length === 0) {
		console.log('No services with candidates.')
		return
	}

	console.log(`Finalizing ${services.length} services...\n`)
	for (const service of services) {
		await finalizeService(service)
	}
	console.log('\nDone!')
}

// --- CLI ---

async function main() {
	const args = process.argv.slice(2)

	// Build hash index of every existing image up front
	if (
		!args.includes('--help') &&
		!args.includes('--list-missing') &&
		!args.includes('--finalize')
	) {
		console.log('Hashing all existing images...')
		knownHashes = getAllExistingHashes()
		console.log(`${knownHashes.size} unique images already on disk.\n`)
	} else {
		knownHashes = new Set()
	}

	if (args.length === 0 || args.includes('--help')) {
		console.log(`
Scrape before/after images from Bing, verify with OpenAI vision,
split into separate before/after with transparent backgrounds.

Usage:
  tsx scripts/scrape-before-after.ts <service>           Download candidates for one service
  tsx scripts/scrape-before-after.ts --missing            Download for services missing images
  tsx scripts/scrape-before-after.ts --all                Download for ALL services
  tsx scripts/scrape-before-after.ts --list-missing       List what's missing
  tsx scripts/scrape-before-after.ts --split [service]    Split source images into before/after
  tsx scripts/scrape-before-after.ts --split              Split all unsplit candidates
  tsx scripts/scrape-before-after.ts --finalize [service]  Move candidates to final images
  tsx scripts/scrape-before-after.ts --finalize            Finalize all services

Workflow:
  1. Download:  tsx scripts/scrape-before-after.ts --all
  2. Review:    open public/img/candidates/
  3. Delete:    Remove the source images you don't want
  4. Split:     tsx scripts/scrape-before-after.ts --split
  5. Finalize:  tsx scripts/scrape-before-after.ts --finalize

Candidates go to:  public/img/candidates/{service}/
Final images go to: public/img/{service}/001-before.webp, 001-after.webp, ...
Processed originals moved to: public/img/processed/{service}/

Environment:
  GEMINI_API_KEY    Required for scraping + splitting (not needed for --finalize or --list-missing)
  CANDIDATES_DIR    Override candidates folder name (default: "candidates")

Available services:
  ${Object.keys(SEARCH_QUERIES).join('\n  ')}
`)
		process.exit(0)
	}

	if (args.includes('--list-missing')) {
		const missing = getMissing()
		if (missing.length === 0) {
			console.log('All services have before/after images!')
		} else {
			console.log(`Missing images for ${missing.length} services:`)
			for (const s of missing) console.log(`  ${s}`)
		}
		return
	}

	if (args.includes('--split')) {
		const idx = args.indexOf('--split')
		const service = args[idx + 1]
		if (service && !service.startsWith('--')) {
			await splitService(service)
		} else {
			await splitAll()
		}
		return
	}

	if (args.includes('--finalize')) {
		const idx = args.indexOf('--finalize')
		const service = args[idx + 1]
		if (service && !service.startsWith('--')) {
			await finalizeService(service)
		} else {
			await finalizeAll()
		}
		return
	}

	if (args.includes('--all')) {
		const all = Object.keys(SEARCH_QUERIES)
		console.log(`Scraping candidates for ALL ${all.length} services...\n`)
		let success = 0
		let fail = 0
		for (const service of all) {
			const ok = await processService(service)
			if (ok) success++
			else fail++
			await new Promise(r => setTimeout(r, 2000))
		}
		console.log(`\nDone: ${success} succeeded, ${fail} failed`)
		return
	}

	if (args.includes('--missing')) {
		const missing = getMissing()
		if (missing.length === 0) {
			console.log('All services have before/after images!')
			return
		}
		console.log(
			`Scraping candidates for ${missing.length} missing services...\n`,
		)
		let success = 0
		let fail = 0
		for (const service of missing) {
			const ok = await processService(service)
			if (ok) success++
			else fail++
			await new Promise(r => setTimeout(r, 2000))
		}
		console.log(`\nDone: ${success} succeeded, ${fail} failed`)
		return
	}

	// Single service
	await processService(args[0]!)
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
