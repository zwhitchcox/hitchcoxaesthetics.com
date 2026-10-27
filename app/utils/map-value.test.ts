import { expect, test } from 'vitest'
import { mapValueByService, searchWordService } from '#app/utils/map-value.ts'

test('a search word goes to its service; our names and jobs go to neither', () => {
	expect(searchWordService('weight loss')).toBe('weight loss')
	expect(searchWordService('phentermine')).toBe('weight loss')
	expect(searchWordService('reta weight loss')).toBe('weight loss')
	expect(searchWordService('botox knoxville tn')).toBe('botox')
	expect(searchWordService('lip filler knoxville tn')).toBe('filler')
	expect(searchWordService('microneedling knoxville tn')).toBe('med spa')
	expect(searchWordService('sarah hitchcock aesthetics')).toBe('ours')
	expect(searchWordService('botox knox med spa')).toBe('ours')
	expect(searchWordService('esthetician jobs knoxville tn')).toBe('jobs')
})

test('views are split by the search words, scaled by reach and valued', () => {
	const rows = mapValueByService({
		views: [
			{ listing: 'SHA Bearden', views: 1000 },
			// No search words named for this brand: all of it is weight loss.
			{ listing: 'KWLC (Farragut)', views: 500 },
		],
		words: [
			{ listing: 'SHA Bearden', keyword: 'weight loss', views: 60 },
			{ listing: 'SHA Bearden', keyword: 'botox knoxville tn', views: 30 },
			{ listing: 'SHA Bearden', keyword: 'sarah hitchcox aesthetics', views: 10 },
			{ listing: 'SHA Bearden', keyword: 'botox near me', views: null },
		],
		reach: new Map([
			['weight loss', 0.5],
			['botox near me', 0.2],
		]),
		value: () => 600,
		rate: 0.002,
	})
	const wl = rows.find(r => r.key === 'weight loss')!
	// 60% of SHA's 1,000 views, plus all 500 of Weight Loss Knox.
	expect(wl.seen).toBeCloseTo(1100)
	expect(wl.reach).toBeCloseTo(0.5)
	expect(wl.clients).toBeCloseTo(2.2)
	expect(wl.revenue).toBeCloseTo(1320)
	expect(wl.topRevenue).toBeCloseTo(2640)
	expect(wl.revenueAt(0.25)).toBeCloseTo(660)
	const botox = rows.find(r => r.key === 'botox')!
	expect(botox.seen).toBeCloseTo(300)
	// Only "botox near me" has a capture yet.
	expect(botox.reach).toBeCloseTo(0.2)
	expect(botox.mainSearchRead).toBe(false)
	expect(wl.mainSearchRead).toBe(true)
	expect(botox.topRevenue).toBeCloseTo(1800)
	// Searches for our names (10% of SHA's views) count for no service.
	const total = rows.reduce((s, r) => s + r.seen, 0)
	expect(total).toBeCloseTo(1400)
	// Without a reach capture there is no top-spot value.
	expect(rows.find(r => r.key === 'filler')!.topRevenue).toBeNull()
})

test("a search's reach counts by its share of the views", () => {
	const [wl] = mapValueByService({
		views: [{ listing: 'KWLC (Bearden)', views: 100 }],
		words: [
			{ listing: 'KWLC (Bearden)', keyword: 'weight loss', views: 63 },
			{ listing: 'KWLC (Bearden)', keyword: 'semaglutide near me', views: null },
		],
		reach: new Map([
			['weight loss', 0.4],
			['semaglutide near me', 0.8],
		]),
		value: () => 600,
		rate: 0.002,
	})
	// 63 views at 40% and 7 (an unnamed word) at 80%.
	expect(wl!.reach).toBeCloseTo((63 * 0.4 + 7 * 0.8) / 70)
})
