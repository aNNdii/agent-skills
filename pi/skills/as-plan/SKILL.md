---
name: as-plan
description: Phase 2 of the /spec → /plan → /build → /review flow. Use only when the user runs /plan or explicitly asks to plan an approved spec. Runs a design arena (competing designs, cross-judge, graft), lets the user decide conflicts, writes the design and a task plan, then stops for approval.
---

# Plan

Input: an approved spec. Find it per `../../references/worktrees.md#find-the-work-item`: the path or topic from the request, else the newest approved `spec.md`. If its status is not `approved`, stop and say so.

Then run `../../references/worktrees.md#working-directory` with the spec's `Branch:` line. Recon, the size check, the arena and the design check all read the code in `<wd>`.

No product code in this phase. Language rules: `../../references/language.md`.

## 1. Size check

If the change is one or two files with an obvious approach, skip the arena. Write a short plan directly (design in five lines plus tasks), say you skipped it and why, and go to step 4.

## 2. Design arena

Resolve `tiers` per `../../references/model-tiers.md` and add it to `args` (leave it out if nothing resolves). Call `SubagentWorkflow` with `name: "as-design-arena"` and `args: { specPath, repo, redFlagsPath, tiers }`, where `repo` is `<wd>` and `redFlagsPath` is the absolute path of `../../references/design-red-flags.md`. It runs in the background. Wait for the completion notification, do not poll.

The default lenses are minimal, domain, and caller. When the spec suggests sharper angles (say "offline-first" against "server-authoritative"), pass `lenses` with two or three structurally different briefs instead.

## 3. Compare, then let the user decide

The judge and you recommend. The user decides. Never settle a design conflict silently.

First save the arena result to `<spec dir>/arena.md`: per candidate the summary, usage, types, and tasks, then the judge's scores, base, grafts, and forks with their examples. A later session resumes the design decision from this file.

Read every candidate and the judge's verdict in full. Score against the judge's rubric yourself. Then:

- **Converged, no forks, and you agree with the judge:** go to step 4. List the grafts as decisions in the plan so the user can veto them.
- **Otherwise (the candidates differ in shape, the judge lists forks, or you disagree with the judge): stop here, before writing tasks.** Send a design decision message:
  1. Per candidate, 3-4 lines: the shape, its strength, its weakness, the judge's scores.
  2. The conflicts per `../../references/panel-synthesis.md` as split items. Each has options A and B with who backs them (candidate, judge, you), a concrete example per option, the judge's recommendation, and yours. If you disagree with the judge, say so in that item.
  3. The proposed grafts, numbered, so the user can accept or drop each.

  Ask the user to decide and end your turn. Write the plan only from the user's answers.
- If the candidates diverge wildly, the spec leaves something open. Name the open spec point in the message. Do not average designs.

When you write the design, graft by hand so the result stays one coherent shape. Check it against the real code: the named files and functions exist, and the signatures fit the call sites.

## 4. Write the plan

Write `<spec dir>/plan.md`. Not committed.

```markdown
# Plan: <title>
Status: draft · Spec: spec.md

## Design
Usage (2-3 real call sites) → types and signatures → module map → data flow.
Signatures as code, bodies `not implemented`.

## Decisions
| Question | Chosen | Rejected | Why | Decided by |
(Decided by: user, consensus, or recommendation (unconfirmed))

## Execution
- Verify per task: `<fast, hermetic test command, with a terse reporter>`
- Final verify: `<cmd>`, `<cmd>`   (every command in its own backticks; the full CI selection plus slow lanes)
- Branch: <branch> · Base: <base>   (the spec's `Branch:` line, copied verbatim per `worktrees.md#spec-header`)
- Commits: checkpoints | none   (default checkpoints; none builds without commits and leaves the result staged)
- Workstreams: one | <name: tasks, files> (only for disjoint files)

## Tasks
### T1: <verb phrase>
- Acceptance: <AC reference, concrete>
- Files: ...
- Depends on: —
- Hard: yes   (only for subtle logic; gets more reasoning)
- Verify: `<cmd>`   (optional; replaces Verify per task for this task and must cover its new tests)

## Coverage
AC1 → T1, T3 · AC2 → T2

## Risks
```

There is no worktree line: `worktrees.md#locate-for-build` finds the worktree of `<branch>` wherever it is.

Verify commands (Verify per task, Final verify, and a task's `Verify:`):
- No pipe, no `||`, no `;`, no lone `&`, no line break and no backslash outside quotes. `--pattern='a|b'`, `&&` and `2>&1` are fine. The build gate chains its own steps (staging, the progress line) after the command with `&&`, so `a || b` would stage and record progress even when `a` is red. The build workflow rejects such commands.
- The exit code comes from the test runner itself. Nothing after it may swallow a failure.
- Use the runner's quiet or terse reporter flags so a failure fits in a short output.
- Select tests the way CI does. If CI runs one process per file, so does the command.
- A path filter must already match on the base and must pick up the new test files the tasks add. Check it against the base before you write it down.
- Task gates are hermetic: no network, no downloads, no services to start. Agents may not install tools or browsers.
- Browser, integration, and E2E lanes go only into Final verify, never into Verify per task or a task's `Verify:`.
- A gate that runs longer than 10 minutes is aborted and counts as red. Long lanes go into Final verify.
- `Commits: none` requires `Workstreams: one`.

Task rules:
- Vertical slices: one complete path per task, not layers. Each task ends in a passing test and one checkpoint (a commit, or with `Commits: none` the staged state).
- At most about five files per task. Order by dependency.
- Every acceptance criterion is covered by at least one task (the coverage line).
- Use more than one workstream only when the file sets are disjoint and no task depends across workstreams. Otherwise use one workstream.

## 5. Stop for approval

Send: the plan path, the design in 5-8 lines, the decisions table, every decision still marked "recommendation (unconfirmed)" as a numbered item, and the tasks one line each. Ask whether to approve or correct, and end your turn.

On approval: set `Status: approved <date>` and name the next step: `/build <plan path>`. The command starts a fresh session itself when needed.
