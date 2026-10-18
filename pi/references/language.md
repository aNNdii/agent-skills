# Language

- Talk to the user in the user's language: every question, summary, decision message, and verdict.
- Write the prose of `spec.md`, `plan.md`, `arena.md`, and `review.md` in the user's language, and translate the template headings with it.
- Keep these in English in every language, because other phases parse them: the `Status:` values (`draft`, `approved`, `built`, `reviewed`, `done`), the header keys `Branch:`, `Base:`, `Worktree:` and `Carried changes:` with their values (see `worktrees.md#spec-header`), the plan heading `Execution` with its keys `Verify per task:`, `Final verify:`, `Commits:` (values `checkpoints`, `none`) and `Workstreams:`, the task key `Verify:`, acceptance criterion ids (`AC1`), task ids (`T1`), commit tags (`[T1]`, `[final]`, `[review-1]`, `[wip]`), the progress file `build-progress`, the note "staged, not committed", file names, branch names, and code.
- Subagents report in English. Translate what you pass on to the user.
