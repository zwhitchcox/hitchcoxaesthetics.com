/**
 * The practice's websites, as the report pages name them. `key` is the
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
	// Added 2026-10-06. No Search Console property or rank target yet, so its
	// rows stay empty until those exist.
	{
		key: 'klc',
		label: 'Knoxville Laser Clinic',
		site: 'knoxvillelaserclinic.com',
		rankTarget: 'Knoxville Laser Clinic',
	},
] as const

export type SiteKey = (typeof OUR_SITES)[number]['key']

/** The site filter every report page offers: all of them, or one. */
export const SITE_CHOICES = [
	{ value: 'all', label: 'All sites' },
	...OUR_SITES.map(s => ({ value: s.key, label: s.label })),
] as const

export type SiteChoice = 'all' | SiteKey

export const SITE_CHOICE_VALUES = SITE_CHOICES.map(
	c => c.value,
) as ReadonlyArray<SiteChoice>

/** The domains of our sites, for SQL `= ANY($1)` filters. */
export const OUR_DOMAINS = OUR_SITES.map(s => s.site)
