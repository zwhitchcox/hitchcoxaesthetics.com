/**
 * Composite the Sarah Hitchcox Aesthetics logo onto an interior photo as wall
 * signage, via OpenRouter (google/gemini-2.5-flash-image). Uses our own
 * med-spa-2.webp (logo on wall) and knoxville-med-spa.webp (brand style) as
 * references. Output is a branded MOCKUP — for GBP, real photos of the actual
 * suite are safest.
 *
 *   pnpm tsx scripts/brand-interior-mockup.ts <baseImage> <outName>
 *   pnpm tsx scripts/brand-interior-mockup.ts ~/Downloads/elitesuites.jpg sha-west-hills-mockup
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const apiKey = process.env.OPEN_ROUTER_API_KEY
const model = process.env.OPENROUTER_IMAGE_MODEL ?? 'google/gemini-2.5-flash-image'

// Normalize any input (jpg/webp/avif/heic/png) to PNG so the model accepts it.
async function dataUrl(p: string) {
	const buf = await sharp(p).png().toBuffer()
	return `data:image/png;base64,${buf.toString('base64')}`
}

async function main() {
	const base = process.argv[2]
	const outName = process.argv[3]
	if (!apiKey) throw new Error('OPEN_ROUTER_API_KEY required')
	if (!base || !outName)
		throw new Error('usage: tsx scripts/brand-interior-mockup.ts <baseImage> <outName>')

	const logoRef = 'public/img/med-spa-2.webp'
	const styleRef = 'public/img/knoxville-med-spa.webp'

	const prompt = [
		'Edit the FIRST image, which is the interior of a salon/spa suite.',
		'Add the "Sarah Hitchcox Aesthetics" logo and wordmark exactly as shown in the SECOND image',
		'(a circular line monogram above the words "SARAH HITCHCOX" and "AESTHETICS") onto a prominent,',
		'mostly-blank wall in the first image, as professional dark mounted wall signage.',
		"Match the wall's perspective, lighting, shadows, and a realistic scale so it reads as real",
		'installed signage, not a sticker or overlay. Keep everything else in the first image unchanged.',
		'The THIRD image shows our overall brand style for reference.',
		'Photorealistic. Do not distort, recolor, or misspell the logo text. No extra text, no watermarks.',
	].join(' ')

	const content = [
		{ type: 'text', text: prompt },
		{ type: 'image_url', image_url: { url: await dataUrl(base) } },
		{ type: 'image_url', image_url: { url: await dataUrl(logoRef) } },
		{ type: 'image_url', image_url: { url: await dataUrl(styleRef) } },
	]

	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ model, modalities: ['image', 'text'], messages: [{ role: 'user', content }] }),
	})
	const data: any = await res.json().catch(() => ({}))
	if (data.error) throw new Error(`OpenRouter: ${data.error.message}`)
	const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url
	if (!url?.startsWith?.('data:')) {
		throw new Error(
			`No image returned. Text/response: ${JSON.stringify(data.choices?.[0]?.message ?? data).slice(0, 300)}`,
		)
	}
	const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
	const outPath = path.join(process.env.HOME!, 'Downloads', `${outName}.png`)
	fs.writeFileSync(outPath, buf)
	console.log(`✓ saved ${outPath} (${(buf.length / 1024).toFixed(0)}KB)`)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
