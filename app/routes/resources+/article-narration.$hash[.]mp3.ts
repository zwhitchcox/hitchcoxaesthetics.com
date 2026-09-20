/** GET the cached audio for one narration. Admins only, cached for a year: the hash is the content. */
import { type LoaderFunctionArgs } from '@remix-run/node'

import { readNarrationAudio } from '#app/utils/article-narration.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const hash = params.hash ?? ''
	if (!/^[a-f0-9]{64}$/.test(hash)) return new Response('Not found', { status: 404 })
	const audio = await readNarrationAudio(hash)
	if (!audio) return new Response('Not found', { status: 404 })
	return new Response(audio, {
		headers: {
			'Content-Type': 'audio/mpeg',
			'Content-Length': String(audio.byteLength),
			'Cache-Control': 'private, max-age=31536000, immutable',
		},
	})
}
