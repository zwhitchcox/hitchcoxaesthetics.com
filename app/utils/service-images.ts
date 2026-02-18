import fs from 'node:fs'
import path from 'node:path'

/**
 * Deterministic before/after image assignment for services across locations.
 *
 * Scans public/img/before-after/ at import time and builds a map of
 * service → sorted list of image pair numbers.
 *
 * Location indices: 0 = all (no location), 1 = knoxville, 2 = farragut
 * Each location gets a different image (where available) via modular arithmetic.
 *
 * The assignment is fully deterministic: same files on disk → same assignment.
 */

const BEFORE_AFTER_DIR = path.join(
	process.cwd(),
	'public',
	'img',
	'before-after',
)

// --- Build the image index at import time ---

/** Map from image prefix (e.g. "botox") → sorted list of pair numbers ["001", "002", ...] */
const imageIndex = new Map<string, string[]>()

if (fs.existsSync(BEFORE_AFTER_DIR)) {
	const files = fs
		.readdirSync(BEFORE_AFTER_DIR)
		.filter(f => f.endsWith('-after.webp'))
		.sort()

	for (const f of files) {
		// e.g. "botox-001-after.webp" → prefix="botox", num="001"
		const match = f.match(/^(.+)-(\d{3})-after\.webp$/)
		if (!match) continue
		const [, prefix, num] = match
		if (!imageIndex.has(prefix!)) imageIndex.set(prefix!, [])
		imageIndex.get(prefix!)!.push(num!)
	}
}

// --- Slug-to-image-prefix mapping ---

/**
 * Maps route slugs to image prefixes.
 *
 * Route slugs use slashes for sub-services (e.g. "botox/brow-lift"),
 * while image prefixes use hyphens (e.g. "botox-brow-lift").
 *
 * Some services don't have their own images and fall back to a related service.
 * Categories (injectables, laser-services, weight-loss) fall back to a representative child.
 *
 * When multiple slugs share the same prefix, use `offset` to pick different images
 * so siblings don't all show the same photo.
 */
type PrefixMapping = { prefix: string; offset: number }
const SLUG_TO_PREFIX: Record<string, string | PrefixMapping> = {
	// Categories → representative child
	injectables: 'botox',
	'laser-services': 'laser-hair-removal',
	'weight-loss': 'semaglutide',

	// Top-level services (direct match)
	botox: 'botox',
	kybella: 'kybella',
	'laser-hair-removal': 'laser-hair-removal',
	microneedling: 'microneedling',
	'pigmented-lesion-reduction': 'pigmented-lesion-reduction',
	semaglutide: 'semaglutide',
	skinvive: 'skinvive',
	'vascular-lesion-reduction': 'vascular-lesion-reduction',

	// Services that share images with a sibling (offset to pick different images)
	filler: 'filler-lip-filler',
	jeuveau: { prefix: 'botox', offset: 1 },
	dysport: { prefix: 'botox', offset: 2 },
	tirzepatide: { prefix: 'semaglutide', offset: 1 },
	everesse: 'skinvive',
	// skin-revitalization now uses direct prefix if available

	// Botox sub-services
	'botox/forehead-lines': 'botox-forehead-lines',
	'botox/frown-lines': 'botox-frown-lines',
	'botox/crows-feet': 'botox-crows-feet',
	'botox/lip-flip': 'botox-lip-flip',
	'botox/bunny-lines': 'botox-bunny-lines',
	'botox/gummy-smile': 'botox-gummy-smile',
	'botox/chin-dimpling': 'botox-chin-dimpling',
	'botox/brow-lift': 'botox-brow-lift',

	// Filler sub-services
	'filler/lip-filler': 'filler-lip-filler',
	'filler/cheek-filler': 'filler-cheek-filler',
	'filler/chin-filler': 'filler-chin-filler',
	'filler/jawline-filler': 'filler-jawline-filler',
	'filler/under-eye-filler': { prefix: 'filler-cheek-filler', offset: 1 },
	'filler/nasolabial-folds': { prefix: 'filler-cheek-filler', offset: 2 },

	// Microneedling sub-services
	'microneedling/face': 'microneedling',
	'microneedling/hair-loss': { prefix: 'microneedling', offset: 1 },

	// Everesse sub-services (fallback to skinvive until real images exist)
	'everesse/face': 'skinvive',
	'everesse/neck': { prefix: 'skinvive', offset: 1 },
	'everesse/jawline': { prefix: 'skinvive', offset: 2 },
}

function resolvePrefix(mapping: string | PrefixMapping): {
	prefix: string
	offset: number
} {
	if (typeof mapping === 'string') return { prefix: mapping, offset: 0 }
	return mapping
}

function resolveServicePrefix(
	serviceSlug: string,
): { prefix: string; offset: number } | null {
	const mapped = SLUG_TO_PREFIX[serviceSlug]
	if (mapped) return resolvePrefix(mapped)

	const directPrefix = serviceSlug.replace(/\//g, '-')
	if (imageIndex.has(directPrefix)) {
		return { prefix: directPrefix, offset: 0 }
	}

	return null
}

/** Location string → index for modular image selection */
const LOCATION_INDEX: Record<string, number> = {
	all: 0,
	knoxville: 1,
	farragut: 2,
}

/**
 * Get the heroImage path for a service at a given location.
 *
 * Returns the "after" image path (e.g. "/img/before-after/botox-001-after.webp").
 * The "before" image can be derived by replacing "-after." with "-before." in the path.
 *
 * @param serviceSlug - Route slug (e.g. "botox", "botox/brow-lift", "filler/lip-filler")
 * @param locationId - "all" | "knoxville" | "farragut" (defaults to "all")
 * @returns The heroImage path, or undefined if no images exist for this service
 */
export function getServiceImage(
	serviceSlug: string,
	locationId: string = 'all',
): string | undefined {
	const resolved = resolveServicePrefix(serviceSlug)
	if (!resolved) return undefined

	const { prefix, offset } = resolved
	const pairs = imageIndex.get(prefix)
	if (!pairs || pairs.length === 0) return undefined

	const locIdx = LOCATION_INDEX[locationId] ?? 0
	const pairNum = pairs[(locIdx + offset) % pairs.length]

	return `/img/before-after/${prefix}-${pairNum}-after.webp`
}

/**
 * Get all image pair numbers for a service (for galleries, carousels, etc.)
 *
 * @param serviceSlug - Route slug
 * @returns Array of {before, after} image paths, or empty array
 */
export function getAllServiceImages(
	serviceSlug: string,
): { before: string; after: string }[] {
	const resolved = resolveServicePrefix(serviceSlug)
	if (!resolved) return []

	const { prefix } = resolved
	const pairs = imageIndex.get(prefix)
	if (!pairs || pairs.length === 0) return []

	return pairs.map(num => ({
		before: `/img/before-after/${prefix}-${num}-before.webp`,
		after: `/img/before-after/${prefix}-${num}-after.webp`,
	}))
}

/**
 * Derive the "before" image path from a heroImage (after) path.
 * e.g. "/img/before-after/botox-001-after.webp" → "/img/before-after/botox-001-before.webp"
 */
export function deriveBeforeImage(heroImage: string): string {
	return heroImage.replace('-after.', '-before.')
}
