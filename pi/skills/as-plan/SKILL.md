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

## 3. Compare, then let the user decide

The judge and you recommend. The user decides. Never settle a design conflict silently.

Read every candidate and the judge's verdict in full. Score against the judge's rubric yourself. Then:

- **Converged, no forks, and you agree with the judge:** go to step 4. List the grafts as decisions in the plan so the user can veto them.
- **Otherwise (the candidates differ in shape, the judge lists forks, or you disagree with the judge): stop here, before writing tasks.** Send a design decision message:
  1. Per candidate, 3-4 lines: the shape, its strength, its weakness, the judge's scores.
  2. The conflicts per `../../references/panel-synthesis.md` as ⚖️ items. Each has options A and B with who backs them (candidate, judge, you), a concrete example per option, the judge's recommendation, and yours. If you disagree with the judge, say so in that item.
  3. The proposed grafts, numbered, so the user can accept or drop each.

  Ask the user to decide and end your turn. Write the plan only from the user's answers.
- If the candidates diverge wildly, the spec leaves something open. Name the open spec point in the message. Do not average designs.

When you write the design, graft by hand so the result stays one coherent shape. Check it against the real code: the named files and functions exist, and the signatures fit the call sites.

## 4. Write the plan

Write `<spec dir>/plan.md`. Not committed.

```markdown
# Plan: <Titel>
Status: Entwurf · Spec: spec.md

## Entwurf
Nutzung (2-3 echte Aufrufstellen) → Typen und Signaturen → Modul-Karte → Datenfluss.
Signaturen als Code, Bodies `not implemented`.

## Entscheidungen
| Frage | Gewählt | Verworfen | Warum | Entschieden von |
(Entschieden von: Nutzer, Konsens, oder Empfehlung (unbestätigt))

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

Send: the plan path, the design in 5-8 lines, the decisions table, every decision still marked "Empfehlung (unbestätigt)" as a numbered item, and the tasks one line each. Ask "Freigeben oder korrigieren?" and end your turn.

On approval: set `Status: freigegeben <date>` and name the next step: `/build <plan path>`, ideally in a fresh session.
