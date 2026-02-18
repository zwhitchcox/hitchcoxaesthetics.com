/**
 * Migration script: Create .hero/ directories next to each .md file
 * with all before/after image pairs for that service.
 *
 * Uses the SLUG_TO_PREFIX mapping from service-images.ts to determine
 * which image prefix to use, then copies ALL pairs for that prefix
 * into the .hero/ directory.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getAllServiceImages } from '../app/utils/service-images'

const CONTENT_DIR = path.join(process.cwd(), 'content')
const LOCATIONS_DIR = path.join(CONTENT_DIR, 'locations')
const PUBLIC_DIR = path.join(process.cwd(), 'public')

// --- Replicate content-loader logic to get service slugs ---
const CATEGORY_DIRS = fs.existsSync(CONTENT_DIR)
	? fs
			.readdirSync(CONTENT_DIR, { withFileTypes: true })
			.filter(e => e.isDirectory() && e.name !== 'locations')
			.map(e => e.name)
	: []

const categoriesWithServiceFolders = new Set<string>()
for (const category of CATEGORY_DIRS) {
	const catDir = path.join(CONTENT_DIR, category)
	const hasSubDirs = fs
		.readdirSync(catDir, { withFileTypes: true })
		.some(e => e.isDirectory())
	if (hasSubDirs) categoriesWithServiceFolders.add(category)
}

function filePathToUrlPath(category: string, relativePath: string): string {
	const withoutExt = relativePath.replace(/\.md$/, '')
	if (withoutExt === 'index') return category
	const cleaned = withoutExt.replace(/\/index$/, '')
	if (!cleaned.includes('/') && !categoriesWithServiceFolders.has(category)) {
		return `${category}/${cleaned}`
	}
	return cleaned
}

function createHeroDir(mdFilePath: string, serviceSlug: string) {
	const heroDir = mdFilePath.replace(/\.md$/, '.hero')

	// Get all image pairs for this service
	const pairs = getAllServiceImages(serviceSlug)
	if (pairs.length === 0) {
		console.log(`  No images for ${serviceSlug}, skipping`)
		return
	}

	// Create the .hero/ directory
	fs.mkdirSync(heroDir, { recursive: true })

	let copied = 0
	for (const pair of pairs) {
		const beforeSrc = path.join(PUBLIC_DIR, pair.before)
		const afterSrc = path.join(PUBLIC_DIR, pair.after)
		const beforeName = path.basename(pair.before)
		const afterName = path.basename(pair.after)

		if (fs.existsSync(beforeSrc)) {
			fs.copyFileSync(beforeSrc, path.join(heroDir, beforeName))
			copied++
		}
		if (fs.existsSync(afterSrc)) {
			fs.copyFileSync(afterSrc, path.join(heroDir, afterName))
			copied++
		}
	}

	const rel = path.relative(process.cwd(), heroDir)
	console.log(`  ${rel}/ (${pairs.length} pairs, ${copied} files)`)
}

function scanMainContent() {
	for (const category of CATEGORY_DIRS) {
		const categoryDir = path.join(CONTENT_DIR, category)

		function scan(dir: string) {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const fullPath = path.join(dir, entry.name)
				if (entry.isDirectory()) {
					scan(fullPath)
				} else if (entry.name.endsWith('.md')) {
					const relativePath = path.relative(categoryDir, fullPath)
					const serviceSlug = filePathToUrlPath(category, relativePath)
					createHeroDir(fullPath, serviceSlug)
				}
			}
		}

		scan(categoryDir)
	}
}

function scanLocationContent() {
	if (!fs.existsSync(LOCATIONS_DIR)) return

	for (const locEntry of fs.readdirSync(LOCATIONS_DIR, {
		withFileTypes: true,
	})) {
		if (!locEntry.isDirectory()) continue
		const locationId = locEntry.name
		const locationDir = path.join(LOCATIONS_DIR, locationId)

		function scan(dir: string) {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const fullPath = path.join(dir, entry.name)
				if (entry.isDirectory()) {
					scan(fullPath)
				} else if (entry.name.endsWith('.md')) {
					const relToLocation = path.relative(locationDir, fullPath)
					const parts = relToLocation.split('/')
					const category = parts[0]!
					const restPath = parts.slice(1).join('/')
					const serviceSlug = filePathToUrlPath(category, restPath)
					// Location pages use the SAME image set as the base service
					createHeroDir(fullPath, serviceSlug)
				}
			}
		}

		scan(locationDir)
	}
}

console.log('--- Main Service Pages ---')
scanMainContent()
console.log('\n--- Location Pages ---')
scanLocationContent()
console.log('\nDone!')
