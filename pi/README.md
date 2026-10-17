# pi flow

This fork adds a pi layer on top of [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Everything pi-specific lives in `pi/` and `package.json`. Upstream files stay untouched, so `git merge upstream/main` stays conflict-free.

## Flow

| Command | Does | Stops for you |
|---|---|---|
| `/spec <request>` | Recon, rounds of assumptions and questions (each with a recommendation), one-page spec, three-lens spec review | yes |
| `/plan [spec]` | Design arena: grounding, 2-3 competing designs (minimal, domain, caller), cross-judge, graft. Then the task plan | yes |
| `/build [plan]` | Worktree on `feat/<topic>`, one fresh subagent per task, verify command as gate, one commit per task. No per-task review | only on blockers |
| `/review [plan]` | code-reviewer, security-auditor, test-engineer in parallel on the branch diff. Verified, merged verdict | yes, applies nothing |
| `/flow [request]` | Detects the phase from `.specs/` and git and runs the next one. Same stops as above | per phase |

Spec and plan live in `<repo>/.specs/<date>-<topic>/` and are excluded via `.git/info/exclude`, never committed.

## Pieces

- `pi/skills/as-*`: the four phases. Invoked through `pi/prompts/*.md`.
- `pi/workflows/*.js`: deterministic fan-outs for `SubagentWorkflow` (pi-subagents). Reviewers run on Opus. Spec review uses medium effort, design, judge, and final review use high.
- `pi/references/`: panel synthesis (Konsens, Uneinig, Einzeln, Verworfen) and design red flags.
- `pi/skills/principles/`: three short pstack principles, auto-loaded when they apply.
- `agents/`: the upstream personas, registered as pi subagents.

The manifest hides upstream skills that the phases replace or that would fire on every change (`using-agent-skills`, `spec-driven-development`, `planning-and-task-breakdown`, `incremental-implementation`, `interview-me`, `doubt-driven-development`, `code-review-and-quality`, `context-engineering`, `git-workflow-and-versioning`). Every other upstream skill loads automatically when it applies.

## Update from upstream

```bash
git fetch upstream && git merge upstream/main
```

## Credits

Design arena, red flags, review synthesis, and principles are adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan (MIT).
