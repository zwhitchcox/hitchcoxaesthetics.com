import { expect, test } from 'vitest'

import { getClientHintApplyScript } from '#app/utils/client-hints.tsx'

test('client-hint apply script saves cookies and applies theme without a full reload', () => {
	const script = getClientHintApplyScript()
	// The whole point: never reload (that resets document.referrer + flashes).
	expect(script).not.toContain('location.reload')
	// Still writes the cookies the server reads via getHints.
	expect(script).toContain('CH-prefers-color-scheme')
	expect(script).toContain('CH-time-zone')
	// Applies the color scheme client-side (Tailwind darkMode: 'class').
	expect(script).toContain("classList.toggle('dark'")
	// Flags a soft revalidate instead of reloading.
	expect(script).toContain('__needsHintRevalidate')
})
