/**
 * This file contains utilities for using client hints for user preference which
 * are needed by the server, but are only known by the browser.
 */
import { getHintUtils } from '@epic-web/client-hints'
import {
	clientHint as colorSchemeHint,
	subscribeToSchemeChange,
} from '@epic-web/client-hints/color-scheme'
import { clientHint as timeZoneHint } from '@epic-web/client-hints/time-zone'
import { useRevalidator } from '@remix-run/react'
import * as React from 'react'
import { useRequestInfo } from '#/app/utils/request-info.ts'

const hintsUtils = getHintUtils({
	theme: colorSchemeHint,
	timeZone: timeZoneHint,
	// add other hints here
})

export const { getHints } = hintsUtils

/**
 * @returns an object with the client hints and their values
 */
export function useHints() {
	const requestInfo = useRequestInfo()
	return requestInfo.hints
}

/**
 * Inline script that saves the client-hint cookies and applies the color scheme
 * immediately, WITHOUT a full-page reload.
 *
 * The stock getClientHintCheckScript() reloads the page on a visitor's first
 * load (when the cookies are not yet set). That reload causes a visible flash
 * and, worse, resets document.referrer to our own URL, which destroys ad and
 * referrer attribution for first-time visitors (i.e. most ad clicks). Instead we
 * apply the theme class client-side (Tailwind darkMode: 'class') so the first
 * paint matches the OS, and trigger a soft Remix revalidate so loader-derived
 * state catches up without reloading.
 */
export function getClientHintApplyScript() {
	const hintEntry = (hint: {
		cookieName: string
		getValueCode: string
		fallback: string
	}) =>
		`{ name: ${JSON.stringify(hint.cookieName)}, actual: String(${hint.getValueCode}), value: cookies[${JSON.stringify(hint.cookieName)}] ?? encodeURIComponent(${JSON.stringify(hint.fallback)}) }`

	return `
const cookies = document.cookie.split(';').map(c => c.trim()).reduce((acc, cur) => {
	const [key, value] = cur.split('=');
	acc[key] = value;
	return acc;
}, {});
let cookieChanged = false;
const hints = [
${hintEntry(colorSchemeHint)},
${hintEntry(timeZoneHint)}
];
for (const hint of hints) {
	document.cookie = encodeURIComponent(hint.name) + '=' + encodeURIComponent(hint.actual) + '; Max-Age=31536000; path=/';
	if (decodeURIComponent(hint.value) !== hint.actual) cookieChanged = true;
}
// Apply the color scheme now (darkMode: 'class') so the first paint matches the
// OS preference instead of reloading the whole page.
document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
// Reconcile loader-derived state after hydration with a soft revalidate (no
// full reload, so document.referrer and ad attribution are preserved).
if (cookieChanged && navigator.cookieEnabled) window.__needsHintRevalidate = true;
	`
}

export function ClientHintCheck({ nonce }: { nonce: string }) {
	const { revalidate } = useRevalidator()
	React.useEffect(
		() => subscribeToSchemeChange(() => revalidate()),
		[revalidate],
	)
	React.useEffect(() => {
		const w = window as unknown as { __needsHintRevalidate?: boolean }
		if (w.__needsHintRevalidate) {
			w.__needsHintRevalidate = false
			revalidate()
		}
	}, [revalidate])

	return (
		<script
			nonce={nonce}
			dangerouslySetInnerHTML={{
				__html: getClientHintApplyScript(),
			}}
		/>
	)
}
