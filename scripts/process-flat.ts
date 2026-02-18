#!/usr/bin/env tsx
/**
 * Process flat image pipeline:
 *   Step 0: normalize - Convert all sources to real JPEG (fixes mismatched extensions)
 *   Step 1: split     - Analyze layout + split into before/after halves (Gemini + sharp)
 *   Step 2: clean     - Remove text/logos/watermarks from each half (Gemini)
 *   Step 3: white     - Generate white background version (Gemini)
 *   Step 4: black     - Generate black background version from white (Gemini)
 *   Step 5: nobg      - Use nobg-manual/ (Picthing) first, fall back to rembg or difference matte
 *   Step 6: trim      - Trim transparent pixels (sharp)
 *
 * Directory structure:
 *   public/img/flat/sources/      ← raw source files (mixed formats with .jpg ext)
 *   public/img/flat/normalized/   ← step 0: all converted to real JPEG
 *   public/img/flat/split/        ← step 1: before/after halves (jpg)
 *   public/img/flat/cleaned/      ← step 2: logos removed from halves (webp)
 *   public/img/flat/white/        ← step 3: white background versions
 *   public/img/flat/black/        ← step 4: black background versions
 *   public/img/flat/nobg-manual/  ← paste Picthing results here (any format)
 *   public/img/flat/nobg/         ← step 5: merged (manual + difference matte)
 *   public/img/flat/final/        ← step 6: trimmed (webp+alpha)
 *
 * Usage:
 *   tsx scripts/process-flat.ts normalize               Step 0 only
 *   tsx scripts/process-flat.ts split                   Step 1 only
 *   tsx scripts/process-flat.ts clean                   Step 2 only
 *   tsx scripts/process-flat.ts white                   Step 3 only
 *   tsx scripts/process-flat.ts black                   Step 4 only
 *   tsx scripts/process-flat.ts nobg                    Step 5 only
 *   tsx scripts/process-flat.ts trim                    Step 6 only
 *   tsx scripts/process-flat.ts all                     All steps
 *   tsx scripts/process-flat.ts white+black+nobg+trim   Steps 3-6
 *
 * Environment:
 *   GEMINI_API_KEY   Required for split + clean + white + black steps
 *   CONCURRENCY      Parallel workers (default: 4)
 *   NOBG_METHOD      'rembg' (default) or 'matte' — fallback bg removal for non-Picthing files
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { GoogleGenAI } from '@google/genai'
import sharp from 'sharp'

const BASE = path.join(process.cwd(), 'processing-images')
const DIRS = {
	sources: path.join(BASE, 'sources'),
	normalized: path.join(BASE, 'normalized'),
	split: path.join(BASE, 'split'),
	cleaned: path.join(BASE, 'cleaned'),
	'nobg-manual': path.join(BASE, 'nobg-manual'),
	white: path.join(BASE, 'white'),
	black: path.join(BASE, 'black'),
	nobg: path.join(BASE, 'nobg'),
	final: path.join(BASE, 'final'),
}

const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '4', 10)

/** Background removal method for non-manual files: 'rembg' or 'matte' */
type NobgMethod = 'rembg' | 'matte'
const NOBG_METHOD: NobgMethod = (process.env.NOBG_METHOD ??
	'rembg') as NobgMethod

// --- Utilities ---

async function pMap<T>(
	items: T[],
	fn: (item: T) => Promise<void>,
	concurrency: number,
) {
	let i = 0
	async function next(): Promise<void> {
		const idx = i++
		if (idx >= items.length) return
		await fn(items[idx]!)
		await next()
	}
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () => next()),
	)
}

function listFiles(dir: string, ext?: string): string[] {
	if (!fs.existsSync(dir)) return []
	return fs
		.readdirSync(dir)
		.filter(f => !f.startsWith('.'))
		.filter(f => !ext || f.endsWith(ext))
		.sort()
}

/** Get set of base names that have manual Picthing results in nobg-manual/ */
function getManualBases(): Set<string> {
	const manualFiles = listFiles(DIRS['nobg-manual'])
	const bases = new Set<string>()
	for (const f of manualFiles) {
		const base = f.replace(/-bg-removed/, '').replace(/\.[^.]+$/, '')
		bases.add(base)
	}
	return bases
}

function needsProcessing(
	inputDir: string,
	outputDir: string,
	inputFile: string,
	outputFile: string,
): boolean {
	if (!fs.existsSync(path.join(inputDir, inputFile))) return false
	return !fs.existsSync(path.join(outputDir, outputFile))
}

/** Helper: call Gemini image generation and return the first image buffer, or null */
async function geminiImageEdit(
	gemini: GoogleGenAI,
	prompt: string,
	mimeType: string,
	imageB64: string,
	file: string,
	maxAttempts = 3,
): Promise<Buffer | null> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			const res = await gemini.models.generateContent({
				model: 'gemini-3-pro-image-preview',
				contents: [
					{
						role: 'user',
						parts: [
							{ text: prompt },
							{ inlineData: { mimeType, data: imageB64 } },
						],
					},
				],
				config: {
					responseModalities: ['IMAGE', 'TEXT'],
				},
			})

			const candidates = res.candidates ?? []
			const finishReason = candidates[0]?.finishReason ?? 'N/A'
			const parts = candidates[0]?.content?.parts ?? []
			console.log(
				`  ${file}: [attempt ${attempt + 1}] finishReason: ${finishReason}, parts: ${parts.length}`,
			)

			for (const part of parts) {
				if (part.inlineData?.data) {
					return Buffer.from(part.inlineData.data, 'base64')
				}
			}
			console.log(`  ${file}: no image returned (attempt ${attempt + 1})`)
		} catch (err) {
			const msg = (err as Error).message
			console.error(
				`  ${file}: [attempt ${attempt + 1}] ERROR: ${msg.slice(0, 200)}`,
			)
			if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
				const wait = 30 * (attempt + 1)
				console.log(`  ${file}: rate limited, waiting ${wait}s...`)
				await new Promise(r => setTimeout(r, wait * 1000))
			}
		}
	}
	return null
}

// --- Step 0: Normalize (convert all sources to real JPEG) ---

async function stepNormalize() {
	fs.mkdirSync(DIRS.normalized, { recursive: true })

	const sources = listFiles(DIRS.sources).filter(f =>
		/\.(jpg|jpeg|png|webp|avif)$/i.test(f),
	)
	const todo = sources.filter(f => {
		const out = f.replace(/\.[^.]+$/, '.jpg')
		return !fs.existsSync(path.join(DIRS.normalized, out))
	})

	console.log(
		`Step 0 (normalize): ${todo.length} files to process (${sources.length - todo.length} already done)\n`,
	)
	if (todo.length === 0) return

	let converted = 0
	let alreadyJpeg = 0
	let errors = 0

	await pMap(
		todo,
		async file => {
			try {
				const inputPath = path.join(DIRS.sources, file)
				const outFile = file.replace(/\.[^.]+$/, '.jpg')
				const outputPath = path.join(DIRS.normalized, outFile)
				const rawBuffer = fs.readFileSync(inputPath)

				let actualFormat = 'unknown'
				if (rawBuffer[0] === 0xff && rawBuffer[1] === 0xd8) {
					actualFormat = 'jpeg'
				} else if (
					rawBuffer[0] === 0x89 &&
					rawBuffer[1] === 0x50 &&
					rawBuffer[2] === 0x4e &&
					rawBuffer[3] === 0x47
				) {
					actualFormat = 'png'
				} else if (
					rawBuffer[0] === 0x52 &&
					rawBuffer[1] === 0x49 &&
					rawBuffer[2] === 0x46 &&
					rawBuffer[3] === 0x46
				) {
					actualFormat = 'webp'
				} else if (
					rawBuffer.length > 12 &&
					rawBuffer[4] === 0x66 &&
					rawBuffer[5] === 0x74 &&
					rawBuffer[6] === 0x79 &&
					rawBuffer[7] === 0x70 &&
					rawBuffer[8] === 0x61 &&
					rawBuffer[9] === 0x76 &&
					rawBuffer[10] === 0x69 &&
					rawBuffer[11] === 0x66
				) {
					actualFormat = 'avif'
				}

				const jpegBuffer = await sharp(rawBuffer)
					.jpeg({ quality: 95 })
					.toBuffer()

				fs.writeFileSync(outputPath, jpegBuffer)

				if (actualFormat !== 'jpeg') {
					console.log(
						`  ${file}: ${actualFormat} → jpeg (${rawBuffer.length} → ${jpegBuffer.length} bytes)`,
					)
					converted++
				} else {
					console.log(
						`  ${file}: jpeg → jpeg (${rawBuffer.length} → ${jpegBuffer.length} bytes)`,
					)
					alreadyJpeg++
				}
			} catch (err) {
				console.error(
					`  ${file}: ERROR ${(err as Error).message.slice(0, 150)}`,
				)
				errors++
			}
		},
		CONCURRENCY,
	)

	console.log(
		`\nNormalize summary: ${converted} converted, ${alreadyJpeg} already jpeg, ${errors} errors`,
	)
}

// --- Step 1: Split (analyze layout + split into before/after halves) ---

async function stepSplit() {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		console.error('GEMINI_API_KEY required for split step')
		process.exit(1)
	}
	const gemini = new GoogleGenAI({ apiKey: geminiKey })

	fs.mkdirSync(DIRS.split, { recursive: true })

	const normalized = listFiles(DIRS.normalized, '.jpg')
	if (normalized.length === 0) {
		console.log(
			'Step 1 (split): no normalized files found. Run "normalize" step first.\n',
		)
		return
	}
	const todo = normalized.filter(f => {
		const base = f.replace(/\.jpg$/, '')
		return (
			!fs.existsSync(path.join(DIRS.split, `${base}--before.jpg`)) ||
			!fs.existsSync(path.join(DIRS.split, `${base}--after.jpg`))
		)
	})

	console.log(
		`Step 1 (split): ${todo.length} files to process (${normalized.length - todo.length} already done)\n`,
	)
	if (todo.length === 0) return

	await pMap(
		todo,
		async file => {
			try {
				const buffer = fs.readFileSync(path.join(DIRS.normalized, file))
				const b64 = buffer.toString('base64')
				const base = file.replace(/\.jpg$/, '')

				let layout = 'BEFORE_LEFT'
				{
					for (let attempt = 0; attempt < 3; attempt++) {
						try {
							const res = await gemini.models.generateContent({
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
												text: 'This is a before-and-after comparison. Which side is BEFORE? Reply ONLY: BEFORE_LEFT, BEFORE_RIGHT, BEFORE_TOP, or BEFORE_BOTTOM',
											},
										],
									},
								],
							})
							const answer = (res.text ?? '').trim().toUpperCase()
							if (answer.includes('RIGHT')) layout = 'BEFORE_RIGHT'
							else if (answer.includes('TOP')) layout = 'BEFORE_TOP'
							else if (answer.includes('BOTTOM')) layout = 'BEFORE_BOTTOM'
							console.log(`  ${file}: Gemini says "${answer}" → ${layout}`)
							break
						} catch (err) {
							console.error(
								`  ${file}: layout detect error (attempt ${attempt + 1}): ${(err as Error).message.slice(0, 100)}`,
							)
							if (attempt < 2)
								await new Promise(r => setTimeout(r, 5000 * (attempt + 1)))
						}
					}
				}

				const meta = await sharp(buffer).metadata()
				const w = meta.width!,
					h = meta.height!
				const side = layout.replace('BEFORE_', '').toLowerCase()

				const regions: Record<
					string,
					{ left: number; top: number; width: number; height: number }
				> = {
					left: { left: 0, top: 0, width: Math.floor(w / 2), height: h },
					right: {
						left: Math.floor(w / 2),
						top: 0,
						width: w - Math.floor(w / 2),
						height: h,
					},
					top: { left: 0, top: 0, width: w, height: Math.floor(h / 2) },
					bottom: {
						left: 0,
						top: Math.floor(h / 2),
						width: w,
						height: h - Math.floor(h / 2),
					},
				}
				const opposites: Record<string, string> = {
					left: 'right',
					right: 'left',
					top: 'bottom',
					bottom: 'top',
				}

				const beforeBuf = await sharp(buffer)
					.extract(regions[side]!)
					.jpeg({ quality: 95 })
					.toBuffer()
				const afterBuf = await sharp(buffer)
					.extract(regions[opposites[side]!]!)
					.jpeg({ quality: 95 })
					.toBuffer()

				fs.writeFileSync(
					path.join(DIRS.split, `${base}--before.jpg`),
					beforeBuf,
				)
				fs.writeFileSync(path.join(DIRS.split, `${base}--after.jpg`), afterBuf)

				console.log(`  ${file}: split (${layout}, ${w}x${h})`)
			} catch (err) {
				console.error(
					`  ${file}: ERROR ${(err as Error).message.slice(0, 100)}`,
				)
			}
		},
		CONCURRENCY,
	)
}

// --- Step 2: Clean (remove text/logos/watermarks from each half) ---

async function stepClean() {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		console.error('GEMINI_API_KEY required for clean step')
		process.exit(1)
	}
	const gemini = new GoogleGenAI({ apiKey: geminiKey })

	fs.mkdirSync(DIRS.cleaned, { recursive: true })

	const splitFiles = listFiles(DIRS.split, '.jpg')
	if (splitFiles.length === 0) {
		console.log(
			'Step 2 (clean): no split files found. Run "split" step first.\n',
		)
		return
	}
	const todo = splitFiles.filter(f => {
		const out = f.replace(/\.jpg$/, '.webp')
		return needsProcessing(DIRS.split, DIRS.cleaned, f, out)
	})

	console.log(
		`Step 2 (clean): ${todo.length} files to process (${splitFiles.length - todo.length} already done)\n`,
	)
	if (todo.length === 0) return

	await pMap(
		todo,
		async file => {
			try {
				const buffer = fs.readFileSync(path.join(DIRS.split, file))
				const b64 = buffer.toString('base64')
				const mime = 'image/jpeg' as const

				let hasLogos = false
				console.log(`  ${file}: checking for logos... (${buffer.length} bytes)`)
				for (let attempt = 0; attempt < 3; attempt++) {
					try {
						const detectRes = await gemini.models.generateContent({
							model: 'gemini-2.0-flash',
							contents: [
								{
									role: 'user',
									parts: [
										{ inlineData: { mimeType: mime, data: b64 } },
										{
											text: 'Does this image have ANY text, letters, words, numbers, logos, watermarks, website URLs, brand marks, labels like "Before" or "After", or arrows ANYWHERE in the image — including on the background, borders, or edges? Answer ONLY "yes" or "no".',
										},
									],
								},
							],
						})
						const detectText = (detectRes.text ?? '').trim()
						hasLogos = detectText.toLowerCase().startsWith('yes')
						console.log(
							`  ${file}: logo detection = "${detectText}" → hasLogos=${hasLogos}`,
						)
						break
					} catch (err) {
						console.error(
							`  ${file}: logo detect error (attempt ${attempt + 1}): ${(err as Error).message.slice(0, 100)}`,
						)
						if (attempt < 2)
							await new Promise(r => setTimeout(r, 5000 * (attempt + 1)))
					}
				}

				const outFile = file.replace(/\.jpg$/, '.webp')

				if (!hasLogos) {
					await sharp(buffer)
						.webp({ quality: 95 })
						.toFile(path.join(DIRS.cleaned, outFile))
					console.log(`  ${file}: clean (no logos)`)
					return
				}

				console.log(`  ${file}: logos detected, removing...`)
				const cleaned = await geminiImageEdit(
					gemini,
					'Remove ALL text, letters, words, numbers, logos, watermarks, website URLs, labels, arrows, and any other overlay graphics from EVERYWHERE in this image — including the background, borders, and edges. Replace removed areas with the surrounding background. Keep the person exactly the same.',
					mime,
					b64,
					file,
				)

				if (cleaned) {
					await sharp(cleaned)
						.webp({ quality: 95 })
						.toFile(path.join(DIRS.cleaned, outFile))
					console.log(`  ${file}: logos removed`)
				} else {
					// Fallback: save as-is
					await sharp(buffer)
						.webp({ quality: 95 })
						.toFile(path.join(DIRS.cleaned, outFile))
					console.log(`  ${file}: saved as-is (logo removal failed)`)
				}
			} catch (err) {
				console.error(
					`  ${file}: ERROR ${(err as Error).message.slice(0, 100)}`,
				)
			}
		},
		CONCURRENCY,
	)
}

// --- Step 3: White background (Gemini) ---

async function stepWhite() {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		console.error('GEMINI_API_KEY required for white step')
		process.exit(1)
	}
	const gemini = new GoogleGenAI({ apiKey: geminiKey })

	fs.mkdirSync(DIRS.white, { recursive: true })

	const cleanedFiles = listFiles(DIRS.cleaned, '.webp')
	if (cleanedFiles.length === 0) {
		console.log(
			'Step 3 (white): no cleaned files found. Run "clean" step first.\n',
		)
		return
	}
	// Skip files that have manual Picthing results — no need for white/black/matte
	const manualBases = getManualBases()
	const todo = cleanedFiles.filter(f => {
		const base = f.replace(/\.webp$/, '')
		if (manualBases.has(base)) return false
		return !fs.existsSync(path.join(DIRS.white, f))
	})
	const skipped = cleanedFiles.length - todo.length

	console.log(
		`Step 3 (white): ${todo.length} files to process (${skipped} skipped — already done or in nobg-manual/)\n`,
	)
	if (todo.length === 0) return

	await pMap(
		todo,
		async file => {
			try {
				const buffer = fs.readFileSync(path.join(DIRS.cleaned, file))
				// Convert to JPEG for Gemini
				const jpegBuf = await sharp(buffer).jpeg({ quality: 95 }).toBuffer()
				const b64 = jpegBuf.toString('base64')

				const result = await geminiImageEdit(
					gemini,
					'Change the background to a pure solid white #FFFFFF background. Keep the person and everything about them exactly unchanged.',
					'image/jpeg',
					b64,
					file,
				)

				if (result) {
					await sharp(result)
						.webp({ quality: 95 })
						.toFile(path.join(DIRS.white, file))
					console.log(`  ${file}: white bg done`)
				} else {
					console.log(`  ${file}: FAILED (no image returned)`)
				}
			} catch (err) {
				console.error(
					`  ${file}: ERROR ${(err as Error).message.slice(0, 100)}`,
				)
			}
		},
		CONCURRENCY,
	)
}

// --- Step 4: Black background (from white version, Gemini) ---

async function stepBlack() {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		console.error('GEMINI_API_KEY required for black step')
		process.exit(1)
	}
	const gemini = new GoogleGenAI({ apiKey: geminiKey })

	fs.mkdirSync(DIRS.black, { recursive: true })

	const whiteFiles = listFiles(DIRS.white, '.webp')
	if (whiteFiles.length === 0) {
		console.log(
			'Step 4 (black): no white files found. Run "white" step first.\n',
		)
		return
	}
	const manualBases = getManualBases()
	const todo = whiteFiles.filter(f => {
		const base = f.replace(/\.webp$/, '')
		if (manualBases.has(base)) return false
		return !fs.existsSync(path.join(DIRS.black, f))
	})
	const skipped = whiteFiles.length - todo.length

	console.log(
		`Step 4 (black): ${todo.length} files to process (${skipped} skipped — already done or in nobg-manual/)\n`,
	)
	if (todo.length === 0) return

	await pMap(
		todo,
		async file => {
			try {
				const buffer = fs.readFileSync(path.join(DIRS.white, file))
				// Convert to JPEG for Gemini
				const jpegBuf = await sharp(buffer).jpeg({ quality: 95 }).toBuffer()
				const b64 = jpegBuf.toString('base64')

				const result = await geminiImageEdit(
					gemini,
					'Change the white background to a solid pure black #000000 background. Keep everything else exactly unchanged.',
					'image/jpeg',
					b64,
					file,
				)

				if (result) {
					await sharp(result)
						.webp({ quality: 95 })
						.toFile(path.join(DIRS.black, file))
					console.log(`  ${file}: black bg done`)
				} else {
					console.log(`  ${file}: FAILED (no image returned)`)
				}
			} catch (err) {
				console.error(
					`  ${file}: ERROR ${(err as Error).message.slice(0, 100)}`,
				)
			}
		},
		CONCURRENCY,
	)
}

// --- Step 5: nobg (use manual Picthing results, fall back to rembg or difference matte) ---

async function stepNobgRembg(needsRemoval: string[]) {
	const REMBG_SCRIPT = path.join(process.cwd(), 'scripts', 'rembg-remove.py')
	let rembgCount = 0

	// rembg creates a new session per call which is slow for the model load.
	// We use concurrency=1 to keep it simple; rembg itself isn't super fast anyway.
	await pMap(
		needsRemoval,
		async file => {
			const inputPath = path.join(DIRS.cleaned, file)
			const outputPath = path.join(DIRS.nobg, file)
			// Use the actual filename for temp to avoid collisions
			const tmpInput = path.join(
				DIRS.nobg,
				`_tmp_in_${file.replace(/\.webp$/, '.png')}`,
			)
			const tmpOutput = path.join(
				DIRS.nobg,
				`_tmp_out_${file.replace(/\.webp$/, '.png')}`,
			)
			try {
				// rembg wants PNG input/output
				await sharp(inputPath).png().toFile(tmpInput)
				execFileSync('python3', [REMBG_SCRIPT, tmpInput, tmpOutput], {
					timeout: 120_000,
				})
				await sharp(tmpOutput)
					.webp({ quality: 90, alphaQuality: 100 })
					.toFile(outputPath)
				console.log(`  ${file}: rembg done`)
				rembgCount++
			} catch (err) {
				console.error(
					`  ${file}: ERROR ${(err as Error).message.slice(0, 100)}`,
				)
			} finally {
				if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput)
				if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput)
			}
		},
		Math.min(CONCURRENCY, 2), // rembg is heavy on memory/GPU, keep low
	)
	return rembgCount
}

async function stepNobgMatte(needsMatte: string[]) {
	const whiteSet = new Set(listFiles(DIRS.white, '.webp'))
	const blackSet = new Set(listFiles(DIRS.black, '.webp'))
	const matteReady = needsMatte.filter(f => whiteSet.has(f) && blackSet.has(f))
	const matteMissing = needsMatte.filter(
		f => !whiteSet.has(f) || !blackSet.has(f),
	)

	if (matteMissing.length > 0) {
		console.log(
			`  ${matteMissing.length} files missing white/black versions — run "white" and "black" steps first`,
		)
		for (const f of matteMissing.slice(0, 5)) {
			console.log(`    ${f}: white=${whiteSet.has(f)} black=${blackSet.has(f)}`)
		}
		if (matteMissing.length > 5)
			console.log(`    ... and ${matteMissing.length - 5} more`)
	}

	if (matteReady.length === 0) return 0

	const bgDist = Math.sqrt(3 * 255 * 255) // ~441.67
	let matteCount = 0

	await pMap(
		matteReady,
		async file => {
			try {
				const { data: dataWhite, info: meta } = await sharp(
					path.join(DIRS.white, file),
				)
					.ensureAlpha()
					.raw()
					.toBuffer({ resolveWithObject: true })

				const { data: dataBlack } = await sharp(path.join(DIRS.black, file))
					.resize(meta.width, meta.height)
					.ensureAlpha()
					.raw()
					.toBuffer({ resolveWithObject: true })

				if (dataWhite.length !== dataBlack.length) {
					console.error(
						`  ${file}: dimension mismatch (white=${dataWhite.length}, black=${dataBlack.length})`,
					)
					return
				}

				const outputBuffer = Buffer.alloc(dataWhite.length)

				for (let i = 0; i < meta.width * meta.height; i++) {
					const offset = i * 4

					const rW = dataWhite[offset]!
					const gW = dataWhite[offset + 1]!
					const bW = dataWhite[offset + 2]!

					const rB = dataBlack[offset]!
					const gB = dataBlack[offset + 1]!
					const bB = dataBlack[offset + 2]!

					const pixelDist = Math.sqrt(
						(rW - rB) ** 2 + (gW - gB) ** 2 + (bW - bB) ** 2,
					)

					let alpha = 1 - pixelDist / bgDist
					alpha = Math.max(0, Math.min(1, alpha))

					let rOut = 0,
						gOut = 0,
						bOut = 0

					if (alpha > 0.01) {
						rOut = rB / alpha
						gOut = gB / alpha
						bOut = bB / alpha
					}

					outputBuffer[offset] = Math.round(Math.min(255, rOut))
					outputBuffer[offset + 1] = Math.round(Math.min(255, gOut))
					outputBuffer[offset + 2] = Math.round(Math.min(255, bOut))
					outputBuffer[offset + 3] = Math.round(alpha * 255)
				}

				await sharp(outputBuffer, {
					raw: {
						width: meta.width,
						height: meta.height,
						channels: 4,
					},
				})
					.webp({ quality: 90, alphaQuality: 100 })
					.toFile(path.join(DIRS.nobg, file))

				console.log(`  ${file}: matte done`)
				matteCount++
			} catch (err) {
				console.error(
					`  ${file}: ERROR ${(err as Error).message.slice(0, 100)}`,
				)
			}
		},
		CONCURRENCY,
	)
	return matteCount
}

async function stepNobg() {
	fs.mkdirSync(DIRS.nobg, { recursive: true })
	fs.mkdirSync(DIRS['nobg-manual'], { recursive: true })

	console.log(
		`  method: ${NOBG_METHOD} (set NOBG_METHOD=rembg|matte to switch)\n`,
	)

	// All cleaned files need a nobg version
	const cleanedFiles = listFiles(DIRS.cleaned, '.webp')
	if (cleanedFiles.length === 0) {
		console.log(
			'Step 5 (nobg): no cleaned files found. Run "clean" step first.\n',
		)
		return
	}

	const alreadyDone = new Set(listFiles(DIRS.nobg, '.webp'))
	const todo = cleanedFiles.filter(f => !alreadyDone.has(f))

	if (todo.length === 0) {
		console.log(
			`Step 5 (nobg): all ${cleanedFiles.length} files already done\n`,
		)
		return
	}

	// Check which ones have manual Picthing results
	// Picthing names: botox_007--before-bg-removed.webp → match to botox_007--before
	const manualFiles = listFiles(DIRS['nobg-manual'])
	const manualMap = new Map<string, string>() // base → filename
	for (const f of manualFiles) {
		const base = f.replace(/-bg-removed/, '').replace(/\.[^.]+$/, '')
		manualMap.set(base, f)
	}

	let manualCount = 0
	const needsFallback: string[] = []

	for (const f of todo) {
		const base = f.replace(/\.webp$/, '')
		const manualFile = manualMap.get(base)
		if (manualFile) {
			// Copy manual result to nobg/
			const src = path.join(DIRS['nobg-manual'], manualFile)
			await sharp(src)
				.webp({ quality: 90, alphaQuality: 100 })
				.toFile(path.join(DIRS.nobg, f))
			console.log(`  ${f}: copied from nobg-manual/`)
			manualCount++
		} else {
			needsFallback.push(f)
		}
	}

	const methodLabel = NOBG_METHOD === 'rembg' ? 'rembg' : 'difference matte'
	console.log(
		`Step 5 (nobg): ${manualCount} from Picthing, ${needsFallback.length} need ${methodLabel}\n`,
	)

	if (needsFallback.length === 0) return

	let fallbackCount = 0
	if (NOBG_METHOD === 'rembg') {
		fallbackCount = await stepNobgRembg(needsFallback)
	} else {
		fallbackCount = await stepNobgMatte(needsFallback)
	}

	console.log(
		`\nnobg summary: ${manualCount} Picthing, ${fallbackCount} ${methodLabel}`,
	)
}

// --- Step 6: Trim ---

async function stepTrim() {
	fs.mkdirSync(DIRS.final, { recursive: true })

	const nobgFiles = listFiles(DIRS.nobg, '.webp')
	if (nobgFiles.length === 0) {
		console.log('Step 6 (trim): no nobg files found. Run "matte" step first.\n')
		return
	}
	const todo = nobgFiles.filter(f => !fs.existsSync(path.join(DIRS.final, f)))

	console.log(
		`Step 6 (trim): ${todo.length} files to process (${nobgFiles.length - todo.length} already done)\n`,
	)
	if (todo.length === 0) return

	await pMap(
		todo,
		async file => {
			try {
				const input = path.join(DIRS.nobg, file)
				await sharp(input)
					.trim()
					.webp({ quality: 90, alphaQuality: 100 })
					.toFile(path.join(DIRS.final, file))
				console.log(`  ${file}: trimmed`)
			} catch (err) {
				console.error(
					`  ${file}: ERROR ${(err as Error).message.slice(0, 100)}`,
				)
			}
		},
		CONCURRENCY,
	)
}

// --- Prune: cascade-delete orphaned downstream files ---

function stepPrune() {
	let totalRemoved = 0

	// 0. normalized depends on sources
	const sourceBases = new Set(
		listFiles(DIRS.sources)
			.filter(f => /\.(jpg|jpeg|png|webp|avif)$/i.test(f))
			.map(f => f.replace(/\.[^.]+$/, '')),
	)
	for (const f of listFiles(DIRS.normalized, '.jpg')) {
		const base = f.replace(/\.jpg$/, '')
		if (!sourceBases.has(base)) {
			fs.unlinkSync(path.join(DIRS.normalized, f))
			console.log(`  prune normalized/${f} (no source)`)
			totalRemoved++
		}
	}

	// 1. split depends on normalized
	const normalizedBases = new Set(
		listFiles(DIRS.normalized, '.jpg').map(f => f.replace(/\.jpg$/, '')),
	)
	for (const f of listFiles(DIRS.split, '.jpg')) {
		const base = f.replace(/--(before|after)\.jpg$/, '')
		if (!normalizedBases.has(base)) {
			fs.unlinkSync(path.join(DIRS.split, f))
			console.log(`  prune split/${f} (no normalized source)`)
			totalRemoved++
		}
	}

	// 2. cleaned depends on split
	const splitBases = new Set(
		listFiles(DIRS.split, '.jpg').map(f => f.replace(/\.jpg$/, '')),
	)
	for (const f of listFiles(DIRS.cleaned, '.webp')) {
		const base = f.replace(/\.webp$/, '')
		if (!splitBases.has(base)) {
			fs.unlinkSync(path.join(DIRS.cleaned, f))
			console.log(`  prune cleaned/${f} (no split source)`)
			totalRemoved++
		}
	}

	// 3. white depends on cleaned
	const cleanedBases = new Set(
		listFiles(DIRS.cleaned, '.webp').map(f => f.replace(/\.webp$/, '')),
	)
	for (const f of listFiles(DIRS.white, '.webp')) {
		const base = f.replace(/\.webp$/, '')
		if (!cleanedBases.has(base)) {
			fs.unlinkSync(path.join(DIRS.white, f))
			console.log(`  prune white/${f} (no cleaned source)`)
			totalRemoved++
		}
	}

	// 4. black depends on white
	const whiteBases = new Set(
		listFiles(DIRS.white, '.webp').map(f => f.replace(/\.webp$/, '')),
	)
	for (const f of listFiles(DIRS.black, '.webp')) {
		const base = f.replace(/\.webp$/, '')
		if (!whiteBases.has(base)) {
			fs.unlinkSync(path.join(DIRS.black, f))
			console.log(`  prune black/${f} (no white source)`)
			totalRemoved++
		}
	}

	// 5. nobg depends on cleaned (rembg) or white+black (matte), plus nobg-manual
	const blackBases = new Set(
		listFiles(DIRS.black, '.webp').map(f => f.replace(/\.webp$/, '')),
	)
	const manualPruneBases = getManualBases()
	for (const f of listFiles(DIRS.nobg, '.webp')) {
		const base = f.replace(/\.webp$/, '')
		// If it came from manual, it just needs a cleaned source
		if (manualPruneBases.has(base)) {
			if (!cleanedBases.has(base)) {
				fs.unlinkSync(path.join(DIRS.nobg, f))
				console.log(`  prune nobg/${f} (no cleaned source)`)
				totalRemoved++
			}
		} else if (NOBG_METHOD === 'rembg') {
			// rembg: depends on cleaned/
			if (!cleanedBases.has(base)) {
				fs.unlinkSync(path.join(DIRS.nobg, f))
				console.log(`  prune nobg/${f} (no cleaned source)`)
				totalRemoved++
			}
		} else {
			// matte: depends on white+black
			if (!whiteBases.has(base) || !blackBases.has(base)) {
				fs.unlinkSync(path.join(DIRS.nobg, f))
				console.log(`  prune nobg/${f} (missing white or black)`)
				totalRemoved++
			}
		}
	}

	// 6. final depends on nobg
	const nobgBases = new Set(
		listFiles(DIRS.nobg, '.webp').map(f => f.replace(/\.webp$/, '')),
	)
	for (const f of listFiles(DIRS.final, '.webp')) {
		const base = f.replace(/\.webp$/, '')
		if (!nobgBases.has(base)) {
			fs.unlinkSync(path.join(DIRS.final, f))
			console.log(`  prune final/${f} (no nobg source)`)
			totalRemoved++
		}
	}

	if (totalRemoved === 0) {
		console.log('  nothing to prune')
	} else {
		console.log(`\n  pruned ${totalRemoved} orphaned files`)
	}
}

// --- Step 7: Deploy (copy final → public/img/before-after/ with sequential numbering) ---

const DEPLOY_DIR = path.join(process.cwd(), 'public', 'img', 'before-after')

async function stepDeploy() {
	const finalFiles = listFiles(DIRS.final, '.webp')
	if (finalFiles.length === 0) {
		console.log(
			'Step 7 (deploy): no final files found. Run "trim" step first.\n',
		)
		return
	}

	// Group files into pairs by service+number
	// e.g. botox_001--before.webp → service="botox", num="001", side="before"
	//      laser-skin-revitalization--before.webp → service="laser-skin-revitalization", num="000"
	const pairMap = new Map<string, { before?: string; after?: string }>()
	for (const f of finalFiles) {
		const matchWithNum = f.match(/^(.+?)_(\d+)--(.+?)\.webp$/)
		const matchWithHyphenNum = f.match(/^(.+?)-(\d+)--(.+?)\.webp$/)
		const matchNoNum = f.match(/^(.+?)--(.+?)\.webp$/)
		if (!matchWithNum && !matchWithHyphenNum && !matchNoNum) {
			console.log(`  skip ${f}: doesn't match expected pattern`)
			continue
		}
		const service = matchWithNum
			? matchWithNum[1]
			: matchWithHyphenNum
				? matchWithHyphenNum[1]
				: matchNoNum![1]
		const num = matchWithNum
			? matchWithNum[2]
			: matchWithHyphenNum
				? matchWithHyphenNum[2]
				: '000'
		const side = matchWithNum
			? matchWithNum[3]
			: matchWithHyphenNum
				? matchWithHyphenNum[3]
				: matchNoNum![2]
		const key = `${service}_${num}`
		if (!pairMap.has(key)) pairMap.set(key, {})
		const pair = pairMap.get(key)!
		if (side === 'before') pair.before = f
		else if (side === 'after') pair.after = f
	}

	// Group complete pairs by service, sorted by original number
	const serviceGroups = new Map<string, { before: string; after: string }[]>()
	for (const [key, pair] of [...pairMap.entries()].sort()) {
		if (!pair.before || !pair.after) {
			console.log(
				`  skip ${key}: incomplete pair (before=${!!pair.before}, after=${!!pair.after})`,
			)
			continue
		}
		const service = key.replace(/_\d+$/, '')
		if (!serviceGroups.has(service)) serviceGroups.set(service, [])
		serviceGroups.get(service)!.push({ before: pair.before, after: pair.after })
	}

	// Clear and recreate deploy dir
	if (fs.existsSync(DEPLOY_DIR)) {
		fs.rmSync(DEPLOY_DIR, { recursive: true })
	}
	fs.mkdirSync(DEPLOY_DIR, { recursive: true })

	let totalCopied = 0
	for (const [service, pairs] of [...serviceGroups.entries()].sort()) {
		for (let i = 0; i < pairs.length; i++) {
			const num = String(i + 1).padStart(3, '0')
			const newBefore = `${service}-${num}-before.webp`
			const newAfter = `${service}-${num}-after.webp`

			await sharp(path.join(DIRS.final, pairs[i]!.before))
				.webp({ quality: 90, alphaQuality: 100 })
				.toFile(path.join(DEPLOY_DIR, newBefore))
			await sharp(path.join(DIRS.final, pairs[i]!.after))
				.webp({ quality: 90, alphaQuality: 100 })
				.toFile(path.join(DEPLOY_DIR, newAfter))

			totalCopied += 2
		}
		console.log(
			`  ${service}: ${pairs.length} pairs → ${service}-001 to ${service}-${String(pairs.length).padStart(3, '0')}`,
		)
	}

	console.log(
		`\ndeploy summary: ${totalCopied} files copied to public/img/before-after/`,
	)
}

// --- CLI ---

async function main() {
	const steps = process.argv[2] ?? 'all'

	if (steps === '--help' || !steps) {
		console.log(`
Usage: tsx scripts/process-flat.ts <steps>

Steps:
  normalize  Convert all sources to real JPEG
  split      Detect layout + split into before/after halves — reads from normalized/
  clean      Remove text/logos from each half (Gemini) — reads from split/
  white      Generate white background version (Gemini) — reads from cleaned/
  black      Generate black background from white (Gemini) — reads from white/
  nobg       Remove bg: use nobg-manual/ (Picthing) first, fall back to rembg or matte
  trim       Trim transparent pixels — reads from nobg/
  deploy     Copy final → public/img/before-after/ with sequential numbering
  prune      Remove orphaned downstream files (auto-runs before "all")
  all        Prune + all steps in order (includes deploy)

Combine with +: white+black+nobg+trim+deploy

Pipeline:
  sources/ → normalized/ → split/ → cleaned/ → nobg/ → final/
                                         ↓
                                    (rembg) direct bg removal from cleaned/
                                    (matte) white/ → black/ → difference matte

  Paste Picthing results into: processing-images/nobg-manual/
  Name them to match cleaned files (e.g. botox_001--before.png)
  The nobg step uses those first, falls back to NOBG_METHOD for the rest.

Workflow: delete a bad file from any step, run "all", and everything downstream
gets cleaned up and regenerated.

Environment:
  GEMINI_API_KEY   Required for split + clean + white + black
  CONCURRENCY      Parallel workers (default: 4)
  NOBG_METHOD      rembg (default) or matte — fallback for non-Picthing files
                   rembg: uses rembg python library, skips white/black steps
                   matte: uses Gemini white+black → difference matte
`)
		process.exit(0)
	}

	const stepList =
		steps === 'all'
			? NOBG_METHOD === 'rembg'
				? ['prune', 'normalize', 'split', 'clean', 'nobg', 'trim', 'deploy']
				: [
						'prune',
						'normalize',
						'split',
						'clean',
						'white',
						'black',
						'nobg',
						'trim',
						'deploy',
					]
			: steps.split('+')

	for (const step of stepList) {
		console.log(`\n=== ${step.toUpperCase()} ===\n`)
		switch (step) {
			case 'prune':
				stepPrune()
				break
			case 'normalize':
				await stepNormalize()
				break
			case 'split':
				await stepSplit()
				break
			case 'clean':
				await stepClean()
				break
			case 'white':
				await stepWhite()
				break
			case 'black':
				await stepBlack()
				break
			case 'nobg':
				await stepNobg()
				break
			case 'trim':
				await stepTrim()
				break
			case 'deploy':
				await stepDeploy()
				break
			default:
				console.error(`Unknown step: ${step}`)
				process.exit(1)
		}
	}

	console.log('\nDone!')
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
