/**
 * Pure helpers for the "Things to check first" panel on /review/:id.
 *
 * Browser-safe: no prisma, no node modules. The caller (articles.server.ts)
 * stores the verified aid as JSON and hashes it, so the record says what
 * Sarah was shown.
 *
 * Every item carries the quote as it stands in the body (the body's own
 * slice, never the writer's copy of it) and the character offset of that
 * slice in the body. Offsets belong to the body they were found in. When the
 * body changes, call findHighlightRanges again with the stored quotes.
 */

export const WORDS_PER_MINUTE = 230

/** round(wordCount / 230 * 60). The median article (893 words) is 233 s. */
export function estimateReadSeconds(wordCount: number): number {
	if (!Number.isFinite(wordCount) || wordCount <= 0) return 0
	return Math.round((wordCount / WORDS_PER_MINUTE) * 60)
}

/** "About 4 min". Never below one minute. Shown once, never counted down. */
export function aboutMinutes(readSeconds: number): string {
	const minutes = Math.max(1, Math.round(readSeconds / 60))
	return `About ${minutes} min`
}

export type ReviewAidItem = {
	/** The body's own text, verbatim. */
	quote: string
	/** Character index of `quote` in the body it was verified against. */
	offset: number
}

export type ReviewAidSource = 'writer' | 'search'

export type ReviewAid = {
	/** 'writer' = the writing system sent the list. 'search' = the regex fallback. */
	source: ReviewAidSource
	/** Medical claims (writer) or sentences with numbers, units, drugs and products (search). */
	claims: ReviewAidItem[]
	/** Sentences that name Sarah, RN, the practice, an office, or a sister brand. */
	credentials: ReviewAidItem[]
	/** The publisher's rules from the brief. Empty for the fallback. */
	rules: string[]
	/** Distinct drug and product names found in the body, in order of first use. */
	products: string[]
	/** Writer quotes that could not be found in the body. */
	unmatched: number
}

/** The shape the mini sends in the sync payload (`reviewAid`). */
export type ReviewAidInput = {
	claims?: ReadonlyArray<{ quote: string }> | null
	credentials?: ReadonlyArray<{ quote: string }> | null
	rules?: ReadonlyArray<string> | null
}

export type HighlightRange = {
	start: number
	end: number
	/** The body slice [start, end). */
	quote: string
	/** Position of the matching quote in the `quotes` argument. */
	index: number
}

export type Paragraph = { start: number; end: number; text: string }

/* ------------------------------------------------------------------------ */
/* Normalisation                                                            */
/* ------------------------------------------------------------------------ */

/**
 * The normalised text plus a map from each normalised index back to the
 * original index. CRLF becomes LF, runs of whitespace become one space,
 * leading and trailing whitespace go, and curly quotes become straight ones.
 */
type Normalized = { text: string; map: number[] }

const QUOTE_FOLD: Record<string, string> = {
	'‘': "'",
	'’': "'",
	'‚': "'",
	'“': '"',
	'”': '"',
	'„': '"',
}

export function normalize(input: string): Normalized {
	const map: number[] = []
	let text = ''
	let spaceStart = -1
	for (let i = 0; i < input.length; i++) {
		const ch = input[i] as string
		if (ch === '\r') continue
		if (/\s/.test(ch)) {
			if (text.length > 0 && spaceStart < 0) spaceStart = i
			continue
		}
		if (spaceStart >= 0) {
			text += ' '
			map.push(spaceStart)
			spaceStart = -1
		}
		text += QUOTE_FOLD[ch] ?? ch
		map.push(i)
	}
	return { text, map }
}

/** Find `quote` in the normalised body. Returns the range in body coordinates. */
function locate(
	body: Normalized,
	quote: string,
	from = 0,
): { start: number; end: number } | null {
	const q = normalize(quote).text
	if (!q) return null
	const at = body.text.indexOf(q, from)
	if (at < 0) return null
	const start = body.map[at] as number
	const end = (body.map[at + q.length - 1] as number) + 1
	return { start, end }
}

/* ------------------------------------------------------------------------ */
/* Writer aid: verify                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Keep only the quotes that occur verbatim in the body after normalisation.
 * Each kept item becomes the body's own slice at its offset. Dropped quotes
 * are counted in `unmatched` for the "could not be matched" note.
 */
export function verifyReviewAid(body: string, aid: ReviewAidInput): ReviewAid {
	const norm = normalize(body)
	let unmatched = 0
	const verify = (
		items: ReadonlyArray<{ quote: string }> | null | undefined,
	) => {
		const out: ReviewAidItem[] = []
		const seen = new Set<number>()
		for (const item of items ?? []) {
			const quote = typeof item?.quote === 'string' ? item.quote : ''
			const range = locate(norm, quote)
			if (!range) {
				unmatched += 1
				continue
			}
			if (seen.has(range.start)) continue
			seen.add(range.start)
			out.push({
				quote: body.slice(range.start, range.end),
				offset: range.start,
			})
		}
		return out.sort((a, b) => a.offset - b.offset)
	}
	const claims = verify(aid.claims)
	const credentials = verify(aid.credentials)
	const rules = cleanRules(aid.rules)
	return {
		source: 'writer',
		claims,
		credentials,
		rules,
		products: findProducts(body),
		unmatched,
	}
}

function cleanRules(rules: ReadonlyArray<string> | null | undefined): string[] {
	const out: string[] = []
	for (const rule of rules ?? []) {
		const text = typeof rule === 'string' ? rule.trim() : ''
		if (text && !out.includes(text)) out.push(text)
	}
	return out
}

/* ------------------------------------------------------------------------ */
/* Fallback aid: word search                                                */
/* ------------------------------------------------------------------------ */

/** Numbers with units: "20 units", "3 to 4 months", "10%", "$150", "1.5 ml". */
const UNIT_RE =
	/(?:\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*(?:%|percent|mg|units?|mm|ml|cc|weeks?|days?|hours?|months?))(?![a-z])/i

/** Drug and product names. The first spelling is the one reported. */
const PRODUCTS: ReadonlyArray<{ name: string; re: RegExp }> = [
	{ name: 'Botox', re: /\bbotox\b/i },
	{ name: 'Dysport', re: /\bdysport\b/i },
	{ name: 'Xeomin', re: /\bxeomin\b/i },
	{ name: 'Jeuveau', re: /\bjeuveau\b/i },
	{ name: 'Daxxify', re: /\bdaxxify\b/i },
	{ name: 'Kybella', re: /\bkybella\b/i },
	{ name: 'Sculptra', re: /\bsculptra\b/i },
	{ name: 'Juvederm', re: /\bjuv[eé]derm\b/i },
	{ name: 'Restylane', re: /\brestylane\b/i },
	{ name: 'Radiesse', re: /\bradiesse\b/i },
	{ name: 'semaglutide', re: /\bsemaglutide\b/i },
	{ name: 'tirzepatide', re: /\btirzepatide\b/i },
	{ name: 'Ozempic', re: /\bozempic\b/i },
	{ name: 'Wegovy', re: /\bwegovy\b/i },
	{ name: 'Mounjaro', re: /\bmounjaro\b/i },
	{ name: 'Zepbound', re: /\bzepbound\b/i },
	{ name: 'lidocaine', re: /\blidocaine\b/i },
	{ name: 'tretinoin', re: /\btretinoin\b/i },
	{ name: 'hydroquinone', re: /\bhydroquinone\b/i },
	{ name: 'hyaluronic acid', re: /\bhyaluronic\s+acid\b/i },
	{ name: 'PRP', re: /\bPRP\b/ },
]

/** "Botox Knox" is a brand, not a dose. Blank it before the product scan. */
const BRAND_WITH_PRODUCT_RE = /botox\s+knox/gi

/** RN and R.N. are case-sensitive. The names and places are not. */
const CREDENTIAL_RES: ReadonlyArray<RegExp> = [
	/\bRN\b/,
	/\bR\.N\.(?![a-z])/,
	/\bnurses?\b/i,
	/\bsarah\s+hitchcox\b/i,
	/\bhitchcox\s+aesthetics\b/i,
	/\bbotox\s+knox\b/i,
	/\bknoxville\s+weight\s+loss\s+clinic\b/i,
	/\bbearden\b/i,
	/\bfarragut\b/i,
	/\bwest\s+hills\b/i,
	/\bcedar\s+bluff\b/i,
]

function hasProduct(text: string): boolean {
	const scrubbed = text.replace(BRAND_WITH_PRODUCT_RE, ' ')
	return PRODUCTS.some(p => p.re.test(scrubbed))
}

function hasCredential(text: string): boolean {
	return CREDENTIAL_RES.some(re => re.test(text))
}

/** Distinct product names in the body, in order of first use. */
export function findProducts(body: string): string[] {
	const scrubbed = body.replace(BRAND_WITH_PRODUCT_RE, ' ')
	const found: Array<{ name: string; at: number }> = []
	for (const p of PRODUCTS) {
		const m = p.re.exec(scrubbed)
		if (m) found.push({ name: p.name, at: m.index })
	}
	return found.sort((a, b) => a.at - b.at).map(f => f.name)
}

/**
 * A regex pass over the body for when the writing system sent no list.
 * Claims: sentences with a number and a unit, or a drug or product name.
 * Credentials: sentences that name Sarah, RN, the practice, an office, or
 * a sister brand. The panel labels this as a word search.
 */
export function fallbackReviewAid(body: string): ReviewAid {
	const claims: ReviewAidItem[] = []
	const credentials: ReviewAidItem[] = []
	for (const s of splitSentences(body)) {
		if (UNIT_RE.test(s.text) || hasProduct(s.text)) {
			claims.push({ quote: s.text, offset: s.start })
		}
		if (hasCredential(s.text)) {
			credentials.push({ quote: s.text, offset: s.start })
		}
	}
	return {
		source: 'search',
		claims,
		credentials,
		rules: [],
		products: findProducts(body),
		unmatched: 0,
	}
}

/* ------------------------------------------------------------------------ */
/* Text structure                                                           */
/* ------------------------------------------------------------------------ */

/** Blank-line separated blocks with their offsets. Empty blocks are skipped. */
export function splitParagraphs(body: string): Paragraph[] {
	const out: Paragraph[] = []
	const re = /\r?\n[ \t]*\r?\n/g
	let start = 0
	const push = (end: number) => {
		const raw = body.slice(start, end)
		const lead = raw.length - raw.trimStart().length
		const text = raw.trim()
		if (text)
			out.push({ start: start + lead, end: start + lead + text.length, text })
	}
	let m: RegExpExecArray | null
	while ((m = re.exec(body))) {
		push(m.index)
		start = m.index + m[0].length
	}
	push(body.length)
	return out
}

/** The paragraph that holds `offset`, or -1. Use it for "See in text" scrolling. */
export function paragraphIndexAt(
	paragraphs: ReadonlyArray<Paragraph>,
	offset: number,
): number {
	return paragraphs.findIndex(p => offset >= p.start && offset < p.end)
}

/** Words that end in a period but do not end a sentence. */
const ABBREVIATIONS = new Set([
	'dr',
	'mr',
	'mrs',
	'ms',
	'vs',
	'e.g',
	'i.e',
	'etc',
	'st',
	'no',
	'approx',
])

/** Leading markdown: heading marks, quote marks, list bullets, numbers. */
const LINE_PREFIX_RE = /^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)+/

/**
 * Sentences with their offsets in the body. Each markdown line is split on
 * sentence ends. Image lines, rules, fences, and table rows are skipped.
 * Leading markdown marks are left out of the quote.
 */
export function splitSentences(body: string): Paragraph[] {
	const out: Paragraph[] = []
	let inFence = false
	let lineStart = 0
	const lines = body.split('\n')
	for (const rawLine of lines) {
		const lineEnd = lineStart + rawLine.length
		const line = rawLine.replace(/\r$/, '')
		const trimmed = line.trim()
		if (trimmed.startsWith('```')) {
			inFence = !inFence
		} else if (!inFence && trimmed && !isSkippedLine(trimmed)) {
			const lead = line.length - line.trimStart().length
			const prefix = LINE_PREFIX_RE.exec(trimmed)?.[0].length ?? 0
			const contentStart = lineStart + lead + prefix
			const content = trimmed.slice(prefix)
			for (const s of splitLine(content)) {
				out.push({
					start: contentStart + s.start,
					end: contentStart + s.end,
					text: s.text,
				})
			}
		}
		lineStart = lineEnd + 1
	}
	return out
}

function isSkippedLine(trimmed: string): boolean {
	// A heading is a title, not a claim: never list it in the word search.
	if (/^#{1,6}\s/.test(trimmed)) return true
	if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(trimmed)) return true
	if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return true
	if (trimmed.startsWith('|')) return true
	return false
}

/** Split one line into sentences. Offsets are relative to the line. */
function splitLine(line: string): Paragraph[] {
	const out: Paragraph[] = []
	let start = 0
	const re = /[.!?]+["')\]]*(?=\s+(?:["'([]?[A-Z0-9]))/g
	let m: RegExpExecArray | null
	while ((m = re.exec(line))) {
		const end = m.index + m[0].length
		const before = line.slice(start, m.index)
		const lastWord = before.split(/\s+/).pop()?.toLowerCase() ?? ''
		if (ABBREVIATIONS.has(lastWord)) continue
		pushTrimmed(out, line, start, end)
		start = end
	}
	pushTrimmed(out, line, start, line.length)
	return out
}

function pushTrimmed(
	out: Paragraph[],
	line: string,
	start: number,
	end: number,
) {
	const raw = line.slice(start, end)
	const lead = raw.length - raw.trimStart().length
	const text = raw.trim()
	if (text)
		out.push({ start: start + lead, end: start + lead + text.length, text })
}

/* ------------------------------------------------------------------------ */
/* Highlights                                                               */
/* ------------------------------------------------------------------------ */

/**
 * Where each quote sits in `body`, sorted by position, first occurrence only.
 * Quotes that are not in the body are left out. A range that overlaps an
 * earlier one is left out, so the ranges can be wrapped in order.
 */
export function findHighlightRanges(
	body: string,
	quotes: ReadonlyArray<string>,
): HighlightRange[] {
	const norm = normalize(body)
	const found: HighlightRange[] = []
	quotes.forEach((quote, index) => {
		const range = locate(norm, quote)
		if (!range) return
		found.push({ ...range, quote: body.slice(range.start, range.end), index })
	})
	found.sort((a, b) => a.start - b.start || b.end - a.end)
	const out: HighlightRange[] = []
	let lastEnd = -1
	for (const r of found) {
		if (r.start < lastEnd) continue
		out.push(r)
		lastEnd = r.end
	}
	return out
}

/* ------------------------------------------------------------------------ */
/* Stored aid                                                               */
/* ------------------------------------------------------------------------ */

/**
 * The aid for the panel, from `Article.reviewAidJson` and the body she will
 * see. A stored list is verified again against this body, so the offsets
 * are fresh and a quote she edited away is dropped and counted. The stored
 * `unmatched` (or `dropped`) count carries over. No stored list, or a list
 * that does not parse: the word search.
 */
export function loadReviewAid(
	json: string | null | undefined,
	body: string,
): ReviewAid {
	const stored = parseStoredAid(json)
	if (!stored) return fallbackReviewAid(body)
	const aid = verifyReviewAid(body, stored)
	return { ...aid, unmatched: aid.unmatched + stored.unmatched }
}

function parseStoredAid(
	json: string | null | undefined,
): (ReviewAidInput & { unmatched: number }) | null {
	if (!json) return null
	let parsed: unknown
	try {
		parsed = JSON.parse(json)
	} catch {
		return null
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return null
	}
	const o = parsed as Record<string, unknown>
	const items = (v: unknown) =>
		Array.isArray(v)
			? v.filter(
					(i): i is { quote: string } =>
						typeof i === 'object' &&
						i !== null &&
						typeof (i as { quote?: unknown }).quote === 'string',
				)
			: []
	const rules = Array.isArray(o.rules)
		? o.rules.filter((r): r is string => typeof r === 'string')
		: []
	const count = (v: unknown) =>
		typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0
	return {
		claims: items(o.claims),
		credentials: items(o.credentials),
		rules,
		unmatched: count(o.unmatched) || count(o.dropped),
	}
}

/* ------------------------------------------------------------------------ */
/* Display                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * A quote as prose, for the panel and the claim pills. Links keep their
 * text and lose the URL; emphasis marks and backticks are removed. Display
 * only: the stored quote stays verbatim so offsets and hashes hold.
 */
export function plainQuote(quote: string): string {
	return quote
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[*`]+/g, '')
		.replace(/(^|[^A-Za-z0-9])_+/g, '$1')
		.replace(/_+($|[^A-Za-z0-9])/g, '$1')
}

/* ------------------------------------------------------------------------ */
/* Copy                                                                     */
/* ------------------------------------------------------------------------ */

/** The grey note under the panel. Exact copy from the spec. */
export function reviewAidNote(
	aid: Pick<ReviewAid, 'source' | 'unmatched'>,
): string {
	if (aid.source === 'search') {
		return 'The writing system sent no claim list for this one. These were found by a word search.'
	}
	const base =
		'Pulled out by the writing system and checked word for word against the text.'
	if (aid.unmatched <= 0) return base
	const items = aid.unmatched === 1 ? '1 item' : `${aid.unmatched} items`
	return `${base} ${items} could not be matched to the text.`
}
