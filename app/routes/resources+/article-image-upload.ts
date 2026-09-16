import { createId } from '@paralleldrive/cuid2'
import {
	json,
	MaxPartSizeExceededError,
	unstable_createMemoryUploadHandler,
	unstable_parseMultipartFormData,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { z } from 'zod'
import { takeRateLimitToken } from '#app/utils/ai-chat.ts'
import {
	ARTICLE_IMAGE_MAX_BYTES,
	ARTICLE_IMAGE_UPLOAD_COPY,
	ARTICLE_IMAGE_UPLOAD_RATE_LIMIT,
	articleImageUrl,
	imageDimensions,
	sniffImageType,
	stripLocation,
	userPictureFileName,
} from '#app/utils/article-images.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { recordReviewEvent } from '#app/utils/review-events.server.ts'

/**
 * A picture Sarah adds in the article chat.
 *
 *   POST /resources/article-image-upload   multipart: articleId, file
 *   -> 200 { image: { id, fileName, width, height, url } }
 *   -> 400 the 10 MB line (a part over the cap), or an unreadable upload
 *   -> 404 no such article; 409 { error: 'decided', message } when it is not pending
 *   -> 415 the HEIC line, or the not-a-picture line
 *   -> 429 the too-many line
 *
 * Admin only. The type comes from the first bytes, never from the client's
 * MIME type. `stripLocation` takes the GPS position, XMP and comments out of
 * the bytes first (a phone photo carries them; the orientation stays). The
 * result is stored as an ArticleImage row named `user-<id>.<ext>`; a picture line `![alt](images/user-<id>.<ext>)` then
 * shows it in place and approved.md carries it to the mini. Logs carry the
 * byte count, the size and the type only.
 */

const ArticleIdSchema = z.string().trim().min(1).max(64)

// Per-user sliding window of request timestamps. In-memory per machine.
const rateWindows = new Map<string, number[]>()

export function loader() {
	return json({ error: 'POST only' }, { status: 405 })
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method.toUpperCase() !== 'POST') {
		return json({ error: 'POST only' }, { status: 405 })
	}
	const userId = await requireUserWithRole(request, 'admin')

	pruneRateWindows()
	const window = takeRateLimitToken(
		rateWindows.get(userId) ?? [],
		Date.now(),
		ARTICLE_IMAGE_UPLOAD_RATE_LIMIT,
	)
	rateWindows.set(userId, window.timestamps)
	if (!window.allowed) {
		return json({ error: ARTICLE_IMAGE_UPLOAD_COPY.tooMany }, { status: 429 })
	}

	let form: FormData
	try {
		form = await unstable_parseMultipartFormData(
			request,
			unstable_createMemoryUploadHandler({
				maxPartSize: ARTICLE_IMAGE_MAX_BYTES,
			}),
		)
	} catch (error) {
		if (error instanceof MaxPartSizeExceededError) {
			return json({ error: ARTICLE_IMAGE_UPLOAD_COPY.tooBig }, { status: 400 })
		}
		return json(
			{ error: ARTICLE_IMAGE_UPLOAD_COPY.unreadable },
			{ status: 400 },
		)
	}

	const articleId = ArticleIdSchema.safeParse(form.get('articleId'))
	if (!articleId.success) {
		return json({ error: 'articleId is required.' }, { status: 400 })
	}
	const file = form.get('file')
	if (!(file instanceof File) || file.size === 0) {
		return json({ error: ARTICLE_IMAGE_UPLOAD_COPY.wrongType }, { status: 415 })
	}

	const article = await prisma.article.findUnique({
		where: { id: articleId.data },
		select: { id: true, status: true },
	})
	if (!article) return json({ error: 'Article not found.' }, { status: 404 })
	if (article.status !== 'pending') {
		return json(
			{ error: 'decided', message: ARTICLE_IMAGE_UPLOAD_COPY.decided },
			{ status: 409 },
		)
	}

	const sent = new Uint8Array(await file.arrayBuffer())
	const type = sniffImageType(sent)
	if (type === 'heic') {
		return json({ error: ARTICLE_IMAGE_UPLOAD_COPY.heic }, { status: 415 })
	}
	if (type === null) {
		return json({ error: ARTICLE_IMAGE_UPLOAD_COPY.wrongType }, { status: 415 })
	}
	const bytes = stripLocation(sent)
	const size = imageDimensions(bytes)

	const last = await prisma.articleImage.aggregate({
		where: { articleId: article.id },
		_max: { position: true },
	})
	const id = createId()
	const image = await prisma.articleImage.create({
		data: {
			id,
			articleId: article.id,
			fileName: userPictureFileName(id, type),
			contentType: `image/${type}`,
			blob: Buffer.from(bytes),
			width: size?.width ?? null,
			height: size?.height ?? null,
			position: (last._max.position ?? -1) + 1,
			altText: null,
		},
		select: { id: true, fileName: true, width: true, height: true },
	})
	const sizeLabel = size ? `${size.width}x${size.height}` : 'unknown size'
	await recordReviewEvent(article.id, 'picture_uploaded', {
		userId,
		note: `${sizeLabel} ${type}`,
	})
	console.log(
		`Article image upload: ${bytes.byteLength} bytes, ${sizeLabel}, ${type}`,
	)

	return json({ image: { ...image, url: articleImageUrl(image.id) } })
}

/** Keep the in-memory window map from growing without bound. */
function pruneRateWindows() {
	const cutoff = Date.now() - ARTICLE_IMAGE_UPLOAD_RATE_LIMIT.windowMs
	for (const [key, timestamps] of rateWindows) {
		if (!timestamps.some(t => t > cutoff)) rateWindows.delete(key)
	}
}
