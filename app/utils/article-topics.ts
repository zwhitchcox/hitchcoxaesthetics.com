/**
 * The writer's topic bank, copied from the mini's articles.py TOPICS (keys and
 * titles only). "Write a different article" offers these; the key travels in
 * the review note as `NEW ARTICLE: topic=<key>` and the mini forces that topic.
 * Keep this list in step with articles.py when a topic is added there.
 */
export const ARTICLE_TOPICS: ReadonlyArray<{ key: string; title: string }> = [
	{
		key: 'first-consultation',
		title: 'What actually happens at a first aesthetics consultation',
	},
	{
		key: 'choosing-an-injector',
		title:
			'How to choose an injector: the questions that matter more than the price',
	},
	{
		key: 'botox-expectations',
		title: 'Botox, Dysport and Jeuveau: what they do and what they cannot do',
	},
	{
		key: 'filler-safety',
		title: 'Dermal fillers: the safety conversation to have before you book',
	},
	{
		key: 'laser-hair-prep',
		title: 'Planning laser hair removal around real life',
	},
	{ key: 'microneedling', title: 'Microneedling explained by a nurse' },
	{
		key: 'acne-scars',
		title: 'Options for acne scarring, from skincare to in-office treatment',
	},
	{
		key: 'glp1-supervision',
		title: 'What medical supervision means for GLP-1 weight loss',
	},
	{
		key: 'glp1-side-effects',
		title:
			'The first weeks on a GLP-1: side effects and how follow-ups catch them',
	},
	{
		key: 'glp1-plateaus',
		title: 'Weight loss plateaus on GLP-1s: what a clinic checks',
	},
	{ key: 'seasonal-skin', title: 'East Tennessee skin through the seasons' },
	{
		key: 'sun-myths',
		title: 'Sun protection myths a nurse hears every summer',
	},
	{
		key: 'mens-aesthetics',
		title: 'Aesthetic treatments men ask about, and what to expect',
	},
	{ key: 'aftercare', title: 'Aftercare that protects your results' },
	{
		key: 'cost-transparency',
		title: 'How to read an aesthetic treatment price',
	},
	{ key: 'nurse-owned', title: 'What a nurse-owned practice does differently' },
	{ key: 'med-spa-red-flags', title: 'Red flags when choosing a med spa' },
	{
		key: 'wedding-timeline',
		title: 'A treatment timeline for the year before a wedding',
	},
	{
		key: 'moms-time',
		title: "Fitting skin and self-care into a parent's schedule",
	},
	{
		key: 'shift-workers',
		title: 'Weight loss and skin care for shift workers and first responders',
	},
	{
		key: 'small-business-ai',
		title: 'Before adding AI to a small practice, decide who can correct it',
	},
	{ key: 'front-desk-role', title: 'What a med spa front desk really does' },
	{ key: 'reviews-honest', title: 'Reading med spa reviews like a nurse' },
	{
		key: 'skincare-basics',
		title: 'A short skincare routine that a clinic would not change',
	},
	{ key: 'travel-treatments', title: 'Timing treatments around travel' },
	{
		key: 'workplace-wellness',
		title: 'Medical weight loss as a workplace benefit question',
	},
]

/** The review note prefix the mini reads for "Write a different article". */
export const REWRITE_NOTE_PREFIX = 'NEW ARTICLE: '
/** The words after the prefix when she chose nothing. */
export const REWRITE_DEFAULT_WORDS = 'a different article'
const TOPIC_MARK = 'topic='
export const REWRITE_WORDS_MAX = 300

export const REWRITE_TOPIC_COPY = {
	label: 'What should it be about?',
	writerChooses: 'Let the writer choose',
	wordsLabel: 'Or say it in your own words (optional)',
	wordsPlaceholder: 'For example: laser hair removal before a beach trip',
} as const

/** The note for a rewrite: a chosen topic key wins, then her words, then the default. */
export function rewriteNote(input: {
	topic?: string | null
	words?: string | null
}): string {
	const topic = (input.topic ?? '').trim()
	if (topic && ARTICLE_TOPICS.some(t => t.key === topic)) {
		return `${REWRITE_NOTE_PREFIX}${TOPIC_MARK}${topic}`
	}
	const words = (input.words ?? '').trim().replace(/\s+/g, ' ')
	if (words) return `${REWRITE_NOTE_PREFIX}${words.slice(0, REWRITE_WORDS_MAX)}`
	return `${REWRITE_NOTE_PREFIX}${REWRITE_DEFAULT_WORDS}`
}

export function isRewriteNote(note: string | null | undefined): boolean {
	return Boolean(note && note.startsWith(REWRITE_NOTE_PREFIX))
}

/**
 * What she asked for, for display: the topic's title for a key, her words
 * as typed, or '' for the default note.
 */
export function rewriteWords(note: string | null | undefined): string {
	if (!isRewriteNote(note) || !note) return ''
	const rest = note.slice(REWRITE_NOTE_PREFIX.length).trim()
	if (rest === REWRITE_DEFAULT_WORDS) return ''
	if (rest.startsWith(TOPIC_MARK)) {
		const key = rest.slice(TOPIC_MARK.length).trim()
		return ARTICLE_TOPICS.find(t => t.key === key)?.title ?? key
	}
	return rest
}
