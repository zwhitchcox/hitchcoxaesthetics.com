/**
 * The weekly hours of our Google listings, as Google shows them.
 * GET /resources/listing-hours
 *
 * The brand sites (weightlossknoxvilletn.com, botoxknoxvilletn.com,
 * knoxvillelaserclinic.com) read this for their hours lines. It reads only
 * the GbpListingHours mirror (gbp-listing-hours.server.ts).
 */
import { json } from '@remix-run/node'
import { readListingHours } from '#app/utils/gbp-listing-hours.server.ts'

export async function loader() {
	return json(
		{ listings: await readListingHours() },
		{ headers: { 'Cache-Control': 'public, max-age=300' } },
	)
}
