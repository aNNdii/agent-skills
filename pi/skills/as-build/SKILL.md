---
name: as-build
description: Phase 3 of the /spec → /plan → /build → /review flow. Use only when the user runs /build or explicitly asks to execute an approved plan. Runs every task in a git worktree with one fresh subagent per task and the test command as the gate. No per-task review.
---

# Build

Input: an approved plan (`Status: approved`). Find it per `../../references/worktrees.md#find-the-work-item`: the path or topic from the request, else the newest plan with `Status: approved`. If it is not approved, stop. `<branch>` and `<base>` come only from the plan's `Execution` line `Branch: <branch> · Base: <base>`.

Language rules: `../../references/language.md`.

Plan approval is the only gate. Do not ask for confirmation again, except for the questions `worktrees.md#locate-for-build` asks before it changes `<main>` and the stops below. Run to the end.

Two verify levels: `Verify per task` gates every task, `Final verify` checks the whole result once at the end. `<progress>` is the absolute path `<spec dir>/build-progress`, with the spec dir where Find the work item found it. The build gate appends one line `<workstream>:<Tn>` per green task. In mode `none` the line also carries the tree the gate staged: `<workstream>:<Tn> <tree>`. A task counts as listed when a line starts with `<workstream>:<Tn>`. With one workstream its name is `main`.

## 1. Prepare

1. Read `Execution`: `Verify per task`, `Final verify` (one command per backtick pair), `Commits` (`checkpoints` or `none`, default `checkpoints`), `Workstreams`, and every task's optional `Verify:`. An older plan with only `- Verify: <cmd>` uses that command for both levels: `verify` is `<cmd>`, `finalVerify` is `[<cmd>]`.
2. Check before anything runs: every command against the list "Verify commands" in `../as-plan/SKILL.md` §4 (no pipe, `||`, `;`, lone `&`, line break or backslash outside quotes, hermetic gates, lanes only in Final verify), `Commits: none` with more than one workstream, and `<progress>` inside a worktree. On any problem, stop: name each problem and propose the corrected `Execution` or task line. Write it into the plan only after the user agrees. Never rewrite an approved command silently.
3. If `<progress>` exists but `<branch>` does not, or in mode `none` `worktrees.md#locate-for-build` step 3 finds no worktree on `<branch>` (the staged state would be gone), stop and ask. Never let Locate for build create it anew. Options: restore the branch or worktree and run `/build` again, or delete `<progress>` after asking and build from T1, or abort.
4. Get the worktree `<wt>` per `../../references/worktrees.md#locate-for-build`. It finds or creates it and asks before it touches `<main>`. Never build in `<main>`.
5. Done tasks: if `<progress>` exists, exactly the tasks whose line is in it. Otherwise (older plans) the tasks whose `[T<n>]` tag is in `git -C <wt> log <base>..<branch>` (or in the workstream's branch). Then write one line `<workstream>:<Tn>` per task found this way into `<progress>`, before §2: from then on `<progress>` is the only source, so a later resume still counts them. A run with at least one done task is a resume.
6. In `<wt>`, run the build step of `worktrees.md#carried-changes`. It commits `[wip]` once or stops with the file list. Skip it on a resume in mode `none`: the index holds the green tasks, and unstaged changes are leftovers of an interrupted task. Discard nothing; the workflow tells the first open task how to handle them.
7. Several workstreams: set up their worktrees per `worktrees.md#workstreams`.
8. In each worktree, install dependencies if needed.
9. Baseline, only while no task is done: in `<wt>`, run `Verify per task` and every `Final verify` command, each on its own and always all of them, with short output. In every workstream worktree, run `Verify per task`. Any red command is a blocker before T1: stop and report each red command with its output. A resume has no baseline.
10. No open task left: skip §2 and go on with §3.

On any stop, report the state and the options (per `worktrees.md#stops-and-recovery` where it names the stop) and end your turn.

## 2. Run

Resolve `tiers` per `../../references/model-tiers.md` and add it to `args` (leave it out if nothing resolves). Call `SubagentWorkflow` with `name: "as-build"` and these args:

```json
{
  "specPath": "<abs>", "planPath": "<abs>",
  "verify": "<Verify per task>",
  "finalVerify": ["<Final verify command>", "<Final verify command>"],
  "commits": "checkpoints",
  "progressPath": "<abs spec dir>/build-progress",
  "tiers": { "high": "<provider>/<id>", "mid": "<provider>/<id>", "low": "<provider>/<id>" },
  "workstreams": [{ "name": "main", "worktree": "<wt>", "branch": "<branch>",
                    "tasks": [{ "id": "T1", "title": "...", "hard": false, "verify": "<the task's Verify:, only if it has one>" }] }]
}
```

Pass only the open tasks. With several workstreams, pass one entry per workstream with the worktree and branch from `worktrees.md#workstreams`. If the workflow throws `as-build args rejected:`, nothing ran: handle each listed problem like a failed check in §1 step 2.

It runs in the background. Wait for the completion notification, do not poll. It returns `results`, one per workstream: `{ name, branch, done, stoppedAt, reason?, report?, staleProgress? }`.

## 3. Afterwards

1. For every result with `staleProgress`, delete exactly the line that starts with it from `<progress>`: the gate also runs when a task reports blocked, and in mode `none` it may have staged the blocked task's leftovers. In mode `none`, then restore the index without touching the files: `git -C <wt> read-tree <tree>` with the tree of the last remaining line, or `git -C <wt> read-tree HEAD` when no line with a tree remains. Add `git -C <wt> diff --cached --stat` and `git -C <wt> status --porcelain` to the blocker report.
2. **Blocked** (`stoppedAt` is set): report the task, the reason, and the options, and end your turn. The user decides. Afterwards `/build` again resumes at the first task without a line in `<progress>`.
3. **Several workstreams:** merge them back per `worktrees.md#workstreams`.
4. Run the Final verify below.
5. Check off the finished tasks in `plan.md` where `worktrees.md#find-the-work-item` found it. Only when every task is done and Final verify is green, set `Status: built <date>` and add the worktree path and branch under `Execution`. Otherwise the plan stays `approved`.
6. Report one line per task (commit, or staged in mode `none`, and a deviation if any), the Final verify output per command as evidence, the worktree path, and the branch. Next step: `/review`.

### Final verify

1. In `<wt>`, run every `Final verify` command on its own, all of them even after a red one. Note the exit code and a short output per command.
2. All green: go to step 5.
3. Any red: start one fresh fix agent with the Agent tool, effort `high`, with the `high` tier model from `../../references/model-tiers.md` (leave the model out if none resolves), in `<wt>`. Give it the spec and plan paths and every red command with its output. It fixes the root cause, does not commit, stage, stash or reset, does not change verify commands or weaken tests, and downloads nothing.
4. Run every `Final verify` command again as in step 1. Still red: leave the fix unstaged, report a blocker with each red command and its output, keep the plan `approved`, and end your turn.
5. Green: in mode `checkpoints`, if the fix agent changed files, `git -C <wt> add -A` and commit `[final]` unsigned (`git -C <wt> -c commit.gpgsign=false commit -m "fix: final verify [final]"`). In mode `none`, `git -C <wt> add -A`.

Task commits are unsigned checkpoints (`git -c commit.gpgsign=false commit`), so no signing prompt interrupts the run. `/review` squashes them into one commit at the end. In mode `none` nothing is committed: the result stays staged in `<wt>`, and `/review` offers the commit.

Never push. Never commit in `<main>` or on a protected branch. `worktrees.md#locate-for-build` is the only step that changes `<main>`'s checkout, and only after the user agreed.
