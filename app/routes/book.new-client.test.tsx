/**
 * @vitest-environment jsdom
 */
import { createRemixStub } from '@remix-run/testing'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import BlvdBookRoute from '#app/routes/book.tsx'

const checkoutMock = vi.hoisted(() => vi.fn())

vi.mock('@boulevard/blvd-book-sdk', () => {
	type MockCart = {
		bookingQuestions: Array<unknown>
		clientInformation: {
			email: string | null
			externalId: string | null
			firstName: string | null
			lastName: string | null
			phoneNumber: string | null
		} | null
		endTime: Date | null
		id: string
		startTime: Date | null
		summary: {
			paymentMethodRequired: boolean
			total: number
		}
		[key: string]: unknown
	}

	const location = {
		address: {
			city: 'Knoxville',
			country: 'US',
			line1: '5113 Kingston Pike',
			state: 'TN',
			zip: '37919',
		},
		allowOnlineBooking: true,
		id: 'urn:blvd:Location:901d91b2-5c66-4848-bafa-01f81667ca36',
		name: 'Knoxville',
		tz: 'America/New_York',
	}
	const service = {
		__typename: 'CartAvailableBookableItem',
		description: 'Botox appointment for new clients.',
		disabled: false,
		id: 'urn:blvd:Service:b293ac32-1e70-47e7-9a6c-fcd0478aec85',
		listDurationRange: {
			max: 30,
			min: 30,
			variable: false,
		},
		listPriceRange: {
			max: 0,
			min: 0,
			variable: false,
		},
		name: 'New Client Tox (Botox/Dysport/Jeuveau/Xeomin)',
		getLocationVariants: vi.fn(async () => [{ location }]),
		getStaffVariants: vi.fn(async () => []),
	}
	const bookableDate = {
		date: new Date('2026-06-10T04:00:00.000Z'),
		id: 'date-2026-06-10',
	}
	const bookableTime = {
		id: 'time-1815',
		startTime: new Date('2026-06-10T22:15:00.000Z'),
	}

	function createCart() {
		const cart: MockCart = {
			bookingQuestions: [],
			clientInformation: null,
			endTime: null,
			id: 'cart_123',
			startTime: null,
			summary: {
				paymentMethodRequired: false,
				total: 0,
			},
			addBookableItem: vi.fn(async () => cart),
			addCardPaymentMethod: vi.fn(async () => cart),
			checkout: checkoutMock.mockImplementation(async () => ({
				appointments: [
					{
						appointmentId: 'appointment_123',
						clientId: 'client_123',
						forCartOwner: true,
					},
				],
				cart,
			})),
			getAvailableCategories: vi.fn(async () => [
				{
					availableItems: [service],
					id: 'category_injectables',
					name: 'New Patient - Injectables',
				},
			]),
			getAvailablePaymentMethods: vi.fn(async () => []),
			getBookableDates: vi.fn(async () => [bookableDate]),
			getBookableTimes: vi.fn(async () => [bookableTime]),
			reserveBookableItems: vi.fn(async () => {
				cart.startTime = bookableTime.startTime
				cart.endTime = new Date('2026-06-10T22:45:00.000Z')
				return cart
			}),
			selectPaymentMethod: vi.fn(async () => cart),
			sendOwnershipCodeBySms: vi.fn(async () => {
				throw new Error(
					JSON.stringify({
						errors: [{ code: 'CLIENT_NOT_FOUND_BY_MOBILE_PHONE' }],
					}),
				)
			}),
			takeOwnershipByCode: vi.fn(async () => cart),
			update: vi.fn(async opts => {
				cart.clientInformation = {
					email: opts.clientInformation?.email ?? null,
					externalId: null,
					firstName: opts.clientInformation?.firstName ?? null,
					lastName: opts.clientInformation?.lastName ?? null,
					phoneNumber: opts.clientInformation?.phoneNumber ?? null,
				}
				return cart
			}),
		}
		return cart
	}

	return {
		Blvd: class {
			businesses = {
				get: vi.fn(async () => ({
					getLocations: vi.fn(async () => [location]),
				})),
			}
			carts = {
				create: vi.fn(async () => createCart()),
			}
		},
		PlatformTarget: { Live: 1 },
	}
})

test('new clients can verify their phone and complete a mocked booking', async () => {
	const user = userEvent.setup()
	const okResponse = () =>
		new Response(JSON.stringify({ ok: true }), {
			headers: { 'Content-Type': 'application/json' },
			status: 200,
		})
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		const url = typeof input === 'string' ? input : input.toString()
		if (
			url.endsWith('/resources/booking-phone-verification') ||
			url.endsWith('/resources/blvd-booking-intent') ||
			url.endsWith('/resources/blvd-attribution')
		) {
			return okResponse()
		}
		return okResponse()
	})
	vi.stubGlobal('fetch', fetchMock)
	vi.stubGlobal('scrollTo', vi.fn())

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
	// single-location services skip the location step straight to the schedule
	await user.click(await screen.findByRole('button', { name: /6:15 PM/i }))
	await user.type(screen.getByLabelText(/Mobile phone/i), '8659780953')
	await user.click(screen.getByRole('button', { name: /Text Me A Code/i }))

	const verificationCodeInput = await screen.findByPlaceholderText('ABC123')
	expect(verificationCodeInput).toBeVisible()
	// sending the code focuses the input automatically
	await waitFor(() => expect(verificationCodeInput).toHaveFocus())
	await user.type(verificationCodeInput, 'AB12CD')
	expect(verificationCodeInput).toHaveValue('AB12CD')
	await user.clear(verificationCodeInput)
	expect(
		screen.queryByText(/could not find an existing profile/i),
	).not.toBeInTheDocument()

	// codes are alphanumeric (e.g. 368TQ8) — must not be treated as digits-only.
	// Pressing Enter must verify the code, not submit the surrounding details
	// form (which would complain the phone is not verified).
	await user.type(verificationCodeInput, '368tq8{Enter}')
	expect(
		screen.queryByText(/Verify your mobile number before continuing/i),
	).not.toBeInTheDocument()

	await user.type(await screen.findByLabelText(/First name/i), 'Jane')
	await user.type(screen.getByLabelText(/Last name/i), 'Smith')
	await user.type(screen.getByLabelText(/Email/i), 'jane@example.com')
	await user.click(screen.getByRole('button', { name: /Confirm Details/i }))

	await screen.findByRole('heading', { name: /Confirm & Book/i })
	await user.click(screen.getByRole('button', { name: 'Confirm' }))

	await expect(
		screen.findByText(/Your appointment is confirmed/i),
	).resolves.toBeVisible()
	await waitFor(() => expect(checkoutMock).toHaveBeenCalledTimes(1))
	expect(fetchMock).toHaveBeenCalledWith(
		'/resources/booking-phone-verification',
		expect.objectContaining({
			method: 'POST',
		}),
	)
})
