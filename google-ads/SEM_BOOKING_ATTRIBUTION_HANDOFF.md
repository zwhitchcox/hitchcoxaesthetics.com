# SEM Booking Attribution Handoff

This is the short handoff summary for paid media and SEO reporting.

## Events Available

- `booking_funnel_entered`
- `booking_step_viewed`
- `booking_completed`

`booking_step_viewed` includes:

- `step = service`
- `step = location`
- `step = schedule`
- `step = details`
- `step = reserve`
- `step = success`

## Main Attribution Fields

- `traffic_channel`
- `traffic_source_detail`
- `traffic_platform`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `gclid`
- `gbraid`
- `wbraid`
- `msclkid`
- `fbclid`

## Meaning Of The Main Attribution Fields

- `traffic_channel` is the broad reporting bucket
- `traffic_source_detail` is the practical source label to use in reporting
- `traffic_platform` is the platform family

Examples:

- `paid_search` / `google_ads` / `google`
- `paid_search` / `bing_ads` / `bing`
- `paid_social` / `meta_ads` / `meta`
- `organic_search` / `seo_google` / `google`
- `gmb` / `google_business_profile` / `google`
- `direct` / `direct` / null
- `referral` / `referral` / null

## Pre-Book Behavior Fields

- `book_entry_from_path`
- `book_entry_path`
- `initial_landing_path`
- `initial_landing_search`
- `initial_referrer`
- `initial_referring_domain`
- `pages_visited_before_book`
- `unique_pages_before_book`
- `pages_before_book_bucket`
- `pre_book_duration_ms`
- `pre_book_duration_seconds`
- `pre_book_duration_bucket`

These fields answer:

- what page got the user into booking
- what page they first landed on
- how long they were on site before entering booking
- how many pages they visited before entering booking

## Booking Context Fields

- `booking_service_name`
- `booking_service_id`
- `booking_service_category`
- `booking_location_name`
- `booking_location_id`
- `booking_is_telehealth`
- `booking_requires_card`
- `booking_has_verified_client`
- `booking_saved_payment_method_count`
- `booking_selected_payment_method_type`
- `booking_value_usd`
- `appointment_count`

These fields answer:

- which service or category converted
- whether the booking was telehealth
- whether card requirement may have created friction
- whether the person was a verified returning client

## Best Reporting Dimensions

Use these first:

- `traffic_source_detail`
- `traffic_channel`
- `book_entry_from_path`
- `initial_landing_path`
- `booking_service_category`
- `booking_service_name`
- `booking_requires_card`
- `pages_before_book_bucket`
- `pre_book_duration_bucket`

## UTM Standards

### Google Ads

Use:

```text
utm_source=google
utm_medium=cpc
utm_campaign=<campaign_name>
utm_content=<ad_group_or_ad_name>
utm_term=<keyword>
```

Keep Google auto-tagging enabled so `gclid` is still available.

### Meta Ads

Use:

```text
utm_source=meta
utm_medium=paid_social
utm_campaign=<campaign_name>
utm_content=<ad_set_or_ad_name>
```

### Google Business Profile

Use tagged URLs or GBP will get mixed into normal Google organic.

Website link:

```text
https://hitchcoxaesthetics.com/?utm_source=google&utm_medium=organic&utm_campaign=gmb&utm_content=website_button
```

Booking link:

```text
https://hitchcoxaesthetics.com/book?utm_source=google&utm_medium=organic&utm_campaign=gmb&utm_content=booking_button
```

### Email

Use:

```text
utm_source=<platform_name>
utm_medium=email
utm_campaign=<campaign_name>
```

### SMS

Use:

```text
utm_source=<platform_name>
utm_medium=sms
utm_campaign=<campaign_name>
```

## Questions The Current Data Can Answer

- Which source starts the booking funnel?
- Which source completes bookings?
- Which page sends users into `/book`?
- Which services convert best?
- Which services drop off during schedule, details, or reserve?
- Does requiring a card reduce completion rate?
- Does GBP outperform SEO or paid search?
- Do warmer visitors convert better than quick visitors?

## Important Constraint

GBP attribution is only reliably separated from regular Google organic when the
GBP links are UTM tagged.
