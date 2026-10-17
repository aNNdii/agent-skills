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

- **✅ Konsens.** Two or more lenses, same recommendation. Or one lens, and you verified it. Present the recommendation for confirmation.
- **⚖️ Uneinig.** Lenses recommend different things. Show each option with who backs it and why, then your recommendation and why.
- **❓ Einzeln.** One lens, not yet verified. Show it with its recommendation. Lower signal.
- **🗑️ Verworfen.** One line each with the reason. At the end, short.

Within each class, order by impact: blocks the build, changes the design, minor.

## 4. Format

Number every item across all classes so the user can answer tersely ("1 ok, 2 B, 4: lieber X").

```markdown
### ✅ Konsens
1. **<Thema>.** <Frage/Befund in einem Satz.> Empfehlung: <konkret>. (<Linsen>)

### ⚖️ Uneinig
2. **<Thema>.** <Frage in einem Satz.>
   - A (<Linsen>): <Option>. <Begründung>
   - B (<Linsen>): <Option>. <Begründung>
   - Meine Empfehlung: A, weil <Grund>.

### ❓ Einzeln
3. **<Thema>.** <...> Empfehlung: <...>. (<Linse>)

### 🗑️ Verworfen
- <Punkt>: <Grund>.
```

Reply in the user's language. Keep each item to two or three lines.
