#!/usr/bin/env tsx
/**
 * Distribute candidate source images evenly into knoxville/, farragut/, all/ subfolders.
 *
 * Usage:
 *   tsx scripts/distribute-candidates.ts
 *
 * Reads from: candidates/{service}/
 * Writes to:  public/img/candidates/{service}/knoxville/
 *             public/img/candidates/{service}/farragut/
 *             public/img/candidates/{service}/all/
 *
 * Images are distributed as evenly as possible. Remainders go to `all` first, then `knoxville`.
 */

import fs from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.join(process.cwd(), 'candidates')
const DEST_DIR = path.join(process.cwd(), 'public', 'img', 'candidates')
const LOCATIONS = ['all', 'knoxville', 'farragut'] as const

function main() {
	if (!fs.existsSync(SRC_DIR)) {
		console.error(`Source directory not found: ${SRC_DIR}`)
		process.exit(1)
	}

	const services = fs
		.readdirSync(SRC_DIR, { withFileTypes: true })
		.filter(d => d.isDirectory())
		.map(d => d.name)

	console.log(`Found ${services.length} services\n`)

	for (const service of services) {
		const serviceDir = path.join(SRC_DIR, service)
		const images = fs
			.readdirSync(serviceDir)
			.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
			.sort()

		if (images.length === 0) {
			console.log(`${service}: no images, skipping`)
			continue
		}

		// Create destination folders
		for (const loc of LOCATIONS) {
			fs.mkdirSync(path.join(DEST_DIR, service, loc), { recursive: true })
		}

		// Distribute evenly: all gets remainder priority, then knoxville
		const perLoc = Math.floor(images.length / 3)
		const remainder = images.length % 3

		const allCount = perLoc + (remainder >= 1 ? 1 : 0)
		const knoxCount = perLoc + (remainder >= 2 ? 1 : 0)
		const farCount = perLoc

		let idx = 0
		const assignments: { file: string; loc: string }[] = []

		for (let i = 0; i < allCount && idx < images.length; i++, idx++) {
			assignments.push({ file: images[idx]!, loc: 'all' })
		}
		for (let i = 0; i < knoxCount && idx < images.length; i++, idx++) {
			assignments.push({ file: images[idx]!, loc: 'knoxville' })
		}
		for (let i = 0; i < farCount && idx < images.length; i++, idx++) {
			assignments.push({ file: images[idx]!, loc: 'farragut' })
		}

		// Copy files
		for (const { file, loc } of assignments) {
			const src = path.join(serviceDir, file)
			const dest = path.join(DEST_DIR, service, loc, file)
			fs.copyFileSync(src, dest)
		}

		console.log(
			`${service}: ${images.length} images → all(${allCount}) knoxville(${knoxCount}) farragut(${farCount})`,
		)
	}

	console.log(`\nDone! Distributed to: ${DEST_DIR}`)
	console.log(`\nNext steps:`)
	console.log(`  1. Review: open public/img/candidates/`)
	console.log(
		`  2. Split:  OPENAI_API_KEY=sk-... tsx scripts/scrape-before-after.ts --split`,
	)
	console.log(`  3. Finalize: tsx scripts/scrape-before-after.ts --finalize`)
}

main()
