#!/usr/bin/env tsx
/**
 * Generate before/after images for service pages using OpenAI's gpt-image-1 API.
 * Images have transparent backgrounds and are saved as PNG, then converted to WebP.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... tsx scripts/generate-images.ts botox-forehead-lines
 *   OPENAI_API_KEY=sk-... tsx scripts/generate-images.ts botox-forehead-lines before
 *   OPENAI_API_KEY=sk-... tsx scripts/generate-images.ts --missing
 *   tsx scripts/generate-images.ts --list-missing
 *   tsx scripts/generate-images.ts --generate-script   # outputs scripts/generate-missing.sh
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import OpenAI from 'openai'
import sharp from 'sharp'

const PUBLIC_IMG_DIR = path.join(process.cwd(), 'public', 'img')

// Each entry describes how to generate a matching before/after pair.
// The "subject" ensures both images depict the same person/body part.
type ImageDef = {
	description: string
	subject: string // Shared subject description so before/after match
	beforeDetail: string // What makes the "before" distinct
	afterDetail: string // What makes the "after" distinct
}

// Keep descriptions subtle and believable. Real patients have mild-to-moderate
// concerns, not extreme ones. The images should look like casual phone photos,
// not dramatic clinical documentation or 3D renders.

const IMAGE_DEFS: Record<string, ImageDef> = {
	// === Top-level services ===
	botox: {
		description: 'Botox for wrinkles and fine lines',
		subject:
			'A woman in her early 40s, front-facing, bare face, normal skin with a few pores and a freckle',
		beforeDetail:
			"some forehead lines, mild frown lines between the brows, light crow's feet — nothing extreme, just normal early aging",
		afterDetail:
			"same woman, forehead looks a bit smoother, frown lines softer, crow's feet less noticeable — a subtle realistic improvement",
	},
	filler: {
		description: 'Dermal filler for lips cheeks facial balancing',
		subject:
			'A woman in her mid-30s, three-quarter angle, bare face, normal skin',
		beforeDetail:
			'slightly thin lips, mild flatness in cheeks, light nasolabial lines — just normal, nothing dramatic',
		afterDetail:
			'same woman, lips a touch fuller, cheeks look a little more lifted, nasolabial lines softer — subtle natural change',
	},
	skinvive: {
		description: 'SkinVive skin hydration',
		subject:
			"Close-up of a woman's cheek and jawline, clean skin, no makeup, normal pores",
		beforeDetail:
			'skin looks a bit dull and dry, some visible pores, slightly rough texture',
		afterDetail:
			'same skin looking a bit dewier and healthier, pores still there but skin has a nice glow',
	},
	kybella: {
		description: 'Kybella double chin reduction',
		subject:
			'Side profile of a woman in her 40s, bare face, normal skin on neck',
		beforeDetail:
			'some extra fullness under the chin, soft jawline — mild double chin, nothing extreme',
		afterDetail:
			'same woman, under-chin area a bit slimmer, jawline slightly more defined',
	},
	microneedling: {
		description: 'Microneedling for skin texture',
		subject:
			"Close-up of a woman's cheek, clean skin, no makeup, normal lighting",
		beforeDetail:
			'some old acne marks, mildly enlarged pores, slightly uneven texture',
		afterDetail:
			'same cheek, marks are faded, pores look smaller, skin is smoother overall but still natural',
	},
	semaglutide: {
		description: 'Semaglutide weight loss',
		subject:
			'A woman in her mid-30s wearing simple black workout clothes, standing casually',
		beforeDetail:
			'a bit overweight, fuller face and midsection, relaxed posture',
		afterDetail:
			'same woman looking noticeably slimmer, face more defined, midsection trimmer',
	},
	everesse: {
		description: 'Everesse skin tightening',
		subject:
			"Close-up of a woman's jawline and lower face, age 50, clean skin, no makeup",
		beforeDetail:
			'mild jowling, some looseness along the jawline, slight sagging',
		afterDetail:
			'same woman, jawline looks a bit tighter and more defined, subtle lift',
	},
	'laser-hair-removal': {
		description: 'Laser hair removal',
		subject: "Close-up of a woman's underarm area, normal skin",
		beforeDetail:
			'visible dark stubble and some hair regrowth, a couple razor bumps',
		afterDetail: 'same area, smooth and hair-free, normal skin texture',
	},
	'skin-revitalization': {
		description: 'Laser skin revitalization',
		subject:
			"Close-up of a woman's face, age 45, clean skin, no makeup, no makeup",
		beforeDetail:
			'mildly uneven skin tone, a few sun spots, some fine lines, skin looks a bit tired',
		afterDetail:
			'same woman, skin tone more even, sun spots lighter, looks fresher and brighter',
	},
	'pigmented-lesion-reduction': {
		description: 'Pigmented lesion and dark spot removal',
		subject: "Close-up of the back of a person's hand, normal skin",
		beforeDetail:
			'several brown sun spots and age spots on the hand, normal skin with visible veins',
		afterDetail:
			'same hand, spots are much lighter, some barely visible, skin otherwise unchanged',
	},
	'vascular-lesion-reduction': {
		description: 'Vascular lesion and spider vein treatment',
		subject: "Close-up of a woman's nose and cheek area, clean skin, no makeup",
		beforeDetail:
			'some visible red spider veins on the cheeks, mild redness around the nose, a few broken capillaries',
		afterDetail:
			'same area, veins much less visible, redness reduced, skin looks calmer',
	},
	'hair-loss-prevention-regrowth': {
		description: 'Microneedling for hair loss',
		subject: "Top-down view of a person's scalp along the hair part",
		beforeDetail:
			'widening part line, scalp visible through thinning hair, some wispy hairs',
		afterDetail:
			'same scalp, part looks narrower, more hair coverage, less scalp showing',
	},

	// === Botox sub-services ===
	'botox-forehead-lines': {
		description: 'Botox for forehead lines',
		subject:
			"A woman's upper face from hairline down to her eyes, front-facing, clean skin, no makeup, normal lighting",
		beforeDetail:
			'several noticeable horizontal wrinkles across the forehead, the lines are clearly visible even at rest, full forehead showing from hairline to eyebrows',
		afterDetail:
			'same woman, the horizontal forehead wrinkles are visibly smoother and less deep, full forehead showing from hairline to eyebrows, skin still natural',
	},
	'botox-frown-lines': {
		description: 'Botox for the vertical lines between the eyebrows',
		subject:
			"Close-up of a woman's upper face showing the space between her eyebrows and her forehead, clean skin, no makeup, relaxed expression",
		beforeDetail:
			'two mild vertical creases in the space between the eyebrows, slightly furrowed look',
		afterDetail:
			'same area looking smoother and more relaxed, the vertical creases between the eyebrows are softer, no longer furrowed',
	},
	'botox-crows-feet': {
		description: "Botox for crow's feet",
		subject:
			"Close-up of a woman's eye corner while she's smiling slightly, clean skin, no makeup",
		beforeDetail:
			"some crow's feet lines fanning out from the eye corner when smiling",
		afterDetail:
			'same eye corner smiling, lines are softer and less noticeable',
	},
	'botox-lip-flip': {
		description: 'Botox lip flip',
		subject:
			"Close-up of a woman's lips and mouth, clean skin, no makeup, slight smile",
		beforeDetail:
			'upper lip is a bit thin and curls inward when smiling, not much lip showing',
		afterDetail:
			'same lips, upper lip is slightly rolled outward, a bit more pink visible, subtle change',
	},
	'botox-bunny-lines': {
		description: 'Botox for bunny lines',
		subject: 'Close-up of a woman scrunching her nose, clean skin, no makeup',
		beforeDetail:
			'some small wrinkles on the sides of the nose when scrunching, normal pores',
		afterDetail:
			'same expression, wrinkles on nose sides are reduced, skin looks the same otherwise',
	},
	'botox-gummy-smile': {
		description: 'Botox for gummy smile',
		subject:
			'Close-up of a woman smiling wide showing teeth and gums, natural teeth',
		beforeDetail:
			'a bit too much gum showing above the upper teeth when smiling',
		afterDetail:
			'same smile, less gum visible, upper lip sits a little lower, more balanced',
	},
	'botox-chin-dimpling': {
		description: 'Botox for chin dimpling',
		subject: "Close-up of a woman's chin area, clean skin, no makeup",
		beforeDetail:
			'slightly bumpy or pebbled texture on the chin, mild dimpling',
		afterDetail:
			'same chin, surface is smoother, dimpling gone, normal skin texture',
	},
	'botox-brow-lift': {
		description: 'Botox brow lift',
		subject:
			"Close-up of a woman's eye and brow, clean skin, no makeup, natural brow hair",
		beforeDetail:
			'brow sitting a little low, making the eye area look slightly heavy or tired',
		afterDetail:
			'same brow lifted just a couple millimeters, eye area looks more open and awake',
	},

	// === Filler sub-services ===
	'filler-lip-filler': {
		description: 'Lip filler',
		subject:
			"Close-up of a woman's lips, mouth slightly parted, clean skin, no makeup, natural lip texture",
		beforeDetail:
			'naturally thin lips, especially the upper lip, slight asymmetry',
		afterDetail:
			'same lips with a bit more volume, better-defined border, still looks natural not overdone',
	},
	'filler-cheek-filler': {
		description: 'Cheek filler',
		subject:
			'Three-quarter view of a woman in her late 30s, bare face, normal skin',
		beforeDetail:
			'cheeks look a bit flat, mild volume loss in the mid-face area',
		afterDetail:
			'same woman, cheeks look a little fuller and more lifted, subtle change',
	},
	'filler-chin-filler': {
		description: 'Chin filler',
		subject:
			"Side profile of a woman's chin and lower face, clean skin, no makeup",
		beforeDetail: 'chin is a bit recessed, profile looks slightly unbalanced',
		afterDetail:
			'same profile, chin has a bit more projection, face looks more balanced',
	},
	'filler-jawline-filler': {
		description: 'Jawline filler',
		subject:
			"Three-quarter view of a woman's jawline from ear to chin, clean skin, no makeup",
		beforeDetail: 'jawline is soft and undefined, very mild early jowling',
		afterDetail: 'same jaw with a bit more definition and angle, looks sharper',
	},
	'filler-under-eye-filler': {
		description: 'Under-eye filler',
		subject:
			"Close-up of a woman's under-eye area, clean skin, no makeup, no makeup",
		beforeDetail:
			'mild dark circles, slight hollowness under the eyes, looks a bit tired',
		afterDetail:
			'same under-eye area, hollows filled a bit, dark circles reduced, looks more rested',
	},
	'filler-nasolabial-folds': {
		description: 'Nasolabial fold filler',
		subject:
			"Close-up of a woman's nose-to-mouth area, clean skin, no makeup, normal pores",
		beforeDetail:
			'moderate nasolabial fold lines running from nose to mouth corners',
		afterDetail:
			'same area, folds are softer and less shadowed, still has some line but much improved',
	},

	// === Microneedling sub-services ===
	'microneedling-face': {
		description: 'Face microneedling for skin texture',
		subject:
			"Close-up of a woman's cheek, clean skin, no makeup, you can see individual pores",
		beforeDetail:
			'some old shallow acne marks, mildly enlarged pores, slightly rough texture',
		afterDetail:
			'same cheek, marks are fading, pores look smaller, skin is smoother but still real',
	},
	'microneedling-hair-loss': {
		description: 'Scalp microneedling for hair regrowth',
		subject: "Top-down view of a person's scalp along the center hair part",
		beforeDetail:
			'widening part line, scalp visible through thin hair, some wispy strands',
		afterDetail:
			'same scalp, part is narrower, more hair filling in, less scalp showing',
	},
}

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

function getMissing(): { service: string; type: 'before' | 'after' }[] {
	const existing = getExistingImages()
	const missing: { service: string; type: 'before' | 'after' }[] = []
	for (const service of Object.keys(IMAGE_DEFS)) {
		const files = existing.get(service) ?? new Set()
		const hasBefore = ['before.jpg', 'before.webp', 'before.png'].some(f =>
			files.has(f),
		)
		const hasAfter = ['after.jpg', 'after.webp', 'after.png'].some(f =>
			files.has(f),
		)
		if (!hasBefore) missing.push({ service, type: 'before' })
		if (!hasAfter) missing.push({ service, type: 'after' })
	}
	return missing
}

function _getMissingServices(): string[] {
	const missing = getMissing()
	return [...new Set(missing.map(m => m.service))]
}

async function toWebp(pngPath: string, webpPath: string): Promise<void> {
	await sharp(pngPath)
		.trim() // auto-crop transparent padding
		.webp({ quality: 90, alphaQuality: 100 })
		.toFile(webpPath)
	fs.unlinkSync(pngPath)
	console.log(`  Saved: ${webpPath}`)
}

/**
 * Generate a before/after pair for a service.
 * 1. Generate the "before" image from scratch
 * 2. Feed the "before" image into image edit to produce the "after"
 *    so it's the same person with the treatment applied.
 */
async function generatePair(service: string): Promise<void> {
	const def = IMAGE_DEFS[service]
	if (!def) {
		console.error(`Unknown service: ${service}`)
		console.error(`Available:\n  ${Object.keys(IMAGE_DEFS).join('\n  ')}`)
		process.exit(1)
	}

	const apiKey = process.env.OPENAI_API_KEY
	if (!apiKey) {
		console.error('OPENAI_API_KEY environment variable is required')
		process.exit(1)
	}

	const openai = new OpenAI({ apiKey })
	const outputDir = path.join(PUBLIC_IMG_DIR, service)
	fs.mkdirSync(outputDir, { recursive: true })

	// --- Step 1: Generate the "before" image ---
	console.log(`\n  Generating BEFORE for "${service}"...`)

	const beforePrompt = [
		'A single casual photograph of one person or body part.',
		'NOT a comparison. NOT a side-by-side. NOT a collage. Just one photo.',
		"Style: ordinary snapshot taken on an iPhone at a doctor's office.",
		"Photorealistic. Looks like a real photo you'd find on someone's phone.",
		'Normal everyday skin — some pores, maybe a freckle or two, normal imperfections.',
		'Do NOT exaggerate any features. Subtle, believable, realistic.',
		'NOT a cartoon, NOT an illustration, NOT hyperrealistic, NOT 3D rendered.',
		'NOT airbrushed. NOT overly dramatic. Just a normal photo of a normal person.',
		`${def.subject}.`,
		`Showing: ${def.beforeDetail}.`,
		'Nothing else in the frame — no background, no floor, no furniture, no room.',
		'Just the person/body part on a transparent background.',
		'No text, no labels, no watermarks.',
	].join(' ')

	const beforeResponse = await openai.images.generate({
		model: 'gpt-image-1.5',
		prompt: beforePrompt,
		n: 1,
		size: '1024x1024',
		quality: 'high',
		background: 'transparent',
		output_format: 'png',
	})

	const beforeB64 = beforeResponse.data?.[0]?.b64_json
	if (!beforeB64) {
		console.error('  No before image returned from OpenAI')
		process.exit(1)
	}

	const beforeBuffer = Buffer.from(beforeB64, 'base64')
	const beforePng = path.join(outputDir, 'before.png')
	const beforeWebp = path.join(outputDir, 'before.webp')
	fs.writeFileSync(beforePng, beforeBuffer)
	console.log(
		`  Before PNG saved (${(beforeBuffer.length / 1024).toFixed(0)}KB)`,
	)
	await toWebp(beforePng, beforeWebp)

	// --- Step 2: Generate "after" via Responses API with image_generation tool ---
	console.log(
		`  Generating AFTER for "${service}" (using before image as reference)...`,
	)

	const afterPrompt = [
		'Look at the attached photo. This is a BEFORE photo of a person prior to a cosmetic treatment.',
		`Generate a new image of this EXACT SAME person showing them AFTER ${def.description}.`,
		`The after result should show: ${def.afterDetail}.`,
		'Keep the same person, same angle, same lighting, same framing.',
		'The change should be subtle and realistic.',
		'Transparent background. No text, no labels, no watermarks.',
		"Do NOT change the person's identity, hair color, or clothing.",
		'Output a single photo, NOT a side-by-side comparison.',
	].join(' ')

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const afterResponse: any = await openai.responses.create({
		model: 'gpt-5.2',
		input: [
			{
				role: 'user',
				content: [
					{
						type: 'input_image',
						image_url: `data:image/png;base64,${beforeB64}`,
						detail: 'high',
					},
					{
						type: 'input_text',
						text: afterPrompt,
					},
				],
			},
		],
		tools: [
			{
				type: 'image_generation',
				model: 'gpt-image-1.5',
				background: 'transparent',
				output_format: 'png',
				size: '1024x1024',
				quality: 'high',
			},
		],
	} as any)

	// Extract the generated image from the response
	let afterB64: string | undefined
	for (const item of afterResponse.output ?? []) {
		if (item.type === 'image_generation_call' && item.result) {
			afterB64 = item.result
			break
		}
	}

	if (!afterB64) {
		console.error('  No after image returned')
		console.error(
			'  Output types:',
			JSON.stringify(afterResponse.output?.map((o: any) => o.type)),
		)
		process.exit(1)
	}

	const afterBuffer = Buffer.from(afterB64, 'base64')
	const afterPng = path.join(outputDir, 'after.png')
	const afterWebp = path.join(outputDir, 'after.webp')
	fs.writeFileSync(afterPng, afterBuffer)
	console.log(`  After PNG saved (${(afterBuffer.length / 1024).toFixed(0)}KB)`)
	await toWebp(afterPng, afterWebp)

	console.log(`  Done: ${service} (before + after)`)
}

function generateScript(): void {
	const missing = getMissing()
	if (missing.length === 0) {
		console.log('All images present. No script needed.')
		return
	}

	// Group by service so we generate both before+after together
	const byService = new Map<string, ('before' | 'after')[]>()
	for (const { service, type } of missing) {
		const types = byService.get(service) ?? []
		types.push(type)
		byService.set(service, types)
	}

	const scriptPath = path.join(process.cwd(), 'scripts', 'generate-missing.sh')
	const lines = [
		'#!/bin/bash',
		'# Auto-generated script to create all missing before/after images.',
		'# Re-run: tsx scripts/generate-images.ts --generate-script',
		'#',
		'# To regenerate a single service, comment out the others.',
		'# Each service generates BOTH before and after to ensure they match.',
		'#',
		`# Missing: ${missing.length} images across ${byService.size} services`,
		'',
		'set -e',
		'',
		'if [ -z "$OPENAI_API_KEY" ]; then',
		'  echo "Error: OPENAI_API_KEY is required"',
		'  exit 1',
		'fi',
		'',
	]

	for (const [service] of byService) {
		const def = IMAGE_DEFS[service]
		lines.push(`# --- ${service} (${def?.description ?? ''}) ---`)
		lines.push(`tsx scripts/generate-images.ts "${service}"`)
		lines.push('')
	}

	lines.push('echo "All missing images generated!"')

	fs.writeFileSync(scriptPath, lines.join('\n') + '\n')
	execSync(`chmod +x "${scriptPath}"`)
	console.log(`Generated: ${scriptPath}`)
	console.log(`  ${missing.length} images across ${byService.size} services`)
	console.log(
		`\nRun it:\n  OPENAI_API_KEY=sk-... bash scripts/generate-missing.sh`,
	)
}

// --- CLI ---
async function main() {
	const args = process.argv.slice(2)

	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		console.log(`
Usage:
  tsx scripts/generate-images.ts <service>             Generate before+after pair
  tsx scripts/generate-images.ts --missing             Generate all missing pairs
  tsx scripts/generate-images.ts --list-missing        List what's missing
  tsx scripts/generate-images.ts --generate-script     Create generate-missing.sh

Note: Always generates BOTH before and after together as a pair.
      The "after" is created by editing the "before" so it's the same person.

Available services:
  ${Object.keys(IMAGE_DEFS).join('\n  ')}

Environment:
  OPENAI_API_KEY  Required for generation (not needed for --list-missing or --generate-script)
`)
		process.exit(0)
	}

	if (args.includes('--list-missing')) {
		const missing = getMissing()
		if (missing.length === 0) {
			console.log('All before/after images are present!')
		} else {
			console.log(`Missing ${missing.length} images:`)
			for (const { service, type } of missing) {
				console.log(`  ${service}/${type}`)
			}
		}
		return
	}

	if (args.includes('--generate-script')) {
		generateScript()
		return
	}

	if (args.includes('--missing')) {
		const missing = getMissing()
		if (missing.length === 0) {
			console.log('All before/after images are present!')
			return
		}
		// Deduplicate to service level (always generate pairs)
		const services = [...new Set(missing.map(m => m.service))]
		console.log(`Generating pairs for ${services.length} services...\n`)
		for (const service of services) {
			await generatePair(service)
			console.log()
		}
		console.log('All done!')
		return
	}

	// Single service — always generates both before + after as a pair
	const service = args[0]!
	await generatePair(service)
	console.log('\nDone!')
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
