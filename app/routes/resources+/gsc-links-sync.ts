import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'

/**
 * Sync endpoint for Google's own linking-sites report.
 *
 *   POST /resources/gsc-links-sync   {pulls: [...]}   store one snapshot per property
 *   GET  /resources/gsc-links-sync                    the newest snapshot per property
 *
 * The Search Console API has no links report, so ~/outreach/gsc-links.py on the Mac mini reads the
 * report page in a signed-in browser and pushes the result here. Same trust model as article-sync:
 * a bearer token, and with no token set the endpoint refuses everything.
 */
const SiteSchema = z.object({
	site: z.string().min(1).max(255),
	root: z.string().min(1).max(255),
	linkingPages: z.number().int().nonnegative().nullable().optional(),
	targetPages: z.number().int().nonnegative().nullable().optional(),
	klass: z.string().max(80).nullable().optional(),
	spam: z.boolean().optional(),
	ours: z.boolean().optional(),
	isOurLink: z.boolean().optional(),
})

const PullSchema = z.object({
	property: z.enum(['sha', 'bk', 'kwlc']),
	pulledAt: z.string().min(10),
	sites: z.number().int().nonnegative(),
	linkingPages: z.number().int().nonnegative(),
	realSites: z.number().int().nonnegative().optional(),
	spamSites: z.number().int().nonnegative().optional(),
	oursSites: z.number().int().nonnegative().optional(),
	searchSites: z.number().int().nonnegative().optional(),
	ourLiveLinks: z.number().int().nonnegative().optional(),
	pickedUp: z.number().int().nonnegative().optional(),
	source: z.string().max(40).optional(),
	links: z.array(SiteSchema).max(2000),
})

const PayloadSchema = z.object({ pulls: z.array(PullSchema).min(1).max(12) })

function authorized(request: Request) {
	const token = process.env.GSC_SYNC_TOKEN || process.env.ARTICLE_SYNC_TOKEN
	const auth = request.headers.get('Authorization')
	return Boolean(token && auth === `Bearer ${token}`)
}

export async function loader({ request }: LoaderFunctionArgs) {
	if (!authorized(request)) return json({ error: 'unauthorized' }, { status: 401 })
	const properties = ['sha', 'bk', 'kwlc'] as const
	const latest = await Promise.all(
		properties.map(property =>
			prisma.gscLinkPull.findFirst({
				where: { property },
				orderBy: { pulledAt: 'desc' },
				select: { property: true, pulledAt: true, sites: true, linkingPages: true, realSites: true },
			}),
		),
	)
	return json({ now: new Date().toISOString(), latest: latest.filter(Boolean) })
}

export async function action({ request }: ActionFunctionArgs) {
	if (!authorized(request)) return json({ error: 'unauthorized' }, { status: 401 })
	if (request.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

	const parsed = PayloadSchema.safeParse(await request.json().catch(() => null))
	if (!parsed.success) {
		return json({ error: 'bad payload', detail: parsed.error.flatten() }, { status: 400 })
	}

	const stored: Array<{ property: string; pulledAt: string; links: number }> = []
	for (const pull of parsed.data.pulls) {
		const pulledAt = new Date(pull.pulledAt)
		if (Number.isNaN(pulledAt.getTime())) {
			return json({ error: `bad pulledAt for ${pull.property}` }, { status: 400 })
		}
		// A re-push of the same snapshot replaces it rather than doubling the history.
		const existing = await prisma.gscLinkPull.findUnique({
			where: { property_pulledAt: { property: pull.property, pulledAt } },
			select: { id: true },
		})
		if (existing) await prisma.gscLinkPull.delete({ where: { id: existing.id } })

		await prisma.gscLinkPull.create({
			data: {
				property: pull.property,
				pulledAt,
				sites: pull.sites,
				linkingPages: pull.linkingPages,
				realSites: pull.realSites ?? 0,
				spamSites: pull.spamSites ?? 0,
				oursSites: pull.oursSites ?? 0,
				searchSites: pull.searchSites ?? 0,
				ourLiveLinks: pull.ourLiveLinks ?? 0,
				pickedUp: pull.pickedUp ?? 0,
				source: pull.source ?? 'shade',
				links: {
					create: pull.links.map(l => ({
						site: l.site,
						root: l.root,
						linkingPages: l.linkingPages ?? null,
						targetPages: l.targetPages ?? null,
						klass: l.klass ?? null,
						spam: l.spam ?? false,
						ours: l.ours ?? false,
						isOurLink: l.isOurLink ?? false,
					})),
				},
			},
		})
		stored.push({ property: pull.property, pulledAt: pulledAt.toISOString(), links: pull.links.length })
	}
	return json({ ok: true, stored })
}
