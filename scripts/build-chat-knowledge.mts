/**
 * Generates docs/chat-site-knowledge.md, the website knowledge base compiled
 * into the AI chat agent's prompt (scripts/retell-chat-agent-config.ts).
 *
 * It fetches the LIVE site's sitemap, distills every marketing/service page
 * to markdown (title, path, headings, visible copy, minus boilerplate that
 * repeats on every page), and appends the two lists the agent's action
 * directives are allowed to use: valid navigation paths (from the sitemap)
 * and valid booking service slugs (from the Boulevard catalog, same
 * derivation as /book?service=).
 *
 *   pnpm exec tsx scripts/build-chat-knowledge.mts
 *
 * Re-run and check in the result whenever site copy or the Boulevard
 * catalog changes meaningfully, then re-run scripts/retell-deploy-chat-agent.ts.
 */
import { writeFileSync } from 'node:fs'
import { config as loadDotenv } from 'dotenv'

loadDotenv({ override: true })

const SITE_ORIGIN = 'https://hitchcoxaesthetics.com'
const OUTPUT_URL = new URL('../docs/chat-site-knowledge.md', import.meta.url)
const MAX_PAGE_CHARS = 1600
// Non-marketing paths the chat has no business summarizing or linking to.
const EXCLUDED_PATH_RE =
	/^\/(book|login|signup|admin|me|settings|users|account|verify|onboarding|reset-password|forgot|logout|tos|privacy|offer|invite|review-qr|booking-links|geo-rank|resources|cache|lp|r)(\/|$)/

async function main() {
	const paths = await fetchSitemapPaths()
	const pages: Array<{ path: string; title: string; lines: string[] }> = []
	for (const path of paths) {
		try {
			const html = await fetchText(`${SITE_ORIGIN}${path}`)
			pages.push({ path, ...distillPage(html) })
			console.error(`ok       ${path}`)
		} catch (error) {
			console.error(
				`skipped  ${path}: ${error instanceof Error ? error.message : error}`,
			)
		}
	}
	if (pages.length === 0) throw new Error('No pages could be fetched.')

	// Drop boilerplate: body lines that repeat on most pages (nav, footer,
	// CTA bar) say nothing about the page itself.
	const lineCounts = new Map<string, number>()
	for (const page of pages) {
		for (const line of new Set(page.lines)) {
			lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1)
		}
	}
	const boilerplateThreshold = Math.max(3, Math.ceil(pages.length * 0.6))
	const isBoilerplate = (line: string) =>
		(lineCounts.get(line) ?? 0) >= boilerplateThreshold

	const pageSections = pages.map(page => {
		const seen = new Set<string>()
		const body = page.lines
			.filter(line => {
				if (isBoilerplate(line)) return false
				if (seen.has(line)) return false
				seen.add(line)
				return true
			})
			.join('\n')
			.slice(0, MAX_PAGE_CHARS)
			.trim()
		return `## ${page.title}\nPath: ${page.path}\n\n${body}`
	})

	const slugSection = await buildBookingSlugSection()
	const pathList = pages.map(page => `- ${page.path}`).join('\n')

	const output = [
		'<!-- GENERATED FILE, do not edit by hand. -->',
		'<!-- Rebuild with: pnpm exec tsx scripts/build-chat-knowledge.mts -->',
		`<!-- Source: ${SITE_ORIGIN} sitemap + Boulevard catalog, generated ${new Date().toISOString().slice(0, 10)} -->`,
		'',
		'# Sarah Hitchcox Aesthetics website knowledge',
		'',
		...pageSections,
		'',
		'## Valid navigation paths',
		'The only paths the NAVIGATE directive may use:',
		'',
		pathList,
		'',
		slugSection,
		'',
	].join('\n\n')

	writeFileSync(OUTPUT_URL, output.replace(/\n{3,}/g, '\n\n'))
	console.error(
		`wrote docs/chat-site-knowledge.md (${pages.length} pages, ${output.length} chars)`,
	)
}

async function buildBookingSlugSection() {
	// Same slug derivation the /book?service= param uses. Requires Boulevard
	// admin env; the import stays dynamic so sitemap distillation works even
	// while Boulevard env is absent (the script then fails with a clear
	// message instead of at import time).
	const { listBookingSlugGroups } =
		await import('../app/utils/booking-service-slugs.server.ts')
	const groups = await listBookingSlugGroups()
	const lines = groups.map(
		group => `- ${group.slug} (${group.serviceNames.join(' | ')})`,
	)
	return [
		'## Valid booking service slugs',
		'The only slugs the BOOK directive may use, with the Boulevard services each resolves to:',
		'',
		lines.join('\n'),
	].join('\n\n')
}

async function fetchSitemapPaths() {
	const xml = await fetchText(`${SITE_ORIGIN}/sitemap.xml`)
	const paths = new Set<string>()
	for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
		try {
			const url = new URL(match[1]!)
			if (url.origin !== SITE_ORIGIN) continue
			const path = url.pathname.replace(/\/+$/, '') || '/'
			if (EXCLUDED_PATH_RE.test(path)) continue
			if (!/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(path)) continue
			paths.add(path)
		} catch {
			// ignore malformed loc entries
		}
	}
	if (paths.size === 0) throw new Error('Sitemap produced no usable paths.')
	return [...paths].sort()
}

async function fetchText(url: string) {
	const response = await fetch(url, {
		headers: { 'user-agent': 'sha-chat-knowledge-builder' },
		signal: AbortSignal.timeout(30_000),
	})
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return response.text()
}

function distillPage(html: string) {
	const title = decodeEntities(
		/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '',
	)
		.replace(/\s+/g, ' ')
		.trim()

	let body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
	body = body
		.replace(/<(script|style|svg|noscript|iframe|form)[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		// Headings become markdown so structure survives tag stripping.
		.replace(
			/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi,
			(_, level: string, text: string) =>
				`\n${'#'.repeat(Number(level) + 1)} ${text.replace(/<[^>]+>/g, ' ')}\n`,
		)
		.replace(/<(?:p|li|br|div|section|article|tr)[^>]*>/gi, '\n')
		.replace(/<[^>]+>/g, ' ')

	const lines = decodeEntities(body)
		.split('\n')
		.map(line => line.replace(/\s+/g, ' ').trim())
		.filter(line => line.length > 2)
		.filter(line => !/^window\.|^\{|^\}|^var |^function /.test(line))

	return { lines, title: title || 'Untitled page' }
}

function decodeEntities(text: string) {
	return text
		.replace(/&#(\d+);/g, (_, code: string) =>
			String.fromCodePoint(Number(code)),
		)
		.replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
			String.fromCodePoint(parseInt(code, 16)),
		)
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&mdash;|&ndash;/g, '-')
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
