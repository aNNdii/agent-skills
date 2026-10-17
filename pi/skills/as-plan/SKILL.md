---
name: as-plan
description: Phase 2 of the /spec → /plan → /build → /review flow. Use only when the user runs /plan or explicitly asks to plan an approved spec. Runs a design arena (competing designs, cross-judge, graft), writes the design and a task plan, then stops for approval.
---

# Plan

Input: an approved spec. Take the path from the request, else the newest `.specs/*/spec.md`. If its status is not `freigegeben`, stop and say so.

No product code in this phase.

## 1. Size check

If the change is one or two files with an obvious approach, skip the arena. Write a short plan directly (design in five lines plus tasks), say you skipped it and why, and go to step 4.

## 2. Design arena

Call `SubagentWorkflow` with `name: "as-design-arena"` and `args: { specPath, repo, redFlagsPath }`, where `redFlagsPath` is the absolute path of `../../references/design-red-flags.md`. It runs in the background. Wait for the completion notification, do not poll.

The default lenses are minimal, domain, and caller. When the spec suggests sharper angles (say "offline-first" against "server-authoritative"), pass `lenses` with two or three structurally different briefs instead.

## 3. Pick, graft, check

- Read every candidate and the judge's verdict in full. Score against the judge's rubric yourself. If you and the judge agree on the base, go with it. If you disagree, read both rationales, decide, and say why.
- If the candidates converged, that is strong agreement. Use the shared shape.
- If they diverge wildly, the spec leaves something open. Turn it into a question for the user. Do not average designs.
- Graft one or two ideas from the other candidates by hand, so the result stays one coherent shape.
- Check the result against the real code: the named files and functions exist, and the signatures fit the call sites.

## 4. Write the plan

Write `<spec dir>/plan.md`. Not committed.

```markdown
# Plan: <Titel>
Status: Entwurf · Spec: spec.md

## Entwurf
Nutzung (2-3 echte Aufrufstellen) → Typen und Signaturen → Modul-Karte → Datenfluss.
Signaturen als Code, Bodies `not implemented`.

## Entscheidungen
| Frage | Gewählt | Verworfen | Warum |

## Ausführung
- Verify: `<voller Test-Befehl, mit knappem Reporter>`
- Base: <branch> · Feature-Branch: feat/<topic>
- Workstreams: einer | <Name: Tasks, Dateien> (nur bei disjunkten Dateien)

## Tasks
### T1: <Verb-Phrase>
- Akzeptanz: <AK-Bezug, konkret>
- Dateien: ...
- Hängt ab von: —
- Schwer: ja   (nur bei subtiler Logik; bekommt mehr Reasoning)

## Abdeckung
AK1 → T1, T3 · AK2 → T2

## Risiken
```

Task rules:
- Vertical slices: one complete path per task, not layers. Each task ends in a passing test and one commit.
- At most about five files per task. Order by dependency.
- Every acceptance criterion is covered by at least one task (the coverage line).
- Use more than one workstream only when the file sets are disjoint and no task depends across workstreams. Otherwise use one workstream.

## 5. Stop for approval

Send: the plan path, the design in 5-8 lines, the decisions table, the open design points merged per `../../references/panel-synthesis.md` (the judge's forks plus your own), and the tasks one line each. Ask "Freigeben oder korrigieren?" and end your turn.

On approval: set `Status: freigegeben <date>` and name the next step: `/build <plan path>`, ideally in a fresh session.
