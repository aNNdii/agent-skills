# pi flow

This fork adds a pi layer on top of [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). Everything pi-specific lives in `pi/` and `package.json`. Upstream files stay untouched, so `git merge upstream/main` stays conflict-free.

## Install

Requires [pi](https://pi.dev) and the [pi-subagents](https://github.com/tintinweb/pi-subagents) extension, which runs the workflows and reviewer agents.

```bash
pi install npm:@tintinweb/pi-subagents
pi install git:github.com/aNNdii/agent-skills
```

Use `git:git@github.com:aNNdii/agent-skills` to clone over SSH instead of HTTPS. Add `-l` to install into the current project only (`.pi/settings.json`).

Remove other workflow packs that route skills on their own, so two flows don't compete:

```bash
pi remove git:github.com/obra/superpowers
```

Start a new pi session, then check:

- `pi list` shows the package.
- `/flow`, `/spec`, `/plan`, `/build`, and `/review` appear in the `/` menu.
- `/agents` lists `code-reviewer`, `security-auditor`, and `test-engineer`.

Update with `pi update`. Turn single skills or prompts on and off with `pi config`.

### Developing the pack

Install from a local clone instead. Pi loads it in place, so edits apply on the next session or `/reload`:

```bash
git clone git@github.com:aNNdii/agent-skills ~/development/agent-skills
pi install ~/development/agent-skills
```

## Flow

```mermaid
flowchart TD
    start(["/flow 'Feature X'"]):::cmd

    subgraph S1["1 · SPEC"]
        recon["Recon<br/>reads the code"]
        mode{"Goal clear?"}
        intent["Clarify intent<br/>one question per message<br/>with a guess"]
        rounds["Detail rounds: understood ·<br/>assumptions · questions with recommendation"]
        specmd[/"spec.md · max. one page"/]:::file
        subgraph SR["Spec review · Opus medium · parallel"]
            l1["Builder"]
            l2["Edge cases"]
            l3["Scope"]
        end
        syn1["Synthesis ✅ ⚖️ ❓ 🗑️<br/>with examples"]
        stop1{{"STOP<br/>approve spec?"}}:::stop
        recon --> mode
        mode -->|no| intent
        intent -->|"you answer"| intent
        intent -->|"intent clear"| rounds
        mode -->|yes| rounds
        rounds -->|"you answer"| rounds
        rounds --> specmd
        specmd --> l1 & l2 & l3
        l1 & l2 & l3 --> syn1
        syn1 --> stop1
    end

    subgraph S2["2 · PLAN"]
        ground["Explorer<br/>grounding"]
        subgraph AR["Design arena · Opus high · parallel"]
            d1["minimal"]
            d2["domain"]
            d3["caller"]
        end
        judge["Judge<br/>rubric · base · grafts · forks"]
        arenamd[/"arena.md"/]:::file
        conflict{"Conflict or<br/>dissent?"}
        stopD{{"STOP<br/>design decision<br/>A / B + example + recommendation"}}:::stop
        planmd[/"plan.md<br/>design · decisions · tasks"/]:::file
        stop2{{"STOP<br/>approve plan?"}}:::stop
        ground --> d1 & d2 & d3
        d1 & d2 & d3 --> judge
        judge --> arenamd --> conflict
        conflict -->|yes| stopD --> planmd
        conflict -->|no| planmd
        planmd --> stop2
    end

    subgraph S3["3 · BUILD · runs without you"]
        wt["Worktree + branch feat/topic<br/>baseline green?"]
        task["Task Tn: fresh subagent<br/>RED → GREEN → verify"]
        gate{"Gate:<br/>tests green?"}
        cp["Checkpoint commit [Tn]<br/>unsigned"]
        retry["1 retry"]
        block{{"STOP<br/>blocker"}}:::stop
        more{"more<br/>tasks?"}
        wt --> task --> gate
        gate -->|yes| cp --> more
        gate -->|no| retry --> gate
        retry -.->|"red again"| block
        more -->|yes| task
    end

    subgraph S4["4 · REVIEW"]
        subgraph RV["Reviewer · Opus high · parallel"]
            r1["code-reviewer"]
            r2["security-auditor"]
            r3["test-engineer"]
        end
        verify["Orchestrator verifies<br/>every finding itself"]
        verdict[/"review.md<br/>Act on · Consider · Noted · Dismissed<br/>+ acceptance table"/]:::file
        stop3{{"STOP<br/>pick numbers"}}:::stop
        fixes["Fixes as checkpoints [review-n]"]
        squash["Squash → one signed commit"]
        stop4{{"STOP<br/>merge / push / keep"}}:::stop
        r1 & r2 & r3 --> verify
        verify --> verdict --> stop3 --> fixes --> squash --> stop4
    end

    start --> recon
    stop1 -->|approved| ground
    stop2 -->|approved| wt
    more -->|no| r1 & r2 & r3

    classDef stop fill:#f9d5d3,stroke:#c0392b,stroke-width:2px,color:#000
    classDef file fill:#fff3c4,stroke:#b8860b,color:#000
    classDef cmd fill:#d6eaf8,stroke:#2471a3,stroke-width:2px,color:#000
```


| Command | Does | Stops for you |
|---|---|---|
| `/spec <request>` | Recon, then intent questions one at a time if the goal is unclear ("one by one" forces it), then detail rounds with recommendations, one-page spec, three-lens spec review | yes |
| `/plan [spec]` | Design arena: grounding, 2-3 competing designs (minimal, domain, caller), cross-judge, graft. Then the task plan | yes |
| `/build [plan]` | Worktree on `feat/<topic>`, one fresh subagent per task, verify command as gate, one commit per task. No per-task review | only on blockers |
| `/review [plan]` | code-reviewer, security-auditor, test-engineer in parallel on the branch diff. Verified, merged verdict | yes, applies nothing |
| `/flow [request]` | Detects the phase from `.specs/` and git and runs the next one. Same stops as above | per phase |

Spec and plan live in `<repo>/.specs/<date>-<topic>/` and are excluded via `.git/info/exclude`, never committed.

## Pieces

- `pi/skills/as-*`: the four phases. Invoked through `pi/prompts/*.md`.
- `pi/workflows/*.js`: deterministic fan-outs for `SubagentWorkflow` (pi-subagents). Reviewers run on Opus. Spec review uses medium effort, design, judge, and final review use high.
- `pi/references/`: panel synthesis (consensus, split, single, dismissed), design red flags, and language rules (talk and write specs in the user's language, keep repo text, status values, and ids in English).
- `pi/skills/principles/`: three short pstack principles, auto-loaded when they apply.
- `agents/`: the upstream personas, registered as pi subagents.

The manifest hides upstream skills that the phases replace or that would fire on every change (`using-agent-skills`, `spec-driven-development`, `planning-and-task-breakdown`, `incremental-implementation`, `interview-me`, `doubt-driven-development`, `code-review-and-quality`, `context-engineering`, `git-workflow-and-versioning`). `/spec` still reads `interview-me` by path for its intent mode. Every other upstream skill loads automatically when it applies.

## Update from upstream

```bash
git remote add upstream https://github.com/addyosmani/agent-skills.git   # once
git fetch upstream && git merge upstream/main && git push
```

Git installs pick the merge up with `pi update`.

## Credits

Design arena, red flags, review synthesis, and principles are adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan (MIT).
