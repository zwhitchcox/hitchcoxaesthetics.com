import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'

/**
 * Server side of the article review flow: the sync payload the outreach system
 * on the Mac mini sends (tools/article-writer/review_sync.py in the pbn repo)
 * and the upsert that keeps Sarah's edits and review state safe across pushes.
 */

export const SyncImageSchema = z.object({
	fileName: z.string().min(1).max(200),
	contentType: z.string().min(1).max(100),
	altText: z.string().max(1000).nullish(),
	caption: z.string().max(2000).nullish(),
	position: z.number().int().min(0).default(0),
	dataBase64: z.string().min(1),
})

export const SyncArticleSchema = z.object({
	sourceKey: z.string().min(1).max(200),
	kind: z.enum(['guest', 'blog']),
	outreachRowId: z.number().int().nullish(),
	outreachArticleId: z.number().int().nullish(),
	publication: z.string().max(200).nullish(),
	publicationUrl: z.string().max(500).nullish(),
	slug: z
		.string()
		.max(200)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		.nullish(),
	title: z.string().min(1).max(500),
	dek: z.string().max(2000).nullish(),
	byline: z.string().max(200).nullish(),
	body: z.string().min(1),
	writer: z.string().max(100).nullish(),
	isReference: z.boolean().default(false),
	wordCount: z.number().int().nullish(),
	links: z.array(z.object({ name: z.string(), url: z.string() })).nullish(),
	notes: z.string().max(5000).nullish(),
	outreachStatus: z.string().max(50).nullish(),
	liveUrl: z.string().max(1000).nullish(),
	/** When present, the stored picture set is replaced by this one. */
	images: z.array(SyncImageSchema).nullish(),
})

export const SyncPayloadSchema = z.object({
	articles: z.array(SyncArticleSchema).min(1).max(50),
})

export type SyncArticle = z.infer<typeof SyncArticleSchema>

export function hashBody(body: string): string {
	return createHash('sha256')
		.update(body.replace(/\r\n/g, '\n').trim())
		.digest('hex')
}

export type UpsertResult = {
	sourceKey: string
	id: string
	status: string
	changed: 'created' | 'text' | 'meta'
}

/**
 * Create or update one article from the writer's side. New text resets the
 * review (Sarah reviews what will actually go out). Metadata alone, such as
 * the outreach status or the live URL, never touches her edits or decision.
 */
export async function upsertSyncedArticle(a: SyncArticle): Promise<UpsertResult> {
	const bodyHash = hashBody(a.body)
	const meta = {
		kind: a.kind,
		outreachRowId: a.outreachRowId ?? null,
		outreachArticleId: a.outreachArticleId ?? null,
		publication: a.publication ?? null,
		publicationUrl: a.publicationUrl ?? null,
		slug: a.slug ?? null,
		title: a.title,
		dek: a.dek ?? null,
		byline: a.byline ?? null,
		writer: a.writer ?? null,
		isReference: a.isReference,
		wordCount: a.wordCount ?? null,
		linksJson: a.links ? JSON.stringify(a.links) : null,
		notes: a.notes ?? null,
		outreachStatus: a.outreachStatus ?? null,
		liveUrl: a.liveUrl ?? null,
	}
	const existing = await prisma.article.findUnique({
		where: { sourceKey: a.sourceKey },
		select: {
			id: true,
			bodyHash: true,
			body: true,
			status: true,
			reviewedAt: true,
			reviewedBy: true,
			editedAt: true,
		},
	})
	let id: string
	let changed: UpsertResult['changed']
	let status = 'pending'
	if (!existing) {
		const created = await prisma.article.create({
			data: { ...meta, sourceKey: a.sourceKey, body: a.body, bodyOriginal: a.body, bodyHash },
			select: { id: true },
		})
		id = created.id
		changed = 'created'
	} else if (existing.bodyHash !== bodyHash) {
		const when = new Date().toISOString().slice(0, 10)
		const cleared = existing.reviewedAt
			? ` The earlier decision (${existing.status} by ${existing.reviewedBy ?? 'admin'} on ${existing.reviewedAt.toISOString().slice(0, 10)}) was cleared.`
			: ''
		await prisma.article.update({
			where: { id: existing.id },
			data: {
				...meta,
				body: a.body,
				bodyOriginal: a.body,
				bodyHash,
				previousBody: existing.editedAt ? existing.body : null,
				status: 'pending',
				reviewNote: `The writer sent new text on ${when}.${cleared}`,
				reviewedAt: null,
				reviewedBy: null,
				editedAt: null,
				editedBy: null,
				receivedAt: new Date(),
			},
		})
		id = existing.id
		changed = 'text'
	} else {
		await prisma.article.update({ where: { id: existing.id }, data: meta })
		id = existing.id
		changed = 'meta'
		status = existing.status
	}
	if (a.images) {
		const keep = a.images.map(i => i.fileName)
		await prisma.articleImage.deleteMany({
			where: { articleId: id, fileName: { notIn: keep } },
		})
		for (const im of a.images) {
			const blob = Buffer.from(im.dataBase64, 'base64')
			const fields = {
				contentType: im.contentType,
				altText: im.altText ?? null,
				caption: im.caption ?? null,
				position: im.position,
				blob,
			}
			await prisma.articleImage.upsert({
				where: { articleId_fileName: { articleId: id, fileName: im.fileName } },
				create: { ...fields, articleId: id, fileName: im.fileName },
				update: fields,
			})
		}
	}
	return { sourceKey: a.sourceKey, id, status, changed }
}

/** The name shown as the reviewer. Never the phone number. */
export async function reviewerName(userId: string): Promise<string> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { name: true },
	})
	return user?.name?.trim() || 'admin'
}
