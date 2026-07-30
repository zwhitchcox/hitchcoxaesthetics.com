# Website AI chat: hand-maintained facts

This file is for Sarah and Zane. Add plain-English facts the website AI chat
assistant should know that are not on the website: policies, parking, current
specials, seasonal hours, anything. One fact per bullet, no special format.

These facts are folded into the chat agent's prompt AFTER the generated
website knowledge, and the agent is told to trust this file when the two
conflict. After editing, apply the change by running:

```
pnpm exec tsx scripts/retell-deploy-chat-agent.ts
```

## Facts

- Example: Free parking is available directly in front of both offices.
- Example: New clients should arrive 10 minutes early to fill out intake forms.
