# New location spoke — setup runbook (any location)

Stand up a new marketing/SEO location (West Hills, Cedar Bluff, anything). The runbook's job is exactly two things: **add the location to the website** (a marketing page + NAP) and **add the location's website URL to its Google Business Profile**. Everything else below is either a separate script or handled automatically.

**Booking is auto-driven by Boulevard. You do not wire it here.** The booking picker's locations come straight from Boulevard, so a location becomes bookable when (and only when) it exists in Boulevard. The site's `locations` array is NAP/display only and is independent of booking.

**Non-requirements (do nothing):**

- **Retell / the booking bot** reads its locations from Boulevard, so a new *location* of an existing brand needs no Retell change. Only a brand-new *business name* needs a new agent.
- **The website booking system** auto-fetches locations from Boulevard, so there is nothing to add.

To use: fill in the **Tokens** below, then find-and-replace them throughout steps 1–2 and pass them to the script in step 3.

## Coverage vs. the full spoke checklist

| Checklist item | Status in this runbook |
|---|---|
| Website — location page + maps embed + NAP | ✅ code (steps 1–2) |
| Website — JSON-LD matches GBP (name + sameAs/hasMap + NAP) | ✅ code (step 4b) |
| CallRail — GMB source number | ✅ script (step 3) |
| CallRail — website pool "Brand - Location - Pool" | ✅ script (step 3) |
| CallRail — call-replacement (number-swap) script on site | ✅ already site-wide (`app/root.tsx`, `swap.js`), nothing per-location |
| GBP — GMB number primary, real line secondary (NAP) | ✅ script (step 4, `--phone` + `--secondary-phone`) |
| GBP — categories: primary **Medical spa** + Skin care clinic, Weight loss service, Laser hair removal service, Facial spa | ✅ script (`gbp-reconcile.ts`, global `ADDITIONAL_CATEGORIES`) |
| GBP — website URL `...?utm_campaign=gmb&utm_content=<location id>` — so appointments attribute to the specific GMB | ✅ script (`gbp-reconcile.ts`, or `gbp-update-location.ts --utm-location`) |
| GMB — create/verify listing, photos, service info | ⚠️ manual in Google dashboard (step 4) |
| CallRail — forward inbound texts to RingCentral | ❌ not built (`message_flow` is null), see "Not covered yet" |
| **RingCentral — numbers + queue + forward to the matching Retell agent** | ❌ manual / not built, see "Not covered yet" |
| **Retell — new agent (only for a brand-new business name)** | ❌ not built, see "Not covered yet" |
| **Listings distribution (SEMrush "local distribute")** | ❌ external tool, see "Not covered yet" |

So this runbook does the **website location page + the CallRail trackers + the GBP phone/website push (scripted)**. The four rows marked ❌ are separate systems, not automated here yet.

## Tokens (replace these everywhere below)

| token | example (West Hills) |
|---|---|
| `{{BRAND}}` | Sarah Hitchcox Aesthetics |
| `{{LOCATION}}` | West Hills |
| `{{SLUG}}` | west-hills |
| `{{ADDRESS}}` | 7600 Kingston Pike Suite 1550 |
| `{{CITY}}` / `{{STATE}}` / `{{ZIP}}` | Knoxville / TN / 37919 |
| `{{PHONE}}` / `{{PHONE_RAW}}` | (865) 555-1234 / 8655551234 |
| `{{DESTINATION}}` | +18655551234 (RingCentral number the tracking numbers forward to) |
| `{{AREA_CODE}}` | 865 |
| `{{LAT}}` / `{{LNG}}` | 35.94 / -83.99 (Maps → right-click pin → copy coords) |
| `{{MAPS_EMBED_URL}}` | from Google Maps → Share → **Embed a map** → copy the `src` |
| `{{MAPS_DIRECTIONS_URL}}` | `https://maps.google.com/?q=<url-encoded address>` |

## Step 1 — Add the location to the CANONICAL config

**`app/config/locations.json` is the single source of truth** for every
per-location fact: NAP (address lines, real phone, tracking phone), the GBP
listing id/title/placeId/mapsCid, BrightLocal location + campaign ids, the GBP
description, and the ghost flag. The site (`app/utils/locations.ts`, JSON-LD,
footer/contact/sitemap), `scripts/gbp-reconcile.ts`, and
`scripts/brightlocal-citations.ts` ALL derive from it — so a value entered once
there cannot drift between systems, and a wrong value is caught by the
reconciler's dry-run diff before anything ships.

Add the new location as an object in its `locations` array (copy an existing
entry; `gbp.*` and `brightlocal.*` ids get filled in as steps 3–4 create them —
the scripts print them). Field rules are documented in the file's `_readme`.

The legacy shape below is what `app/utils/locations.ts` derives for the app —
you no longer edit it by hand:

```ts
{
	id: '{{SLUG}}',
	name: '{{LOCATION}}',
	displayName: 'Knoxville ({{LOCATION}})',
	address: '{{ADDRESS}}',
	city: '{{CITY}}',
	state: '{{STATE}}',
	zip: '{{ZIP}}',
	phone: '{{PHONE}}',
	phoneRaw: '{{PHONE_RAW}}',
	lat: {{LAT}},
	lng: {{LNG}},
	ghost: true, // see "ghost vs. real" below
	googleMapsEmbedUrl: '{{MAPS_EMBED_URL}}',
	googleMapsDirectionsUrl: '{{MAPS_DIRECTIONS_URL}}',
},
```

**Ghost vs. real.** Set `ghost: true` for a location that exists only to drive GBP/SEO traffic — it gets a landing page (the GBP "website" link points at it) but is **not** shown in the nav menu, the footer, or the contact page, and nothing on the site links to it. A `ghost: false` location is a normal, promoted one. The `ghost` flag is what the footer/contact filters on (`publicLocations`), and the sitemap intentionally includes ghosts so search engines can still find the orphaned page. Default a new spoke to `ghost: true` unless you mean to feature it.

## Step 2 — Create the marketing page

Create `app/routes/_marketing+/{{SLUG}}.tsx` (this is `farragut.tsx` with the tokens swapped — the map embed comes from the entry above):

```tsx
import { json, type MetaFunction } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { Hero } from '#app/components/hero.js'
import { ServiceCardGrid } from '#app/components/service-card-grid.js'
import { Icon } from '#app/components/ui/icon.js'
import { useBlvdUrl } from '#app/utils/blvd-context.tsx'
import { getLocationById } from '#app/utils/locations.js'
import { getSocialMetas } from '#app/utils/seo.ts'
import { getCategoryPages } from '#app/utils/site-pages.server.js'

export const meta: MetaFunction = ({ location }) =>
	getSocialMetas({
		title:
			'{{LOCATION}} Med Spa | Botox, Fillers & Lasers | {{BRAND}}',
		description:
			'{{BRAND}} in {{LOCATION}}, {{CITY}} ({{ADDRESS}}). Expert Botox, dermal fillers, laser treatments, and GLP-1 weight loss.',
		pathname: location.pathname,
	})

export async function loader() {
	const categories = getCategoryPages().map(c => ({
		slug: c.path,
		serviceName: c.name,
		shortDescription: c.shortDescription,
		heroImage: c.heroImage,
	}))
	return json({ categories })
}

export default function LocationPage() {
	const { categories } = useLoaderData<typeof loader>()
	const location = getLocationById('{{SLUG}}')!
	const blvdUrl = useBlvdUrl()

	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'MedicalBusiness',
		name: '{{BRAND}} - {{LOCATION}}',
		description:
			'Medical spa in {{LOCATION}}, {{CITY}} offering Botox, dermal fillers, laser treatments, and GLP-1 weight loss.',
		url: 'https://hitchcoxaesthetics.com/{{SLUG}}',
		telephone: location.phone,
		email: 'sarah@hitchcoxaesthetics.com',
		image: 'https://hitchcoxaesthetics.com/img/sarah.jpg',
		priceRange: '$$',
		address: {
			'@type': 'PostalAddress',
			streetAddress: location.address,
			addressLocality: location.city,
			addressRegion: location.state,
			postalCode: location.zip,
			addressCountry: 'US',
		},
		geo: {
			'@type': 'GeoCoordinates',
			latitude: location.lat,
			longitude: location.lng,
		},
		openingHoursSpecification: [
			{
				'@type': 'OpeningHoursSpecification',
				dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
				opens: '09:00',
				closes: '17:00',
			},
		],
	}

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<div className="font-poppins flex w-full flex-col bg-white">
				<Hero
					image="/img/sarah.jpg"
					imageAlt="Sarah Hitchcox - {{LOCATION}} Med Spa"
					topText="SARAH HITCHCOX"
					bottomText="AESTHETICS"
					subText="{{LOCATION}} Med Spa"
					ctaText="Book Appointment"
					ctaHref={blvdUrl}
				/>

				<div className="mx-auto w-full max-w-4xl px-6 py-16">
					<div className="space-y-12">
						<div className="text-center">
							<h2 className="mb-4 text-3xl font-bold text-gray-900">
								Knoxville Med Spa | {{LOCATION}}
							</h2>
							<p className="text-lg leading-relaxed text-gray-600">
								{{BRAND}} brings premier medical spa services to {{LOCATION}}.
								We specialize in natural-looking results through expert Botox
								injections, dermal fillers, and cutting-edge skin treatments.
								Visit our {{LOCATION}} location for a personalized consultation
								tailored to your aesthetic goals.
							</p>
						</div>

						<div>
							<h2 className="text-center text-2xl font-bold text-gray-900">
								Knoxville Med Spa Services Available in {{LOCATION}}
							</h2>
							<div className="mt-8">
								<ServiceCardGrid services={categories} variant="thumbnail" />
							</div>
						</div>

						<div className="rounded-xl bg-gray-50 p-8 text-center">
							<h3 className="mb-4 text-2xl font-semibold text-gray-900">
								Visit Our {{LOCATION}} Location
							</h3>
							<p className="mb-6 text-gray-600">
								We are located at {location.address}, in {{LOCATION}}. Ample
								parking is available.
							</p>
							<div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
								<Link
									to={`tel:${location.phoneRaw}`}
									reloadDocument
									className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
								>
									Call {location.phone}
								</Link>
								<a
									href={location.googleMapsDirectionsUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center justify-center gap-2 rounded-md bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
								>
									<Icon name="map-pin" className="h-5 w-5" />
									Get Directions
								</a>
							</div>

							<div className="h-64 w-full overflow-hidden rounded-lg shadow-sm">
								<iframe
									src={location.googleMapsEmbedUrl}
									width="100%"
									height="100%"
									allowFullScreen={false}
									loading="lazy"
									referrerPolicy="no-referrer-when-downgrade"
									title="Map of {{BRAND}} {{LOCATION}}"
									style={{ border: 0 }}
								/>
							</div>
						</div>

						<div className="text-center">
							<p className="text-gray-600">
								Also visit our{' '}
								<Link to="/bearden" className="font-medium text-primary hover:underline">
									Bearden
								</Link>{' '}
								and{' '}
								<Link to="/farragut" className="font-medium text-primary hover:underline">
									Farragut
								</Link>{' '}
								locations.
							</p>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}
```

## Step 3 — Create the CallRail trackers (GMB number + website pool)

Dry run (prints payloads, creates nothing):

```sh
pnpm tsx scripts/callrail-create-location-trackers.ts --location="{{LOCATION}}" --destination={{DESTINATION}}
```

Provision for real (**billable** — one GMB number + a 4-number pool):

```sh
pnpm tsx scripts/callrail-create-location-trackers.ts --location="{{LOCATION}}" --destination={{DESTINATION}} --apply
```

Flags: `--location` (required), `--destination` (required for `--apply`), `--area=865`, `--pool=4`, `--swap=+1865...` (defaults to the destination). Copy the **GMB tracking number** from the output for step 4.

## Step 4 — Google Business Profile (phone + website scripted, the rest manual)

**Manual, one-time (Google dashboard):** create/claim the {{LOCATION}} listing at {{ADDRESS}} (Google mails a verification postcard), then add photos + service info.

**Phone + website are scripted** via `scripts/gbp-update-location.ts` (needs `GOOGLE_REFRESH_TOKEN` scoped for `business.manage`). Run it with no flags first to list locations and copy the {{LOCATION}} location name (it also prints each listing's `mapsUri` and `placeId`, which you need for the JSON-LD step below):

```sh
pnpm tsx scripts/gbp-update-location.ts
```

Then apply. This sets the CallRail GMB number as the **primary** phone, the **real line** ({{PHONE}}) as the secondary NAP, and the utm website link in one PATCH:

```sh
pnpm tsx scripts/gbp-update-location.ts \
  --location=accounts/123/locations/456 \
  --phone="<GMB tracking number from step 3>" \
  --secondary-phone="{{PHONE}}" \
  --website="https://hitchcoxaesthetics.com/{{SLUG}}" \
  --utm-location="{{SLUG}}" \
  --description="<from-the-business description>" --apply
```

Pass `--phone` and `--secondary-phone` together: the update replaces the whole `phoneNumbers` object, so omitting one clears it. `--utm-location` stamps the website link with `utm_content=<location id>` (on top of `utm_campaign=gmb`). **This is required, not cosmetic:** `utm_content` is captured by `app/utils/blvd-attribution.server.ts` and carried into the Boulevard booking, so appointments attribute to the specific GMB that generated them. Use the location slug as the id. `--description` sets the GBP "from the business" description (≤750 chars, no phone numbers, URLs, or superlatives).

> **Prefer `scripts/gbp-reconcile.ts`.** It's the declarative "check everything" tool: the `LOCATIONS` array is the desired state (title, `utm_campaign=gmb` + `utm_content=<slug>` website, primary/secondary phone, description), and it PATCHes only the fields that drift. `gbp-update-location.ts` is the lower-level per-field tool. For a new location, add an entry to `gbp-reconcile.ts` and run it.

## Step 4b — Point the page's JSON-LD at the GBP (entity matching)

This is what lets Google connect the website page to the Google listing, so make it exact. The discovery run above prints each listing's `mapsUri` (a `https://maps.google.com/maps?cid=...` URL) and `placeId`. In the location's `{{SLUG}}.tsx` `MedicalBusiness` JSON-LD:

- **`name`** must match the GBP listing's exact title (e.g. `Sarah Hitchcox Aesthetics - Knoxville ({{LOCATION}})`).
- **`sameAs`** and **`hasMap`** = the listing's `mapsUri`. `sameAs` is the strongest "this page **is** this listing" signal.
- **`telephone`** = the **real line** ({{PHONE}}) — the same number set as the GBP *additional* phone and used across every citation. Keep the CallRail tracking number as the GBP *primary* only; never put it on the site or in citations (it breaks NAP consistency).
- **address** must match the GBP address exactly, suite included.

Each page links to the listing physically at its address. If two listings are name-swapped on Google, fix the GBP titles (rename) so the names line up — but link by address regardless.

## Step 5 — Verify + deploy

```sh
pnpm run typecheck
# then load http://localhost:4000/{{SLUG}} and eyeball the page + map
```

Commit `app/utils/locations.ts` + `app/routes/_marketing+/{{SLUG}}.tsx` and push to deploy.

## Not covered yet (the ❌ rows above)

These are separate systems / not yet automated. Notes for whoever builds them:

- **RingCentral:** set up the location's phone number(s), add them to a call queue, and in the queue's *waiting* settings forward calls to Retell, **to the agent that matches the brand** (e.g. Sarah Hitchcox Aesthetics calls go to the Sarah Hitchcox Aesthetics agent). Done in the RingCentral admin UI; the API needs a JWT credential + the approval-gated Edit Accounts scope. This produces the `{{DESTINATION}}` number used above.
- **Retell agent:** only needed for a brand-new *business name*. A new *location* of an existing brand needs nothing here, the bot reads its locations from Boulevard. Existing tooling: `scripts/retell-*` (`retell-create-booking-agent.ts`, `retell-booking-brands.ts`).
- **Forward inbound texts to RingCentral:** the CallRail trackers are created with `sms_enabled: true` but `message_flow: null`, so texts land in CallRail but are not forwarded. Set each tracker's `message_flow` to forward to the RingCentral SMS number (blocked on having that number).
- **Listings distribution (SEMrush "local distribute"):** push the new location's NAP, the `?utm_campaign=gmb` website for Google (keep a clean URL for the others), and photos. For 2–4 locations, BrightLocal or Moz Local, not Yext.
