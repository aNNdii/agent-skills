---
name: as-spec
description: Phase 1 of the /spec → /plan → /build → /review flow. Use only when the user runs /spec or explicitly asks to start a spec for a feature. Clarifies intent and details, writes a one-page spec, runs a three-lens spec review, then stops for approval.
---

# Spec

Goal: a one-page spec the user approved, that a builder can implement without asking back.

No product code, scaffolding, or dependency installs in this phase. Reading and exploring are fine. Language rules: `../../references/language.md`.

## 1. Recon

Read before you ask. Explore the code the request touches. For more than a handful of files, use an Explore subagent and keep its summary, not raw output. Never ask what the code answers.

If the request is trivially clear (a one-liner, a rename), say so and suggest doing it directly without the flow. If it bundles several independent features, say so, propose an order, and spec one at a time.

## 2. Clarify

After recon, decide which mode fits and say it in one line.

### 2a. Intent mode: the goal itself is unclear

Use it when you cannot say in two sentences what they want, for whom, and why. Also use it whenever the user asks for one question at a time ("one by one", "grill me", "interview me", or the same in their language). In that case keep one question per message for the whole clarification.

- One question per message about the why: the moment they miss this, who it is for, what success looks like, what would make it a failure even if it technically works.
- Anchor in specifics ("Walk me through the last time..."). Add your guess so they can correct it instead of starting from zero. Mention what the code showed when it matters.
- When you could state goal, user, and success criterion and they would nod, say so and switch to 2b. Carry everything over, never ask twice.

Deeper technique: `../../../skills/interview-me/SKILL.md`.

### 2b. Detail rounds: the goal is clear

One message per round with three parts:

1. **Understood:** what you think they want and why, in 3-5 sentences.
2. **Assumptions:** a numbered list. Mark each as your guess and say they hold unless corrected.
3. **Questions:** every open point whose answer changes what gets built, numbered, most important first. Each with your recommendation, a one-line reason, and an example when the effect is not obvious, so "ok" is a valid answer. Many questions in one round are fine.

Turn vague goals into checkable criteria ("faster" becomes "p95 under 200 ms for X"). Repeat rounds until no open point changes what gets built. Then write the spec.

## 3. Write the spec

Path: `<repo>/.specs/<YYYY-MM-DD>-<topic>/spec.md`. Spec and plan are never committed: make sure `.specs/` is listed in `.git/info/exclude` (append it if missing, never edit `.gitignore`).

At most one page. Drop empty sections. Mark every decision you made yourself as an assumption or your call.

```markdown
# Spec: <title>
Status: draft

## Goal
Who, what, why. 2-4 sentences.

## Non-goals

## Behavior and acceptance criteria
- [ ] AC1: <checkable statement, e.g. Given/When/Then>

## Edge cases and errors

## Boundaries
- Always: ...
- Ask first: ...
- Never: ...

## Context from the code
Affected places with paths, test command, conventions.

## Open points
```

## 4. Spec review

Call `SubagentWorkflow` with `name: "as-spec-review"` and `args: { specPath, repo }` (absolute paths). It runs in the background. Wait for the completion notification, do not poll.

Merge the result per `../../references/panel-synthesis.md`. Resolve items the spec, the code, or earlier answers already settle yourself, and fix the spec for them. Leave every real user decision open.

## 5. Stop for approval

Send: the spec path, a 3-5 line summary, and the synthesized review items. Ask whether to approve or correct, and end your turn.

On answers: update the spec, report only which decisions changed, and ask again only if new open points arose. On approval: set `Status: approved <date>` and name the next step: `/plan <spec path>`, ideally in a fresh session.
