# PostHog Booking Playbook

This file is the implementation guide for the current custom Boulevard booking
analytics.

## What Exists

The site now sends these PostHog events:

- `marketing_page_viewed`
- `book_cta_clicked`
- `phone_cta_clicked`
- `booking_funnel_entered`
- `booking_step_viewed`
- `booking_completed`

`booking_step_viewed` uses the `step` property with these values:

- `service`
- `location`
- `schedule`
- `details`
- `reserve`
- `success`

## Dashboard

Create a PostHog dashboard called `Booking Funnel - Attribution`.

Add these insights.

### 1. Entry To Completion Funnel

Type: Funnel

Steps:

1. `booking_funnel_entered`
2. `booking_completed`

Breakdown options to save as separate insights:

- `traffic_source_detail`
- `traffic_channel`
- `traffic_platform`
- `book_entry_from_path`
- `initial_landing_path`
- `booking_service_category`

Use this to answer:

- Which channels actually create completed bookings?
- Which entry pages push users into the booking flow?
- Which service categories convert best after entering booking?

Additional saved variants worth keeping on the dashboard:

- `Entry To Completion - LP Entry by Source Detail`
- `Entry To Completion - Non-LP Entry by Source Detail`

Also save these page-type views:

- `Entry To Completion - Entry Page Prefix Type`
- `Entry To Completion - Entry Page Type`

These use the derived `book_entry_page_prefix_type` and `book_entry_page_type`
properties so the comparison is declarative instead of regex-based.

### 1b. CTA Click Likelihood

Type: Funnel

Funnels:

1. `marketing_page_viewed`
2. `book_cta_clicked`

and

1. `marketing_page_viewed`
2. `phone_cta_clicked`

Save these breakdowns:

- `initial_landing_page_prefix_type`
- `current_page_type`

Save these source-filtered variants:

- `Book CTA Click Funnel - LP Landing by Source Detail`
- `Book CTA Click Funnel - Non-LP Landing by Source Detail`
- `Phone CTA Click Funnel - LP Landing by Source Detail`
- `Phone CTA Click Funnel - Non-LP Landing by Source Detail`

Use this to answer:

- Are `/lp` visitors more likely to click Book Online than non-`/lp` visitors?
- Are `/lp` visitors more likely to click the phone CTA than non-`/lp` visitors?
- Does that relationship hold once you compare within the same traffic source?

### 2. Full Booking Step Funnel

Type: Funnel

Steps:

1. `booking_step_viewed` where `step = service`
2. `booking_step_viewed` where `step = location`
3. `booking_step_viewed` where `step = schedule`
4. `booking_step_viewed` where `step = details`
5. `booking_step_viewed` where `step = reserve`
6. `booking_completed`

Breakdown options to save as separate insights:

- `traffic_source_detail`
- `booking_service_name`
- `booking_service_category`
- `booking_is_telehealth`
- `booking_requires_card`
- `booking_has_verified_client`

Use this to answer:

- Which service types stall in scheduling?
- Does telehealth behave differently from in-person booking?
- Are card-required bookings dropping harder in the reserve step?
- Do verified returning clients convert better than cold visitors?

### 3. Booking Entry Trends

Type: Trends

Event:

- `booking_funnel_entered`

Breakdown options to save as separate insights:

- `traffic_source_detail`
- `traffic_channel`
- `initial_landing_path`

Use this to answer:

- Which campaigns drive booking intent?
- Which landing pages create the most booking starts?

### 4. Booking Completion Trends

Type: Trends

Event:

- `booking_completed`

Breakdown options to save as separate insights:

- `traffic_source_detail`
- `traffic_channel`
- `booking_service_category`
- `booking_service_name`

Use this to answer:

- Which campaigns create actual bookings, not just starts?
- Which service lines are producing completions?

### 5. Pre-Book Quality Funnel

Type: Funnel

Steps:

1. `booking_funnel_entered`
2. `booking_completed`

Breakdown options to save as separate insights:

- `pages_before_book_bucket`
- `pre_book_duration_bucket`

Use this to answer:

- Do fast visitors convert better than long researchers?
- Do users who browse multiple pages convert better?

### 6. Service-Level Revenue Proxy Trend

Type: Trends

Event:

- `booking_completed`

Display:

- Use `Sum of property` on `booking_value_usd` if useful in your PostHog plan

Breakdown options to save as separate insights:

- `booking_service_category`
- `booking_service_name`
- `traffic_source_detail`

Use this to answer:

- Which sources drive the highest estimated booking value?
- Which services generate the most modeled booking value?

## Saved Breakdowns

These are the main properties worth using as saved breakdowns across multiple
insights:

- `traffic_source_detail`
- `traffic_channel`
- `traffic_platform`
- `book_entry_from_path`
- `initial_landing_path`
- `booking_service_category`
- `booking_service_name`
- `booking_is_telehealth`
- `booking_requires_card`
- `booking_has_verified_client`
- `pages_before_book_bucket`
- `pre_book_duration_bucket`

## Recommended Filters

Save these common filters as copies of the same funnel:

- `booking_service_category = Injectables`
- `booking_service_category = Weight Loss`
- `booking_is_telehealth = true`
- `traffic_source_detail = google_ads`
- `traffic_source_detail = google_business_profile`
- `traffic_source_detail = seo_google`
- `traffic_source_detail = meta_ads`

## User Paths

Create a `User Paths` report starting from `booking_funnel_entered`.

Break down by:

- `traffic_source_detail`
- `book_entry_from_path`

This is useful for seeing whether people typically enter booking from:

- service pages
- landing pages
- homepage
- weight-loss pages

## How To Read The Attribution Fields

- `traffic_channel` is the broad bucket
- `traffic_source_detail` is the practical reporting label
- `traffic_platform` is the platform family

Examples:

- `traffic_channel = paid_search`, `traffic_source_detail = google_ads`,
  `traffic_platform = google`
- `traffic_channel = gmb`, `traffic_source_detail = google_business_profile`,
  `traffic_platform = google`
- `traffic_channel = organic_search`, `traffic_source_detail = seo_google`,
  `traffic_platform = google`
- `traffic_channel = paid_social`, `traffic_source_detail = meta_ads`,
  `traffic_platform = meta`

## Tagging Rules

These rules keep attribution clean.

### Google Ads

- Keep auto-tagging on so `gclid` is present.
- Also add UTMs for readability.

Recommended pattern:

```text
utm_source=google
utm_medium=cpc
utm_campaign=<campaign_name>
utm_content=<ad_group_or_ad_name>
utm_term=<keyword>
```

### Meta Ads

Recommended pattern:

```text
utm_source=meta
utm_medium=paid_social
utm_campaign=<campaign_name>
utm_content=<ad_set_or_ad_name>
```

### Google Business Profile

Use UTM-tagged URLs for both the website link and any booking link.

Recommended website link:

```text
https://hitchcoxaesthetics.com/?utm_source=google&utm_medium=organic&utm_campaign=gmb&utm_content=website_button
```

Recommended booking link:

```text
https://hitchcoxaesthetics.com/book?utm_source=google&utm_medium=organic&utm_campaign=gmb&utm_content=booking_button
```

Without that tagging, GBP traffic can blend into normal Google organic.

### Email And SMS

Recommended patterns:

```text
utm_source=klaviyo
utm_medium=email
utm_campaign=<campaign_name>
```

```text
utm_source=attentive
utm_medium=sms
utm_campaign=<campaign_name>
```

## Core Questions This Setup Can Answer

- Which source starts the most bookings?
- Which source completes the most bookings?
- Which pages push users into `/book`?
- Which service categories have the worst step drop-off?
- Does requiring a card reduce completion rate?
- Do returning verified clients outperform first-time users?
- Does GBP traffic behave differently from SEO or Google Ads?

## Notes

- Local development still does not send PostHog events unless PostHog is enabled
  in `app/root.tsx`.
- Funnel and trend insights can now be synced from this repo with
  `pnpm posthog:sync` and `pnpm posthog:sync:apply`.
- The current dashboard config lives at
  `google-ads/posthog-booking-attribution.yaml`.
- Sync script usage and conventions live in `google-ads/POSTHOG_SYNC.md`.
- The current YAML is also allowed to prune undeclared PostHog dashboards and
  insights, so treat it as the source of truth before applying.
