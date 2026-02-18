import fs from 'node:fs'
import path from 'node:path'
import { getServiceImage } from '../app/utils/service-images'

const CONTENT_DIR = path.join(process.cwd(), 'content')
const LOCATIONS_DIR = path.join(CONTENT_DIR, 'locations')
const PUBLIC_DIR = path.join(process.cwd(), 'public')

// --- Replicate content-loader logic ---
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

	if (withoutExt === 'index') {
		return category
	}

	// Replace /index with nothing (service folder index → service name)
	const cleaned = withoutExt.replace(/\/index$/, '')

	// If this is a direct file in a category (no slashes in cleaned path),
	// and the category does NOT have service folders, prefix with category.
	if (!cleaned.includes('/') && !categoriesWithServiceFolders.has(category)) {
		return `${category}/${cleaned}`
	}

	return cleaned
}

// --- Migration Logic ---

function migrateFile(filePath: string, locationId: string = 'all') {
	// Determine category and relative path
	let relPath = ''
	if (locationId !== 'all') {
		const locDir = path.join(LOCATIONS_DIR, locationId)
		relPath = path.relative(locDir, filePath)
	} else {
		relPath = path.relative(CONTENT_DIR, filePath)
	}

	const parts = relPath.split('/')
	const category = parts[0]
	const restPath = parts.slice(1).join('/')

	// Determine service slug
	const serviceSlug = filePathToUrlPath(category, restPath)

	// Get image path
	const imagePath = getServiceImage(serviceSlug, locationId)

	if (imagePath) {
		const sourceFile = path.join(PUBLIC_DIR, imagePath)
		// Destination: replace .md with .hero.webp
		const destFile = filePath.replace(/\.md$/, '.hero.webp')

		if (fs.existsSync(sourceFile)) {
			console.log(
				`Copying ${imagePath} to ${path.relative(process.cwd(), destFile)}`,
			)
			fs.copyFileSync(sourceFile, destFile)
		} else {
			console.warn(`Warning: Source image not found: ${sourceFile}`)
		}
	} else {
		console.log(
			`No image found for slug: ${serviceSlug} (Location: ${locationId})`,
		)
	}
}

function scanDir(dir: string, locationId: string = 'all') {
	const files = fs.readdirSync(dir, { withFileTypes: true })
	for (const file of files) {
		const fullPath = path.join(dir, file.name)
		if (file.isDirectory()) {
			if (locationId === 'all' && file.name === 'locations') continue // Skip locations dir in main scan
			scanDir(fullPath, locationId)
		} else if (file.name.endsWith('.md')) {
			migrateFile(fullPath, locationId)
		}
	}
}

// Scan main content
console.log('--- Migrating Main Service Pages ---')
scanDir(CONTENT_DIR, 'all')

// Scan locations
if (fs.existsSync(LOCATIONS_DIR)) {
	const locations = fs.readdirSync(LOCATIONS_DIR, { withFileTypes: true })
	for (const loc of locations) {
		if (loc.isDirectory()) {
			console.log(`--- Migrating ${loc.name} Pages ---`)
			scanDir(path.join(LOCATIONS_DIR, loc.name), loc.name)
		}
	}
}
