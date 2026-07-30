# Business Listing Registry

This directory is the durable record of every local-directory account and
listing for the Sarah Hitchcox business family. Update the relevant location
record whenever a listing is created, claimed, submitted, verified, corrected,
renamed, suspended, or closed.

## Sources of Truth

Use these in order:

1. `app/config/locations.json` for Sarah Hitchcox Aesthetics location NAP,
   Google Business Profile IDs, BrightLocal IDs, and map coordinates.
2. `app/config/brands.ts` for current customer-facing brand names and domains.
3. `~/dev/zwhitchcox/sha/sha-reports/docs/gbp-playbook.md` for GBP-specific
   naming, categories, tracking-phone rules, attribution, and cluster risks.
4. The per-location records in `docs/listings/locations/` for directory status,
   account ownership, listing URLs, submissions, and history.

Do not silently resolve a conflict. Record it in the location's `Open issues`
section, then correct the appropriate source of truth.

Each location record contains:

- a `Public Listing Links` table for the canonical website page and every
  confirmed major-directory page;
- a `Directory Registry` that also records submissions, blocked work, and
  directories with no public page yet; and
- for the four Sarah Hitchcox Aesthetics locations, the complete BrightLocal
  Citation Builder output with the exact public URL returned for each published
  citation.

Use the location record, not browser history or a chat transcript, when a
listing needs to be corrected later.

The consolidated unfinished-work checklist is [Business Listing TODO](TODO.md).
Update it whenever a blocker clears or a listing is completed.

## Portfolio

| Record                                                              | Operating status                         | Google                | Yelp                                     | Nextdoor                                                | BBB       |
| ------------------------------------------------------------------- | ---------------------------------------- | --------------------- | ---------------------------------------- | ------------------------------------------------------- | --------- |
| [SHA Bearden](locations/sha-bearden.md)                             | Physical clinic                          | Live                  | Claimed                                  | Public live; admin blocked by shared-account suspension | Submitted |
| [SHA Farragut](locations/sha-farragut.md)                           | Physical clinic                          | Live                  | Claimed                                  | Public live; admin blocked by shared-account suspension | Submitted |
| [SHA West Hills](locations/sha-west-hills.md)                       | Business location; config update pending | Live                  | Claimed; pending Yelp moderator approval | Created; account suspended                              | Submitted |
| [SHA Cedar Bluff](locations/sha-cedar-bluff.md)                     | Business location; config update pending | Live                  | Submission did not create listing        | Blocked by account suspension                           | Submitted |
| [Botox Knox Bearden](locations/botox-knox-bearden.md)               | Physical sub-brand                       | Live                  | Submission pending                       | Blocked by account suspension                           | Submitted |
| [Botox Knox Farragut](locations/botox-knox-farragut.md)             | Physical sub-brand                       | Live                  | Claimed                                  | Blocked by account suspension                           | Submitted |
| [Weight Loss Knox Bearden](locations/weight-loss-knox-bearden.md)   | Physical sub-brand                       | Live                  | Claimed                                  | Blocked by account suspension                           | Submitted |
| [Weight Loss Knox Farragut](locations/weight-loss-knox-farragut.md) | Physical sub-brand                       | Live; duplicate issue | Claimed                                  | Blocked by account suspension                           | Submitted |

The Yelp account now contains six claimed listings: the five recovered listings
plus SHA West Hills. Cedar Bluff and Botox Knox Bearden both passed Yelp's
hCaptcha, but Yelp returned to the completed form without creating either
location. The account still shows six locations. Yelp's logged-in support center
offers phone support at (877) 767-9357 for this issue. SHA West Hills is present
in Yelp for Business with the canonical phone and `/west-hills` website. Yelp
explicitly says the page will not appear publicly until its moderators approve
the business, so the public slug currently redirects to search by design.

Nextdoor allowed SHA West Hills to be added under the shared owner account, then
immediately suspended the account. A reinstatement appeal was submitted on
2026-07-28; Nextdoor states it will respond within 24–48 hours. Do not create
more Nextdoor pages until the account is reinstated. Nextdoor's disabled account
screen and Sarah's inbox contain no specific policy reason. The Bearden and
Farragut public Pages remained live with canonical NAP when checked on
2026-07-29, but the suspended owner account cannot manage them. An automated
"Check the verification of your business" email received on 2026-07-29 was not
an appeal decision; its status link still redirected to the disabled-account
screen. No reinstatement response was present in either the business inbox or
the owner's personal Gmail.

## Website Completion Standard

Every directory record must include a Website Publication Audit. A listing is
not complete merely because the canonical website was submitted: the public
listing must be opened, its website link tested, and the published destination
recorded. If a directory supports a website and the field is blank, stale, or
points to the wrong location or sibling brand, the listing remains incomplete.

### Shared And Historical Website Audit

| Listing             | Website status        | Published destination           | Last verified | Required action                                                                                            |
| ------------------- | --------------------- | ------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| Knoxville Moms      | WRONG                 | https://botoxknoxville.com      | 2026-07-29    | Replace with the canonical SHA Bearden page and business email                                             |
| Portrait Care       | LISTING NOT RESOLVING | -                               | 2026-07-29    | Recorded URL redirects to the Portrait Care homepage; locate/claim before adding the canonical SHA website |
| Fresha placeholder  | VERIFIED              | https://hitchcoxaesthetics.com/ | 2026-07-29    | No change unless the placeholder is removed                                                                |
| JaneApp legacy page | PRESENT               | https://hitchcoxaesthetics.com  | 2026-07-29    | Retire the legacy booking page rather than investing in the citation                                       |

The four SHA locations also have completed BrightLocal citation campaigns:

| Location    | BrightLocal location | Campaign | Completed  | Cost |
| ----------- | -------------------: | -------: | ---------- | ---: |
| Bearden     |            `4101999` | `980257` | 2026-07-20 |  $80 |
| Farragut    |            `4102000` | `980259` | 2026-07-20 |  $80 |
| West Hills  |            `4101900` | `980210` | 2026-07-20 |  $80 |
| Cedar Bluff |            `4102074` | `980294` | 2026-07-20 |  $80 |

These campaigns created or updated secondary citations. They do not establish
ownership of Google, Apple, Bing, Yelp, Facebook, Nextdoor, BBB, or medical
directory profiles.

## Shared And Historical Listings

These records span multiple locations or do not map cleanly to one current
location page. Their exact status is also recorded in the applicable location
file.

| Platform            | Public page                                                                                                   | Scope                                                        | Status                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Facebook            | [Official Sarah Hitchcox Aesthetics Page](https://www.facebook.com/profile.php?id=61592729485925)             | Brand-wide; Bearden is currently the primary Page address    | LIVE; owned by the Sarah Hitchcox Aesthetics Business Portfolio; Farragut, West Hills, and Cedar Bluff website links are published |
| Facebook            | [Botox Knox Med Spa - Bearden](https://www.facebook.com/profile.php?id=61592681608237)                        | Botox Knox primary Page; Bearden Suite 15B                   | LIVE; exact canonical phone, website, email, and address saved 2026-07-28                                                          |
| Facebook            | [Knoxville Weight Loss Clinic - Bearden](https://www.facebook.com/profile.php?id=61592834871651)              | Knoxville Weight Loss Clinic primary Page; Bearden Suite 15C | LIVE; exact canonical phone, website, email, and address saved 2026-07-28                                                          |
| Knoxville Moms      | [Sarah Hitchcox Aesthetics listing](https://knoxvillemoms.com/directory/listing/sarah-hitchcox-aesthetics-1/) | Bearden address; description mentions Bearden and Farragut   | LIVE, but the email and website are stale and require correction                                                                   |
| Portrait Care       | [Sarah Hitchcox Aesthetics listing](https://www.portraitcare.com/location/sarah-hitchcox-aesthetics-34659/)   | Bearden address only                                         | LIVE, unclaimed, and showing a non-canonical phone                                                                                 |
| JaneApp             | [Legacy SHA booking page](https://hitchcoxaesthetics.janeapp.com/)                                            | Historical Bearden and Farragut booking locations            | DEPRECATED; retain only as a cleanup record                                                                                        |
| Medical directories | [Dr. Tasheema Fair directory record](providers/dr-tasheema-fair.md)                                           | Provider profiles with additive SHA affiliations requested   | IN PROGRESS; provider pages are not yet confirmed SHA location pages                                                               |

If a platform has no confirmed public URL, the location record says
`No public page yet` instead of linking to a generic signup, claim, or
management screen.

## Status Vocabulary

- `LIVE`: public and verified.
- `CLAIMED`: ownership is confirmed; public data may still need review.
- `SUBMITTED`: application sent; not yet approved or published.
- `PENDING VERIFICATION`: directory requires a code, call, document, or review.
- `NEEDS CORRECTION`: public profile exists but at least one field is wrong.
- `NOT STARTED`: no confirmed action.
- `BLOCKED`: cannot proceed without authorization, credentials, or factual
  confirmation.
- `DEFERRED`: intentionally postponed.
- `NOT ELIGIBLE`: directory rules do not permit the proposed profile.
- `PAID / DECISION REQUIRED`: requires a contract or purchase.
- `NOT PURSUING - PAID`: intentionally excluded because it requires a paid
  subscription.

## Shared Rules

- Account email: `sarah@hitchcoxaesthetics.com`.
- Facebook Business Portfolio: `Sarah Hitchcox Aesthetics`, business ID
  `2014119969227719`. Sarah Hitchcox's personal Facebook profile has full
  control. The official SHA, Botox Knox Med Spa, and Knoxville Weight Loss
  Clinic Pages are owned by this portfolio. Use the business email for public
  contact and recovery where Facebook permits it.
- Meta Store Locations reports that it is available only to clients with
  dedicated Meta support. On 2026-07-29 it also reported that the main SHA Page
  was less than two days old and lacked both a profile and cover image. Ask Meta
  support to enable the feature after completing those Page assets; continue
  treating standalone location Pages as the fallback.
- After creating the Botox Knox and Knoxville Weight Loss Clinic Pages, Meta
  initially displayed a recent-Page-creation limit. Retried Botox Knox Farragut
  and Knoxville Weight Loss Clinic Farragut on 2026-07-29; both attempts
  returned a generic Page-policy error and created no Page. Do not treat the
  restriction as cleared until a new Page appears in the owned Pages list.
- Store passwords only in 1Password. Never put passwords, recovery codes, or
  one-time verification codes in this repository.
- Citations use canonical NAP phones, never CallRail tracking numbers.
- The live Google Business Profile resources currently expose tracking phones as
  their primary public phone. That conflicts with the canonical citation phones
  above. Do not copy the Google tracking phone into another directory; confirm
  the GBP attribution policy before changing the Google records.
- The owner has confirmed that Dr. Tasheema Fair is the medical director for
  these businesses. Treat the medical-director relationship as the basis for
  authorized practice staff to prepare and manage accurate directory updates.
  Involve Dr. Fair only when a directory specifically requires a
  provider-originated request, provider-only attestation, or verification.
  Location additions must not remove her other practice affiliations.
- The owner confirmed on 2026-07-28 that West Hills and Cedar Bluff should be
  treated as business locations for directory work. Their `ghost: true` flags in
  `app/config/locations.json` are stale and should not block the listing
  workflow; update that application config separately when ready.
- For a new location, copy [the location template](location-template.md) and add
  it to the portfolio table before creating directory profiles.

## Shared Medical-Directory Provider

Dr. Tasheema Fair is the medical director being evaluated for provider-led
directories:

- Name: Tasheema Lanell Fair, MD
- NPI: `1164613816`
- Healthgrades: `https://www.healthgrades.com/physician/dr-tasheema-fair-xh6y8`
- Detailed status:
  [Dr. Tasheema Fair directory record](providers/dr-tasheema-fair.md)

These profiles belong to Dr. Fair, not to Sarah Hitchcox Aesthetics. Submit only
accurate affiliations and preserve every existing affiliation. Additional
Healthgrades, Vitals, and WebMD practice-location work is deferred until NP
Hayley joins; create a separate provider record once her legal identity,
credentials, NPI, and verification details are available. RealSelf is not
active citation work because a useful free multi-location SHA listing with a
direct website link has not been confirmed.
