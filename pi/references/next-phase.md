# Next phase

At the spec approval, the plan approval and the `/build` report (every task done, Final verify green), the user also chooses how the next phase starts. The phase skills point here; this holds in the chat and in the Inbox (there the choices form the lead card, `inbox.md#cards`).

## Choices

Labels name the way first, then the phase, in the user's language. Recommended first:

| Stop | Choices |
|---|---|
| spec approval | `This session: /plan`, `Fresh session: /plan`, `Compact, then /plan`, `Start /plan myself` |
| plan approval | `Fresh session: /build`, `Compact, then /build`, `This session: /build`, `Start /build myself` |
| `/build` report | `Fresh session: /review`, `Compact, then /review`, `This session: /review`, `Start /review myself` |

Without the `flow_next_phase` tool, offer only `This session: …` and `Start … myself`, and recommend `Start … myself` where the table recommends a fresh session. In the chat, list the choices in the approval question, so a plain "ok" takes the recommended one. A `/build` report that ends in a stop or a blocker offers no next phase.

## Finish the stop first

On the answer, before anything below: write every answer into `spec.md` or `plan.md` (in the plan's Decisions table `Decided by: user` for a pick, `user (default)` for a recommendation the user took without picking), and set the status as the skill says. In the Inbox, also name the settled cards in `supersedes` (`inbox.md#replies`). A fresh session or a compacted one knows only the files.

## Continue

- `This session: …`: go on with the next phase's skill in this turn.
- `Fresh session: …` or `Compact, then …`: call `flow_next_phase` with mode `fresh` or `compact` and prompt `/<phase> <absolute path>`, as the only tool call of the last step of this turn, and end your turn. The next session reads the channel and the thread from the spec header.
- `Start … myself`: name the command with its absolute path and end your turn.
