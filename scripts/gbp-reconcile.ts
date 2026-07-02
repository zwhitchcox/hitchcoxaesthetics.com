/**
 * Declarative GBP reconciler for the official Sarah Hitchcox Aesthetics
 * listings. The desired state is the CANONICAL config in
 * app/config/locations.json (phones, titles, descriptions, categories, and the
 * utm website scheme all come from there — edit that file, not this script).
 * The script reads each live listing, shows a diff, and (with --apply) PATCHes
 * only the fields that differ. Idempotent — a clean run means everything
 * matches. To add a location: add it to the config and re-run.
 *
 *   pnpm tsx scripts/gbp-reconcile.ts          # dry run — shows current state + diffs
 *   pnpm tsx scripts/gbp-reconcile.ts --apply  # write the diffs to the live listings
 */
import 'dotenv/config'

import {
	GBP_CATEGORIES,
	gbpWebsiteUrl,
	locations,
} from '#app/utils/locations.ts'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const APPLY = process.argv.includes('--apply')

const normCat = (n?: string) => (n ?? '').replace(/^categories\//, '')
const normPhone = (p?: string) => (p ?? '').replace(/\D/g, '').replace(/^1/, '').slice(-10)

async function getAccessToken() {
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		body: new URLSearchParams({
			client_id: process.env.GOOGLE_CLIENT_ID ?? '',
			client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
			refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? '',
			grant_type: 'refresh_token',
		}),
	})
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(`token ${res.status}: ${JSON.stringify(json)}`)
	return json.access_token as string
}

async function main() {
	const token = await getAccessToken()
	let changes = 0
	for (const loc of locations) {
		const readMask = 'title,phoneNumbers,websiteUri,profile,categories,regularHours'
		const res = await fetch(`${INFO_API}/${loc.gbp.locationId}?readMask=${readMask}`, {
			headers: { Authorization: `Bearer ${token}` },
		})
		const cur: any = await res.json().catch(() => ({}))
		if (!res.ok) {
			console.log(`\n=== ${loc.gbp.title} ===\n  ! read failed ${res.status}: ${JSON.stringify(cur).slice(0, 160)}`)
			continue
		}

		const desiredWebsite = gbpWebsiteUrl(loc)
		const updates: Record<string, unknown> = {}
		const mask: string[] = []
		const diffs: string[] = []

		if (cur.title !== loc.gbp.title) {
			updates.title = loc.gbp.title
			mask.push('title')
			diffs.push(`title: "${cur.title}" → "${loc.gbp.title}"`)
		}
		if (cur.websiteUri !== desiredWebsite) {
			updates.websiteUri = desiredWebsite
			mask.push('websiteUri')
			diffs.push(`website: ${cur.websiteUri ?? '(none)'} → ${desiredWebsite}`)
		}
		const curP = normPhone(cur.phoneNumbers?.primaryPhone)
		const curS = normPhone(cur.phoneNumbers?.additionalPhones?.[0])
		if (curP !== normPhone(loc.phones.tracking) || curS !== normPhone(loc.phones.real)) {
			updates.phoneNumbers = {
				primaryPhone: loc.phones.tracking,
				additionalPhones: [loc.phones.real],
			}
			mask.push('phoneNumbers')
			diffs.push(
				`phone: ${cur.phoneNumbers?.primaryPhone ?? '(none)'}/${cur.phoneNumbers?.additionalPhones?.[0] ?? '-'} → ${loc.phones.tracking}/${loc.phones.real}`,
			)
		}
		if (loc.description && cur.profile?.description !== loc.description) {
			updates.profile = { description: loc.description }
			mask.push('profile.description')
			diffs.push(`description: ${cur.profile?.description?.length ?? 0}ch → ${loc.description.length}ch`)
		}
		const curAddl = (cur.categories?.additionalCategories ?? []).map((c: any) => c.name as string)
		const primaryOff =
			normCat(cur.categories?.primaryCategory?.name) !== normCat(GBP_CATEGORIES.primary)
		const addlOff =
			JSON.stringify(curAddl.map(normCat).sort()) !==
			JSON.stringify(GBP_CATEGORIES.additional.map(normCat).sort())
		if (primaryOff || addlOff) {
			updates.categories = {
				primaryCategory: { name: GBP_CATEGORIES.primary },
				additionalCategories: GBP_CATEGORIES.additional.map(name => ({ name })),
			}
			mask.push('categories')
			diffs.push(
				`categories: [${curAddl.map(normCat).join(', ') || 'none'}] → [${GBP_CATEGORIES.additional.map(normCat).join(', ')}]`,
			)
		}

		console.log(`\n=== ${loc.gbp.title} ===`)
		console.log(
			`  category=${cur.categories?.primaryCategory?.displayName ?? '** MISSING **'} | hours=${cur.regularHours?.periods?.length ? 'set' : '** MISSING **'} | desc=${cur.profile?.description?.length ?? 0}ch`,
		)
		if (diffs.length === 0) {
			console.log('  ✓ already correct')
			continue
		}
		changes++
		for (const d of diffs) console.log(`  Δ ${d}`)
		if (APPLY) {
			const patch = await fetch(`${INFO_API}/${loc.gbp.locationId}?updateMask=${mask.join(',')}`, {
				method: 'PATCH',
				headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
				body: JSON.stringify(updates),
			})
			const pj: any = await patch.json().catch(() => ({}))
			console.log(patch.ok ? '  ✓ applied' : `  ✗ ${patch.status}: ${JSON.stringify(pj).slice(0, 160)}`)
		}
	}
	if (changes === 0) console.log('\n✓ All listings already match desired state.')
	else if (!APPLY) console.log(`\nDRY RUN — ${changes} listing(s) have diffs. Pass --apply to write them.`)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
