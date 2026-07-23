import { expect, test } from 'vitest'

import { getAggregatedSource } from '#app/utils/revenue-by-source.server.ts'

function webGbpTouch(utmContent: string | null) {
	return {
		trafficChannel: 'gmb',
		utmContent,
		rawProperties: null,
		callrailSource: null,
	}
}

function phoneTouch(callrailSource: string | null, retell = true) {
	return {
		trafficChannel: null,
		utmContent: null,
		rawProperties: retell ? '{"booking_channel":"retell_v2"}' : null,
		callrailSource,
	}
}

test('web GBP utm_content maps every listing slug to one source, channel online', () => {
	for (const slug of [
		'bearden',
		'farragut',
		'west-hills',
		'cedar-bluff',
		'botox-knox-bearden',
		'botox-knox-farragut',
		'kwlc-bearden',
		'kwlc-farragut',
	]) {
		expect(getAggregatedSource(webGbpTouch(slug))).toEqual({
			label: `GBP · ${slug}`,
			channel: 'online',
		})
	}
})

test('phone CallRail tracker names map to the same listing sources, channel phone', () => {
	const cases: Array<[string, string]> = [
		['GMB Knoxville', 'bearden'],
		['GMB Farragut', 'farragut'],
		['GMB - Sarah Hitchcox Aesthetics - Cedar Bluff', 'cedar-bluff'],
		['GMB - Sarah Hitchcox Aesthetics - West Hills', 'west-hills'],
		['GMB - Botox Knox - Bearden', 'botox-knox-bearden'],
		['GMB - Weight Loss Knox - Bearden', 'kwlc-bearden'],
		['GMB - Weight Loss Knox - Farragut', 'kwlc-farragut'],
	]
	for (const [tracker, slug] of cases) {
		expect(getAggregatedSource(phoneTouch(tracker))).toEqual({
			label: `GBP · ${slug}`,
			channel: 'phone',
		})
	}
})

test('matches the Farragut Botox Knox tracker despite its missing space', () => {
	expect(getAggregatedSource(phoneTouch('GMB -Botox Knox - Farragut'))).toEqual({
		label: 'GBP · botox-knox-farragut',
		channel: 'phone',
	})
})

test('web and phone bookings for the same listing share one source label', () => {
	const web = getAggregatedSource(webGbpTouch('cedar-bluff'))
	const phone = getAggregatedSource(
		phoneTouch('GMB - Sarah Hitchcox Aesthetics - Cedar Bluff'),
	)
	expect(web.label).toBe(phone.label)
	expect(web.channel).toBe('online')
	expect(phone.channel).toBe('phone')
})

test('legacy generic Google My Business tracker falls back to listing unknown', () => {
	expect(getAggregatedSource(phoneTouch('Google My Business'))).toEqual({
		label: 'GBP (listing unknown)',
		channel: 'phone',
	})
})

test('web GBP without utm_content is listing unknown, channel online', () => {
	expect(getAggregatedSource(webGbpTouch(null))).toEqual({
		label: 'GBP (listing unknown)',
		channel: 'online',
	})
})

test('AI phone bookings with non-GMB trackers keep their AI phone label', () => {
	expect(getAggregatedSource(phoneTouch('SearchGPT'))).toEqual({
		label: 'AI phone · SearchGPT',
		channel: 'phone',
	})
})

test('non-retell phone bookings with callrail data count as phone', () => {
	expect(getAggregatedSource(phoneTouch('Some Radio Ad', false))).toEqual({
		label: 'Phone · Some Radio Ad',
		channel: 'phone',
	})
})

test('non-GBP web sources keep their existing labels, channel online', () => {
	expect(
		getAggregatedSource({
			trafficChannel: 'paid_search',
			utmContent: null,
			rawProperties: null,
			callrailSource: null,
		}),
	).toEqual({ label: 'Google Ads', channel: 'online' })
})

test('rows with no touch are neither phone nor online', () => {
	expect(getAggregatedSource(null, 'STAFF')).toEqual({
		label: 'Rebook (staff-booked)',
		channel: 'none',
	})
	expect(getAggregatedSource(undefined, null)).toEqual({
		label: 'Untracked (phone / walk-in)',
		channel: 'none',
	})
})
