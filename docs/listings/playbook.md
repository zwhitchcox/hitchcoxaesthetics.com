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
(`docs/research/knoxville-competitor-backlinks-2026-07-28.md` has the full
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
`docs/research/knoxville-competitor-backlinks-2026-07-28.md`. Check the ledger
before emailing anyone; several outlets were already contacted 2026-07-29.
