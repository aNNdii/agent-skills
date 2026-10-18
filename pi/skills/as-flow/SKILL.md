---
name: as-flow
description: Runs the whole /spec → /plan → /build → /review flow phase by phase from one command. Use only when the user runs /flow or explicitly asks to run or resume the full flow. Detects the current phase from the files in .specs/ and git, then runs the next phase with all its approval stops.
---

# Flow

One entry point for the four phases. The state lives in files, not in this conversation, so `/flow` resumes correctly. The command itself starts a fresh session when needed.

## 1. Find the work item

- The request names a new feature: start a new item and go to the spec phase.
- Otherwise run `../../references/worktrees.md#find-the-work-item` with the path or topic from the request, else for the newest item that is not `done`. If there are several open ones, list them and ask which one.

## 2. Detect the phase

| State in the files | Next |
|---|---|
| No `spec.md` | **as-spec**, with the request |
| `spec.md` has `Status: draft` | **as-spec**, continue: show the open points and ask for approval |
| Spec `approved`, no `plan.md`, no `arena.md` | **as-plan** |
| `arena.md` exists, no `plan.md` | **as-plan** from step 3: present the design decision from `arena.md` |
| `plan.md` has `Status: draft` | **as-plan**, continue: show the unconfirmed decisions and ask for approval |
| Plan `approved` | **as-build** (it resumes at the first task without a `[T<n>]` commit) |
| Plan `built` | **as-review** |
| Plan `reviewed` | **as-review** from step 4: open fixes, or the finish when the user says done |
| Plan `done` | Report that it is done, with the branch or merge state |

Say which phase you detected in one line, in the user's language (`../../references/language.md`), then load that skill and follow it. Every approval stop in the phase skills stays.

## 3. Between phases

The end of a phase is a stop: the spec is approved, the plan is approved, the plan is `built`, or the review verdict is sent. Do not start the next phase in the same turn. End the message with "continue with `/flow`" in the user's language, instead of the phase skill's next command.

Inside a phase, keep going in the same session: answers to open points, the design decision, and corrections continue the current phase.
