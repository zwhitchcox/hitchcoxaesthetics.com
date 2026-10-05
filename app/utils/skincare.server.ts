/**
 * The skincare pages (/skincare and /skincare/<product>) read their products
 * from content/skincare/*.md. Each product file holds structured frontmatter
 * (step, facts, ingredients, how to use, FAQ); index.md holds the landing
 * page's title, description and FAQ. ROUTINES below sets where each product
 * goes in the morning and evening routines. The same files feed the sitemap
 * and the Skincare cards through the content loader, so there is one source.
 */
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

const DIR = path.join(process.cwd(), 'content', 'skincare')

export type Routine = 'morning' | 'evening'

export type SkincareProduct = {
	slug: string
	name: string
	tagline: string
	title: string
	metaDescription: string
	shortDescription: string
	image: string
	texture: string | null
	step: string
	order: number
	facts: string[]
	sizes: string | null
	why: string
	howTo: string[]
	ingredients: { name: string; does: string }[]
	faq: { question: string; answer: string }[]
}

export type SkincareLanding = {
	title: string
	metaDescription: string
	faq: { question: string; answer: string }[]
}

/** One row of a routine: a product step, or a step with no product (cleanse). */
export type RoutineStep = {
	step: string
	text: string
	slug?: string
}

/**
 * Where most regimens start. Sarah adjusts them at the consultation; the
 * product pages highlight their own row.
 */
export const ROUTINES: Record<
	Routine,
	{ label: string; steps: RoutineStep[] }
> = {
	morning: {
		label: 'Morning',
		steps: [
			{ step: 'Cleanse', text: 'A gentle cleanser matched to your skin' },
			{
				step: 'Correct',
				slug: 'alto-advanced-defense-and-repair-serum',
				text: 'Antioxidants that defend against the day',
			},
			{
				step: 'Eyes',
				slug: 'interfuse-treatment-cream-eye',
				text: "Softens crow's feet and puffiness",
			},
			{
				step: 'Hydrate',
				slug: 'trio-rebalancing-moisture-treatment',
				text: 'Light, deep moisture for the skin barrier',
			},
			{
				step: 'Protect',
				slug: 'sunbetter-tone-smart-spf-75',
				text: 'Tinted mineral SPF 75, every morning',
			},
			{
				step: 'Reapply',
				slug: 'sunbetter-sheer-spf-56-stick',
				text: 'A pocket stick for touch-ups outside',
			},
		],
	},
	evening: {
		label: 'Evening',
		steps: [
			{ step: 'Cleanse', text: 'Wash off sunscreen and the day' },
			{
				step: 'Correct',
				slug: 'alto-advanced-defense-and-repair-serum',
				text: 'A second layer of antioxidants before your retinoid',
			},
			{
				step: 'Renew',
				slug: 'alpharet-overnight-cream',
				text: 'Retinoid and lactic acid while you sleep',
			},
			{
				step: 'Eyes',
				slug: 'interfuse-treatment-cream-eye',
				text: 'Hydrates and smooths the eye area',
			},
			{
				step: 'Hydrate',
				slug: 'trio-rebalancing-moisture-treatment',
				text: 'Keeps skin comfortable with a retinoid',
			},
		],
	},
}

function text(v: unknown): string {
	return typeof v === 'string' ? v.trim() : ''
}

function texts(v: unknown): string[] {
	return Array.isArray(v) ? v.map(text).filter(Boolean) : []
}

function pairs<K extends string, L extends string>(
	v: unknown,
	a: K,
	b: L,
): Record<K | L, string>[] {
	if (!Array.isArray(v)) return []
	return v
		.map(item => {
			const row = (item ?? {}) as Record<string, unknown>
			const first = text(row[a])
			const second = text(row[b])
			return first && second
				? ({ [a]: first, [b]: second } as Record<K | L, string>)
				: null
		})
		.filter((row): row is Record<K | L, string> => row !== null)
}

function readProduct(file: string): SkincareProduct | null {
	const { data } = matter(fs.readFileSync(path.join(DIR, file), 'utf-8'))
	if (data.enabled === false) return null
	const name = text(data.name)
	const image = text(data.image)
	if (!name || !image) return null
	return {
		slug: file.replace(/\.md$/, ''),
		name,
		tagline: text(data.tagline),
		title: text(data.title) || `${name} | Sarah Hitchcox Aesthetics`,
		metaDescription: text(data.metaDescription),
		shortDescription: text(data.shortDescription),
		image,
		texture: text(data.texture) || null,
		step: text(data.step),
		order: typeof data.order === 'number' ? data.order : 99,
		facts: texts(data.facts),
		sizes: text(data.sizes) || null,
		why: text(data.why),
		howTo: texts(data.howTo),
		ingredients: pairs(data.ingredients, 'name', 'does'),
		faq: pairs(data.faq, 'question', 'answer'),
	}
}

let cache: SkincareProduct[] | null = null

/** Every enabled product, in display order. Re-read on each call outside production. */
export function loadSkincareProducts(): SkincareProduct[] {
	if (cache && process.env.NODE_ENV === 'production') return cache
	const products = fs
		.readdirSync(DIR)
		.filter(f => f.endsWith('.md') && f !== 'index.md')
		.map(readProduct)
		.filter((p): p is SkincareProduct => p !== null)
		.sort((x, y) => x.order - y.order)
	cache = products
	return products
}

export function getSkincareProduct(slug: string): SkincareProduct | null {
	return loadSkincareProducts().find(p => p.slug === slug) ?? null
}

export function loadSkincareLanding(): SkincareLanding {
	const { data } = matter(fs.readFileSync(path.join(DIR, 'index.md'), 'utf-8'))
	return {
		title: text(data.title),
		metaDescription: text(data.metaDescription),
		faq: pairs(data.faq, 'question', 'answer'),
	}
}
