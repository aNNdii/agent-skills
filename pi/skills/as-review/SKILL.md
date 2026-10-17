---
name: as-review
description: Phase 4 of the /spec → /plan → /build → /review flow. Use only when the user runs /review or explicitly asks for the final review of a built plan. Runs code-reviewer, security-auditor and test-engineer in parallel on the branch diff and merges them into one verified verdict. Applies nothing on its own.
---

# Review

Input: the plan (path from the request, else the newest `.specs/*/plan.md`), its worktree and feature branch from the build report, and the base from the plan.

## 1. Evidence

Run in the worktree: `git diff --stat <base>...HEAD`, `git log --oneline <base>..HEAD`, and the verify command once (short output).

## 2. Panel

Call `SubagentWorkflow` with `name: "as-final-review"` and `args: { worktree, base, specPath, planPath }`. Add `"web-performance-auditor"` to `personas` when the change affects web UI or load performance. It runs in the background. Wait for the completion notification, do not poll.

## 3. Verify and merge

- Open every critical or important finding at its file:line and confirm the failure path yourself before you list it.
- Merge per `../../references/panel-synthesis.md`. Findings two personas raise, or that you confirmed, are ✅ Konsens.
- Sort into **Act on** (would block a real PR), **Consider**, **Noted**, **Dismissed** (one line each with the reason).
- Add an acceptance table: each criterion from the spec, met, partial, or missing, with evidence.

## 4. Stop

Send the verdict with numbered items and end your turn. Apply nothing yet.

The user picks numbers. Fix those in the worktree, one commit per fix, and run verify after each. No new review round unless the user asks for one.

## 5. Finish

When the user is done, offer: merge `feat/<topic>` into the base locally, push the branch for a merge request, or keep it. Remove the worktree only after the merge (`git worktree remove`). Never push without being asked.
