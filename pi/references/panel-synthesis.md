# Panel synthesis

How to merge the output of several reviewers (lenses) into one message for the user. Used by the spec review, the design judge, and the final code review.

All reviewers run on the same model family. Agreement means the lenses agree, not that independent models agree. Treat consensus as a strong recommendation the user confirms, never as a decision.

## 1. Merge

Merge items that describe the same underlying issue, even when phrased differently. For each merged item keep: which lenses raised it, and what each one recommended.

## 2. Check before you present

You can see the whole context, the reviewers saw a slice. For every item:

- **Already answered** by the spec, the code, or an earlier user answer: resolve it yourself, note where. Do not ask the user.
- **Hypothetical**: keep it only if a real path exists. Trace the caller. If the type system or upstream validation prevents it, dismiss it.
- **"I would have done it differently"** without a concrete problem: dismiss.
- **Premature abstraction** ("extract an interface", "make it configurable") with no second use: dismiss.
- **Nitpick gravity**: reviewers fill space. If a lens found only nits, say its area looks fine.
- Do not dismiss security or correctness findings just because one lens raised them. Check them harder.

## 3. Classify

- **✅ Consensus.** Two or more lenses, same recommendation. Or one lens, and you verified it. Present the recommendation for confirmation.
- **⚖️ Split.** Lenses recommend different things. Show each option with who backs it and why, then your recommendation and why.
- **❓ Single.** One lens, not yet verified. Show it with its recommendation. Lower signal.
- **🗑️ Dismissed.** One line each with the reason. At the end, short.

Within each class, order by impact: blocks the build, changes the design, minor.

## Examples

Every split option, and every recommendation whose effect is not obvious from the sentence, gets a concrete example so the user sees the difference without reading code. Pick the smallest form that shows it:

- an input and the output under each option: `slugify('a b', { maxLength: null })` → A: `'a-b'` · B: TypeError
- two or three lines of code showing the call site or shape
- a short scenario: "user saves twice within a second → A: one row · B: two rows"

Use the reviewers' examples when they fit, and write your own when they don't. Never invent behavior the code or the design does not have.

## 4. Format

Number every item across all classes so the user can answer tersely ("1 ok, 2 B, 4: rather X"). Write everything, headings included, in the user's language (`language.md`). The skeleton:

```markdown
### ✅ Consensus
1. **<topic>.** <question or finding in one sentence> Recommendation: <concrete>. (<lenses>)
   Example: <input → result>   (only when not obvious)

### ⚖️ Split
2. **<topic>.** <question in one sentence>
   - A (<lenses>): <option>. <reason>
     Example: <input → result under A>
   - B (<lenses>): <option>. <reason>
     Example: <input → result under B>
   - My recommendation: A, because <reason>.

### ❓ Single
3. **<topic>.** <...> Recommendation: <...>. (<lens>)

### 🗑️ Dismissed
- <item>: <reason>.
```

Keep each item to two or three lines plus its example.
