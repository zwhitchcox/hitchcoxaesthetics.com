/**
 * Restructure content/ from flat layout to hierarchical layout.
 *
 * Before:
 *   content/botox.md
 *   content/botox/forehead-lines.md
 *   content/injectables.md
 *   content/knoxville/botox.md
 *
 * After:
 *   content/injectables/index.md
 *   content/injectables/botox/index.md
 *   content/injectables/botox/forehead-lines.md
 *   content/injectables/skinvive.md
 *   content/locations/knoxville/injectables/botox/index.md
 *   content/locations/knoxville/injectables/botox/forehead-lines.md
 *
 * Usage: npx tsx scripts/restructure-content.ts
 */

import fs from 'node:fs'
import path from 'node:path'

const CONTENT_DIR = path.join(process.cwd(), 'content')
const NEW_DIR = path.join(process.cwd(), 'content-new')

function ensureDir(dir: string) {
	fs.mkdirSync(dir, { recursive: true })
}

function copyFile(src: string, dest: string) {
	ensureDir(path.dirname(dest))
	fs.copyFileSync(src, dest)
	console.log(
		`  ${path.relative(process.cwd(), src)} → ${path.relative(process.cwd(), dest)}`,
	)
}

// --- Define the hierarchy ---
// category → { services that have children (folders), services that are leaves (files) }

const hierarchy: Record<
	string,
	{
		services: Record<string, string[]> // service → sub-service filenames
		leaves: string[] // services with no children (just .md files)
	}
> = {
	injectables: {
		services: {
			botox: [
				'forehead-lines',
				'frown-lines',
				'crows-feet',
				'lip-flip',
				'bunny-lines',
				'gummy-smile',
				'chin-dimpling',
				'brow-lift',
			],
			filler: [
				'lip-filler',
				'cheek-filler',
				'chin-filler',
				'jawline-filler',
				'under-eye-filler',
				'nasolabial-folds',
			],
		},
		leaves: ['skinvive', 'kybella', 'jeuveau', 'dysport'],
	},
	'laser-services': {
		services: {
			everesse: ['face', 'jawline', 'neck'],
		},
		leaves: [
			'laser-hair-removal',
			'skin-revitalization',
			'pigmented-lesion-reduction',
			'vascular-lesion-reduction',
		],
	},
	microneedling: {
		services: {},
		leaves: [],
		// microneedling has direct children: face, hair-loss
	},
	'weight-loss': {
		services: {},
		leaves: ['semaglutide', 'tirzepatide'],
	},
}

// Special: microneedling children are directly under microneedling/
const microneedlingChildren = ['face', 'hair-loss']

console.log('=== Restructuring service pages ===\n')

// Process each category
for (const [category, { services, leaves }] of Object.entries(hierarchy)) {
	// Category index
	const catSrc = path.join(CONTENT_DIR, `${category}.md`)
	const catDest = path.join(NEW_DIR, category, 'index.md')
	if (fs.existsSync(catSrc)) copyFile(catSrc, catDest)

	// Services with children → folder/index.md + sub-services
	for (const [service, subServices] of Object.entries(services)) {
		// Service index
		const svcSrc = path.join(CONTENT_DIR, `${service}.md`)
		const svcDest = path.join(NEW_DIR, category, service, 'index.md')
		if (fs.existsSync(svcSrc)) copyFile(svcSrc, svcDest)

		// Sub-services
		for (const sub of subServices) {
			const subSrc = path.join(CONTENT_DIR, service, `${sub}.md`)
			const subDest = path.join(NEW_DIR, category, service, `${sub}.md`)
			if (fs.existsSync(subSrc)) copyFile(subSrc, subDest)
		}
	}

	// Leaf services (no children) → direct .md files
	for (const leaf of leaves) {
		const leafSrc = path.join(CONTENT_DIR, `${leaf}.md`)
		const leafDest = path.join(NEW_DIR, category, `${leaf}.md`)
		if (fs.existsSync(leafSrc)) copyFile(leafSrc, leafDest)
	}
}

// Special handling for microneedling children (direct children of category)
for (const child of microneedlingChildren) {
	const src = path.join(CONTENT_DIR, 'microneedling', `${child}.md`)
	const dest = path.join(NEW_DIR, 'microneedling', `${child}.md`)
	if (fs.existsSync(src)) copyFile(src, dest)
}

// --- Location pages ---
console.log('\n=== Restructuring location pages ===\n')

for (const locationId of ['knoxville', 'farragut']) {
	const locDir = path.join(CONTENT_DIR, locationId)
	if (!fs.existsSync(locDir)) continue

	// For each location service file, place it in the mirrored hierarchy
	for (const file of fs.readdirSync(locDir)) {
		if (!file.endsWith('.md')) continue
		const slug = file.replace('.md', '')
		const src = path.join(locDir, file)

		// Find which category this service belongs to
		let destPath: string | null = null

		// Check if it's a category
		if (hierarchy[slug]) {
			destPath = path.join(NEW_DIR, 'locations', locationId, slug, 'index.md')
		}
		// Check if it's a service with children
		else {
			for (const [category, { services, leaves }] of Object.entries(
				hierarchy,
			)) {
				if (slug in services) {
					destPath = path.join(
						NEW_DIR,
						'locations',
						locationId,
						category,
						slug,
						'index.md',
					)
					break
				}
				if (leaves.includes(slug)) {
					destPath = path.join(
						NEW_DIR,
						'locations',
						locationId,
						category,
						`${slug}.md`,
					)
					break
				}
			}
			// Check microneedling children
			if (!destPath && microneedlingChildren.includes(slug)) {
				destPath = path.join(
					NEW_DIR,
					'locations',
					locationId,
					'microneedling',
					`${slug}.md`,
				)
			}
			// Fallback — put directly under location
			if (!destPath) {
				destPath = path.join(NEW_DIR, 'locations', locationId, `${slug}.md`)
				console.log(
					`  WARNING: Could not place ${locationId}/${slug} in hierarchy, using fallback`,
				)
			}
		}

		if (destPath) copyFile(src, destPath)
	}
}

console.log('\n=== Done! Files written to content-new/ ===')
console.log('Review the output, then:')
console.log('  rm -rf content && mv content-new content')
