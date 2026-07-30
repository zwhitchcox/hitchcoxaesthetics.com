import { describe, expect, test } from 'vitest'

import {
	AI_CHAT_MAX_MESSAGE_CHARS,
	AI_CHAT_MAX_TURNS_PER_CHAT,
	isChatTurnCapped,
	parseChatDirective,
	takeRateLimitToken,
	validateChatMessage,
} from './ai-chat.ts'

describe('parseChatDirective', () => {
	test('returns plain replies untouched with no action', () => {
		const result = parseChatDirective(
			'Botox is $12 per unit at both locations.',
		)
		expect(result).toEqual({
			action: null,
			message: 'Botox is $12 per unit at both locations.',
		})
	})

	test('strips a trailing NAVIGATE directive and returns the path', () => {
		const result = parseChatDirective(
			'Here is our Botox page with all the details.\n<<NAVIGATE:/injectables/botox>>',
		)
		expect(result.message).toBe('Here is our Botox page with all the details.')
		expect(result.action).toEqual({
			type: 'navigate',
			path: '/injectables/botox',
		})
	})

	test('strips a trailing BOOK directive and returns the slug', () => {
		const result = parseChatDirective(
			"Great, let's get your Botox appointment booked.\n<<BOOK:tox>>",
		)
		expect(result.message).toBe(
			"Great, let's get your Botox appointment booked.",
		)
		expect(result.action).toEqual({ type: 'book', serviceSlug: 'tox' })
	})

	test('tolerates spacing and case inside the directive token', () => {
		const result = parseChatDirective('Sure!\n<< navigate : /About >>')
		expect(result.message).toBe('Sure!')
		expect(result.action).toEqual({ type: 'navigate', path: '/about' })
	})

	test('uses the last valid directive when several appear', () => {
		const result = parseChatDirective(
			'First look here <<NAVIGATE:/injectables>> then book <<BOOK:filler>>',
		)
		expect(result.action).toEqual({ type: 'book', serviceSlug: 'filler' })
		expect(result.message).toBe('First look here  then book')
	})

	test('drops malformed navigate paths without producing an action', () => {
		for (const bad of [
			'<<NAVIGATE:https://evil.example>>',
			'<<NAVIGATE:javascript:alert(1)>>',
			'<<NAVIGATE:/a/../secret>>',
			'<<NAVIGATE:/path with spaces>>',
			'<<NAVIGATE:relative/path>>',
		]) {
			const result = parseChatDirective(`Hello ${bad}`)
			expect(result.action).toBeNull()
			expect(result.message).toBe('Hello')
		}
	})

	test('drops malformed booking slugs without producing an action', () => {
		for (const bad of [
			'<<BOOK:>>',
			'<<BOOK:/tox>>',
			'<<BOOK:tox filler>>',
			'<<BOOK:-tox>>',
		]) {
			const result = parseChatDirective(`Ready ${bad}`)
			expect(result.action).toBeNull()
			expect(result.message).toBe('Ready')
		}
	})

	test('normalizes trailing slashes on navigate paths', () => {
		const result = parseChatDirective('<<NAVIGATE:/weight-loss/>>')
		expect(result.action).toEqual({ type: 'navigate', path: '/weight-loss' })
	})

	test('collapses the blank lines left behind by stripped directives', () => {
		const result = parseChatDirective(
			'Line one.\n\n<<NAVIGATE:/microneedling>>\n\nLine two.',
		)
		expect(result.message).toBe('Line one.\n\nLine two.')
	})
})

describe('validateChatMessage', () => {
	test('accepts and normalizes an ordinary message', () => {
		expect(validateChatMessage('  How much   is\nBotox? ')).toEqual({
			ok: true,
			message: 'How much is Botox?',
		})
	})

	test('rejects empty and non-string input', () => {
		expect(validateChatMessage('   ')).toEqual({ ok: false, reason: 'empty' })
		expect(validateChatMessage(undefined)).toEqual({
			ok: false,
			reason: 'empty',
		})
		expect(validateChatMessage(42)).toEqual({ ok: false, reason: 'empty' })
	})

	test('rejects messages over the character cap', () => {
		const long = 'a'.repeat(AI_CHAT_MAX_MESSAGE_CHARS + 1)
		expect(validateChatMessage(long)).toEqual({ ok: false, reason: 'too_long' })
		const exact = 'a'.repeat(AI_CHAT_MAX_MESSAGE_CHARS)
		expect(validateChatMessage(exact)).toEqual({ ok: true, message: exact })
	})
})

describe('takeRateLimitToken', () => {
	const limit = { max: 3, windowMs: 1000 }

	test('allows requests until the window fills up', () => {
		let timestamps: number[] = []
		for (let i = 0; i < limit.max; i++) {
			const result = takeRateLimitToken(timestamps, 100 + i, limit)
			expect(result.allowed).toBe(true)
			timestamps = result.timestamps
		}
		const blocked = takeRateLimitToken(timestamps, 200, limit)
		expect(blocked.allowed).toBe(false)
		expect(blocked.timestamps).toHaveLength(limit.max)
	})

	test('denied requests do not consume a token', () => {
		const full = [100, 101, 102]
		const blocked = takeRateLimitToken(full, 200, limit)
		expect(blocked.allowed).toBe(false)
		expect(blocked.timestamps).toEqual(full)
	})

	test('old timestamps age out of the window', () => {
		const full = [100, 101, 102]
		const later = takeRateLimitToken(full, 102 + limit.windowMs + 1, limit)
		expect(later.allowed).toBe(true)
		expect(later.timestamps).toEqual([102 + limit.windowMs + 1])
	})
})

describe('isChatTurnCapped', () => {
	test('caps at the configured turn budget', () => {
		expect(isChatTurnCapped(AI_CHAT_MAX_TURNS_PER_CHAT - 1)).toBe(false)
		expect(isChatTurnCapped(AI_CHAT_MAX_TURNS_PER_CHAT)).toBe(true)
		expect(isChatTurnCapped(AI_CHAT_MAX_TURNS_PER_CHAT + 5)).toBe(true)
	})
})
