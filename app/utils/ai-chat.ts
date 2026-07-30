/**
 * Shared logic for the website AI chat assistant.
 *
 * The Retell chat agent ends a reply with at most one action directive line:
 *   <<NAVIGATE:/injectables/botox>>  - browse to a page while chatting
 *   <<BOOK:tox>>                     - hand off to /book?service=tox
 * The resource route strips the directive from the visible message and
 * returns it as structured { message, action } JSON; the widget performs the
 * client-side navigation.
 *
 * This module also holds the pure abuse-cap decisions (message length, turns
 * per chat, per-IP rate window) that the route enforces BEFORE calling
 * Retell, so visitors cannot run up the token bill. Kept dependency-free so
 * the route, the widget, the deploy script, and vitest can all import it.
 */

/** Idempotency key: the deploy script finds/updates the agent by this name. */
export const RETELL_CHAT_AGENT_NAME = 'Sarah Hitchcox Aesthetics Chat'

export const AI_CHAT_OFFICE_PHONE = '(865) 489-8008'

/** Greeting shown locally by the widget and set as the agent begin_message. */
export const AI_CHAT_GREETING = `Hi, I'm the AI assistant for Sarah Hitchcox Aesthetics. I can answer questions about our services, pricing, and locations, and help you get booked. What can I help you with?`

export const AI_CHAT_MAX_MESSAGE_CHARS = 500
export const AI_CHAT_MAX_TURNS_PER_CHAT = 30
export const AI_CHAT_RATE_LIMIT = { max: 20, windowMs: 5 * 60 * 1000 }

export type AiChatAction =
	| { type: 'navigate'; path: string }
	| { type: 'book'; serviceSlug: string }

export type ParsedChatReply = {
	message: string
	action: AiChatAction | null
}

const DIRECTIVE_RE = /<<\s*(NAVIGATE|BOOK)\s*:\s*([^<>]*?)\s*>>/gi
// Site paths only: rooted, lowercase kebab segments, no scheme/host/../query.
const NAVIGATE_PATH_RE = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/
const BOOK_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/

/**
 * Strip every directive token from an agent reply and return the last VALID
 * one as the action. Malformed or invented-looking directives are removed
 * from the visible text but produce no action.
 */
export function parseChatDirective(raw: string): ParsedChatReply {
	let action: AiChatAction | null = null
	for (const match of raw.matchAll(DIRECTIVE_RE)) {
		const kind = match[1]?.toUpperCase()
		const value = (match[2] ?? '').trim()
		if (kind === 'NAVIGATE') {
			const path = value.toLowerCase().replace(/\/+$/, '') || '/'
			if (NAVIGATE_PATH_RE.test(path)) action = { type: 'navigate', path }
		} else if (kind === 'BOOK') {
			const serviceSlug = value.toLowerCase()
			if (BOOK_SLUG_RE.test(serviceSlug)) action = { type: 'book', serviceSlug }
		}
	}
	const message = raw
		.replace(DIRECTIVE_RE, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
	return { action, message }
}

export type AiChatMessageValidation =
	| { ok: true; message: string }
	| { ok: false; reason: 'empty' | 'too_long' }

/** Normalize a visitor message and enforce the length cap. */
export function validateChatMessage(raw: unknown): AiChatMessageValidation {
	if (typeof raw !== 'string') return { ok: false, reason: 'empty' }
	const message = raw.replace(/\s+/g, ' ').trim()
	if (!message) return { ok: false, reason: 'empty' }
	if (message.length > AI_CHAT_MAX_MESSAGE_CHARS) {
		return { ok: false, reason: 'too_long' }
	}
	return { ok: true, message }
}

/**
 * Sliding-window rate limit decision. Pure: pass the stored timestamps for
 * the key and the current time, store the returned array back. The token is
 * only consumed (now appended) when the request is allowed.
 */
export function takeRateLimitToken(
	timestamps: readonly number[],
	now: number,
	limit: { max: number; windowMs: number } = AI_CHAT_RATE_LIMIT,
): { allowed: boolean; timestamps: number[] } {
	const pruned = timestamps.filter(t => t > now - limit.windowMs)
	if (pruned.length >= limit.max) return { allowed: false, timestamps: pruned }
	pruned.push(now)
	return { allowed: true, timestamps: pruned }
}

/** True once a chat has spent its lifetime turn budget. */
export function isChatTurnCapped(
	turnCount: number,
	maxTurns: number = AI_CHAT_MAX_TURNS_PER_CHAT,
): boolean {
	return turnCount >= maxTurns
}
