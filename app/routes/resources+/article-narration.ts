/**
 * POST { text } -> the paragraph's narration (its audio address and word
 * times), made on first request and cached after. Admins only: this spends
 * ElevenLabs credit.
 */
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { z } from 'zod'

import {
	getNarration,
	hasNarrationConfig,
} from '#app/utils/article-narration.server.ts'
import {
	hasSpeech,
	NARRATION_MAX_CHARS,
	normalizeNarrationText,
} from '#app/utils/narration.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

const BodySchema = z.object({
	text: z.string().min(1).max(NARRATION_MAX_CHARS * 4),
})

export function narrationAudioUrl(hash: string): string {
	return `/resources/article-narration/${hash}.mp3`
}

export async function loader() {
	return json({ error: 'POST only' }, { status: 405 })
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== 'POST') {
		return json({ error: 'POST only' }, { status: 405 })
	}
	await requireUserWithRole(request, 'admin')
	if (!hasNarrationConfig()) {
		return json(
			{ error: 'Read-aloud is not set up on this server (no voice key).' },
			{ status: 503 },
		)
	}
	const raw = await request.json().catch(() => null)
	const parsed = BodySchema.safeParse(raw)
	if (!parsed.success) {
		return json({ error: 'Send { text }.' }, { status: 400 })
	}
	const text = normalizeNarrationText(parsed.data.text)
	if (!hasSpeech(text)) {
		return json({ error: 'Nothing to say in this paragraph.' }, { status: 422 })
	}
	if (text.length > NARRATION_MAX_CHARS) {
		return json(
			{ error: `This paragraph is longer than ${NARRATION_MAX_CHARS} characters.` },
			{ status: 422 },
		)
	}
	try {
		const narration = await getNarration(text)
		return json({ ...narration, audioUrl: narrationAudioUrl(narration.hash) })
	} catch (error) {
		console.error(
			'Narration failed:',
			error instanceof Error ? error.message : String(error),
		)
		return json(
			{ error: error instanceof Error ? error.message : 'Narration failed.' },
			{ status: 502 },
		)
	}
}
