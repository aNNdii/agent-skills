---
name: as-build
description: Phase 3 of the /spec → /plan → /build → /review flow. Use only when the user runs /build or explicitly asks to execute an approved plan. Runs every task in a git worktree with one fresh subagent per task and the test command as the gate. No per-task review.
---

# Build

Input: an approved plan (`Status: approved`). Find it per `../../references/worktrees.md#find-the-work-item`: the path or topic from the request, else the newest plan with `Status: approved`. If it is not approved, stop. `<branch>` and `<base>` come only from the plan's `Execution` line `Branch: <branch> · Base: <base>`.

Language rules: `../../references/language.md`.

Plan approval is the only gate. Do not ask for confirmation again, except for the questions `worktrees.md#locate-for-build` asks before it changes `<main>`. Run to the end and stop only for the blockers below.

## 1. Prepare

1. Get the worktree `<wt>` per `../../references/worktrees.md#locate-for-build`. It finds or creates it and asks before it touches `<main>`. Never build in `<main>`.
2. In `<wt>`, run the build step of `worktrees.md#carried-changes`. It commits `[wip]` once or stops with the file list.
3. Several workstreams: set up their worktrees per `worktrees.md#workstreams`.
4. Resume: tasks whose `[T<n>]` tag is in `git -C <wt> log <base>..<branch>` (or in the workstream branch) are done. Pass only the rest.
5. In each worktree, install dependencies if needed, run the verify command once, and keep the output short. A red baseline is a blocker: stop and report.

On any stop, report per `worktrees.md#stops-and-recovery` and end your turn.

## 2. Run

Call `SubagentWorkflow` with `name: "as-build"` and these args:

```json
{
  "specPath": "<abs>", "planPath": "<abs>", "verify": "<verify command from the plan>",
  "workstreams": [{ "name": "main", "worktree": "<wt>", "branch": "<branch>",
                    "tasks": [{ "id": "T1", "title": "...", "hard": false }] }]
}
```

With several workstreams, pass one entry per workstream with the worktree and branch from `worktrees.md#workstreams`.

It runs in the background. Wait for the completion notification, do not poll.

## 3. Afterwards

- **Blocked:** report the task, the reason, and the options. The user decides. Afterwards `/build` again resumes at the first missing task.
- **Several workstreams:** merge them back per `worktrees.md#workstreams`.
- Check off the finished tasks in `plan.md` where `worktrees.md#find-the-work-item` found it. When every task is done, set `Status: built <date>` and add the worktree path and branch under `Execution`.
- Report one line per task (commit, deviation if any), the final verify result as evidence, the worktree path, and the branch. Next step: `/review`.

Task commits are unsigned checkpoints (`git -c commit.gpgsign=false commit`), so no signing prompt interrupts the run. `/review` squashes them into one commit at the end.

Never push. Never commit in `<main>` or on a protected branch. `worktrees.md#locate-for-build` is the only step that changes `<main>`'s checkout, and only after the user agreed.
