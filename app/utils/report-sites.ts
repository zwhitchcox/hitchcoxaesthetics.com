/**
 * The practice's three websites, as the report pages name them. `key` is the
 * brand key the Search Console snapshots use; `rankTarget` is the target name
 * the organic rank tracker stores (sha-reports src/serp.ts).
 */
export const OUR_SITES = [
	{
		key: 'sha',
		label: 'Sarah Hitchcox Aesthetics',
		site: 'hitchcoxaesthetics.com',
		rankTarget: 'Sarah Hitchcox Aesthetics',
	},
	{
		key: 'bk',
		label: 'Botox Knox',
		site: 'botoxknoxvilletn.com',
		rankTarget: 'Botox Knox',
	},
	{
		key: 'kwlc',
		label: 'Weight Loss Knox',
		site: 'weightlossknoxvilletn.com',
		rankTarget: 'Weight Loss Knox',
	},
] as const

export type SiteKey = (typeof OUR_SITES)[number]['key']

/** The site filter every report page offers: all three, or one. */
export const SITE_CHOICES = [
	{ value: 'all', label: 'All three sites' },
	...OUR_SITES.map(s => ({ value: s.key, label: s.label })),
] as const

export type SiteChoice = 'all' | SiteKey

export const SITE_CHOICE_VALUES = SITE_CHOICES.map(
	c => c.value,
) as ReadonlyArray<SiteChoice>

/** The domains of our three sites, for SQL `= ANY($1)` filters. */
export const OUR_DOMAINS = OUR_SITES.map(s => s.site)
