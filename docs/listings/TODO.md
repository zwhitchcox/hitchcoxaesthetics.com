# Business Listing TODO

Last reviewed: 2026-07-30

This is the master checklist for unfinished citation and directory work. The
individual location records remain the source of truth for canonical NAP, public
URLs, IDs, submissions, and history.

## Required Location Coverage

Every directory must be evaluated for all eight physical business records. A
brand-level submission is complete only when the directory supports one record
per brand and the record explicitly includes both branches.

- Sarah Hitchcox Aesthetics: Bearden, Farragut, West Hills, Cedar Bluff
- Botox Knox Med Spa: Bearden, Farragut
- Knoxville Weight Loss Clinic: Bearden, Farragut

## Priority 1: Clear Current Blockers

### New Free Directory Handoff

- [ ] Google Workspace location aliases: create and test `bearden@`,
      `farragut@`, `westhills@`, `cedarbluff@`, `botox-bearden@`,
      `botox-farragut@`, `weightloss-bearden@`, and `weightloss-farragut@`, all
      at `hitchcoxaesthetics.com`, as aliases that deliver to
      `sarah@hitchcoxaesthetics.com`. The domain uses Google Workspace MX
      records, and Cloudflare's catch-all is disabled; arbitrary addresses do
      not currently forward. Until each alias is tested, continue using
      `sarah@hitchcoxaesthetics.com` on directory submissions. BizHWY accepts
      Gmail plus-addressing, so the seven new records were activated with
      mailbox-specific `sarah+...@hitchcoxaesthetics.com` addresses that
      delivered to Sarah without requiring Workspace aliases.

- [x] BizHWY: the SHA Bearden listing was activated on 2026-07-29 at
      `https://tennessee.bizhwy.com/sarah-hitchcox-aesthetics-id15534.php`.
      Its free search-result redirect resolves to the canonical `/bearden`
      page. An older duplicate at
      `https://tennessee.bizhwy.com/sarah-hitchcox-aesthetics-knoxville-bearden-id15456.php`
      still needs cleanup. BizHWY charges `$15` for a direct dofollow link;
      that paid upgrade was not selected. Password recovery was requested and
      delivered to the business inbox on 2026-07-29; save the recovered login
      in 1Password when signed-in access is available. Submit and activate the
      seven remaining records were activated on 2026-07-30: SHA Farragut, SHA
      West Hills, SHA Cedar Bluff, Botox Knox Bearden, Botox Knox Farragut,
      Knoxville Weight Loss Clinic Bearden, and Knoxville Weight Loss Clinic
      Farragut. Each public listing and website redirect was verified. No paid
      `$15` link or `$10` highlight upgrade was selected.
- [x] BizHWY credential housekeeping: the shared credential for the seven
      2026-07-30 listings was moved into the Sarah Hitchcox Aesthetics
      1Password vault on 2026-07-30. The temporary macOS Keychain item and
      `/tmp/codex-bizhwy-password` were removed.
- [x] ThreeBestRated: submissions were completed on 2026-07-29 for Sarah
      Hitchcox Aesthetics, Botox Knox Med Spa, and Knoxville Weight Loss
      Clinic. Each brand submission includes both Bearden and Farragut, with
      current services, pricing, hours, reviews, and three photos. All three
      reCAPTCHAs passed and the forms were submitted for review. No public
      listing URLs have arrived yet; monitor the business inbox and verify
      every website link after publication.
- [ ] MapQuest: the actual Bearden record is
      `https://www.mapquest.com/us/tennessee/sarah-hitchcox-aesthetics-808453774`.
      It has the correct street address and root website, but the prohibited
      `(865) 214-7238` tracking phone. MapQuest's claim link is only a
      Yext marketing scan with sales-call consent. MapQuest's current official
      self-service claim costs `$12.50/month` billed annually (`$150/year`).
      The owner approved one subscription on 2026-07-30 under
      `zwhitchcox@gmail.com`. It was attached to HEP is on the way at
      1605 Prosser Rd and used to publish a clean HEP location-page link. The
      portal then redirected SHA and every other claim attempt back to that HEP
      record and exposed no add/switch-listing control. Do not purchase another
      subscription without a separate owner decision. On 2026-07-30, a
      cancellation request was submitted and email-verified as MapQuest ticket
      `#3170174`. It asks MapQuest to turn off renewal at the end of the current
      paid term and explicitly states that no refund is requested. Monitor
      `zwhitchcox@gmail.com` until MapQuest confirms the cancellation and
      expiration date; do not treat renewal as disabled until that confirmation
      arrives. An account-scope support
      request was submitted and email-verified on 2026-07-30 asking MapQuest to
      enable multi-listing management or confirm the subscription limit in
      writing. Monitor `zwhitchcox@gmail.com` for the response. The paid
      manager accepted the clean HEP Prosser location URL, but the public page
      still showed the old tracking-query URL immediately after publication;
      recheck after MapQuest's cache refresh.
      A separate bulk reconciliation request containing all 11 active HEP
      Google Business Profiles was submitted and email-verified on 2026-07-30.
      It instructs MapQuest to match the exact live Google NAP and website,
      create missing records, and merge stale duplicates. Monitor
      `zwhitchcox@gmail.com` for public URLs and results, then update
      [HEP MapQuest Location Audit](hep-mapquest.md).
      The free `Let us know` route did not expose editable fields. A combined
      no-cost correction request for
      Bearden and Farragut was submitted and email-verified on 2026-07-29;
      monitor the business inbox for MapQuest's response. A fresh MapQuest
      sign-in code was accepted on 2026-07-30, but the business portal returned
      its own `Configuration` error after authentication. MapQuest does not
      document any Google Business Profile synchronization, so do not rely on
      Google changes to update this listing. Do not edit
      `mapquest.com/us/tennessee/hitchcox-tn-283477323`; that URL is the page
      for the geographic community of Hitchcox in Pikeville, Tennessee, not
      Sarah Hitchcox Aesthetics. No existing MapQuest records were found for
      Botox Knox or Knoxville Weight Loss Clinic. Creating those records, and
      adding SHA West Hills or Cedar Bluff, is blocked by MapQuest's paid
      per-listing portal behavior. Continue with free support corrections.
- [ ] MapQuest ongoing synchronization: there is no public MapQuest directory
      API for direct Google Business Profile updates. MapQuest's Data Manager
      API is only for private developer datasets. Obtain an exact Yext
      multi-location quote before deciding whether continuous automatic sync is
      worth paying for. Until then, periodically compare MapQuest with Google
      and submit support corrections.
- [ ] Yellow Pages / Superpages / DexKnows: monitor the consolidated support
      request and six direct manual correction submissions made on 2026-07-30.
      Thryv replied in the business inbox requesting documents that show the
      legal business name and location/address before it will begin
      verification. Select a matching business-license, formation, lease, or
      utility document and send it to `ClientCareEmail@Thryv.com`, referencing
      the existing request. Do not send unrelated personal records.
      The manual form confirmed that each submission will be reviewed within a
      few days. A same-day public recheck found that the changes had not
      published yet: SHA Bearden still had the prohibited tracking phone, SHA
      Farragut still had its prior address, and both Weight Loss records still
      used the old `Weight Loss Knox` name. Verify every public page after Thryv
      publishes the changes.
      - SHA Bearden `581518712`: replace prohibited tracking phone and root
        website.
      - SHA Farragut `581521417`: replace prior address, prohibited tracking
        phone, and root website.
      - SHA West Hills `582524662`: verify canonical NAP and `/west-hills`.
      - SHA Cedar Bluff `582526209`: verify canonical NAP and `/cedar-bluff`.
      - Botox Knox Bearden `581685367` and Farragut `581685390`: canonical NAP
        and website are live; change public name to `Botox Knox Med Spa`.
      - Weight Loss Bearden `581681574` and Farragut `581681761`: canonical
        NAP and website are live; change public name to
        `Knoxville Weight Loss Clinic`.
      The free Yellow Pages claim lookup finds the records, but its own
      reCAPTCHA Enterprise account is over quota. The direct free correction
      form is
      `https://uitl.yellowpages.com/listing_feedback/{THRYV_ID}.html?site=UITL&ptid=dkdesktop`.
      Use free support at
      `(866) 794-0889` if written support does not respond. Do not buy the
      `$250/month` Thryv package; it does not offer standalone listing
      management.
- [ ] Farragut West Knox Chamber: owner decision required before purchasing.
      The likely 2-10 employee first-year price is `$320`, including the one-time
      `$50` application fee. A one-owner/employee business is `$240`.
- [ ] Knoxville Chamber: owner decision required before purchasing. The lowest
      tier with an online investor directory listing is Associate at `$500/year`.

### Website Completion

- [ ] Nextdoor Farragut: publish `https://hitchcoxaesthetics.com/farragut`. A
      public-page suggestion was attempted on 2026-07-29, but Nextdoor rejected
      it while the owner account is suspended.
- [ ] Nextdoor Bearden: replace the homepage link with
      `https://hitchcoxaesthetics.com/bearden` after account reinstatement.
- [ ] Apple SHA Bearden and Farragut: replace the generic SHA homepage with
      their exact location pages when the listings are claimed.
- [ ] Bing Knoxville Weight Loss Clinic Bearden: add
      `https://weightlossknoxvilletn.com`; no website was visible on 2026-07-29.
- [x] Yelp SHA West Hills: Yelp emailed approval on 2026-07-30. The claimed
      record has the canonical phone and
      `https://hitchcoxaesthetics.com/west-hills`.
- [x] Yelp SHA West Hills address: submitted the public-page correction on
      2026-07-30 to replace `Ste 1550 , 30` with canonical
      `#1550 Suite 30`; Yelp confirmed moderator review.
- [ ] Yelp SHA Cedar Bluff: monitor moderation of the canonical phone and
      direct `/cedar-bluff` website submitted on 2026-07-30.
- [ ] Yelp Botox Knox Bearden: monitor the newly claimed page for moderator
      approval, then submit the omitted `Suite 15B` correction.
- [ ] Verify the website on every BBB submission after its public profile is
      published.
- [ ] Treat every listing as incomplete until its public website link is opened
      and recorded in that location's Website Publication Audit.

### Facebook

- [x] Create the five standalone location Pages after Meta cleared the
      page-creation restriction on 2026-07-30:
  - Sarah Hitchcox Aesthetics - Farragut
  - Sarah Hitchcox Aesthetics - West Hills
  - Sarah Hitchcox Aesthetics - Cedar Bluff
  - Botox Knox Med Spa - Farragut
  - Knoxville Weight Loss Clinic - Farragut
- [x] Add exact canonical NAP, website, email, category, and business bio to
      each new Page. SHA location Pages use their direct location URLs; the
      two sub-brand Pages use their canonical brand websites.
- [ ] Add profile and cover images to the official SHA, Botox Knox, and
      Knoxville Weight Loss Clinic Pages.
- [ ] Ask Meta support to enable Store Locations for Business Portfolio
      `2014119969227719`. On 2026-07-29 Meta said the main SHA Page was
      ineligible because it was less than two days old, lacked a profile and
      cover image, and Store Locations is available only to clients with
      dedicated Meta support.
- [x] Record every new public Page URL in the applicable location record.
      Public Page IDs: SHA Farragut `61592888541475`, SHA West Hills
      `61592457969628`, SHA Cedar Bluff `61592881731877`, Botox Knox Farragut
      `61592359752743`, and Knoxville Weight Loss Clinic Farragut
      `61592313046404`.

Completed foundation:

- Meta Business Portfolio `Sarah Hitchcox Aesthetics`, ID `2014119969227719`, is
  active.
- The official SHA, Botox Knox Med Spa, and Knoxville Weight Loss Clinic Pages
  are owned by the portfolio.
- The main SHA Page links to Farragut, West Hills, and Cedar Bluff.
- Meta's temporary Page-creation restriction cleared on 2026-07-30 and all
  five requested standalone Pages are now public.

### Nextdoor

- [x] Recheck both existing public Pages on 2026-07-30. Bearden and Farragut
      remain publicly reachable, so the appeal/suspension has not removed the
      live citations.
- [ ] Correct the Farragut Page from the prior `102 S Campbell Station Rd`
      address to the canonical `11121 Kingston Pike, Suite E, Farragut, TN
      37934` after admin access is restored.
- [x] Recheck account access after the 2026-07-28 reinstatement appeal. On
      2026-07-29 the Farragut page was public and the business account could
      open the post composer, so the account is no longer fully suspended.
- [ ] Monitor Nextdoor support case `#29368270`. Support requested identity
      confirmation on 2026-07-29. Sarah replied from the business inbox on
      2026-07-30 confirming that she submitted the request. Nextdoor replied
      later that day that it escalated the case to its Neighborhood Management
      team for further review and expects feedback within 24–48 hours. No appeal
      decision or restored admin access has arrived yet. The business dashboard
      previously remained blank and the attempted West Hills page was absent
      from the business-page switcher.
- [x] Check the 2026-07-29 Nextdoor verification-reminder email. It was an
      automated reminder, not an appeal decision, and its status link still
      opened the disabled-account page. No reinstatement response was found in
      the business or personal Gmail inbox.
- [ ] Determine whether the attempted West Hills Page can be recovered or must
      be recreated.
- [x] Confirm the existing SHA Bearden and Farragut public Pages still use
      canonical NAP. Both were publicly live and accurate on 2026-07-29; the
      suspended shared owner account cannot currently edit them.
- [ ] Create and record the five missing Pages:
  - SHA Cedar Bluff
  - Botox Knox Bearden
  - Botox Knox Farragut
  - Knoxville Weight Loss Clinic Bearden
  - Knoxville Weight Loss Clinic Farragut
- [ ] Recheck edit access to the SHA Bearden and Farragut Pages after the
      account is restored.

### Yelp

- [x] Yelp approved SHA West Hills by email on 2026-07-30, clearing the
      dependency Yelp support placed on the remaining submissions.
- [ ] Submit or ask Yelp support at `(877) 767-9357` to create:
  - SHA Cedar Bluff
  - Botox Knox Bearden
- [ ] Capture and record the public URLs after Yelp creates those listings.
- [x] Re-audit phone and website on all six managed Yelp listings. Each has a
      canonical non-tracking phone and the correct brand or location website.
- [x] Correct the public Yelp names for Botox Knox Farragut and both Knoxville
      Weight Loss Clinic locations. The public pages reflected the canonical
      names immediately on 2026-07-29.
- [x] Confirm Yelp accepted the `Address 2` correction for Botox Knox Farragut.
      The public listing now shows `Ste 8B`, the canonical phone, and the
      canonical website.
- [ ] Re-audit hours on all six managed Yelp listings.

## Priority 2: Finish Submitted Listings

### BBB

- [ ] Monitor all eight submitted applications for approval.
- [ ] The 2026-07-30 inbox recheck found only the generic
      `Your Free BBB Business Profile Is on Its Way` confirmation and a
      marketing email; no individual-location approval or public-profile email
      has arrived.
- [ ] Capture each public BBB profile URL when published.
- [ ] Verify canonical name, suite, phone, website, and category on every
      approved profile.
- [ ] Ask BBB to rename the two submissions made under `Weight Loss Knox` to
      `Knoxville Weight Loss Clinic` if they publish under the old name.
- [ ] Confirm whether the SHA Bearden application can manage the other SHA
      locations or whether BBB created separate profiles.

### Medical Directories

- [ ] Defer new Healthgrades, Vitals, and WebMD practice-location work until NP
      Hayley joins the practice.
- [ ] When Hayley joins, collect her full legal name, credentials, NPI, state
      license, provider email, and provider phone before starting any claims.
- [ ] Claim or correct Hayley's provider profiles, then add every applicable SHA
      practice location without removing any of her existing affiliations.
- [ ] Record every provider, practice, and location URL in a new provider record
      and the applicable location files.
- [ ] Keep Dr. Fair's existing submission history for reference, but do not
      initiate additional Vitals or WebMD work under her profile unless the
      owner explicitly reopens it.

## Priority 3: Apple And Bing

### Apple Business Connect

- [ ] Claim and correct the existing SHA Bearden listing.
- [ ] Claim and correct the existing SHA Farragut listing.
- [ ] Monitor BrightLocal publication for SHA West Hills and Cedar Bluff, then
      claim both.
- [ ] Create or locate Botox Knox Bearden.
- [ ] Claim the existing Botox Knox Farragut listing.
- [ ] Claim the existing Knoxville Weight Loss Clinic Bearden listing.
- [ ] Create or locate Knoxville Weight Loss Clinic Farragut.
- [ ] Use the business Apple ID from 1Password and record the Apple place ID and
      public URL for each location.

### Bing Places

- [ ] Establish access through an owned Sarah Hitchcox Aesthetics Microsoft
      account. On 2026-07-29, `sarah@hitchcoxaesthetics.com` was not recognized
      as a Microsoft account, and the only Google sign-in offered belonged to
      the third-party HEP account. Do not use that third-party account.
- [ ] Replace tracking phones with canonical phones on SHA Bearden and Farragut.
- [ ] Replace the tracking phone on Knoxville Weight Loss Clinic Bearden.
- [ ] Add `https://weightlossknoxvilletn.com` to Knoxville Weight Loss Clinic
      Bearden; its public Bing listing had no visible website on 2026-07-29.
- [ ] Audit imported listings for SHA West Hills and Cedar Bluff.
- [ ] Locate or create Botox Knox Bearden and Farragut.
- [ ] Locate or create Knoxville Weight Loss Clinic Farragut.
- [ ] Record every Bing public URL or listing ID after correction.

## Priority 4: Citation Cleanup

- [ ] MedSpa Compass: monitor the 2026-07-30 bulk request for all eight
      canonical records. Knoxville was absent from the publisher's city
      selector, so the request asks the publisher to add Knoxville/Farragut and
      create all eight records. Capture and verify every public URL returned.
- [ ] Find My Cosmetic Injector: monitor the support request for the four SHA
      and two Botox Knox locations. The public registration button was broken;
      do not repeat the same form unless the publisher confirms it was fixed.
- [ ] Laser Hair Removal Nearby: monitor the standard-directory request for all
      four SHA locations. No paid featured placement was requested. Verify each
      public website link before closing the task.
- [x] ProvenExpert brand profile: activated and completed on 2026-07-30 at
      `https://www.provenexpert.com/sarah-hitchcox-aesthetics/`. The profile
      uses the canonical Bearden NAP, direct `/bearden` website, Instagram,
      accurate RN credential, and medical-spa service description. Credentials
      are in the Sarah Hitchcox Aesthetics 1Password vault.
- [ ] ProvenExpert BrightLocal records: retain and audit the four existing SHA
      location pages produced through BrightLocal and record their public URLs
      separately from the new brand profile.
- [ ] Recheck AllMedSpas only after the publisher repairs its disconnected
      submission form. The 2026-07-30 attempt failed with `The form is not
      connected to any integration`.
- [ ] Revisit GLP1 Directory and WeightLossNinja only if the publishers add a
      provider submission/contact route. Neither had a usable route on
      2026-07-30.
- [x] Bunity: purchased and activated all eight permanent dofollow profiles
      for `$24` total on 2026-07-30. Public pages and website destinations were
      verified.
- [ ] Laser Hair Removal Success: four SHA profiles were purchased for `$180`
      total on 2026-07-30 under order `L6a6bc4769891f`. Publisher review
      normally takes up to three business days; record and verify each public
      URL when the approval email arrives.
- [ ] Knoxville Moms: replace `botoxknoxville.com` and
      `sarah@botoxknoxville.com` with the canonical SHA website and email.
- [ ] Portrait Care: claim the Bearden listing and replace its non-canonical
      phone.
- [ ] JaneApp: close, redirect, or remove the legacy booking page after
      confirming account access.
- [ ] Audit the four completed BrightLocal campaigns for stale names, suite
      numbers, tracking phones, rejected submissions, and missing public URLs.
- [ ] Revisit BrightLocal rows marked `submitted`, `existing`, `updated`,
      `replaced`, or `unavailable` and record any newly published URLs.
- [ ] Audit Google Business Profile phone strategy before changing its
      tracking-phone configuration; never copy those tracking phones into other
      directories.
- [ ] Create dedicated Bearden and Farragut website location pages for Botox
      Knox and Knoxville Weight Loss Clinic if location-specific canonical URLs
      are needed for future citations.

## Intentionally Excluded

- [x] MedSpaDirectory.org: a listing is removed after its seven-day trial;
      continuing coverage costs `$75/month` for up to 10 listings.
- [x] TrustAnalytica: profile management starts at `$12.95/month` billed
      annually.
- [x] N49 paid expansion: the free profile omits a website; keep the four
      BrightLocal-produced SHA pages but do not add paid `$8/month` sub-brand
      records.
- [x] Storeboard paid expansion: keep the four BrightLocal-produced SHA pages;
      do not buy `$9/year` profiles for additional records without approval.
- [x] Bariatric Journal: only sponsored/paid placement was available.
- [x] Birdeye: not pursuing because it requires a paid subscription per
      location.
- [x] RealSelf: not pursuing as citation work. The existing free provider claim
      may remain, but direct website links are marketed as a paid feature and no
      free public SHA location listing has been confirmed.
- [x] Separate business-only profiles on Healthgrades, Vitals, and WebMD: these
      are provider-led directories and are not separate business citations.
- [x] Dr. Fair Vitals/WebMD follow-up: not pursuing further under her profile.
      Future practice-location work is deferred to Hayley's provider onboarding.

See [`PAID-CANDIDATES.md`](./PAID-CANDIDATES.md) for future purchases and
[`RETRY-FAILURES.md`](./RETRY-FAILURES.md) for publisher failures and pending
rechecks.

## Completion Rule

A task is complete only after the public page is visible and provides at least
one useful outcome: a verified business/practice location or a verified website
backlink. Record the public URL and platform ID in the location file, check
every published NAP field, verify any website link that is available, and store
logins in 1Password rather than this repository.
