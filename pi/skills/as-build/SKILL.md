---
name: as-build
description: Phase 3 of the /spec → /plan → /build → /review flow. Use only when the user runs /build or explicitly asks to execute an approved plan. Runs every task in a git worktree with one fresh subagent per task and the test command as the gate. No per-task review.
---

# Build

Input: an approved plan (`Status: freigegeben`). Take the path from the request, else the newest `.specs/*/plan.md`. If it is not approved, stop.

Plan approval is the only gate. Do not ask for confirmation again. Run to the end and stop only for the blockers below.

## 1. Prepare

1. In the repo, run `git status --porcelain`. If there are changes outside `.specs/`, stop and ask whether to commit or stash them. The worktree branches from the last commit, so uncommitted work would be missing.
2. Base is the plan's `Base`, else the current branch. Worktree root: `<repo parent>/<repo name>-worktrees/`.
3. One workstream: `git worktree add <root>/<topic> -b feat/<topic> <base>`. Several workstreams: one worktree and branch `feat/<topic>-<name>` per workstream, all from the same base.
4. Resume: if the branch exists already, reuse its worktree. Tasks whose `[T<n>]` tag is in `git log` are done. Pass only the rest.
5. In each worktree, install dependencies if needed, run the verify command once, and keep the output short. A red baseline is a blocker: stop and report.

## 2. Run

Call `SubagentWorkflow` with `name: "as-build"` and these args:

```json
{
  "specPath": "<abs>", "planPath": "<abs>", "verify": "<verify command from the plan>",
  "workstreams": [{ "name": "main", "worktree": "<abs>", "branch": "feat/<topic>",
                    "tasks": [{ "id": "T1", "title": "...", "hard": false }] }]
}
```

It runs in the background. Wait for the completion notification, do not poll.

## 3. Afterwards

- **Blocked:** report the task, the reason, and the options. The user decides. Afterwards `/build` again resumes at the first missing task.
- **Several workstreams:** merge each workstream branch into `feat/<topic>` and run verify after every merge. On a conflict, stop and report.
- Check off the finished tasks in `plan.md` (main checkout). When every task is done, set `Status: gebaut <date>` and add the worktree path and branch under `Ausführung`.
- Report one line per task (commit, deviation if any), the final verify result as evidence, the worktree path, and the branch. Next step: `/review`.

Task commits are unsigned checkpoints (`git -c commit.gpgsign=false commit`), so no signing prompt interrupts the run. `/review` squashes them into one commit at the end.

Never push. Never touch the main checkout's working tree beyond `.specs/`.
