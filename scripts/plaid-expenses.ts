/**
 * P&L report over the PlaidTransaction table: revenue vs expenses, broken
 * down by service line (tox, filler, weight loss, skincare) and operating
 * category (marketing, software, ...).
 *
 * Data source is the local database, which holds everything ever synced from
 * Plaid (scripts/plaid-link.ts connections, app/utils/plaid-sync.server.ts
 * sync — run first by default) plus one-time statement imports
 * (scripts/plaid-import-capone-statements.ts). The DB is the permanent store
 * because Plaid windows slide (Capital One only serves the last 90 days).
 *
 *   pnpm plaid:expenses --owner sarah                last 90 days
 *   pnpm plaid:expenses --owner sarah --from 2024-07-01
 *   pnpm plaid:expenses --owner sarah --json
 *   pnpm plaid:expenses --owner sarah --no-ai        skip AI, cache/rules only
 *   pnpm plaid:expenses --owner sarah --no-sync      report from DB only
 *
 * Categorization pipeline, cheapest first:
 *   1. .plaid-vendor-categories.json — cache, edit it by hand to correct a
 *      vendor and your edit sticks (AI never overwrites an existing entry)
 *   2. KNOWN_VENDORS rules below
 *   3. Haiku via OpenRouter for vendors not covered by 1 or 2; each unique
 *      vendor is classified once and written to the cache
 */
import fs from 'node:fs'
import path from 'node:path'

import dotenv from 'dotenv'

dotenv.config()

const OPENROUTER_KEY = process.env.OPEN_ROUTER_API_KEY?.trim()
const CACHE_FILE = path.join(process.cwd(), '.plaid-vendor-categories.json')

const AI_MODEL = 'anthropic/claude-haiku-4.5'
const AI_BATCH_SIZE = 40

// Per-institution card allowlist by last-4. Institutions not listed include
// everything. Amex exposes all cards on the account as ONE Plaid account, but
// tags each transaction's account_owner like "SARAH HITCHCOX 1026"; only the
// companion card ...1026 is the business card, so match on that (falling back
// to the account mask for institutions that split accounts properly).
const ACCOUNT_ONLY: Record<string, string[]> = {
	'American Express': ['1026'],
}

// Deposits into the checking account that are revenue, matched by substring.
// Anything not matched (and not a transfer/card payment) lands in "Unknown
// deposits" for manual review.
const REVENUE_SOURCES: Array<{ label: string; match: string[] }> = [
	{ label: 'Boulevard payouts (services, net of fees)', match: ['boulevard'] },
	{ label: 'Cherry financing payouts', match: ['cherry des:funding'] },
	{ label: 'Jane payouts', match: ['jane payme'] },
	{ label: 'Alle / Aspire rebates', match: ['alle (allergan', 'aspire'] },
]

const SERVICES = [
	'tox',
	'filler',
	'weight-loss',
	'skincare',
	'mixed-cogs',
	'none',
] as const
const CATEGORIES = [
	'COGS',
	'Marketing',
	'Software',
	'Payroll',
	'Rent/Utilities',
	'Fees/Processing',
	'Insurance/Professional',
	'Equipment',
	'Office/Supplies',
	'Travel/Meals',
	'Personal',
	'Other',
] as const
type Service = (typeof SERVICES)[number]
type Category = (typeof CATEGORIES)[number]
type VendorClass = {
	service: Service
	category: Category
	confidence: 'high' | 'low'
	source: 'cache' | 'rule' | 'ai'
}

// First match wins, lowercase substrings against merchant + description.
const KNOWN_VENDORS: Array<{
	match: string[]
	service: Service
	category: Category
}> = [
	// Tox + filler manufacturers that sell both
	{
		match: ['allergan', 'abbvie', 'alle ', 'galderma', 'merz'],
		service: 'mixed-cogs',
		category: 'COGS',
	},
	{ match: ['evolus', 'jeuveau'], service: 'tox', category: 'COGS' },
	{ match: ['revance', 'daxxify'], service: 'tox', category: 'COGS' },
	{
		match: ['prollenium', 'revanesse', 'teoxane', 'rha collection'],
		service: 'filler',
		category: 'COGS',
	},
	// Compounding pharmacies = GLP-1s
	{
		match: [
			'empower pharmacy',
			'olympia pharmacy',
			'strive pharmacy',
			'belmar',
			'red rock',
			'hallandale',
		],
		service: 'weight-loss',
		category: 'COGS',
	},
	{
		match: [
			'skinmedica',
			'zo skin',
			'alastin',
			'hydrafacial',
			'skinbetter',
			'glo2facial',
			'universkin',
		],
		service: 'skincare',
		category: 'COGS',
	},
	// Medical distributors: could be anything clinical
	{
		match: ['mckesson', 'henry schein', 'medline', 'cardinal health', 'besse'],
		service: 'mixed-cogs',
		category: 'COGS',
	},
	{
		match: [
			'google ads',
			'google adwords',
			'adwords',
			'meta platform',
			'facebk',
			'facebook',
			'instagram',
			'yelp',
			'brightlocal',
		],
		service: 'none',
		category: 'Marketing',
	},
	{
		match: [
			'boulevard',
			'blvd',
			'posthog',
			'vercel',
			'fly.io',
			'twilio',
			'retell',
			'callrail',
			'openai',
			'openrouter',
			'anthropic',
			'github',
			'notion',
			'slack',
			'google workspace',
			'google gsuite',
			'ringcentral',
			'zoom',
			'calendly',
			'mailchimp',
			'resend',
		],
		service: 'none',
		category: 'Software',
	},
	{
		match: ['gusto', 'adp', 'paychex', 'quickbooks payroll', 'intuit payroll'],
		service: 'none',
		category: 'Payroll',
	},
	{
		match: [
			'stripe',
			'square',
			'interchange',
			'merchant fee',
			'service charge',
			'wire fee',
			'card fee',
			'annual fee',
			'interest charge',
		],
		service: 'none',
		category: 'Fees/Processing',
	},
	{
		match: ['rent', 'lease', 'realty', 'kub', 'knoxville utilities', 'electric', 'comcast', 'xfinity', 'at&t', 'internet'],
		service: 'none',
		category: 'Rent/Utilities',
	},
]

function parseArgs(argv: string[]) {
	let days = 90
	let from: string | undefined
	let to: string | undefined
	let json = false
	let owner: string | undefined
	let noAi = false
	let noSync = false
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === '--days') days = Number(argv[++i])
		else if (a === '--from') from = argv[++i]
		else if (a === '--to') to = argv[++i]
		else if (a === '--json') json = true
		else if (a === '--owner') owner = argv[++i]?.trim().toLowerCase()
		else if (a === '--no-ai') noAi = true
		else if (a === '--no-sync') noSync = true
	}
	const end = to ?? new Date().toISOString().slice(0, 10)
	const start =
		from ??
		new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
	return { start, end, json, owner, noAi, noSync }
}

/** Stable cache key for a vendor: merchant name if present, else cleaned description. */
function vendorKey(merchant: string, name: string) {
	const base = (merchant || name || '(no name)').toLowerCase()
	// Strip trailing store numbers / reference codes so "TARGET 00012345" and
	// "TARGET 00098765" share one cache entry.
	return base.replace(/[#*]?\s*\d{4,}.*$/, '').replace(/\s+/g, ' ').trim() || base
}

function ruleMatch(key: string): VendorClass | undefined {
	for (const { match, service, category } of KNOWN_VENDORS) {
		if (match.some(m => key.includes(m)))
			return { service, category, confidence: 'high', source: 'rule' }
	}
	return undefined
}

type CacheEntry = {
	service: Service
	category: Category
	confidence: 'high' | 'low'
	sample?: string
}
function loadCache(): Record<string, CacheEntry> {
	try {
		return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Record<
			string,
			CacheEntry
		>
	} catch {
		return {}
	}
}

const AI_PROMPT_HEADER = `You categorize credit card / bank transactions for Sarah Hitchcox Aesthetics, a med spa in Knoxville TN. Its service lines are:
- tox: Botox, Jeuveau, Dysport, Daxxify neurotoxin injections
- filler: dermal filler (Juvederm, Revanesse, RHA)
- weight-loss: medical weight loss with semaglutide / tirzepatide (GLP-1s from compounding pharmacies)
- skincare: facials, chemical peels, medical-grade skincare retail

For each vendor below, return the most likely classification:
- "service": one of ${JSON.stringify(SERVICES)} — which service line the purchase supports. Use "mixed-cogs" for clinical suppliers spanning several lines, "none" for anything not tied to a specific service (marketing, rent, software, personal, ...).
- "category": one of ${JSON.stringify(CATEGORIES)}. "COGS" = clinical products/supplies used to deliver services. Groceries, restaurants (unless clearly business travel), streaming, retail shopping etc. for a card also used personally should be "Personal".
- "confidence": "high" or "low" (low = you're guessing from the name alone).

Reply with ONLY a JSON array, one object per vendor, in the same order:
[{"vendor": "...", "service": "...", "category": "...", "confidence": "..."}]

Vendors (with a sample transaction description and typical amount):`

async function aiClassify(
	vendors: Array<{ key: string; sample: string; typicalAmount: number }>,
): Promise<Record<string, CacheEntry>> {
	const out: Record<string, CacheEntry> = {}
	for (let i = 0; i < vendors.length; i += AI_BATCH_SIZE) {
		const batch = vendors.slice(i, i + AI_BATCH_SIZE)
		const lines = batch
			.map(
				v =>
					`- vendor: ${JSON.stringify(v.key)} | sample: ${JSON.stringify(v.sample)} | typical: $${v.typicalAmount.toFixed(0)}`,
			)
			.join('\n')
		const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENROUTER_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: AI_MODEL,
				messages: [
					{ role: 'user', content: `${AI_PROMPT_HEADER}\n${lines}` },
				],
				temperature: 0,
			}),
		})
		if (!res.ok) {
			console.error(
				`OpenRouter error ${res.status}: ${(await res.text()).slice(0, 300)}`,
			)
			continue
		}
		const data = (await res.json()) as {
			choices: Array<{ message: { content: string } }>
		}
		const text = data.choices?.[0]?.message?.content ?? ''
		const jsonText = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
		let parsed: Array<{
			vendor: string
			service: string
			category: string
			confidence: string
		}>
		try {
			parsed = JSON.parse(jsonText) as typeof parsed
		} catch {
			console.error(`Unparseable AI batch response: ${text.slice(0, 200)}`)
			continue
		}
		// Key by batch order (the prompt demands same-order output): the model
		// sometimes echoes a shortened vendor string, which would cache under a
		// key that never matches at lookup time.
		for (const [j, p] of parsed.entries()) {
			const key =
				batch.length === parsed.length
					? batch[j].key
					: batch.find(b => b.key === p.vendor?.toLowerCase())?.key
			if (!key) continue
			out[key] = {
				service: SERVICES.includes(p.service as Service)
					? (p.service as Service)
					: 'none',
				category: CATEGORIES.includes(p.category as Category)
					? (p.category as Category)
					: 'Other',
				confidence: p.confidence === 'high' ? 'high' : 'low',
				sample: batch[j]?.sample,
			}
		}
		process.stdout.write(
			`  AI classified ${Math.min(i + AI_BATCH_SIZE, vendors.length)}/${vendors.length} vendors\r`,
		)
	}
	if (vendors.length) process.stdout.write('\n')
	return out
}

const usd = (n: number) =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
		n,
	)

type ExpensesArgs = ReturnType<typeof parseArgs>

async function main({ start, end, json, owner, noAi, noSync }: ExpensesArgs) {

	const { syncPlaidTransactions } = await import(
		'#app/utils/plaid-sync.server.ts'
	)
	const { prisma } = await import('#app/utils/db.server.ts')

	if (!noSync) {
		try {
			const result = await syncPlaidTransactions()
			if (!json)
				console.log(
					`Synced ${result.upserted} txns from ${result.items} connection(s)\n`,
				)
		} catch (error) {
			console.error(
				`Plaid sync failed (${error instanceof Error ? error.message : error}); reporting from stored data.`,
			)
		}
	}

	const rows = await prisma.plaidTransaction.findMany({
		where: { date: { gte: start, lte: end }, ...(owner ? { owner } : {}) },
		orderBy: { date: 'asc' },
	})
	if (!rows.length) {
		console.error(
			`No stored transactions${owner ? ` for owner "${owner}"` : ''} in ${start}..${end}. Run "pnpm plaid:link" first.`,
		)
		process.exit(1)
	}

	type Txn = {
		amount: number
		merchant: string
		name: string
		key: string
		date: string
		institution: string
		accountMask: string
	}
	type RevenueTxn = Txn & { source: string }
	// Expenses include credit-card refunds as negative amounts so a returned
	// purchase nets out of its vendor's total.
	const expenses: Txn[] = []
	const revenue: RevenueTxn[] = []
	const unknownDeposits: Txn[] = []
	let excludedTransfers = 0
	let excludedOtherCards = 0
	for (const r of rows) {
		const only = ACCOUNT_ONLY[r.institution]
		const ownerDigits = r.accountOwner?.match(/\d{4}\s*$/)?.[0]?.trim()
		const cardLast4 = ownerDigits || r.accountMask || ''
		if (only && !only.includes(cardLast4)) {
			excludedOtherCards++
			continue
		}
		const merchant = r.merchant ?? ''
		const name = r.name
		const txn: Txn = {
			amount: r.amount, // positive = money out
			merchant,
			name,
			key: vendorKey(merchant, name),
			date: r.date,
			institution: r.owner ? `${r.institution} (${r.owner})` : r.institution,
			accountMask: cardLast4,
		}
		// Credit-card payments move money between our own accounts: the card
		// purchases are the real expenses, the payment that settles them would
		// double-count.
		const isCardPayment =
			r.pfcDetailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' ||
			/payment thank you|autopay|crd autopay|online payment to|capital one mobile pymt/i.test(
				`${merchant} ${name}`,
			)
		if (isCardPayment) {
			excludedTransfers++
			continue
		}
		if (r.accountType === 'depository') {
			if (r.amount < 0) {
				// Deposit: revenue if it matches a known source; otherwise it goes
				// to the review list and is NOT counted as revenue.
				const hay = `${merchant} ${name}`.toLowerCase()
				const source = REVENUE_SOURCES.find(s =>
					s.match.some(m => hay.includes(m)),
				)
				if (source) revenue.push({ ...txn, source: source.label })
				else if (r.pfcPrimary === 'TRANSFER_IN') excludedTransfers++
				else unknownDeposits.push(txn)
			} else if (r.pfcPrimary === 'TRANSFER_OUT') {
				excludedTransfers++
			} else {
				expenses.push(txn)
			}
		} else {
			// Credit account: positive = purchase, negative = refund (card
			// payments were already excluded above).
			expenses.push(txn)
		}
	}

	// Resolve a class for every unique vendor: cache -> rules -> AI.
	const cache = loadCache()
	const classes = new Map<string, VendorClass>()
	const unknown = new Map<
		string,
		{ key: string; sample: string; amounts: number[] }
	>()
	for (const t of expenses) {
		if (classes.has(t.key)) continue
		const cached = cache[t.key]
		if (cached) {
			classes.set(t.key, { ...cached, source: 'cache' })
			continue
		}
		const rule = ruleMatch(t.key)
		if (rule) {
			classes.set(t.key, rule)
			continue
		}
		const u = unknown.get(t.key) ?? {
			key: t.key,
			sample: t.name || t.merchant,
			amounts: [],
		}
		u.amounts.push(t.amount)
		unknown.set(t.key, u)
	}

	if (unknown.size && !noAi) {
		if (!OPENROUTER_KEY) {
			console.error(
				'OPEN_ROUTER_API_KEY missing; leaving new vendors uncategorized (or pass --no-ai to silence this).',
			)
		} else {
			console.log(`Classifying ${unknown.size} new vendor(s) with ${AI_MODEL}...`)
			const fresh = await aiClassify(
				[...unknown.values()].map(u => ({
					key: u.key,
					sample: u.sample,
					typicalAmount:
						u.amounts.reduce((s, a) => s + a, 0) / u.amounts.length,
				})),
			)
			for (const [key, entry] of Object.entries(fresh)) {
				classes.set(key, { ...entry, source: 'ai' })
				cache[key] = entry
			}
			fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, '\t') + '\n')
			console.log(`Cache updated: ${CACHE_FILE}`)
		}
	}

	const fallback: VendorClass = {
		service: 'none',
		category: 'Other',
		confidence: 'low',
		source: 'rule',
	}
	const cls = (t: Txn) => classes.get(t.key) ?? fallback
	// Better safe than sorry: anything the AI wasn't sure about reports as
	// Unknown (with the guess kept as a suggestion) instead of polluting a real
	// category. Fix vendors in the cache file as they're identified.
	const effCategory = (t: Txn): Category | 'Unknown' => {
		const c = classes.get(t.key)
		return !c || c.confidence === 'low' ? 'Unknown' : c.category
	}

	const isBusiness = (t: Txn) => effCategory(t) !== 'Personal'
	const businessExpenses = expenses.filter(isBusiness)
	const personalExpenses = expenses.filter(t => !isBusiness(t))
	const totalExpense = businessExpenses.reduce((s, t) => s + t.amount, 0)
	const totalPersonal = personalExpenses.reduce((s, t) => s + t.amount, 0)
	const totalRevenue = revenue.reduce((s, t) => s - t.amount, 0)
	const totalUnknownDeposits = unknownDeposits.reduce((s, t) => s - t.amount, 0)

	const sumBy = <K extends string>(rows: Txn[], pick: (t: Txn) => K, sign = 1) => {
		const m = new Map<K, { total: number; count: number }>()
		for (const t of rows) {
			const k = pick(t)
			const v = m.get(k) ?? { total: 0, count: 0 }
			v.total += sign * t.amount
			v.count++
			m.set(k, v)
		}
		return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
	}

	const byService = sumBy(businessExpenses, t => cls(t).service)
	const byCategory = sumBy(businessExpenses, t => effCategory(t))
	const byVendor = sumBy(businessExpenses, t => t.key)
	const byInstitution = sumBy(expenses, t => `${t.institution} ...${t.accountMask}`)
	const byRevenueSource = sumBy(revenue, t => (t as RevenueTxn).source, -1)

	const months = [
		...new Set(
			[...businessExpenses, ...revenue].map(t => t.date.slice(0, 7)),
		),
	].sort()
	const monthly = months.map(m => {
		const rev = revenue
			.filter(t => t.date.startsWith(m))
			.reduce((s, t) => s - t.amount, 0)
		const exp = businessExpenses
			.filter(t => t.date.startsWith(m))
			.reduce((s, t) => s + t.amount, 0)
		return { month: m, revenue: rev, expenses: exp, net: rev - exp }
	})

	const unknownVendors = byVendor.filter(([k]) => {
		const c = classes.get(k)
		return !c || c.confidence === 'low'
	})

	const payload = {
		start,
		end,
		totalRevenue,
		totalExpense,
		totalPersonal,
		totalUnknownDeposits,
		netProfit: totalRevenue - totalExpense,
		monthly,
		byRevenueSource,
		byService,
		byCategory,
		vendors: byVendor.map(([k, v]) => ({
			vendor: k,
			...v,
			...(classes.get(k) ?? fallback),
			reported: effCategory({ key: k } as Txn),
		})),
		personalVendors: sumBy(personalExpenses, t => t.key).map(([k, v]) => ({
			vendor: k,
			...v,
		})),
		unknownDeposits: unknownDeposits.map(t => ({
			date: t.date,
			amount: -t.amount,
			name: t.merchant || t.name,
		})),
	}

	if (json) {
		console.log(JSON.stringify(payload, null, 2))
		return payload
	}

	const SERVICE_LABEL: Record<Service, string> = {
		tox: 'Tox (Botox/Jeuveau/...)',
		filler: 'Filler',
		'weight-loss': 'Weight loss (GLP-1s)',
		skincare: 'Skincare / facials',
		'mixed-cogs': 'Mixed clinical (tox+filler suppliers)',
		none: 'Not service-specific',
	}

	console.log(
		`P&L ${start} .. ${end}${owner ? `, owner: ${owner}` : ''} — ${rows.length} stored transactions`,
	)
	console.log(
		`Expense txns: ${expenses.length}  |  revenue txns: ${revenue.length}  |  excluded card payments/transfers: ${excludedTransfers}  |  excluded other-card txns: ${excludedOtherCards}`,
	)

	console.log(`\n=== P&L ===`)
	console.log(`Revenue:            ${usd(totalRevenue).padStart(12)}`)
	console.log(`Business expenses:  ${usd(totalExpense).padStart(12)}`)
	console.log(`Net:                ${usd(totalRevenue - totalExpense).padStart(12)}`)
	if (totalPersonal)
		console.log(`(Personal spending on these cards, not counted: ${usd(totalPersonal)})`)
	if (totalUnknownDeposits)
		console.log(`(Unknown deposits, not counted as revenue: ${usd(totalUnknownDeposits)})`)

	console.log('\nBy month (revenue / expenses / net):')
	for (const m of monthly)
		console.log(
			`  ${m.month}  ${usd(m.revenue).padStart(12)} ${usd(m.expenses).padStart(12)} ${usd(m.net).padStart(12)}`,
		)

	console.log('\nRevenue by source:')
	for (const [source, v] of byRevenueSource)
		console.log(
			`  ${source.padEnd(46)} ${usd(v.total).padStart(12)}  (${v.count} deposits)`,
		)
	if (unknownDeposits.length) {
		console.log('\nUNKNOWN deposits (not counted as revenue, tell me what these are):')
		for (const t of unknownDeposits.slice(0, 20))
			console.log(
				`  ${t.date}  ${usd(-t.amount).padStart(12)}  ${t.merchant || t.name}`,
			)
	}

	console.log('\nExpenses by category:')
	for (const [category, v] of byCategory) {
		const pct = totalExpense ? Math.round((100 * v.total) / totalExpense) : 0
		console.log(
			`  ${category.padEnd(42)} ${usd(v.total).padStart(12)}  (${pct}%, ${v.count} txns)`,
		)
	}

	console.log('\nExpenses by service line:')
	for (const [service, v] of byService) {
		const pct = totalExpense ? Math.round((100 * v.total) / totalExpense) : 0
		console.log(
			`  ${SERVICE_LABEL[service].padEnd(42)} ${usd(v.total).padStart(12)}  (${pct}%, ${v.count} txns)`,
		)
	}

	console.log('\nPer account (all expense txns incl. personal):')
	for (const [inst, v] of byInstitution)
		console.log(
			`  ${inst.padEnd(40)} ${usd(v.total).padStart(12)}  (${v.count} txns)`,
		)

	console.log('\nTop business vendors by spend:')
	for (const [k, v] of byVendor.slice(0, 25)) {
		const c = classes.get(k) ?? fallback
		console.log(
			`  ${usd(v.total).padStart(12)}  ${k.padEnd(38)} ${c.service} / ${effCategory({ key: k } as Txn)}${c.confidence === 'low' ? `  (guess: ${c.category})` : ''}`,
		)
	}

	if (unknownVendors.length) {
		console.log(
			`\nUNKNOWN vendors (tell me what these are, or fix ${path.basename(CACHE_FILE)} and re-run):`,
		)
		for (const [k, v] of unknownVendors) {
			const c = classes.get(k) ?? fallback
			console.log(
				`  ${usd(v.total).padStart(12)}  ${k.padEnd(38)} guess: ${c.service} / ${c.category}`,
			)
		}
	}
	return payload
}

export type BusinessPnlJson = Awaited<ReturnType<typeof main>>

/**
 * Programmatic entry (Temporal worker): Sarah's business P&L over the last 12
 * full months. Skips the Plaid pre-sync (the plaid-sync job owns that) and the
 * AI classifier (cache/rules only — prod has no OpenRouter dependency).
 */
export async function computeBusinessPnl(): Promise<BusinessPnlJson> {
	const from = new Date()
	from.setUTCDate(1)
	from.setUTCMonth(from.getUTCMonth() - 12)
	return await main({
		...parseArgs([]),
		start: from.toISOString().slice(0, 10),
		json: false,
		owner: 'sarah',
		noAi: true,
		noSync: true,
	})
}

if (process.argv[1]?.includes('plaid-expenses')) {
	void main(parseArgs(process.argv.slice(2)))
		.then(() => process.exit(0))
		.catch(error => {
			console.error(error instanceof Error ? error.message : error)
			process.exit(1)
		})
}
