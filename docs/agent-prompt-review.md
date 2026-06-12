# Monthly AI receptionist mistake review

This is a procedure for Claude (or a human) to run roughly once a month. Zane
kicks it off by saying something like "do the agent prompt review". The goal:
look at every analyzed call where the AI receptionist made a mistake or
frustrated the caller, find patterns, and turn them into concrete prompt
improvements.

## Where the data lives

- `CallRailCall` rows (SQLite via Prisma) hold the AI analysis of each call:
  - `analysisJson` - full analysis (tags, summary, reasons)
  - `lostReason` - why a caller hung up unsatisfied
  - `frustrationReason` - what frustrated them about the AI
  - `agentFixSuggestion` - the analyzer's own suggested fix
  - `mistakeReviewedAt` - set once a call has been reviewed here. This is how we
    track which calls were already checked. NEVER review the same call twice;
    NEVER set this field without actually reviewing the call.
- The agent prompt is built in code: `scripts/retell-booking-agent-config.ts`
  (`buildRetellBookingPrompt`), and deployed with `pnpm retell:booking:deploy`
  (see `docs/retell-booking-agent.md`).
- Full transcripts come from the Retell API
  (`GET https://api.retellai.com/v2/get-call/{call_id}`, key in
  `RETELL_API_KEY`; link from `RetellCallOutcome.callrailCallId` ->
  `retellCallId`).

## Procedure

1. Pull the unreviewed mistake calls. In production this means the live DB
   (Fly/LiteFS); locally you can query through a script with Prisma:

   ```ts
   const calls = await prisma.callRailCall.findMany({
   	where: {
   		analyzedAt: { not: null },
   		mistakeReviewedAt: null,
   		OR: [
   			{ frustrationReason: { not: null } },
   			{ agentFixSuggestion: { not: null } },
   			{ lostReason: { not: null } },
   		],
   	},
   	orderBy: { startedAt: 'asc' },
   })
   ```

   Also include calls whose `analysisJson` has a non-empty `tags.agent_mistake`
   array (the columns above usually cover them, but check).

2. For each call, read the analysis and, when the mistake is unclear, pull the
   Retell transcript and read the actual exchange. Confirm the mistake is real
   (the analyzer can be wrong - that itself is worth noting).

3. Group the confirmed mistakes by failure mode (misheard service, failed
   transfer, wrong information, could not find a bookable service, ignored
   request, etc.) and count them.

4. For each failure mode with more than one occurrence, propose a specific edit
   to `buildRetellBookingPrompt` in `scripts/retell-booking-agent-config.ts`.
   Quote the calls that motivated it. Prefer small, testable instructions over
   broad rules. Do not deploy without Zane's approval.

5. After reviewing, stamp the calls:

   ```ts
   await prisma.callRailCall.updateMany({
   	where: { callrailCallId: { in: reviewedIds } },
   	data: { mistakeReviewedAt: new Date() },
   })
   ```

6. Append a dated entry to the review log below: how many calls were reviewed,
   the failure-mode counts, what prompt changes were proposed or made, and
   anything to watch next month.

## Review log

(no reviews yet)
