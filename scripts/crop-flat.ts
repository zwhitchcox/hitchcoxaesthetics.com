#!/usr/bin/env tsx
/**
 * Crop all source images into before/after halves, output as flat files.
 * Uses Gemini for layout analysis, sharp for cropping.
 *
 * Output: public/img/flat-for-bg-removal/
 *   botox__001-before.webp
 *   botox__001-after.webp
 *   ...
 *
 * Usage: GEMINI_API_KEY=... tsx scripts/crop-flat.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { GoogleGenAI } from '@google/genai'
import sharp from 'sharp'

const CANDIDATES_DIR = path.join(process.cwd(), 'public', 'img', 'candidates')
const OUTPUT_DIR = path.join(
	process.cwd(),
	'public',
	'img',
	'flat-for-bg-removal',
)
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '8', 10)

const layoutCache = new Map<string, string>()

async function analyzeLayout(
	gemini: GoogleGenAI,
	b64: string,
): Promise<string> {
	if (layoutCache.has(b64.slice(0, 100)))
		return layoutCache.get(b64.slice(0, 100))!

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
								text: 'This is a before-and-after comparison. Which side is BEFORE? Reply ONLY: BEFORE_LEFT, BEFORE_RIGHT, BEFORE_TOP, or BEFORE_BOTTOM',
							},
						],
					},
				],
			})
			const answer = (response.text ?? '').trim().toUpperCase()
			let result = 'BEFORE_LEFT' // default
			if (answer.includes('RIGHT')) result = 'BEFORE_RIGHT'
			else if (answer.includes('TOP')) result = 'BEFORE_TOP'
			else if (answer.includes('BOTTOM')) result = 'BEFORE_BOTTOM'
			layoutCache.set(b64.slice(0, 100), result)
			return result
		} catch (err) {
			if (attempt < 2)
				await new Promise(r => setTimeout(r, 5000 * (attempt + 1)))
			else throw err
		}
	}
	return 'BEFORE_LEFT'
}

async function cropHalf(
	buf: Buffer,
	which: 'left' | 'right' | 'top' | 'bottom',
): Promise<Buffer> {
	const meta = await sharp(buf).metadata()
	const w = meta.width!,
		h = meta.height!
	const regions = {
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
	return sharp(buf).extract(regions[which]).toBuffer()
}

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

async function main() {
	const geminiKey = process.env.GEMINI_API_KEY
	if (!geminiKey) {
		console.error('GEMINI_API_KEY required')
		process.exit(1)
	}

	const gemini = new GoogleGenAI({ apiKey: geminiKey })

	fs.mkdirSync(OUTPUT_DIR, { recursive: true })

	// Collect all source files
	type Item = { srcPath: string; prefix: string; num: string }
	const items: Item[] = []

	function walk(dir: string, prefix: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				walk(
					path.join(dir, entry.name),
					prefix ? `${prefix}__${entry.name}` : entry.name,
				)
			} else if (entry.name.match(/^\d+-source\./)) {
				const num = entry.name.match(/^(\d+)-source/)?.[1] ?? '000'
				const outBefore = path.join(
					OUTPUT_DIR,
					`${prefix ? prefix + '__' : ''}${num}-before.webp`,
				)
				// Skip if already done
				if (!fs.existsSync(outBefore)) {
					items.push({ srcPath: path.join(dir, entry.name), prefix, num })
				}
			}
		}
	}

	walk(CANDIDATES_DIR, '')

	console.log(`${items.length} images to crop (concurrency=${CONCURRENCY})\n`)

	await pMap(
		items,
		async item => {
			try {
				const buffer = fs.readFileSync(item.srcPath)
				const b64 = buffer.toString('base64')
				const layout = await analyzeLayout(gemini, b64)

				const opposites = {
					left: 'right',
					right: 'left',
					top: 'bottom',
					bottom: 'top',
				} as const
				type Side = keyof typeof opposites
				const beforeSide = layout.replace('BEFORE_', '').toLowerCase() as Side
				const afterSide = opposites[beforeSide]

				const [beforeBuf, afterBuf] = await Promise.all([
					cropHalf(buffer, beforeSide),
					cropHalf(buffer, afterSide),
				])

				const pfx = item.prefix ? `${item.prefix}__` : ''
				await sharp(beforeBuf)
					.webp({ quality: 95 })
					.toFile(path.join(OUTPUT_DIR, `${pfx}${item.num}-before.webp`))
				await sharp(afterBuf)
					.webp({ quality: 95 })
					.toFile(path.join(OUTPUT_DIR, `${pfx}${item.num}-after.webp`))

				console.log(`  ${pfx}${item.num}: done (${layout})`)
			} catch (err) {
				console.error(
					`  ${item.prefix}/${item.num}: ERROR ${(err as Error).message.slice(0, 100)}`,
				)
			}
		},
		CONCURRENCY,
	)

	const total = fs
		.readdirSync(OUTPUT_DIR)
		.filter(f => f.endsWith('.webp')).length
	console.log(`\nDone! ${total} files in ${OUTPUT_DIR}`)
	console.log(
		`\nUpload the contents of public/img/flat-for-bg-removal/ to your bg removal tool.`,
	)
	console.log(
		`When done, put the results back in the same directory with the same filenames.`,
	)
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
