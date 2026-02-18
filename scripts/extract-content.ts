/**
 * Extract content from site-pages.ts and location-service-data.tsx
 * into markdown files with YAML frontmatter in the content/ directory.
 *
 * Usage: npx tsx scripts/extract-content.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import yaml from 'gray-matter'
import { locationServices } from '../app/utils/location-service-data.js'
import { sitePages } from '../app/utils/site-pages.js'

const CONTENT_DIR = path.join(process.cwd(), 'content')

function ensureDir(dir: string) {
	fs.mkdirSync(dir, { recursive: true })
}

function toFrontmatter(data: Record<string, unknown>, content: string): string {
	// Use gray-matter's stringify to produce valid YAML frontmatter
	return yaml.stringify(content, data)
}

// --- Extract service pages ---

console.log('Extracting service pages...')

for (const [pagePath, page] of Object.entries(sitePages)) {
	const filePath = path.join(CONTENT_DIR, `${pagePath}.md`)
	ensureDir(path.dirname(filePath))

	const frontmatter: Record<string, unknown> = {
		name: page.name,
		tagline: page.tagline,
		title: page.title,
		metaDescription: page.metaDescription,
	}

	if (page.parent) frontmatter.parent = page.parent
	if (page.children && page.children.length > 0)
		frontmatter.children = page.children
	if (page.enabled === false) frontmatter.enabled = false
	if (page.shortDescription)
		frontmatter.shortDescription = page.shortDescription
	if (page.whyChooseTitle) frontmatter.whyChooseTitle = page.whyChooseTitle
	if (page.whyChoose) frontmatter.whyChoose = page.whyChoose
	if (page.ctaText) frontmatter.ctaText = page.ctaText
	if (page.faq && page.faq.length > 0) frontmatter.faq = page.faq
	if (page.sections && page.sections.length > 0)
		frontmatter.sections = page.sections

	const output = toFrontmatter(frontmatter, page.content)
	fs.writeFileSync(filePath, output)
	console.log(`  ${pagePath} -> ${path.relative(process.cwd(), filePath)}`)
}

// --- Extract location service pages ---

console.log('\nExtracting location service pages...')

for (const [slug, loc] of Object.entries(locationServices)) {
	// slug is like "knoxville-botox" or "farragut-filler"
	// Map to: content/knoxville/botox.md or content/farragut/filler.md
	const filePath = path.join(
		CONTENT_DIR,
		loc.locationId,
		`${loc.serviceSlug}.md`,
	)
	ensureDir(path.dirname(filePath))

	const frontmatter: Record<string, unknown> = {
		locationName: loc.locationName,
		locationId: loc.locationId,
		serviceName: loc.serviceName,
		serviceSlug: loc.serviceSlug,
		title: loc.title,
		metaDescription: loc.metaDescription,
		h1: loc.h1,
		h2: loc.h2,
		ctaText: loc.ctaText,
	}

	if (loc.shortDescription) frontmatter.shortDescription = loc.shortDescription
	if (loc.tagline) frontmatter.tagline = loc.tagline
	if (loc.whyChooseTitle) frontmatter.whyChooseTitle = loc.whyChooseTitle
	if (loc.whyChoose) frontmatter.whyChoose = loc.whyChoose
	if (loc.sections && loc.sections.length > 0)
		frontmatter.sections = loc.sections

	// Combine intro + body into the markdown content
	const content = [loc.introParagraph, loc.bodyParagraph]
		.filter(Boolean)
		.join('\n\n')

	const output = toFrontmatter(frontmatter, content)
	fs.writeFileSync(filePath, output)
	console.log(`  ${slug} -> ${path.relative(process.cwd(), filePath)}`)
}

console.log('\nDone! Files written to content/')
