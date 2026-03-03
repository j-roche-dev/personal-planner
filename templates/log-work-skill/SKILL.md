---
name: log-work
description: Log session work to the personal planner — updates checklist and daily log (~30 sec)
disable-model-invocation: true
---

# Log Work

Quick end-of-session command to log what was done back to the personal planner. Auto-summarizes the session, matches checklist items, handles billing, and updates the daily log.

Usage: `/log-work [optional-area]`

## Setup

1. Copy this file to `~/.claude/skills/log-work/SKILL.md`
2. Configure the MCP server globally:
   ```
   claude mcp add --scope user personal-planner -- node <path-to-your-planner>/build/index.js
   ```
3. Restart Claude Code

## Step 1 — Prerequisite Check

Call `ping` to verify the personal-planner MCP server is reachable.

If it fails, show:
```
Personal planner MCP server not available.
Setup: claude mcp add --scope user personal-planner -- node <path-to-your-planner>/build/index.js
Then restart Claude Code.
```
Stop here if ping fails.

## Step 2 — Detect Work Area

Resolve the area using this priority order:

1. **Argument**: If `$ARGUMENTS` is a recognized area (e.g. `work`, `fitness`, `personal`), use it directly.
2. **`.planner` file**: Check for `.planner` in the current project root. Parse it as JSON, use the `area` field.
3. **`.claude/planner.json`**: Check for `.claude/planner.json` in the current project root as a fallback.
4. **Infer from context**: Look at the conversation — files touched, topics discussed, project name — and make a best guess.
5. **Ask**: If still unclear, ask the user.

## Step 3 — Summarize and Match Checklist

- Scan the conversation for what was accomplished.
- Compose a 1-2 sentence summary of the work done.
- If the session was purely exploratory (no code changes, just reading/searching), ask: "This looks like exploration with no code changes. Still want to log it?"
- Fetch today's checklist via `checklist_get`.
- Find incomplete items whose text matches the work done (fuzzy match on keywords/intent, not exact string match).
- Present a single confirmation block:

```
Area: work
Summary: "Fixed authentication bug in login flow and added retry logic"
Checklist match: "Fix login auth bug" — mark complete?

Confirm, or adjust?
```

- Wait for user confirmation before proceeding.
- If no checklist items match, show the summary without a checklist match line.

**Multi-area sessions**: If work clearly spans multiple areas, present each as a separate entry in the confirmation block and process them sequentially.

## Step 4 — Billing (Billable Areas Only)

Configure billing rules per your billable areas. For each billable area, ask "Hours and a billing note?" when completing items. Skip billing for non-billable areas (personal, fitness, etc.).

## Step 5 — Execute Updates

1. If a checklist item was matched and confirmed: call `checklist_update` with `completed: true` (plus `completionNote` and `billableHours` if billing was collected).
2. Fetch the current daily log via `daily_log_get` to get existing `actualHighlights`. **Critical**: the API replaces the array, it does not append.
3. Call `daily_log_update` with `actualHighlights: [...existing, newSummary]`.
4. Brief confirmation: "Logged: [summary]." and if a checklist item was marked complete, add "Checklist item marked complete."

## Tone

Fast, no-nonsense. No greetings, no preamble. Get in, confirm, log, done.
