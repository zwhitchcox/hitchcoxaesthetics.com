import { expect, test } from 'vitest'

import {
	combineTouchAttribution,
	getBookingTemporalEventProperties,
	getMarketingParamsFromSearch,
	inferTrafficAttribution,
} from '#app/utils/booking-analytics.ts'

const NO_CLICK = { gclid: null, gbraid: null, wbraid: null }
const UNKNOWN = { channel: 'unknown', detail: 'unknown', platform: null }
const GOOGLE_ADS = {
	channel: 'paid_search',
	detail: 'google_ads',
	platform: 'google',
}

test('recovers google_ads from a prior-session click id when this session is unattributed', () => {
	const result = combineTouchAttribution({
		sessionAttribution: UNKNOWN,
		session: NO_CLICK,
		persisted: { gclid: 'PRIOR_GCLID', gbraid: null, wbraid: null },
	})
	expect(result.trafficAttribution).toEqual(GOOGLE_ADS)
	expect(result.gclid).toBe('PRIOR_GCLID')
	expect(result.recovered).toBe(true)
})

test('does not override a real last-touch channel, but still retains the prior click id', () => {
	const gmb = {
		channel: 'gmb',
		detail: 'google_business_profile',
		platform: 'google',
	}
	const result = combineTouchAttribution({
		sessionAttribution: gmb,
		session: NO_CLICK,
		persisted: { gclid: 'PRIOR_GCLID', gbraid: null, wbraid: null },
	})
	expect(result.trafficAttribution).toEqual(gmb)
	expect(result.gclid).toBe('PRIOR_GCLID')
	expect(result.recovered).toBe(false)
})

test('keeps this session’s own click id and does not flag recovery', () => {
	const result = combineTouchAttribution({
		sessionAttribution: GOOGLE_ADS,
		session: { gclid: 'THIS_GCLID', gbraid: null, wbraid: null },
		persisted: { gclid: 'OLD_GCLID', gbraid: null, wbraid: null },
	})
	expect(result.gclid).toBe('THIS_GCLID')
	expect(result.recovered).toBe(false)
})

test('no click id anywhere leaves attribution untouched', () => {
	const result = combineTouchAttribution({
		sessionAttribution: UNKNOWN,
		session: NO_CLICK,
		persisted: null,
	})
	expect(result.trafficAttribution).toEqual(UNKNOWN)
	expect(result.gclid).toBeNull()
	expect(result.recovered).toBe(false)
})

test('formats booking temporal analytics buckets in Knoxville time', () => {
	expect(
		getBookingTemporalEventProperties(
			new Date('2026-06-02T15:40:00.000Z'),
			'booking_entered',
		),
	).toEqual({
		booking_entered_date: '2026-06-02',
		booking_entered_day_of_week: '2 - Tuesday',
		booking_entered_hour: '11:00',
		booking_entered_hour_bucket: '11 - 11 AM',
		booking_entered_time_zone: 'America/New_York',
	})
})

test('omits booking temporal analytics buckets for invalid timestamps', () => {
	expect(
		getBookingTemporalEventProperties(
			new Date('not-a-date'),
			'booking_entered',
		),
	).toEqual({})
})

test('classifies Google ad click ids as paid search before GMB campaign labels', () => {
	expect(
		inferTrafficAttribution({
			fbclid: null,
			gbraid: '0AAAAADvi5k11sssI8Ghs7zeEOhzjb65I_',
			gclid: 'EAIaIQobChMI4tmli_PmlAMVTirUAR39ZybWEBAYASABEgLOUfD_BwE',
			initialReferrer: null,
			initialReferringDomain: null,
			msclkid: null,
			utm_campaign: 'gmb',
			utm_medium: null,
			utm_source: null,
			wbraid: null,
		}),
	).toEqual({
		channel: 'paid_search',
		detail: 'google_ads',
		platform: 'google',
	})
})

test('classifies self-referrals from our own domain as unknown, not referral', () => {
	expect(
		inferTrafficAttribution({
			fbclid: null,
			gbraid: null,
			gclid: null,
			initialReferrer:
				'https://hitchcoxaesthetics.com/lp/weight-loss-semaglutide',
			initialReferringDomain: 'hitchcoxaesthetics.com',
			msclkid: null,
			utm_campaign: null,
			utm_medium: null,
			utm_source: null,
			wbraid: null,
		}),
	).toEqual({ channel: 'unknown', detail: 'unknown', platform: null })
})

test('a self-referral that still carries a gclid stays google_ads', () => {
	expect(
		inferTrafficAttribution({
			fbclid: null,
			gbraid: null,
			gclid: 'EAIaIQobChMI4tmli_PmlAMVTirUAR39ZybWEBAYASABEgLOUfD_BwE',
			initialReferrer:
				'https://hitchcoxaesthetics.com/lp/weight-loss-semaglutide',
			initialReferringDomain: 'hitchcoxaesthetics.com',
			msclkid: null,
			utm_campaign: null,
			utm_medium: null,
			utm_source: null,
			wbraid: null,
		}),
	).toEqual({
		channel: 'paid_search',
		detail: 'google_ads',
		platform: 'google',
	})
})

test('classifies a genuine external (non-social, non-search) referrer as referral', () => {
	expect(
		inferTrafficAttribution({
			fbclid: null,
			gbraid: null,
			gclid: null,
			initialReferrer: 'https://somepartnerblog.com/post',
			initialReferringDomain: 'somepartnerblog.com',
			msclkid: null,
			utm_campaign: null,
			utm_medium: null,
			utm_source: null,
			wbraid: null,
		}),
	).toEqual({ channel: 'referral', detail: 'referral', platform: null })
})

test('extracts Google click ids from linker params', () => {
	expect(
		getMarketingParamsFromSearch(
			'?_gl=1*ov8xn0*_gcl_aw*R0NMLjE3ODAzMTg0NzYuRUFJYUlRb2JDaE1JLTV1UDZJcm1sQU1WNmpiVUFSMktoUzBFRUFBWUFpQUFFZ0tLTnZEX0J3RQ..*_gcl_au*MTgwODEwNDEyMS4xNzgwMzE4NDc2',
		).gclid,
	).toBe('EAIaIQobChMI-5uP6IrmlAMV6jbUAR2KhS0EEAAYAiAAEgKKNvD_BwE')
})
