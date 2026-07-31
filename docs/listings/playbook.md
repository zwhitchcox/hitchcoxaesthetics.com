# Business Listing Playbook

This playbook covers directory work across Sarah Hitchcox Aesthetics, Botox
Knox, and Knoxville Weight Loss Clinic. GBP-specific ranking and same-address
cluster rules remain in
`~/dev/zwhitchcox/sha/sha-reports/docs/gbp-playbook.md`.

## Before Creating or Editing a Listing

1. Open the location record in `docs/listings/locations/`.
2. Confirm the operating status with the owner. The owner confirmed on
   2026-07-28 that West Hills and Cedar Bluff should be included in directory
   work even though the application still contains stale `ghost: true` flags.
3. Read canonical NAP from `app/config/locations.json` or the brand's verified
   source. Never copy the phone shown on GBP because GBP intentionally uses
   CallRail tracking as its primary phone.
4. Search the directory for existing and duplicate profiles before creating a
   new one.
5. Use `sarah@hitchcoxaesthetics.com` when a shared business login is allowed.
6. Generate/store credentials in 1Password. Do not commit secrets.
7. Add the canonical website to every directory field that supports a website.
   For SHA locations, use the exact location page rather than the homepage.
   A listing is incomplete if its website is blank, stale, points to a sibling
   brand, or points to the wrong location.
8. Open the public listing after saving and test the website link. Record the
   exact published destination in the location record; do not assume the
   submitted website was accepted.
9. Record the listing URL, profile ID, exact submitted NAP, website destination,
   date, and status immediately after the action.

## Verification Email Rules

- Never invent a location-specific email and assume it reaches the shared
  inbox.
- `hitchcoxaesthetics.com` currently uses Google Workspace for mail. Cloudflare
  Email Routing does not provide an enabled catch-all for this domain.
- Until explicit Google Workspace aliases are created and tested, use
  `sarah@hitchcoxaesthetics.com` for every verification email.
- Planned aliases are `bearden@`, `farragut@`, `westhills@`, `cedarbluff@`,
  `botox-bearden@`, `botox-farragut@`, `weightloss-bearden@`, and
  `weightloss-farragut@`, all at `hitchcoxaesthetics.com`.
- Treat an alias as active only after a test message arrives in Sarah's inbox.
- Record the exact verified login/recovery email in the location record. Do not
  create separate paid Google Workspace users when a free alias is sufficient.

## Mandatory Website Rule

Website links are a primary purpose of this citation work, not an optional
enhancement.

- Every listing that permits a website must contain the canonical website.
- SHA listings must use `/bearden`, `/farragut`, `/west-hills`, or
  `/cedar-bluff` as applicable.
- Botox Knox and Knoxville Weight Loss Clinic may use their verified brand
  homepage until dedicated location pages exist.
- Record `VERIFIED`, `MISSING`, `WRONG`, `PENDING`, or `UNSUPPORTED` for the
  website on every tracked directory.
- `VERIFIED` requires opening the public listing and confirming where its
  website link actually lands.
- A listing cannot be marked complete until its public website link is
  verified.

## Canonical vs Tracking Phones

Canonical phones belong in the website, JSON-LD, citations, BBB, Yelp,
Nextdoor, Facebook, Apple, Bing, Birdeye, and medical directories.

Never use these CallRail tracking numbers in citations:

- `(865) 214-7238`
- `(865) 419-4234`
- `(865) 346-4512`
- `(865) 351-6951`
- `(865) 401-8707`
- `(865) 346-4287`

Tracking numbers are allowed only where the GBP playbook explicitly requires
them.

## Multi-Brand Same-Address Rules

At Bearden and Farragut, the three sibling brands must remain differentiated
by suite, primary category, phone, and website. Do not reuse a sibling's suite
or canonical phone.

| Brand | Bearden suite | Farragut suite | Primary category |
|---|---|---|---|
| Sarah Hitchcox Aesthetics | 15 | 8 | Medical spa |
| Botox Knox Med Spa | 15B | 8B | Skin care clinic |
| Knoxville Weight Loss Clinic | 15C | 8C | Weight loss service |

Directory titles must comply with the directory's real-world-name rules.
Marketing descriptors used by GBP are not automatically valid elsewhere.

## Directory-Specific Notes

### BBB

Create one location record first, then request additional locations under the
same business when BBB supports it. Separate brands need separate business
profiles. Leave promotional accreditation/Seal outreach unchecked unless the
business explicitly wants a sales contact.

### Nextdoor

One Nextdoor account can manage multiple Business Pages. Create one page per
truthful location and switch pages from the same login. Do not create separate
accounts unless access must be split between different staff.

For any account error, suspension, missing Page, or verification request, follow
the [Nextdoor Listing And Account Recovery Guide](nextdoor.md). Check Sarah's
business inbox before opening another support case because Nextdoor may pause an
appeal until the owner replies to an identity-confirmation email.

### MapQuest

MapQuest's current self-service claim/edit flow is paid: `$12.50/month`, billed
annually as `$150`. A different login email does not remove this fee because the
charge applies to claiming and managing the business listing. Use MapQuest's
free issue-reporting route for NAP corrections unless the owner approves the
subscription. A correct Google listing does not automatically update MapQuest.
Do not purchase a subscription without explicit approval.

The owner approved one annual subscription on 2026-07-30. It uses
`zwhitchcox@gmail.com` and is attached to the HEP is on the way listing at
1605 Prosser Rd, Knoxville. The paid portal has no account-level listing
switcher: opening another claim while authenticated redirects back to the HEP
record. Treat the product as one subscribed listing unless MapQuest support
confirms otherwise in writing. Do not buy another subscription merely to test
multi-location coverage. An account-scope support request was submitted and
email-verified on 2026-07-30 because the paid portal redirected every
additional claim to the subscribed HEP record.

The owner requested cancellation without a refund on 2026-07-30. The
email-verified cancellation request is MapQuest ticket `#3170174`; it asks
MapQuest to turn off renewal and let the current paid term expire normally.
The subscription remains pending cancellation until MapQuest confirms the
expiration date by email.

MapQuest's public developer APIs do not edit its public business directory. The
Data Manager API only manages private datasets used by a developer's own map
applications. Do not build a Google Business Profile sync against that API.
MapQuest identifies Yext as its supported listings-management partner; use a
listings distributor such as Yext only after the owner approves its exact
multi-location price and contract. Without a distributor, audit MapQuest
against the live Google profiles and submit correction/addition requests.

HEP's current MapQuest reconciliation is tracked in
[HEP MapQuest Location Audit](hep-mapquest.md). The exact public Google
Business Profile values are the source of truth for that portfolio.

### Thryv / Yellow Pages / Superpages / DexKnows

The basic business/courtesy listing is free. Thryv's paid marketing package is
not required to appear on YellowPages.com, Superpages.com, or DexKnows.com. A
2026-07-30 sales quote of `$250/month` did not include a standalone
listings-management option and was declined.

All three directories use the same Thryv listing ID for a location. Correcting
the shared record should update all three public pages. Use the free owner
claim page at
`https://www.yellowpages.com/claim-your-listing?from=advertise-with-us-YP`
when it works. A free manual correction form is also available at
`https://uitl.yellowpages.com/listing_feedback/{THRYV_ID}.html?site=UITL&ptid=dkdesktop`.
It accepts the name, address, phone, hours, and website without a paid account.
If neither route works, use the courtesy-listing support route at
`https://www.dexknows.com/info/contact-us` or call `(866) 794-0889`.

On 2026-07-30, the free claim page found all four SHA records, but its own
reCAPTCHA Enterprise account was over quota and prevented submission. A
consolidated free correction request for all eight SHA, Botox Knox, and
Knoxville Weight Loss Clinic records was therefore submitted through the
DexKnows feedback form using `sarah@hitchcoxaesthetics.com`. Do not create
duplicate listings to work around a claim failure.

On 2026-07-30, the manual form accepted direct corrections for SHA Bearden,
SHA Farragut, both Botox Knox locations, and both Knoxville Weight Loss Clinic
locations. Each submission displayed the review-within-a-few-days
confirmation. Verify all three public directory pages after review.

Use `zwhitchcox@gmail.com` only for the historical Thryv sales inquiry. Do not
accept a Thryv contract, onboarding fee, or paid package without explicit owner
approval.

### Facebook

Create and own the business Pages through Zane Hitchcox's personal Facebook
profile. Use `sarah@hitchcoxaesthetics.com` as the public business contact and
recovery email where Facebook permits it. Keep login credentials in 1Password;
do not create a fake personal profile for a business.

### Bing Places

GBP imports may bring in GBP's tracking phone. If the phone cannot be edited
while sync is enabled, document the issue before disabling sync. Do not leave
sync disabled without recording who owns future updates.

Use only a Microsoft or Google identity owned by Sarah Hitchcox Aesthetics.
Never manage listings through an agency or other third-party account merely
because it appears as an available sign-in. Record an access blocker instead.

### Apple Business Connect

Use the business Apple ID stored in 1Password. Record the Company and Place
IDs after verification.

### Birdeye

Birdeye is a paid listings/reputation platform, not a free citation that can be
claimed independently. Pricing is custom and scales by purchased location and
selected products. The current decision is `NOT PURSUING - PAID`. Keep Birdeye
in the registry so it is clear that it was evaluated and intentionally
excluded, not accidentally missed. Do not request a quote, sign an order form,
or create a Birdeye account.

### Healthgrades

Healthgrades is provider-led. The owner has confirmed Dr. Fair's
medical-director relationship, so authorized practice staff can prepare and
perform the administrative work. Dr. Fair does not need to complete every
field herself unless Healthgrades specifically requires provider verification
or a provider-only attestation. Adding locations must be an additive update
that preserves her other practice affiliations. The claim may require license
information or phone verification. Healthgrades states that accepted profile
updates also sync to Healthline FindCare, Medical News Today, and Sharecare.

### Vitals / WebMD

Vitals and WebMD share a provider-directory correction process. Their claim
forms accept requests from physicians and practices, but require a personal
phone in addition to the public business phone. Authorized practice staff can
prepare the full request with the NPI, profile URL, current address, proposed
addresses, and proof of the practice locations. Dr. Fair's involvement should
be limited to the personal-phone or provider-only verification the directory
requires. Explicitly state that the request adds locations and does not remove
existing affiliations.

### RealSelf

RealSelf is not active citation work. A free provider claim was submitted
before its limitations were confirmed, but direct website links are promoted
as a paid feature and no free public multi-location SHA listing has been
verified. Retain the historical provider claim record, but do not buy a plan,
create sub-brand profiles, or spend additional verification effort unless the
free public profile proves that it can publish an SHA location or website.

## Adding a New Business or Location

1. Copy `docs/listings/location-template.md`.
2. Add the record to `docs/listings/README.md`.
3. Add canonical NAP to the appropriate application/config source.
4. Verify that the site, schema, phone, suites, and signage agree.
5. Create/claim core listings in this order: GBP, Apple, Bing, Yelp, Nextdoor,
   Facebook, BBB.
6. Evaluate paid aggregators and provider directories separately.
7. Add links/IDs and a dated entry to the location record after every action.
8. Re-audit the listing after it becomes public, including opening and testing
   its website link.

## Periodic Audit

Quarterly, or after any NAP change:

- Compare every public profile to its location record.
- Check duplicate profiles and incorrect tracking phones.
- Confirm ownership/admin access still works.
- Confirm provider-location relationships remain current.
- Update the `Last audited` date and change log.

## Link-Building Directory Targets (2026-07-29 gap analysis)

Source: DataForSEO backlink gap across 13 ranking Knoxville competitors
(`docs/marketing/knoxville-competitor-backlinks-2026-07-28.md` has the full
audit). These directories link to 2+ competitors and not to us. Track status
here; mirror completed submissions into the per-location records.

Progress metric: the "clean referring domains" chart on
`/admin/reports/reach` (captured every 3 days). Total backlinks is NOT the
goal; most competitor totals are junk.

| Directory | Competitors with it | Submit route | Follow | Status |
| --- | --- | --- | --- | --- |
| findhealthclinics.com | 9 | Scrapes Facebook Pages; no form. Keep FB Pages complete | dofollow | WAITING ON SCRAPE (FB page live 2026-07-29) |
| bizhwy.com | 7 | bizhwy.com/addlisting.php | dofollow | NEEDS OWNER: form requires setting a password |
| semaglutidenearme.org | 6 | No form; contact page only | dofollow | EMAIL ROUTE |
| salondiscover.com | 6 | No form; contact page only | dofollow | EMAIL ROUTE |
| gleauty.com | 5 | Scrapes Facebook Pages; no form | dofollow | WAITING ON SCRAPE |
| mapquest.com | 4 | Existing unclaimed listing `hitchcox-tn-283477323`; claim requires an account | dofollow | NEEDS OWNER (account) |
| threebestrated.com | 2 | threebestrated.com/submit-business?reason=new | dofollow | NEEDS OWNER: reCAPTCHA + 3 required photos |
| bestprosintown.com | 6 | bestprosintown.com/addbusiness.php | unknown | SUBMITTED 2026-07-30 (SHA Bearden; 3-4 mo queue) |
| loc8nearme.com | 4 | No form; auto-generated | dofollow | EMAIL ROUTE |
| fyple.com | 6 | fyple.com/addcompany/addcompany/ (requires register) | nofollow | LOW VALUE |
| yellowpages.com | 4 | YP for-business signup (account) | nofollow | LOW VALUE |
| superpages.com / dexknows.com | 3 | Same Thryv backend as YP | nofollow | LOW VALUE |

Rules for every submission: canonical NAP from the location record, canonical
phones only, `sarah@hitchcoxaesthetics.com`, exact location page as website.

Not obtainable, do not chase: theaestheticsociety.org (board-certified plastic
surgeons only), downtownknoxville.org (downtown address required),
alastinknoxville.com / knoxvilleaesthetics.com (Skin & Sculpt redirect
domains), bodytn.com / botoxtn.com (Beautique redirect domains).

Press/editorial link targets and the outreach ledger live in
`docs/marketing/knoxville-competitor-backlinks-2026-07-28.md`. Check the ledger
before emailing anyone; several outlets were already contacted 2026-07-29.

## Industry Directory Evaluation (2026-07-30)

This audit evaluated the industry directories found in the 2026-07-30
competitor-gap report. A directory is viable only when it can publish a
durable business or location identity and a useful website link without
misrepresenting the business. Do not repeatedly submit a broken form or start a
paid plan merely to test whether a directory works.

| Directory | Applies to | Free website/location value | Action and current status |
| --- | --- | --- | --- |
| MedSpa Compass | All eight records | Free profile supports business details and map; publisher must add Knoxville/Farragut | Bulk request for all eight canonical records submitted; `PENDING PUBLISHER REVIEW` |
| Find My Cosmetic Injector | Four SHA and two Botox Knox records | Applicable to injectable providers/medical spas; public-link behavior must be verified after publication | Advertised registration button is broken; support request for all six applicable records submitted; `PENDING PUBLISHER RESPONSE` |
| Laser Hair Removal Nearby | Four SHA records | Existing public profiles expose phone, website, and contact details | Standard-directory request for all four SHA locations submitted; no paid featured placement requested; `PENDING PUBLISHER RESPONSE` |
| Fresha | SHA Bearden placeholder | Existing unclaimed placeholder already links to the SHA website; claiming may require adopting Fresha's booking/payment platform | Record and monitor the placeholder. Do not join or migrate booking systems solely to claim this citation without owner approval |
| ProvenExpert | SHA records | BrightLocal already produced live location pages for all four SHA locations | Keep and audit the existing BrightLocal URLs. The separate brand profile is live at `https://www.provenexpert.com/sarah-hitchcox-aesthetics/` with canonical Bearden NAP, `/bearden` website, Instagram, accurate RN credential, and service description. Credentials are in 1Password |
| AllMedSpas | Applicable med-spa records | Intended free submission, but no usable publisher integration | Submission form returned `The form is not connected to any integration`; `BLOCKED - PUBLISHER FORM BROKEN` |
| GLP1 Directory | Two Knoxville Weight Loss Clinic records | Existing profiles include address, phone, and website | No provider registration, add-business, or contact route exists; `BLOCKED - NO SUBMISSION PATH` |
| WeightLossNinja | Two Knoxville Weight Loss Clinic records | Existing public profiles appear to contain business contact details | Site was unavailable and no publisher submission path could be verified; `BLOCKED - SITE/PUBLISHER UNAVAILABLE` |
| MedSpaDirectory.org | Applicable medical-spa records | Listing disappears after the seven-day trial | `$75/month` for up to 10 listings; `NOT PURSUING - PAID/TEMPORARY` |
| TrustAnalytica | All eight records | Business profile management is paid | Plans start at `$12.95/month` billed annually; `NOT PURSUING - PAID` |
| Laser Hair Removal Success | Four SHA records | Paid permanent dofollow profiles; every future edit is also charged | Four records purchased for `$180` total on 2026-07-30; order `L6a6bc4769891f`; `PAID - PENDING PUBLISHER REVIEW` |
| N49 | All eight records | Free profile omits the website link; dofollow website requires `$8/month` | Keep the four existing SHA records from BrightLocal; do not create new paid sub-brand records without approval |
| Storeboard | All eight records | Free account is a community profile; business profile with website costs `$9/year` | Keep the four live SHA pages already produced by BrightLocal; no new paid sub-brand profiles without approval |
| Bunity | All eight records | Permanent dofollow business profiles | Eight records purchased for `$24` total on 2026-07-30; all public pages and website links verified; `LIVE` |
| Bariatric Journal | Two Knoxville Weight Loss Clinic records | Sponsored editorial/business placement | `NOT PURSUING - PAID SPONSORSHIP` |

Track future paid options in
[`PAID-CANDIDATES.md`](./PAID-CANDIDATES.md) and publisher failures or
pending rechecks in [`RETRY-FAILURES.md`](./RETRY-FAILURES.md).

For submitted requests, do not mark the location complete until the publisher
returns a public URL and the website link has been opened and verified. Record
the exact public URL in each applicable location file when it becomes live.
