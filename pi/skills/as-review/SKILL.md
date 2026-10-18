---
name: as-review
description: Phase 4 of the /spec → /plan → /build → /review flow. Use only when the user runs /review or explicitly asks for the final review of a built plan. Runs code-reviewer, security-auditor and test-engineer in parallel on the branch diff and merges them into one verified verdict. Applies nothing on its own.
---

# Review

Input: a built plan. Find it per `../../references/worktrees.md#find-the-work-item`: the path or topic from the request, else the newest plan with `Status: built`. `<branch>` and `<base>` come only from the plan's `Execution` line `Branch: <branch> · Base: <base>`. Never derive the base from the current branch. If the line is missing or a value is empty, stop and ask for both. If `<branch>` is protected (`../../references/worktrees.md#terms`), stop. The worktree `<wt>` is the entry on `refs/heads/<branch>` in `git worktree list --porcelain`. If there is no such entry, or its path is `<main>`, stop and say so: review, fixes and the squash never run in the main checkout. Offer to recreate the worktree per `../../references/worktrees.md#create` (after switching `<main>` away from `<branch>` per `../../references/worktrees.md#locate-for-build`). Run every git command below with `git -C <wt>`.

Language rules: `../../references/language.md`.

## 1. Evidence

Run in `<wt>`: `git diff --stat <base>...HEAD`, `git log --oneline <base>..HEAD`, and the verify command once (short output).

## 2. Panel

Resolve `tiers` per `../../references/model-tiers.md` and add it to `args` (leave it out if nothing resolves). Call `SubagentWorkflow` with `name: "as-final-review"` and `args: { worktree: <wt>, base: <base>, specPath, planPath, tiers }`. Add `"web-performance-auditor"` to `personas` when the change affects web UI or load performance. It runs in the background. Wait for the completion notification, do not poll.

## 3. Verify and merge

- Open every critical or important finding at its file:line and confirm the failure path yourself before you list it.
- Merge per `../../references/panel-synthesis.md`. Findings two personas raise, or that you confirmed, are consensus items.
- Sort into **Act on** (would block a real PR), **Consider**, **Noted**, **Dismissed** (one line each with the reason).
- Add an acceptance table: each criterion from the spec, met, partial, or missing, with evidence.

## 4. Stop

Save the verdict to `<spec dir>/review.md`, set the plan to `Status: reviewed <date>`, then send the verdict with numbered items and end your turn. Apply nothing yet.

The user picks numbers. Fix those in the worktree, one unsigned checkpoint commit per fix tagged `[review-<n>]`, and run verify after each. No new review round unless the user asks for one.

## 5. Finish

When the user says done, squash all commits since `<base>` (the `[wip]` commit of carried changes, the `[T<n>]` and `[review-<n>]` checkpoints) into one commit in `<wt>`:

```bash
git -C <wt> branch <branch>-checkpoints     # backup of the checkpoint history
git -C <wt> reset --soft <base>             # <base> is a branch name or a full SHA
git -C <wt> commit -F <message>             # signs per the user's git config
```

Write the message from spec and plan: a conventional subject line, three to five lines of what changed for callers, and a last line such as `Spec: AC1-AC4 · Tasks: T1-T3 · Review fixes: 2`. Commit messages are always English. Check `git -C <wt> diff --quiet <branch>-checkpoints HEAD` and `git -C <wt> log --oneline <base>..HEAD` (exactly one commit) before going on.

Then offer: fast-forward the base locally, push the branch for a merge request, or keep it. After the merge, ask before removing anything. Only on a yes, remove `<wt>` (`git worktree remove <wt>`), the checkpoint branch `<branch>-checkpoints`, and any workstream worktrees and branches `<branch>-<name>`. Removing `<branch>` itself needs its own yes. Set the plan to `Status: done <date>` with the commit or merge request. Never push without being asked.
