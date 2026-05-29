# Retell Booking Test Agent

This adds a separate Retell test agent for Boulevard booking. It does not alter existing Retell agents.

## Local Test URLs

The custom function endpoints are:

- `POST /resources/retell-booking/services`
- `POST /resources/retell-booking/availability`
- `POST /resources/retell-booking/book`
- `POST /resources/retell-callrail/spam`

They accept Retell's normal `{ name, call, args }` body or an args-only JSON body.

## Environment

Required for Boulevard:

- `BLVD_API_KEY`
- `BLVD_BUSINESS_ID`

Required to create the Retell test agent:

- `RETELL_API_KEY`
- `RETELL_AGENT_WEBHOOK_BASE_URL`, for example an ngrok HTTPS URL

Optional:

- `RETELL_TOOL_SHARED_SECRET`; if set, Retell tool requests must send it as `x-retell-tool-secret` or `Authorization: Bearer ...`
- `RETELL_TEST_AGENT_VOICE_ID`; defaults to `11labs-Adrian`
- `RETELL_TEST_AGENT_MODEL`; defaults to `gpt-5.1`
- `RETELL_TEST_PHONE_NUMBER`; defaults to `+18653389694`

## Setup

For day-to-day testing, run:

```sh
pnpm run retell:booking:dev
```

That command starts the local app if needed, starts ngrok if needed, writes the current ngrok URL to `.env`, patches the Retell LLM tool URLs, binds the Retell phone number to the test agent, and runs a Botox lookup smoke test. Leave it running while testing calls.

To create a fresh Retell test agent instead:

```sh
pnpm exec tsx scripts/retell-create-booking-agent.ts
```

The script prints the new `agent_id` and `llm_id`.

## Manual Endpoint Checks

```sh
curl -X POST http://localhost:3000/resources/retell-booking/services \
  -H 'Content-Type: application/json' \
  -d '{"service_query":"botox"}'

curl -X POST http://localhost:3000/resources/retell-booking/availability \
  -H 'Content-Type: application/json' \
  -d '{"service_query":"botox","location_query":"bearden","days":7,"limit":3}'
```

Only call `/resources/retell-booking/book` when intentionally testing a real booking, because it checks out a live Boulevard appointment.
