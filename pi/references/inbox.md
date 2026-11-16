# Inbox

The Plannotator Inbox is an optional channel for the flow's stops: the user reads and answers there when they are away from the chat, and their answer arrives in this session as the next turn. The phase skills decide what each stop contains and what happens on the answer. This file decides how a stop looks in the Inbox, how answers come back, and the few things only the Inbox does: bundled questions in `/spec` 2a, and the guided code review before the `/review` verdict.

## Inbox mode

Inbox mode is on when both hold:

1. The session has the `plannotator_inbox` tool.
2. The user asked for the Inbox in this flow ("via the Inbox", "I am not watching the chat", or the same in their language), or the spec header has `Channel: inbox` (`worktrees.md#spec-header`).

The user can switch at any stop: "in the chat" turns Inbox mode off, and "via the Inbox" turns it on; add or remove the header line to match.

When the user asked for the Inbox but the tool is missing, or a call to it fails, say so once in the chat and send this stop in the chat. Keep the header line, so a later session with the tool goes back to the Inbox.

## Thread

One thread per work item. Name it at the first Inbox message `<YYYY-MM-DD>-<topic>`, with `<topic>` as `worktrees.md#terms` derives it, and set `subject` to the feature's title. `/spec` writes it into the spec header as `Channel: inbox · Thread: <thread>`. From then on every message of every phase passes exactly that `thread`, read from the header, even when the spec dir ended up with another name. The same thread name in the same project is the same thread across sessions.

When a phase starts or resumes in a session that did not send the thread's last message (a fresh session, `/flow` later), first `read_thread`. If the user answered the last stop and the files do not reflect it yet, apply that answer per [Replies](#replies) before asking anything again.

## Chat and Inbox

After each Inbox message, write one line in the chat: what you sent and the thread's link from the result. Never ask the same question in both places.

A chat message that answers the waiting stop counts as the answer: apply it per [Replies](#replies), settle the open cards in `supersedes` with the note "answered in the chat", and stay in Inbox mode. A chat message that does not answer it gets a pointer to the thread.

## Per stop

The skill names the items of each stop. This table says how each item is shown: as an open block (with its heading emoji), folded into `<details>`, or as cards. Items the table does not name are open blocks.

| Stop | Open blocks | Folded | Cards after the lead card | Attachment |
|---|---|---|---|---|
| `/spec` 2a intent | 🧠 My guess (goal, user, success) · 🔎 Found in the code | | the Detect question if there is one, then three to five questions about the why, bundled unless the user asked for one at a time; `:::question-text`, or `:::question` with your guess as the recommendation | |
| `/spec` 2b detail round | 🧠 Understood · 🎲 Assumptions (numbered) · 🔎 Found in the code | | the Detect question if there is one, then each question | |
| `/spec` approval | 📋 Summary · 🗺️ System context (the Context view) · 🛠️ Fixed by the review | | each open item | `spec.md` |
| `/plan` design decision | 🔀 Candidates (table: shape, strength, weakness, score) | | one card per conflict, backers in `Why:`; the grafts as one `:::question-multi` | `arena.md` |
| `/plan` approval | 🧩 Design (the Building blocks view, the other views named in one line) · 📦 Tasks (table) | Decisions | each unconfirmed decision | `plan.md` |
| `/build` stop or blocker | 🚨 What happened · 📍 State (worktree, branch, progress bar of tasks) | the command output | none: the blocker is the lead card | |
| `/build` report | 📦 Tasks (table) · 🧾 Final verify · 📍 Where | | none | |
| `/review` code | see [Review in the Inbox](#review-in-the-inbox) | | | the guided review |
| `/review` verdict | 🎯 Acceptance (only 🚧 and ❌ rows; progress bar when not all are met) | met criteria · Noted · Dismissed · deferred Non-goals | the findings, see [Review in the Inbox](#review-in-the-inbox) | `review.md` |
| `/review` fixes done | 🛠️ Fixed · 🧾 Final verify | | new findings from line comments | |
| `/review` finish | ✍️ Commit message · 📍 Where | | the finish choices of the skill, irreversible ones as such | |

Every other question from a skill or `worktrees.md` is a card with the same options. Every stop from `worktrees.md#stops-and-recovery` is a blocker.

## Cards

Questions and choices quoted in this file give the meaning, not the wording: write them in the user's language (`language.md`) and read the answer by its meaning.

- **Bundle.** All questions of one stop go in one message, at most five cards after the lead card, most important first. Send the rest in the next round.
- **One card per decision.** `:::question` for one pick, `:::question-multi` for pick-any lists, `:::question-text` for open questions. Name choices by what they do (`Redis store`, `In-memory store`), never `A` and `B`, and never by tool roles (judge, graft, lens names). Give each card a `Recommended:` line and a `Why:` sentence that does not repeat the choice's label, so a reply that takes every recommendation is valid. One-line `Pros:` and `Cons:` under the choices when the options trade off. Never add your own `Other`, `Skip` or `None`: the Inbox has them.
- **Risk** goes on the card it concerns, as a line `Risk: <consequence>` with the label in the user's language.
- **Irreversible or outward actions** (push, merge, fast-forward, remove a worktree or branch, anything forced) are cards without `Recommended:`, come last, and carry a Risk line (`Risk: deletes <path> and its untracked files; cannot be undone`). The lead card and 👍 never settle them: left open means no.
- **Something only the user can do** outside the conversation (merge, sign in, approve a deploy) is one `:::action` block titled verb + noun (`Merge PR #42`).

### Lead card

Every message with a question has one lead card, the first card, right after the status line. Its question is short and starts with what it is about, so the thread preview tells threads apart (`Plan: approve?`, not `Take the recommendation…`). It is one of:

| Stop | Question | Choices |
|---|---|---|
| a question round, a design decision | `<Stop> questions: recommendation for the rest?` | `Take recommendations` (recommended), `Ask again next round` |
| spec or plan approval | `<Spec or plan>: approve?`, with one scope line under it (`3 tasks · 1 decision open · design and tasks below`) | the choices of `next-phase.md`, then `Not yet: revise per my comments`. Every approve choice also takes the recommendation for each card left open |
| `/build` report | `Build done: how does /review start?` | the choices of `next-phase.md` |
| `/review` verdict | `Review: fix as picked?` | `Fix as picked, recommendation for the rest` (recommended when there is anything to act on), `Finish now, fix nothing` (recommended otherwise) |
| `/review` fixes done | `Fixes done: finish?` | `Finish: one commit` (recommended), `Fix more` |
| a blocker | `🛑 <what happened>. How to go on?` | the options from the skill, without `Recommended:` when none is safe |

A 👍 reaction to the message ("Take it as a go") means the lead card's recommended choice.

## Message layout

```markdown
## <phase emoji> <outcome in one line>

✅ Spec · ✅ Plan · **🔨 Build** · Review · ~4 min

<progress bar, when it applies>

:::question
<lead card>
:::

### <block emoji> <Block title>
- <one fact per bullet>

**<block emoji> <Block title>:** <a block of one line>

<details>
<summary><what is folded, with its count></summary>

<content>
</details>

---

<the other cards>

🏆 <what is done> · <what the outcome line did not say>
```

- **Outcome line**: a `##` heading, one sentence, starting with the phase emoji (📝 spec, 🧭 plan, 🔨 build, 🔍 review). Counts follow [Emoji](#emoji): `🔍 Review: 🔥 1 to fix · ⚠️ 2 to consider · ✅ 3 of 4 criteria met`. It is the only `##`.
- **Status line**: the four phases as plain text; done ones with ✅, the current one bold with its phase emoji, later ones bare. Reading time at the end only from 3 minutes on (about 200 words a minute). Leave the phases out before the spec is written.
- **Blocks**: the open blocks of the [Per stop](#per-stop) table, in its order, at most three `###` headings, each starting with its emoji, titled in the user's language with plain labels. A block of one line gets no heading: `**🧾 Final verify:** 57 passed`. Leave out a block that would be empty or that only repeats a card below. Inside: one fact per bullet, at most five; more items, or items that share fields, go in a table. Code spans only for paths, commands, identifiers and values.
- **Folded**: what the table marks as folded, and anything that would push the open part past one screen, goes into `<details>`. The `<summary>` says what is inside with its count (`Dismissed (2)`), without an emoji. Never fold a diagram: the Inbox does not draw it there.
- **Diagrams**: copy the views of `spec.md` or `plan.md` verbatim, with their legend line (`architecture-views.md`); never draw one for the message. Show the one view the table names, and name the others in one line (`Runtime and Deployment: in plan.md`). No views in the file, no diagram in the message.
- **Progress bar**: only when a count is not complete (a blocker, criteria not all met), at most one, right under the status line, no heading. This block, with the width as the percentage and the label as the count:

  ```html
  <div style="display:flex;gap:12px;align-items:center;color:var(--foreground)">
  <div style="flex:0 0 200px;height:10px;border-radius:5px;background:color-mix(in oklch,var(--foreground) 15%,transparent)"><div style="width:67%;height:100%;border-radius:5px;background:var(--primary)"></div></div>
  <span>Tasks 2 / 3</span></div>
  ```

- A `---` line separates the body from the other cards.
- **Closing line**: when a phase is done (approved, built, finished), one line `🏆 <what is done> · <numbers the outcome line did not give>` at the very end (`🏆 Plan approved · 3 tasks · 2 of 4 phases done`). Nothing new to say, no line.

## Emoji

Emoji stand only at the left edge of a heading, a list item, a card question, or in a status column; never as decoration. Phase emoji: 📝 🧭 🔨 🔍. Block emoji, one per kind of item, the same in every stop:

| Block | Emoji | | Block | Emoji |
|---|---|---|---|---|
| My guess, Understood | 🧠 | | Tasks | 📦 |
| Assumptions | 🎲 | | Final verify, Evidence | 🧾 |
| Found in the code | 🔎 | | What happened | 🚨 |
| Summary | 📋 | | Where, State | 📍 |
| System context | 🗺️ | | Acceptance | 🎯 |
| Candidates | 🔀 | | Reading order | 📖 |
| Design | 🧩 | | Fixed | 🛠️ |
| Commit message | ✍️ | | | |

Status emoji have one meaning each. In counts they lead, then the name, then the count in words (`🔥 Limiter · 1 to fix`); a single finding is `Finding <n>`, never a bare number:

| Emoji | Meaning |
|---|---|
| 🛑 | a blocker, at the start of its lead card |
| 🔥 | a finding to act on |
| ⚠️ | a finding to consider |
| ✅ 🚧 ❌ | met, partial, missing; ✅ also marks done work and phases |
| 🏆 | the closing line |

## Replies

The reply arrives as the next turn: picks under "Answers to your questions", free text, and annotations on attachments, each with the quoted line. Treat every annotation like a correction in the chat. When the user picked an approve choice and also annotated or wrote notes, apply them first; if they change what gets built (an acceptance criterion, a decision, a task), ask once more instead of going on, and say why in the first line.

Settle the cards the user left open as the lead card says: take your recommendation, or ask them again next round. Without an answer to the lead card, ask them again. Name every settled or replaced question in `supersedes`, with a one-line note of what now holds, then continue as the skill and `next-phase.md` say.

## Review in the Inbox

Before the verdict, send the diff as a guided review in the same thread: `get_guide_brief`, then `submit_guide` with `patch` exactly as `/review` reviewed it (`git -C <wt> diff <merge-base> HEAD` in mode `checkpoints`, `git -C <wt> diff --cached <merge-base>` in mode `none`, `<merge-base>` from `git -C <wt> merge-base HEAD <base>`). Chapters go in reading order. Each chapter overview names the findings in its files, `🔥 Finding <n> · <file>:<line>: <finding in one line>` (⚠️ for Consider), numbered as in `review.md`. The body is the outcome line, the status line and 📖 **Reading order**: one bullet per chapter with the most severe emoji of its findings (✅ without), the chapter, and the counts (`🔥 Handler · 1 to fix, 2 to consider`). Past six chapters, list only those with findings and end with `✅ <n> more without findings`.

The verdict then asks per finding:

- Question: `🔥 Finding <n>: <finding in one line>` (⚠️ for Consider); under it `<file>:<line>` and the Risk line (the consequence if left as is).
- Choices: `Fix`, `Don't fix`, `Later: own spec`. `Recommended:` is `Fix` for Act on; for Consider, what you would do.
- Up to four findings get a card each. With more, one `:::question-multi` per severity (`Which 🔥 should I fix?`, recommended: all of them; then `Which ⚠️ should I fix?`), each choice `Finding <n> · <file>:<line>: <finding>`; unpicked ones count as `Don't fix`, and `Later: own spec` goes in a note.

Line comments from the guided review are new findings: number them on, say in one line each what you will do, and ask in the next round where it is not obvious.
