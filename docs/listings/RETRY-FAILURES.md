# Directory Retry Queue

Last reviewed: 2026-08-03

## Publisher Failures

| Directory | Scope | Failure | Retry condition |
|---|---|---|---|
| AllMedSpas | Applicable med-spa records | Submission returned `The form is not connected to any integration`. | Retry after the publisher repairs the submission form or provides a working support route. |
| GLP1 Directory | Two Knoxville Weight Loss Clinic records | No provider registration, add-business, or contact route was available. | Recheck quarterly or when the publisher adds a submission route. |
| WeightLossNinja | Two Knoxville Weight Loss Clinic records | Site was unavailable and no publisher submission route could be verified. | Retry when the site and publisher contact path are available. |
| Find My Cosmetic Injector | Four SHA and two Botox Knox records | The public registration button was broken. A support request covering all six records is pending. | Retry when support responds or the registration flow is repaired. |
| ThreeBestRated | Knoxville med-spa application | Publisher rejected the application by email on 2026-08-03. | Reapply no earlier than 2026-11-03 after confirming which brand submissions the rejection covered. |

## Pending Rechecks

| Directory | Scope | Current state | Next action |
|---|---|---|---|
| Laser Hair Removal Success | Four SHA records | Paid under order `L6a6bc4769891f`; publisher review pending. | Check the business inbox after three business days, record every public URL, and verify each website link. |
| MedSpa Compass | All eight records | Knoxville city support is live and the SHA Bearden profile was published; seven records remain. | Claim/correct Bearden, submit the remaining seven individually, and verify every public website link. |
| Laser Hair Removal Nearby | Four SHA records | Standard free-directory request submitted. | Record and verify the public pages if approved. |
| Bunity profile completion | All eight records | Listings and website links are live; descriptions and photos remain incomplete because the rich-text editor was not accessible during setup. | Retry profile enrichment without changing canonical NAP or website destinations. |
