# Model tiers

The workflow scripts in `pi/workflows/*.js` pick a tier (`high`, `mid`, `low`) and an effort per role. They name no model. Before every `SubagentWorkflow` call, the lead resolves which model of the active provider belongs to each tier and passes the result as `args.tiers`. Switching the provider therefore needs no change to code or configuration: recognised model families get a tier, everything else inherits the session model.

## Resolve the tiers

1. Run `pi --list-models` and keep only the rows whose `provider` column is `$PI_PROVIDER`. The variable is set again for every shell command and follows `/model`. If `enabledModels` is set, keep only models that match one of its patterns. The project's `.pi/settings.json` overrides `~/.pi/agent/settings.json`. Patterns use the `--models` format (globs allowed, an optional `:<thinking>` suffix is not part of the id).
2. If an `AGENTS.md` (global or in the project) names a model from that list for a tier in a sentence, that wins. There is no fixed format; read the sentence.
3. Otherwise map each model by the family table below. Families of other vendors get a tier only by analogy, and only when their size line is clearly recognisable (for example a family that marks its large, medium and small variants). Otherwise they get no tier.
4. Within a tier, prefer models with `thinking` `yes`, then the newest version. On the same version, prefer the undated id without a variant suffix; if there is none, take the id that sorts last. A model without thinking fills a tier that would otherwise stay empty.
5. Pass only the tiers you found, as `tiers` with the exact `provider/id` from the listing. Do not fill missing tiers yourself: the script fills `mid` from `high` and `low` from `mid`, and lets a tier without a model inherit (see below).
6. Tell the user the mapping in one line, before the workflow starts.

## Family table

This table lives here so the package works without a global `AGENTS.md`.

| Tier | Families |
|---|---|
| `high` | Claude Opus, GPT Astra |
| `mid` | Claude Sonnet, GPT Sol (GPT Terra if the newest generation has no Sol) |
| `low` | Claude Haiku, GPT Luna |

Older GPT generations without these names: `-pro` is `high`, the plain id is `mid`, `-mini` is `low`. Only the newest generation that has a family counts for that family's tier.

## What the script checks

- `args.tiers` must be a plain object with only the keys `high`, `mid` and `low`, each value a `provider/id` with non-empty parts. The split is at the first `/`, so ids that contain a slash themselves (`openrouter/anthropic/claude-opus-5-5`) are valid. `{}` is valid (every tier inherits). Leaving `tiers` out, or passing `null`, means "none passed".
- Anything else, and any `args.model` or `args.effort`, stops the script before the first agent with a message naming `args.tiers`.
- The script logs one `tiers:` line before its first agent, for example `tiers: high=p/a, mid=p/a (from high), low=p/a (from mid)`.

## What inherit means

A role whose tier has no model gets no `model` from the script. pi-subagents then takes the model of the agent type if it sets one, else the session model. Of the agent types the workflows use, only `Explore` (the arena's `ground` role) sets one, a small Haiku. So without `low`, `ground` runs on that model, and every other role on the session model. The log line without tiers says so: `tiers: none passed, agents inherit the model of their agent type (Explore) or else the session model`.

## When nothing resolves

- `pi --list-models` fails, or lists nothing for `$PI_PROVIDER`: leave `tiers` out. Every agent inherits as described above. Say so to the user.
- The provider has a single known model, for example only a Sonnet: pass `{ mid: '<provider>/<sonnet-id>' }`. The script fills `low` from `mid`, and the `high` roles inherit the session model.
- A passed id disappears between resolving and the run: pi-subagents first tries a fuzzy match and then the same id under other providers. Only if nothing matches does that `agent()` call return `null`. That is accepted; there is no retry that falls back to inheriting.
- A model that cannot run the role's effort gets it lowered by pi. That is accepted.

## Example: `cliproxyapi`

`PI_PROVIDER` is `cliproxyapi`, `enabledModels` is not set, and no `AGENTS.md` names a model for a tier. `pi --list-models` lists:

```text
provider     model                      context  max-out  thinking  images
cliproxyapi  claude-fable-5-1           1M       128K     yes       yes
cliproxyapi  claude-haiku-4-5-20251001  200K     64K      no        yes
cliproxyapi  claude-haiku-5-5           1M       128K     yes       yes
cliproxyapi  claude-opus-5-5            1M       128K     yes       yes
cliproxyapi  claude-sonnet-5-5          1M       128K     yes       yes
```

- `claude-opus-5-5` is Claude Opus, so `high`.
- `claude-sonnet-5-5` is Claude Sonnet, so `mid`.
- `claude-haiku-5-5` and `claude-haiku-4-5-20251001` are both Claude Haiku. `claude-haiku-5-5` takes `low`.
- `claude-haiku-4-5-20251001` loses `low` to `claude-haiku-5-5`: it is older and has no thinking.
- `claude-fable-5-1` gets no tier: the family is unknown, and the table has no size line to draw an analogy from.

The lead passes:

```js
SubagentWorkflow({ name: 'as-spec-review', args: { specPath, repo,
  tiers: { high: 'cliproxyapi/claude-opus-5-5', mid: 'cliproxyapi/claude-sonnet-5-5', low: 'cliproxyapi/claude-haiku-5-5' } } })
```

It tells the user: `Tiers for cliproxyapi: high=claude-opus-5-5, mid=claude-sonnet-5-5, low=claude-haiku-5-5 (claude-fable-5-1: unknown family, no tier).`

The script then logs `tiers: high=cliproxyapi/claude-opus-5-5, mid=cliproxyapi/claude-sonnet-5-5, low=cliproxyapi/claude-haiku-5-5`.
