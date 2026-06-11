/**
 * @vitest-environment jsdom
 */
import { createRemixStub } from '@remix-run/testing'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import BlvdBookRoute from '#app/routes/book.tsx'

const reserveCalls = vi.hoisted(() => ({ knoxville: 0, farragut: 0 }))

vi.mock('@boulevard/blvd-book-sdk', () => {
	const knoxville = {
		address: {
			city: 'Knoxville',
			country: 'US',
			line1: '5113 Kingston Pike',
			state: 'TN',
			zip: '37919',
		},
		allowOnlineBooking: true,
		id: 'urn:blvd:Location:knoxville',
		name: 'Knoxville',
		tz: 'America/New_York',
	}
	const farragut = {
		address: {
			city: 'Farragut',
			country: 'US',
			line1: '102 S Campbell Station Rd',
			state: 'TN',
			zip: '37934',
		},
		allowOnlineBooking: true,
		id: 'urn:blvd:Location:farragut',
		name: 'Farragut',
		tz: 'America/New_York',
	}
	const service = {
		__typename: 'CartAvailableBookableItem',
		description: 'Botox appointment for new clients.',
		disabled: false,
		id: 'urn:blvd:Service:test',
		listDurationRange: { max: 30, min: 30, variable: false },
		listPriceRange: { max: 0, min: 0, variable: false },
		name: 'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
		getLocationVariants: vi.fn(async () => [
			{ location: knoxville },
			{ location: farragut },
		]),
		getStaffVariants: vi.fn(async () => []),
	}

	// Same day at both offices, different times
	const sharedDate = { date: new Date('2026-06-10T04:00:00.000Z'), id: 'd1' }
	const slotsByLocation: Record<
		string,
		{ id: string; startTime: Date }[]
	> = {
		[knoxville.id]: [
			{ id: 'time-knox-1815', startTime: new Date('2026-06-10T22:15:00.000Z') },
		],
		[farragut.id]: [
			{ id: 'time-far-1900', startTime: new Date('2026-06-10T23:00:00.000Z') },
		],
	}

	function createCart(location?: { id: string; name: string }) {
		const cart: Record<string, unknown> = {
			bookingQuestions: [],
			clientInformation: null,
			endTime: null,
			id: `cart_${location?.id ?? 'catalog'}`,
			startTime: null,
			summary: { paymentMethodRequired: false, total: 0 },
			addBookableItem: vi.fn(async () => cart),
			getAvailableCategories: vi.fn(async () => [
				{
					availableItems: [service],
					id: 'category_injectables',
					name: 'New Patient - Injectables',
				},
			]),
			getAvailablePaymentMethods: vi.fn(async () => []),
			getBookableDates: vi.fn(async () => [sharedDate]),
			getBookableTimes: vi.fn(async () => slotsByLocation[location?.id ?? ''] ?? []),
			reserveBookableItems: vi.fn(async () => {
				if (location?.name === 'Knoxville') reserveCalls.knoxville++
				else reserveCalls.farragut++
				return cart
			}),
			selectPaymentMethod: vi.fn(async () => cart),
			update: vi.fn(async () => cart),
		}
		return cart
	}

	return {
		Blvd: class {
			businesses = {
				get: vi.fn(async () => ({
					getLocations: vi.fn(async () => [knoxville, farragut]),
				})),
			}
			carts = {
				create: vi.fn(async (location?: { id: string; name: string }) =>
					createCart(location),
				),
			}
		},
		PlatformTarget: { Live: 1 },
	}
})

function okResponse() {
	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'Content-Type': 'application/json' },
		status: 200,
	})
}

test('either-location shows merged availability and reserves at the picked office', async () => {
	vi.stubGlobal('fetch', vi.fn(async () => okResponse()))
	vi.stubGlobal('scrollTo', vi.fn())
	const user = userEvent.setup()

	const RemixStub = createRemixStub([
		{
			Component: BlvdBookRoute,
			loader: () => ({
				apiKey: 'test-api-key',
				businessId: 'test-business-id',
				sourceHint: null,
			}),
			path: '/book',
		},
	])
	render(<RemixStub initialEntries={['/book']} />)

	await user.click(await screen.findByRole('button', { name: 'No' }))
	const toxButtons = await screen.findAllByRole('button', { name: /Tox/i })
	await user.click(toxButtons[0]!)

	// location step offers both offices plus Either
	await screen.findByRole('button', { name: /Knoxville/i })
	screen.getByRole('button', { name: /Farragut/ })

	// each office card shows the weekdays it has openings (Jun 10 is a Wed)
	const dayLabels = await screen.findAllByText('Wed')
	expect(dayLabels).toHaveLength(2)

	await user.click(screen.getByRole('button', { name: /Either Location/i }))

	// merged schedule shows both slots labeled with their office
	const knoxSlot = await screen.findByRole('button', {
		name: /6:15 PM.*Knoxville/i,
	})
	expect(knoxSlot).toBeVisible()
	const farragutSlot = screen.getByRole('button', {
		name: /7:00 PM.*Farragut/i,
	})

	// switcher pills are present with Either active
	const pills = screen.getAllByRole('button', { name: /^Either$/ })
	expect(pills.length).toBeGreaterThan(0)

	// picking the Farragut slot reserves on the Farragut cart
	await user.click(farragutSlot)
	expect(reserveCalls).toEqual({ knoxville: 0, farragut: 1 })

	// flow advances to details with the chosen location
	expect(await screen.findByLabelText(/Mobile phone/i)).toBeVisible()
	expect(screen.getByText(/at Farragut/i)).toBeVisible()
})

test('switching the location pill narrows availability to that office', async () => {
	vi.stubGlobal('fetch', vi.fn(async () => okResponse()))
	vi.stubGlobal('scrollTo', vi.fn())
	const user = userEvent.setup()

	const RemixStub = createRemixStub([
		{
			Component: BlvdBookRoute,
			loader: () => ({
				apiKey: 'test-api-key',
				businessId: 'test-business-id',
				sourceHint: null,
			}),
			path: '/book',
		},
	])
	render(<RemixStub initialEntries={['/book']} />)

	await user.click(await screen.findByRole('button', { name: 'No' }))
	const toxButtons = await screen.findAllByRole('button', { name: /Tox/i })
	await user.click(toxButtons[0]!)
	await user.click(
		await screen.findByRole('button', { name: /Either Location/i }),
	)
	await screen.findByRole('button', { name: /6:15 PM.*Knoxville/i })

	// switch to Knoxville only — Farragut's slot disappears, label is dropped
	await user.click(screen.getByRole('button', { name: /^Knoxville$/ }))
	const knoxOnly = await screen.findByRole('button', { name: /6:15 PM/i })
	expect(knoxOnly).not.toHaveTextContent(/Knoxville/)
	expect(
		screen.queryByRole('button', { name: /7:00 PM/i }),
	).not.toBeInTheDocument()
})
