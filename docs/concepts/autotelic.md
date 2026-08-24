---
summary: "Autotelic goal discovery: a stepping-stone archive hooked into heartbeat"
read_when:
  - You want the agent to surface self-proposed goals without rewriting gateway code
  - You are changing heartbeat prompt assembly or workspace goal persistence
title: "Autotelic goals"
---

# Autotelic goals

OpenClaw keeps three loops distinct:

| Loop | Role | This change |
| --- | --- | --- |
| **Autotelic** | Discover intrinsically interesting goals from workspace values | **Discovery only** |
| **Executive** | Periodic checklist in `HEARTBEAT.md` (inbox, follow-ups, check-ins) | Unchanged |
| **Evolution** | Self-mutation of gateway / agent code (DGM-style) | **Not implemented** |

This page covers the autotelic loop. It does **not** mutate gateway code, rewrite prompts in place, weaken sandbox or pairing, or auto-announce proposals to WhatsApp/Telegram.

The design is closer to competence-progress / interestingness scoring (Oudeyer-style intrinsic motivation, Voyager / OMNI-style goal archives) than to an executive to-do list. Heartbeat remains the executive path: if nothing needs attention, the model still replies `HEARTBEAT_OK`.

## What gets stored

Goals live in a stepping-stone JSON archive at:

`{workspace}/goals/archive.json`

Old goals are never dropped (`done` / `failed` / `deferred` stay on disk). Near-duplicate intents are suppressed (normalized text plus token overlap ≥ 0.85).

Each goal records `intent`, `origin` (`autotelic` or `user`), `status`, a tagged `domain`, rolling `progress`, and `evidence` snippets pointing at `USER.md` / `MEMORY.md`.

## How discovery runs

On a normal heartbeat turn, if a workspace directory is known, the runner calls `runAutotelicTick` **before** the agent turn:

1. Read `HEARTBEAT.md`, `USER.md`, `SOUL.md`, and `MEMORY.md` (missing files are empty).
2. Propose **at most one** new goal with a deterministic, non-LLM scorer.
3. Persist it if accepted.
4. Append a short **Autotelic** section to the heartbeat **user prompt** (the default `HEARTBEAT.md` instructions are not replaced).

The proposer skips when there is nothing interesting: empty user context, generic chores (`sort downloads`, `organize files`, `check inbox` unless `USER.md` clearly wants that), restatements of `HEARTBEAT.md` bullets, unmentioned domains with zero attempts, or saturated domains. If the tick throws, heartbeat logs and continues with the original prompt.

See [Heartbeat](/gateway/heartbeat) for the executive checklist and `HEARTBEAT_OK` contract.
