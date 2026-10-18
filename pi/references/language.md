# Language

- Talk to the user in the user's language: every question, summary, decision message, and verdict.
- Write the prose of `spec.md`, `plan.md`, `arena.md`, and `review.md` in the user's language, and translate the template headings with it.
- Keep these in English in every language, because other phases parse them: the `Status:` values (`draft`, `approved`, `built`, `reviewed`, `done`), the header keys `Branch:`, `Base:` and `Carried changes:` with their values (see `worktrees.md#spec-header`), acceptance criterion ids (`AC1`), task ids (`T1`), commit tags (`[T1]`, `[review-1]`, `[wip]`), file names, branch names, and code.
- Subagents report in English. Translate what you pass on to the user.
