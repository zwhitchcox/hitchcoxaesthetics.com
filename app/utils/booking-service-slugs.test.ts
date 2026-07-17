import { expect, test } from 'vitest'
import {
	bookingServiceConcept,
	bookingServiceSlug,
	bookingServiceVariant,
	resolveServiceBySlug,
} from '#app/utils/booking-service-slugs.ts'

const svc = (name: string) => ({ item: { name } })

test('variant prefixes and parentheticals collapse into one concept slug', () => {
	expect(bookingServiceSlug('New Client Tox (Botox/Dysport/Jeuveau/Xeomin)')).toBe('tox')
	expect(bookingServiceSlug('Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)')).toBe('tox')
	expect(bookingServiceSlug('New Client Tox & Filler')).toBe('tox-and-filler')
	expect(bookingServiceSlug('Weight Loss Injection (In Person)')).toBe('weight-loss-injection')
	expect(bookingServiceSlug('Laser Hair Reduction - Large Area')).toBe('laser-hair-reduction-large-area')
	expect(bookingServiceSlug('KYBELLA®')).toBe('kybella')
	expect(bookingServiceConcept('New Client Filler')).toBe('Filler')
	expect(bookingServiceVariant('Existing Client Filler')).toBe('existing')
	expect(bookingServiceVariant('Lip Flip')).toBe('shared')
})

test('slug resolves to the variant matching the history answer', () => {
	const services = [
		svc('New Client Tox (Botox/Dysport/Jeuveau/Xeomin)'),
		svc('Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin)'),
		svc('Lip Flip'),
	]
	expect(resolveServiceBySlug(services, 'tox', 'new')?.item.name).toMatch(/^New Client/)
	expect(resolveServiceBySlug(services, 'tox', 'returning')?.item.name).toMatch(/^Existing Client/)
	// null history (unsure) behaves like new
	expect(resolveServiceBySlug(services, 'tox', null)?.item.name).toMatch(/^New Client/)
	// shared service resolves for either answer
	expect(resolveServiceBySlug(services, 'lip-flip', 'returning')?.item.name).toBe('Lip Flip')
	// single-variant fallback: returning still gets the only variant that exists
	expect(
		resolveServiceBySlug([svc('New Client Consult')], 'consult', 'returning')?.item.name,
	).toBe('New Client Consult')
	expect(resolveServiceBySlug(services, 'nonsense', 'new')).toBeNull()
})
