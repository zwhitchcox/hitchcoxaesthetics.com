/**
 * Provider review links.
 *
 * A provider hands a client a QR / short link (`/r/<boulevardStaffId>`). On
 * scan we look up that provider's current (just-finished or in-progress)
 * appointment from a cached snapshot, generate a first-person, SEO-keyworded
 * sample Google review for the service they received, and offer the client a
 * "copy" button plus a button per Google Business Profile location.
 *
 * Funnel tracking is PostHog-only (no DB): every event is keyed to the
 * appointment so a funnel reads appointment -> scanned -> copied -> location
 * selected. See REVIEW_EVENTS below.
 *
 * Appointments can't be filtered by staff/date in the Boulevard Admin API, so a
 * background job (review-link-sync.server.ts) keeps a small snapshot of recent
 * appointments in BlvdSyncState; the scan path only reads that snapshot.
 */
import QRCode from 'qrcode'
import { boulevardAdminFetch } from '#app/utils/blvd-admin.server.ts'
import { prisma } from '#app/utils/db.server.ts'

export const REVIEW_RECENT_APPOINTMENTS_KEY = 'reviewLinkRecentAppointments'

export const REVIEW_EVENTS = {
	eligible: 'review_appointment_eligible',
	scanned: 'review_link_scanned',
	copied: 'review_sample_copied',
	locationSelected: 'review_location_selected',
} as const

/** Stable PostHog person id so the funnel links steps per appointment. */
export function reviewDistinctId(appointmentId: string | null, providerId: string) {
	return appointmentId ? `review-appt:${appointmentId}` : `review-provider:${providerId}`
}

/**
 * Links carry the bare staff UUID for clean URLs; Boulevard ids are URNs
 * (`urn:blvd:Staff:<uuid>`). Rebuild the URN so it matches cached appointments.
 */
export function toStaffUrn(providerIdParam: string) {
	return providerIdParam.startsWith('urn:')
		? providerIdParam
		: `urn:blvd:Staff:${providerIdParam}`
}

// ---------------------------------------------------------------------------
// Cached appointment snapshot
// ---------------------------------------------------------------------------

export type CachedAppointment = {
	id: string
	startAt: string
	endAt: string | null
	state: string | null
	locationId: string
	locationName: string
	staffId: string
	staffName: string
	staffPhone: string | null
	clientFirstName: string | null
	serviceName: string
}

export type ReviewAppointmentSnapshot = {
	refreshedAt: string
	appointments: CachedAppointment[]
}

export async function readAppointmentSnapshot(): Promise<ReviewAppointmentSnapshot | null> {
	const row = await prisma.blvdSyncState.findUnique({
		where: { key: REVIEW_RECENT_APPOINTMENTS_KEY },
	})
	if (!row?.value) return null
	try {
		return JSON.parse(row.value) as ReviewAppointmentSnapshot
	} catch {
		return null
	}
}

/**
 * The appointment a provider is "on" when they hand over the QR: the client
 * they just finished (or are finishing). We prefer an already-started
 * appointment (latest start wins) over one that's only about to begin, so a
 * just-completed visit beats the next client arriving soon. A small grace lets
 * a slightly-early scan still resolve. Returns null when nothing recent is
 * cached for them.
 */
export function resolveCurrentAppointment(
	snapshot: ReviewAppointmentSnapshot | null,
	providerId: string,
	now = new Date(),
): CachedAppointment | null {
	if (!snapshot) return null
	const GRACE_MS = 5 * 60 * 1000 // tolerate scanning ~5 min before start
	const STALE_MS = 6 * 60 * 60 * 1000 // ignore anything older than 6h
	const nowMs = now.getTime()
	const inWindow = snapshot.appointments
		.filter(a => a.staffId === providerId)
		.map(a => ({ a, start: new Date(a.startAt).getTime() }))
		.filter(({ start }) => Number.isFinite(start))
		.filter(({ start }) => start <= nowMs + GRACE_MS && start >= nowMs - STALE_MS)

	// Already started (just-finished or in progress): pick the most recent.
	const started = inWindow
		.filter(({ start }) => start <= nowMs)
		.sort((x, y) => y.start - x.start)
	if (started[0]) return started[0].a

	// Otherwise the soonest about-to-start within the grace window.
	const upcoming = inWindow.sort((x, y) => x.start - y.start)
	return upcoming[0]?.a ?? null
}

// ---------------------------------------------------------------------------
// Service -> SEO keywords
// ---------------------------------------------------------------------------

type ServiceProfile = { category: string; keywords: string[] }

const SERVICE_PROFILES: { match: RegExp; profile: ServiceProfile }[] = [
	{
		match: /tox|botox|dysport|jeuveau|xeomin|wrinkle/i,
		profile: {
			category: 'Tox / Botox',
			keywords: ['Botox Knoxville', 'wrinkle relaxer', 'Dysport', 'natural results'],
		},
	},
	{
		match: /filler|lip|dissolve|hylenex|juvederm|restylane/i,
		profile: {
			category: 'Filler',
			keywords: ['lip filler Knoxville', 'dermal filler', 'natural-looking filler'],
		},
	},
	{
		match: /weight|semaglutide|tirzepatide|glp/i,
		profile: {
			category: 'Weight Loss',
			keywords: ['weight loss Knoxville', 'semaglutide', 'medical weight loss'],
		},
	},
	{
		// Laser split from Skin/Facial: laser reviews stay on the SHA listing
		// while everything else seeds the brand microsites.
		match: /laser|ipl|bbl\b|hair removal|moxi|halo/i,
		profile: {
			category: 'Laser',
			keywords: ['laser hair removal Knoxville', 'laser skin treatment', 'smooth skin'],
		},
	},
	{
		match: /facial|skin|microneedl|peel|hydrafacial/i,
		profile: {
			category: 'Skin / Facial',
			keywords: ['facial Knoxville', 'skincare', 'glowing skin'],
		},
	},
	{
		match: /consult/i,
		profile: {
			category: 'Consultation',
			keywords: ['Knoxville med spa', 'consultation'],
		},
	},
]

export function getServiceProfile(serviceName: string): ServiceProfile {
	for (const { match, profile } of SERVICE_PROFILES) {
		if (match.test(serviceName)) return profile
	}
	return { category: 'Aesthetic treatment', keywords: ['Knoxville med spa', 'aesthetics'] }
}

// ---------------------------------------------------------------------------
// Google Business Profile review locations
// ---------------------------------------------------------------------------

export type ReviewLocation = {
	placeId: string
	label: string
	address: string
	writeReviewUrl: string
	/** matches a Boulevard location name keyword for pre-highlighting */
	blvdMatch: RegExp
}

export function writeReviewUrl(placeId: string) {
	return `https://search.google.com/local/writereview?placeid=${placeId}`
}

// Classify a Google listing to its location by ADDRESS ONLY. The listing/DB
// name is untrustworthy (the Google titles were swapped for a while, and the
// synced GoogleLocation.name can lag renames), but the street address is the
// physical ground truth. Bearden and West Hills are both on Kingston Pike, so
// match street numbers, not the road. Add a case here when a new location goes
// live.
function classifyLocation(address: string): {
	label: string
	blvdMatch: RegExp
} {
	const hay = address.toLowerCase()
	if (/campbell station|37934/.test(hay))
		return { label: 'Farragut', blvdMatch: /farragut/i }
	if (/cross park|37923/.test(hay))
		return { label: 'Cedar Bluff', blvdMatch: /cedar bluff/i }
	if (/7600 kingston/.test(hay))
		return { label: 'West Hills', blvdMatch: /west hills/i }
	return { label: 'Bearden', blvdMatch: /knox|bearden/i }
}

export async function getReviewLocations(): Promise<ReviewLocation[]> {
	const rows = await prisma.googleLocation.findMany({
		select: { name: true, formattedAddress: true, json: true, url: true },
	})
	const locations: ReviewLocation[] = []
	for (const row of rows) {
		let placeId: string | null = null
		try {
			const parsed = row.json
				? (JSON.parse(row.json) as { metadata?: { placeId?: string } })
				: null
			placeId = parsed?.metadata?.placeId ?? null
		} catch {
			placeId = null
		}
		if (!placeId) continue
		const address = row.formattedAddress ?? ''
		const { label, blvdMatch } = classifyLocation(address)
		locations.push({
			placeId,
			label,
			address,
			writeReviewUrl: writeReviewUrl(placeId),
			blvdMatch,
		})
	}
	// Stable default order; the page floats the visited location to the top.
	return locations.sort((a, b) => a.label.localeCompare(b.label))
}

export function matchLocationToAppointment(
	locations: ReviewLocation[],
	appointmentLocationName: string | null | undefined,
): string | null {
	if (!appointmentLocationName) return null
	// Try specific locations before the broad Bearden/Knoxville match, so a
	// "Knoxville (West Hills)" appointment isn't grabbed by Bearden's /knox/.
	const ordered = [...locations].sort(
		(a, b) => Number(a.label === 'Bearden') - Number(b.label === 'Bearden'),
	)
	const hit = ordered.find(l => l.blvdMatch.test(appointmentLocationName))
	return hit?.placeId ?? null
}

// ---------------------------------------------------------------------------
// Review generation (OpenRouter -> Claude), matching call-intelligence pattern
// ---------------------------------------------------------------------------

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_REVIEW_MODEL = 'anthropic/claude-haiku-4.5'

export type GenerateReviewInput = {
	serviceName: string
	providerFirstName: string
	keywords: string[]
}

export async function generateSampleReview({
	serviceName,
	providerFirstName,
	keywords,
}: GenerateReviewInput): Promise<string | null> {
	const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim()
	if (!apiKey) return null
	const model = process.env.REVIEW_GEN_MODEL?.trim() || DEFAULT_REVIEW_MODEL
	const prompt = `You are writing a sample 5-star Google review that a happy med-spa client can use as a starting point and edit before posting.
Business: Sarah Hitchcox Aesthetics, a med spa in Knoxville, TN.
Provider the client just saw: ${providerFirstName}.
Service the client received: ${serviceName}.
Write it in FIRST PERSON as the client, warm and specific, 2-4 sentences, sounding like a real person (not generic marketing copy). Naturally weave in SEO keywords that help this business rank for this service: ${keywords.map(k => `"${k}"`).join(', ')}. Mention the provider by first name. Do NOT invent the client's own name, exact prices, or fake medical claims. No hashtags, no emoji. Return ONLY the review text.`
	try {
		const res = await fetch(OPENROUTER_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages: [{ role: 'user', content: prompt }],
				max_tokens: 300,
				temperature: 0.9,
			}),
		})
		if (!res.ok) return null
		const json = (await res.json()) as any
		const text = json?.choices?.[0]?.message?.content?.trim()
		return typeof text === 'string' && text.length > 0 ? text : null
	} catch {
		return null
	}
}

/** Deterministic fallback when the model is unavailable. */
export function fallbackReview(serviceName: string, providerFirstName: string, keywords: string[]) {
	const kw = keywords[0] ?? 'Knoxville med spa'
	return `${providerFirstName} at Sarah Hitchcox Aesthetics took such great care of me for my ${serviceName.toLowerCase()}. Natural results and a wonderful experience. Highly recommend if you're looking for ${kw}.`
}

// ---------------------------------------------------------------------------
// Sample uniqueness ledger — Google's spam filter clusters and removes
// duplicate review text (2026-07-13: two customers posted the WLK microsite's
// static sample verbatim). Every sample we hand a customer is hashed here and
// never served again.
// ---------------------------------------------------------------------------

const SERVED_SAMPLES_KEY = 'review-samples-served-hashes'
const SERVED_SAMPLES_CAP = 5000

function sampleHash(text: string): string {
	const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
	let hash = 0
	for (let i = 0; i < normalized.length; i++) {
		hash = (hash * 31 + normalized.charCodeAt(i)) | 0
	}
	return `${hash}:${normalized.length}`
}

/**
 * Filter candidates down to texts never served before, and record the
 * survivors so they can never be served again.
 */
export async function takeUniqueSamples(
	candidates: Array<string | null | undefined>,
): Promise<string[]> {
	const texts = candidates.filter(
		(t): t is string => typeof t === 'string' && t.trim().length > 0,
	)
	if (texts.length === 0) return []
	const row = await prisma.blvdSyncState.findUnique({
		where: { key: SERVED_SAMPLES_KEY },
	})
	const served: string[] = row?.value ? (JSON.parse(row.value) as string[]) : []
	const servedSet = new Set(served)
	const unique: string[] = []
	for (const text of texts) {
		const hash = sampleHash(text)
		if (servedSet.has(hash)) continue
		servedSet.add(hash)
		served.push(hash)
		unique.push(text)
	}
	if (unique.length > 0) {
		const value = JSON.stringify(served.slice(-SERVED_SAMPLES_CAP))
		await prisma.blvdSyncState.upsert({
			where: { key: SERVED_SAMPLES_KEY },
			create: { key: SERVED_SAMPLES_KEY, value },
			update: { value },
		})
	}
	return unique
}

const SAMPLE_ANGLES = [
	'how the results made you feel week to week',
	'how easy booking and scheduling was',
	'the staff listening and adjusting the plan to you',
	'being nervous at first and how the visit went',
	'comparing this to other places you researched',
	'the follow-up and check-ins between visits',
	'how quick and convenient the visits are',
	'recommending it to a specific kind of person (friend, coworker)',
]
const SAMPLE_TONES = ['warm and casual', 'matter-of-fact', 'enthusiastic', 'understated and sincere']

/**
 * Brand-aware sample generator for the microsites. Random angle/tone/length
 * per call so outputs stay diverse even within a single page load.
 */
export async function generateBrandSampleReview({
	businessName,
	service,
	keywords,
}: {
	businessName: string
	service: string
	keywords: string[]
}): Promise<string | null> {
	const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim()
	if (!apiKey) return null
	const model = process.env.REVIEW_GEN_MODEL?.trim() || DEFAULT_REVIEW_MODEL
	const angle = SAMPLE_ANGLES[Math.floor(Math.random() * SAMPLE_ANGLES.length)]!
	const tone = SAMPLE_TONES[Math.floor(Math.random() * SAMPLE_TONES.length)]!
	const sentences = 2 + Math.floor(Math.random() * 3)
	const prompt = `You are writing a sample 5-star Google review that a happy client can use as a starting point and edit before posting.
Business: ${businessName}, in Knoxville, TN.
Service the client received: ${service}.
Angle to build the review around: ${angle}. Tone: ${tone}. Length: about ${sentences} sentences.
Write in FIRST PERSON as the client, sounding like a real person (not marketing copy). Naturally weave in one or two of these phrases: ${keywords.map(k => `"${k}"`).join(', ')}. Do NOT invent the client's name, exact prices, specific pound counts, or medical claims. No hashtags, no emoji. Return ONLY the review text.`
	try {
		const res = await fetch(OPENROUTER_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages: [{ role: 'user', content: prompt }],
				max_tokens: 300,
				temperature: 1,
			}),
		})
		if (!res.ok) return null
		const json = (await res.json()) as any
		const text = json?.choices?.[0]?.message?.content?.trim()
		return typeof text === 'string' && text.length > 0 ? text : null
	} catch {
		return null
	}
}

// ---------------------------------------------------------------------------
// Providers + QR codes (for the printable QR pages)
// ---------------------------------------------------------------------------

export type Provider = { id: string; uuid: string; name: string }

export async function listProviders(): Promise<Provider[]> {
	const out: Provider[] = []
	let after: string | null = null
	for (let page = 0; page < 20; page++) {
		const resp: any = await boulevardAdminFetch(
			`query Staff($after: String) {
				staff(first: 100, after: $after) {
					pageInfo { endCursor hasNextPage }
					edges { node { id firstName lastName } }
				}
			}`,
			{ after },
		)
		for (const edge of resp.staff?.edges ?? []) {
			const id = edge.node?.id
			if (!id) continue
			out.push({
				id,
				uuid: id.split(':').pop() ?? id,
				name: [edge.node.firstName, edge.node.lastName].filter(Boolean).join(' ') || id,
			})
		}
		const pageInfo = resp.staff?.pageInfo
		if (!pageInfo?.hasNextPage) break
		after = pageInfo.endCursor
	}
	return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getProviderName(providerIdParam: string): Promise<string | null> {
	try {
		const resp: any = await boulevardAdminFetch(
			`query Provider($id: ID!) { staffMember(id: $id) { firstName lastName } }`,
			{ id: toStaffUrn(providerIdParam) },
		)
		const s = resp.staffMember
		if (!s) return null
		return [s.firstName, s.lastName].filter(Boolean).join(' ') || null
	} catch {
		return null
	}
}

export async function generateReviewQrDataUrl(url: string): Promise<string> {
	return QRCode.toDataURL(url, { width: 900, margin: 1 })
}
