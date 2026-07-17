import { afterEach, expect, test, vi } from 'vitest'

const createdAppointments = vi.hoisted(() => ({ value: [] as any[] }))
vi.mock('#app/utils/revenue-by-source.server.ts', () => ({
	getBlvdAppointmentsCreatedInRange: vi.fn(async () => createdAppointments.value),
}))
vi.mock('#app/utils/blvd-admin.server.ts', () => ({
	boulevardAdminFetch: vi.fn(async () => ({
		client: { mobilePhone: '(423) 366-7052', firstName: 'Ashley', lastName: 'Slagle' },
	})),
}))

import { reconcileMissingAttributionFromPostHog } from '#app/utils/blvd-attribution-reconcile.server.ts'
import { prisma } from '#app/utils/db.server.ts'

const NOW = new Date('2026-07-17T15:00:00.000Z')
const APPT_ID = 'urn:blvd:Appointment:11111111-1111-1111-1111-111111111111'
const CLIENT_ID = 'urn:blvd:Client:22222222-2222-2222-2222-222222222222'

function seedAppointment() {
	createdAppointments.value = [
		{
			id: APPT_ID,
			startAt: new Date('2026-07-17T17:00:00.000Z'),
			createdAt: new Date('2026-07-17T14:19:37.000Z'),
			bookedByType: 'CLIENT',
			clientId: CLIENT_ID,
			clientName: 'Ashley Slagle',
			locationName: 'Knoxville',
			manageUrl: null,
			services: [{ price: null, name: 'Weight Loss Injection (In Person)' }],
		},
	]
}

const matchingEvent = {
	timestamp: '2026-07-17T14:19:37.800000Z',
	distinctId: 'phone:+14233667052',
	properties: {
		posthog_distinct_id: 'phone:+14233667052',
		posthog_session_id: 'sess-123',
		traffic_channel: 'organic_search',
		traffic_platform: 'google',
		booking_location_name: 'Knoxville',
		service: 'Weight Loss Injection (In Person)',
		booking_appointment_start: '2026-07-17T13:00:00-04:00',
		value: 125,
		utm_source: null, // nulls must be stripped, not crash the schema
	},
}

afterEach(() => {
	createdAppointments.value = []
})

test('heals an unattributed booking from its PostHog event, idempotently', async () => {
	seedAppointment()
	const first = await reconcileMissingAttributionFromPostHog({
		now: NOW,
		fetchEvents: async () => [matchingEvent],
	})
	expect(first).toEqual({ candidates: 1, reconciled: 1 })

	const touch = await prisma.blvdAttributionTouch.findFirst({
		where: { appointments: { some: { boulevardAppointmentId: APPT_ID } } },
	})
	expect(touch?.trafficChannel).toBe('organic_search')
	expect(touch?.posthogSessionId).toBe('sess-123')

	// Second run: the appointment is linked now, so nothing to do.
	const second = await reconcileMissingAttributionFromPostHog({
		now: NOW,
		fetchEvents: async () => [matchingEvent],
	})
	expect(second).toEqual({ candidates: 0, reconciled: 0 })
})

test('no reconcile when the event does not match phone or start time', async () => {
	seedAppointment()
	const result = await reconcileMissingAttributionFromPostHog({
		now: NOW,
		fetchEvents: async () => [
			{
				...matchingEvent,
				distinctId: 'phone:+19998887777',
				properties: {
					...matchingEvent.properties,
					posthog_distinct_id: 'phone:+19998887777',
					booking_appointment_start: '2026-07-19T13:00:00-04:00',
				},
			},
		],
	})
	expect(result).toEqual({ candidates: 1, reconciled: 0 })
	expect(
		await prisma.blvdAttributedAppointment.findFirst({
			where: { boulevardAppointmentId: APPT_ID },
		}),
	).toBeNull()
})

test('staff-booked and already-linked appointments are not candidates', async () => {
	createdAppointments.value = [
		{
			id: 'urn:blvd:Appointment:33333333-3333-3333-3333-333333333333',
			startAt: new Date('2026-07-17T17:00:00.000Z'),
			createdAt: new Date('2026-07-17T14:00:00.000Z'),
			bookedByType: 'STAFF',
			clientId: CLIENT_ID,
			clientName: 'Someone Else',
			locationName: 'Knoxville',
			manageUrl: null,
			services: [],
		},
	]
	const result = await reconcileMissingAttributionFromPostHog({
		now: NOW,
		fetchEvents: async () => [matchingEvent],
	})
	expect(result).toEqual({ candidates: 0, reconciled: 0 })
})
