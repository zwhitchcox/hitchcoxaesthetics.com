#!/usr/bin/env tsx
/**
 * Trim transparent padding from all WebP/PNG images in public/img subdirectories.
 *
 * Usage:
 *   tsx scripts/trim-images.ts                    # trim all
 *   tsx scripts/trim-images.ts botox-forehead-lines  # trim one service
 */

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC_IMG_DIR = path.join(process.cwd(), 'public', 'img')

async function trimImage(filePath: string): Promise<boolean> {
	try {
		const meta = await sharp(filePath).metadata()
		if (!meta.width || !meta.height) return false

		const trimmed = await sharp(filePath)
			.trim()
			.toBuffer({ resolveWithObject: true })

		// Only save if we actually trimmed something
		if (trimmed.info.width < meta.width || trimmed.info.height < meta.height) {
			const ext = path.extname(filePath).toLowerCase()
			if (ext === '.webp') {
				await sharp(trimmed.data)
					.webp({ quality: 90, alphaQuality: 100 })
					.toFile(filePath)
			} else {
				await sharp(trimmed.data).png().toFile(filePath)
			}
			const savedKb = (
				((meta.width * meta.height - trimmed.info.width * trimmed.info.height) /
					(meta.width * meta.height)) *
				100
			).toFixed(0)
			console.log(
				`  Trimmed: ${path.basename(filePath)} (${meta.width}x${meta.height} → ${trimmed.info.width}x${trimmed.info.height}, ~${savedKb}% smaller)`,
			)
			return true
		}
		return false
	} catch (err) {
		console.error(`  Error trimming ${filePath}: ${(err as Error).message}`)
		return false
	}
}

async function main() {
	const args = process.argv.slice(2)
	const targetService = args[0]

	const dirs = targetService
		? [path.join(PUBLIC_IMG_DIR, targetService)]
		: fs
				.readdirSync(PUBLIC_IMG_DIR)
				.map(d => path.join(PUBLIC_IMG_DIR, d))
				.filter(d => fs.statSync(d).isDirectory())

	let trimmed = 0
	let skipped = 0

	for (const dir of dirs) {
		if (!fs.existsSync(dir)) {
			console.error(`Directory not found: ${dir}`)
			continue
		}
		const name = path.basename(dir)
		const files = fs
			.readdirSync(dir)
			.filter(f => /\.(webp|png)$/i.test(f))
			.map(f => path.join(dir, f))

		if (files.length === 0) continue
		console.log(`${name}:`)

		for (const file of files) {
			const didTrim = await trimImage(file)
			if (didTrim) trimmed++
			else skipped++
		}
	}

	console.log(`\nDone: ${trimmed} trimmed, ${skipped} already tight`)
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
