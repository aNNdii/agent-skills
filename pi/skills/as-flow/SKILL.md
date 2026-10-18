---
name: as-flow
description: Runs the whole /spec → /plan → /build → /review flow phase by phase from one command. Use only when the user runs /flow or explicitly asks to run or resume the full flow. Detects the current phase from the files in .specs/ and git, then runs the next phase with all its approval stops.
---

# Flow

One entry point for the four phases. The state lives in files, not in this conversation, so `/flow` resumes correctly in a fresh session.

## 1. Find the work item

- The request names a new feature: start a new item and go to the spec phase.
- Otherwise run `../../references/worktrees.md#find-the-work-item` with the path or topic from the request, else for the newest item that is not `done`. If there are several open ones and Find the work item did not pick one by its `Branch:` line, list them and ask.

## 2. Detect the phase

| State in the files | Next |
|---|---|
| No `spec.md` | **as-spec**, with the request |
| `spec.md` has `Status: draft` | **as-spec**, continue: show the open points and ask for approval |
| Spec `approved`, no `plan.md`, no `arena.md` | **as-plan** |
| `arena.md` exists, no `plan.md` | **as-plan** from step 3: present the design decision from `arena.md` |
| `plan.md` has `Status: draft` | **as-plan**, continue: show the unconfirmed decisions and ask for approval |
| Plan `approved` | **as-build** (it resumes at the first task without a line in `<spec dir>/build-progress`, or, while that file is missing, without a `[T<n>]` commit; with no open task left it goes straight to the Final verify) |
| Plan `built` | **as-review** (`built` means the Final verify was green) |
| Plan `reviewed` with the note `staged, not committed` | **as-review** from step 5: offer again to commit the staged result or leave it staged |
| Plan `reviewed` | **as-review** from step 4: open fixes, or the finish when the user says done |
| Plan `done` | Report that it is done, with the branch or merge state |

Say which phase you detected in one line, in the user's language (`../../references/language.md`), then load that skill and follow it. Every approval stop in the phase skills stays.

## 3. Between phases

When the user passes a stop (approves the spec, decides the design, approves the plan), continue directly with the next phase in the same turn. Before `/build`, recommend a fresh session with `/flow` when this conversation is already long, since everything needed is in the files.
