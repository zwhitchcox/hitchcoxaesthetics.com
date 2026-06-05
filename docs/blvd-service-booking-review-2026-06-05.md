# Boulevard Service Booking Review - 2026-06-05

Purpose: give Sarah a single review list for which Boulevard services should
stay customer-bookable.

Method:

- Pulled current public online-bookable services from Boulevard booking.
- Queried recent admin appointment pages and counted appointments returned from
  the last 12 months where available.
- Some high-count services are older or renamed Boulevard services that are not
  currently public online-bookable. Those are listed separately so we do not
  lose historical context.

## Most Booked Services

| Rank | Service                                            | Recent booking count | Current public category                    |
| ---- | -------------------------------------------------- | -------------------: | ------------------------------------------ |
| 1    | Weight Loss Injection \| In Person                 |                  612 | Not currently public under this exact name |
| 2    | Weight Loss Injection (In Person)                  |                  193 | Weight Loss & Wellness                     |
| 3    | Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin) |                  153 | Existing Patient - Injectables             |
| 4    | Lip Flip                                           |                   99 | Existing Patient - Injectables             |
| 5    | Weight Loss Consultation \| In Person              |                   83 | Not currently public under this exact name |
| 6    | New Client Tox (Botox/Dysport/Jeuveau/Xeomin)      |                   71 | Not currently public under this exact row  |
| 7    | Laser Hair Reduction - Large Area                  |                   62 | Laser Treatments                           |
| 8    | Consultation: Skincare/Injectables                 |                   50 | General Services                           |
| 9    | Laser Hair Reduction - Medium Area                 |                   47 | Laser Treatments                           |
| 10   | Tox/Filler Follow-Up                               |                   42 | Existing Patient - Injectables             |
| 11   | Existing Client Filler                             |                   41 | Existing Patient - Injectables             |
| 12   | New Client Tox (Botox/Dysport/Jeuveau/Xeomin)      |                   40 | New Patient - Injectables                  |
| 13   | Non-Surgical Skin Tightening                       |                   35 | Not currently public under this exact name |
| 14   | New Client Tox & Filler                            |                   25 | New Patient - Injectables                  |
| 15   | Vascular Lesion Reduction                          |                   24 | Laser Treatments                           |
| 16   | Existing Client Microneedling                      |                   21 | Aesthetic Treatments                       |
| 17   | VI Peel - Advanced                                 |                   21 | Aesthetic Treatments                       |
| 18   | Laser Hair Reduction - Small Area                  |                   20 | Laser Treatments                           |
| 19   | Lipotropic B12 Injection                           |                   20 | Weight Loss & Wellness                     |
| 20   | New Client Filler                                  |                   17 | New Patient - Injectables                  |
| 21   | Weight Loss Consultation (In-Person)               |                   17 | Weight Loss & Wellness                     |
| 22   | Touch Up Laser Treatment - Large Area              |                   15 | Laser Treatments                           |
| 23   | Existing Client Tox & Filler                       |                   14 | Existing Patient - Injectables             |
| 24   | KYBELLA                                            |                   13 | Existing Patient - Injectables             |
| 25   | Pigmented Lesion Reduction (Brown/Sun Spots)       |                   13 | Laser Treatments                           |
| 26   | Hylenex - Filler Dissolve                          |                   12 | New/Existing Patient - Injectables         |
| 27   | New Client Microneedling                           |                   10 | Aesthetic Treatments                       |
| 28   | Non-Surgical Skin Tightening (EVERESSE)            |                   10 | Not currently public under this exact name |
| 29   | Touch Up Laser Treatment - Small Area              |                   10 | Laser Treatments                           |
| 30   | VI Peel - Original                                 |                   10 | Aesthetic Treatments                       |

## Current Public Online-Bookable Services

Fill in the last column with `allow` or `hide`.

## Hard-Coded Booking UI Groups

These services are intentionally displayed as one customer-facing option and
mapped to the correct Boulevard service by the answer to "Have you been with us
before?"

| Display service | New/unsure Boulevard service ID                         | Returning Boulevard service ID                          |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Tox             | `urn:blvd:Service:b293ac32-1e70-47e7-9a6c-fcd0478aec85` | `urn:blvd:Service:ce6af60c-c8b7-464c-9c33-75ce8cc6972c` |

| Category                       | Customer-facing name in booking UI           | Boulevard service name                             | Recent booking count | Sarah decision |
| ------------------------------ | -------------------------------------------- | -------------------------------------------------- | -------------------: | -------------- |
| General Services               | Consultation: Skincare/Injectables           | Consultation: Skincare/Injectables                 |                   50 |                |
| New Patient - Injectables      | Filler Dissolve                              | Hylenex - Filler Dissolve                          |                   12 |                |
| New Patient - Injectables      | Tox                                          | New Client Tox (Botox/Dysport/Jeuveau/Xeomin)      |                  111 |                |
| New Patient - Injectables      | Tox & Filler                                 | New Client Tox & Filler                            |                   25 |                |
| New Patient - Injectables      | KYBELLA                                      | KYBELLA - New Patient                              |                    0 |                |
| New Patient - Injectables      | SkinVive                                     | New Client SkinVive                                |                    0 |                |
| New Patient - Injectables      | Filler                                       | New Client Filler                                  |                   17 |                |
| Existing Patient - Injectables | Tox/Filler Follow-Up                         | Tox/Filler Follow-Up                               |                   42 |                |
| Existing Patient - Injectables | Filler Dissolve                              | Hylenex - Filler Dissolve                          |                   12 |                |
| Existing Patient - Injectables | PRP - Injectables                            | PRP - Injectables                                  |                    0 |                |
| Existing Patient - Injectables | Lip Flip                                     | Lip Flip                                           |                   99 |                |
| Existing Patient - Injectables | Filler                                       | Existing Client Filler                             |                   41 |                |
| Existing Patient - Injectables | KYBELLA                                      | KYBELLA                                            |                   13 |                |
| Existing Patient - Injectables | Tox & Filler                                 | Existing Client Tox & Filler                       |                   14 |                |
| Existing Patient - Injectables | SkinVive                                     | Existing Client SkinVive                           |                    0 |                |
| Existing Patient - Injectables | Tox                                          | Existing Client Tox (Botox/Dysport/Jeuveau/Xeomin) |                  153 |                |
| Weight Loss & Wellness         | Weight Loss Consultation                     | Weight Loss Consultation (In-Person)               |                  100 |                |
| Weight Loss & Wellness         | Weight Loss Injection                        | Weight Loss Injection (In Person)                  |                  193 |                |
| Weight Loss & Wellness         | Lipotropic B12 Injection                     | Lipotropic B12 Injection                           |                   20 |                |
| Aesthetic Treatments           | Dermaplane Facial                            | Dermaplane Facial                                  |                    0 |                |
| Aesthetic Treatments           | VI Peel - Advanced                           | VI Peel - Advanced                                 |                   21 |                |
| Aesthetic Treatments           | VI Peel - Original                           | VI Peel - Original                                 |                   10 |                |
| Aesthetic Treatments           | Microneedling                                | Existing Client Microneedling                      |                   21 |                |
| Aesthetic Treatments           | Microneedling w/ PDGF                        | Microneedling w/ PDGF                              |                    0 |                |
| Aesthetic Treatments           | Microneedling                                | New Client Microneedling                           |                   10 |                |
| Aesthetic Treatments           | Hair Restoration I PDGF Injection            | Hair Restoration I PDGF Injection                  |                    0 |                |
| Aesthetic Treatments           | Microneedling w/ PRP                         | Microneedling w/ PRP                               |                    0 |                |
| Aesthetic Treatments           | VI Peel - Precision Plus with Peptides       | VI Peel - Precision Plus with Peptides             |                    0 |                |
| Laser Treatments               | Laser Hair Reduction - Medium Area           | Laser Hair Reduction - Medium Area                 |                   47 |                |
| Laser Treatments               | Pigmented Lesion Reduction (Brown/Sun Spots) | Pigmented Lesion Reduction (Brown/Sun Spots)       |                   13 |                |
| Laser Treatments               | Vascular Lesion Reduction                    | Vascular Lesion Reduction                          |                   24 |                |
| Laser Treatments               | Laser Hair Reduction - Large Area            | Laser Hair Reduction - Large Area                  |                   62 |                |
| Laser Treatments               | Touch Up Laser Treatment - Large Area        | Touch Up Laser Treatment - Large Area              |                   15 |                |
| Laser Treatments               | Touch Up Laser Treatment - Small Area        | Touch Up Laser Treatment - Small Area              |                   10 |                |
| Laser Treatments               | Laser Hair Reduction - Small Area            | Laser Hair Reduction - Small Area                  |                   20 |                |
| Laser Treatments               | Skin Revitalization                          | Skin Revitalization                                |                    0 |                |
| Laser Treatments               | Touch Up Laser Treatment - Medium Area       | Touch Up Laser Treatment - Medium Area             |                    0 |                |
