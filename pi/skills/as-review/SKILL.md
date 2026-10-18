---
name: as-review
description: Phase 4 of the /spec → /plan → /build → /review flow. Use only when the user runs /review or explicitly asks for the final review of a built plan. Runs code-reviewer, security-auditor and test-engineer in parallel on the branch diff and merges them into one verified verdict. Applies nothing on its own.
---

# Review

Input: a built plan. Find it per `../../references/worktrees.md#find-the-work-item`: the path or topic from the request, else the newest plan with `Status: built`. `<branch>` and `<base>` come only from the plan's `Execution` line `Branch: <branch> · Base: <base>`. Never derive the base from the current branch. If the line is missing or a value is empty, stop and ask for both. If `<branch>` is protected (`../../references/worktrees.md#terms`), stop. The worktree `<wt>` is the worktree of `<branch>` (`../../references/worktrees.md#terms`). If there is none, or its path is `<main>`, stop and say so: review, fixes and the squash never run in the main checkout. Offer to recreate the worktree per `../../references/worktrees.md#create` (after switching `<main>` away from `<branch>` per `../../references/worktrees.md#locate-for-build`). Run every git command below with `git -C <wt>`.

Language rules: `../../references/language.md`.

Read `Commits` (`checkpoints` or `none`, default `checkpoints`) and `Final verify` from `Execution`. An older plan with only `- Verify: <cmd>` uses that command as its Final verify.

## 1. Evidence

Run in `<wt>`:

- Mode `checkpoints`: `git diff --stat <base>...HEAD` and `git log --oneline <base>..HEAD`.
- Mode `none`: `git diff --cached --stat $(git -C <wt> merge-base HEAD <base>)`. The result is staged, not committed.
- Final verify: every command on its own, all of them, as in `../as-build/SKILL.md#final-verify` step 1, with exit code and short output. A red command goes into the verdict; it starts no fix agent here.

## 2. Panel

Resolve `tiers` per `../../references/model-tiers.md` and add it to `args` (leave it out if nothing resolves). Call `SubagentWorkflow` with `name: "as-final-review"` and `args: { worktree: <wt>, base: <base>, specPath, planPath, commits, tiers }`, with `commits` from `Execution`. Add `"web-performance-auditor"` to `personas` when the change affects web UI or load performance. It runs in the background. Wait for the completion notification, do not poll.

## 3. Verify and merge

- Open every critical or important finding at its file:line and confirm the failure path yourself before you list it.
- Merge per `../../references/panel-synthesis.md`. Findings two personas raise, or that you confirmed, are consensus items.
- Sort into **Act on** (would block a real PR), **Consider**, **Noted**, **Dismissed** (one line each with the reason).
- Add an acceptance table: each criterion from the spec, met, partial, or missing, with evidence.

## 4. Stop

Save the verdict to `<spec dir>/review.md`, set the plan to `Status: reviewed <date>`, then send the verdict with numbered items and end your turn. Apply nothing yet.

The user picks numbers. Fix those in the worktree one at a time. After each fix, run Final verify as in §1. Only when it is green, take the fix: in mode `checkpoints` `git -C <wt> add -A` and one unsigned checkpoint commit tagged `[review-<n>]` (`git -C <wt> -c commit.gpgsign=false commit -m "fix: <what> [review-<n>]"`), in mode `none` `git -C <wt> add -A`. Red: fix the root cause and run Final verify again; if it stays red, leave the fix unstaged, report each red command with its output and `git -C <wt> status --porcelain`, and end your turn before the next fix, so `git add -A` never takes a red fix into the next one. No new review round unless the user asks for one.

## 5. Finish

When the user says done, turn the result into one commit in `<wt>`. Write the message from spec and plan: a conventional subject line, three to five lines of what changed for callers, and a last line such as `Spec: AC1-AC4 · Tasks: T1-T3 · Review fixes: 2`. Commit messages are always English and signed per the user's git config. First get `<onto>` per `../../references/worktrees.md#squash-base`.

Mode `checkpoints`: squash all commits since `<onto>` (the `[wip]` commit of carried changes, the `[T<n>]`, `[final]` and `[review-<n>]` checkpoints). If Squash base returns `no squash`, skip steps 1-3.

1. Backup: if `git -C <wt> rev-parse --verify --quiet refs/heads/<branch>-checkpoints` finds the branch, stop and ask; never use `-f`. Otherwise `git -C <wt> branch <branch>-checkpoints`.
2. `git -C <wt> reset --soft <onto>`, then `git -C <wt> commit -F <message>`.
3. Check `git -C <wt> diff --quiet <branch>-checkpoints HEAD` and that `git -C <wt> log --oneline <onto>..HEAD` shows exactly one commit. On a failure, stop and report; the backup holds the history.
4. `git -C <wt> rebase <base>`. On a conflict, note the files from `git -C <wt> diff --name-only --diff-filter=U`, run `git -C <wt> rebase --abort`, report the files, and end your turn.
5. Run Final verify again as in §1. Red: report each red command with its output and end your turn.

Mode `none`: ask whether to (a) commit the staged result or (b) leave it staged. Propose (a).

- (a) Record the verified index with `tree=$(git -C <wt> write-tree)`, then run step 2 (the soft reset folds a `[wip]` commit of carried changes in and keeps the index; for `no squash`, `<onto>` is HEAD). Step 3 checks `git -C <wt> diff --quiet $tree HEAD` instead of the backup comparison, plus exactly one commit. Then go on with steps 4 and 5, and drop the note "staged, not committed" from the plan if it has one.
- (b) No commit, no rebase, no cleanup. The plan stays `Status: reviewed <date>` with the note: `Status: reviewed <date> · staged, not committed`. End your turn. `/flow` offers §5 again later.

After step 5, offer: fast-forward the base locally, push the branch for a merge request, or keep it. After the merge, ask before removing anything. If `<wt>` is a flow-owned worktree (`../../references/worktrees.md#terms`): only on a yes, remove `<wt>` (`git worktree remove <wt>`), the checkpoint branch `<branch>-checkpoints` if there is one, and any workstream worktrees and branches `<branch>-<name>`. Removing `<branch>` itself needs its own yes. Otherwise offer only to remove `<branch>-checkpoints` if there is one, and say: "`<wt>` was not created by the flow: managing it is up to you." Set the plan to `Status: done <date>` with the commit or merge request. Never push without being asked.
