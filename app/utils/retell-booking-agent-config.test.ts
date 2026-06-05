import { expect, test } from 'vitest'

import { buildRetellBookingPrompt } from '../../scripts/retell-booking-agent-config.ts'

test('Retell booking prompt includes pricing and closing guardrails', () => {
	const prompt = buildRetellBookingPrompt()

	expect(prompt).toContain('large areas including Brazilian')
	expect(prompt).toContain('Do not call end_call just because')
	expect(prompt).toContain('ask one concise follow-up')
})
