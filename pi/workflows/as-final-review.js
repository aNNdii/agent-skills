/**
 * as-final-review: the one review of the flow. Reviewer personas from
 * agents/ read the finished branch diff in parallel. The calling skill
 * (as-review) verifies and merges them per pi/references/panel-synthesis.md.
 *
 * args: { worktree, base, specPath, planPath, tiers?: { high?, mid?, low? },
 *   commits?: 'checkpoints' | 'none', personas?: string[] }
 * tiers maps each tier to an exact "<provider>/<id>"; see pi/references/model-tiers.md.
 * commits: 'checkpoints' (default) reviews `diff <base>...HEAD` and the log;
 * 'none' reviews the staged result, `diff --cached $(merge-base HEAD <base>)`.
 */
export const meta = {
  name: 'as-final-review',
  description: 'Final review: reviewer personas read the finished branch diff in parallel',
  phases: [{ title: 'Review' }],
}

const ROLES = { 'final-review': { tier: 'high', effort: 'high' } }

// --- tiers: shared block. Keep byte-identical in all pi/workflows/*.js; pi/scripts/pi-workflows-test.js fails on drift. See pi/references/model-tiers.md ---
function resolveRoles(roles) {
  const name = meta.name
  if (args?.model != null || args?.effort != null) {
    throw new Error(`${name} no longer takes args.model or args.effort; pass args.tiers { high?, mid?, low? } with exact "<provider>/<id>" values instead`)
  }
  const TIERS = ['high', 'mid', 'low']
  const UP = { low: 'mid', mid: 'high', high: 'high' }
  const given = args?.tiers
  if (given != null) {
    if (typeof given !== 'object' || Array.isArray(given)) {
      throw new Error(`${name} needs args.tiers as an object { high?, mid?, low? }, got ${JSON.stringify(given)}`)
    }
    for (const [key, value] of Object.entries(given)) {
      if (!TIERS.includes(key)) throw new Error(`${name}: args.tiers.${key} is not a tier; use high, mid or low`)
      if (typeof value !== 'string' || !/^[^/]+\/.+$/.test(value)) {
        throw new Error(`${name} needs args.tiers.${key} as "<provider>/<id>", got ${JSON.stringify(value)}`)
      }
    }
  }
  const t = given ?? {}
  const models = { high: t.high, mid: t.mid ?? t.high, low: t.low ?? t.mid ?? t.high }
  const from = { high: null, mid: t.mid === undefined ? 'high' : null, low: t.low === undefined ? 'mid' : null }
  const show = k =>
    models[k] === undefined ? `${k}=inherit` : `${k}=${models[k]}${from[k] ? ` (from ${from[k]})` : ''}`
  log(given == null ? 'tiers: none passed, agents inherit the model of their agent type (Explore) or else the session model' : `tiers: ${TIERS.map(show).join(', ')}`)
  return (role, after) => {
    if (!Object.hasOwn(roles, role)) throw new Error(`${name}: unknown role "${role}"`)
    const row = roles[role]
    let tier = row.tier
    if (tier === 'above') {
      if (!Object.hasOwn(roles, after) || roles[after].tier === 'above') {
        throw new Error(`${name}: role "${role}" needs a base role with a fixed tier, got ${JSON.stringify(after)}`)
      }
      tier = UP[roles[after].tier]
    } else if (after !== undefined) {
      throw new Error(`${name}: role "${role}" has a fixed tier and takes no base role`)
    }
    return models[tier] === undefined ? { effort: row.effort } : { model: models[tier], effort: row.effort }
  }
}
// --- end tiers ---

const { worktree, base, specPath, planPath } = args ?? {}
if (!worktree || !base || !specPath || !planPath)
  throw new Error('as-final-review needs args.worktree, args.base, args.specPath and args.planPath')

const commits = args?.commits ?? 'checkpoints'
if (commits !== 'checkpoints' && commits !== 'none')
  throw new Error(`as-final-review: args.commits must be 'checkpoints' or 'none', got ${JSON.stringify(commits)}`)

const personas = args?.personas ?? ['code-reviewer', 'security-auditor', 'test-engineer']
const role = resolveRoles(ROLES)

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Two sentences: overall state from your angle' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'important', 'suggestion', 'nit'] },
          file: { type: 'string' },
          line: { type: 'string' },
          title: { type: 'string' },
          detail: { type: 'string', description: 'The concrete failure path: input, steps, wrong result' },
          recommendation: { type: 'string' },
          example: { type: 'string', description: 'A concrete repro: input or call and the wrong result, or the 2-3 offending lines' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['severity', 'file', 'title', 'detail', 'recommendation', 'confidence'],
      },
    },
    acceptance: {
      type: 'array',
      description: 'One entry per acceptance criterion in the spec',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          status: { type: 'string', enum: ['met', 'partial', 'missing', 'unclear'] },
          evidence: { type: 'string', description: 'Test name or file:line' },
        },
        required: ['criterion', 'status'],
      },
    },
  },
  required: ['summary', 'findings'],
}

const prompt = persona =>
  [
    `You are the ${persona} on the final review of a finished feature branch. Use the review framework from your instructions.`,
    '',
    `Worktree: ${worktree}`,
    commits === 'none'
      ? `Change (staged, not committed): \`git -C '${worktree}' diff --cached $(git -C '${worktree}' merge-base HEAD ${base})\` (start with --stat).`
      : `Change: \`git -C '${worktree}' diff ${base}...HEAD\` (start with --stat), commits: \`git -C '${worktree}' log --oneline ${base}..HEAD\`.`,
    `Spec with acceptance criteria: ${specPath}`,
    `Plan with the intended design: ${planPath}`,
    '',
    'Rules:',
    '- Read-only. Do not edit, commit, format, or install anything. Running the existing tests is fine.',
    '- Review the change and what it affects, not unrelated code.',
    '- Trace call sites before claiming a bug. Every finding names file:line and a concrete failure path.',
    '- No "I would do it differently" without a concrete problem. No abstractions without a second use.',
    '- If your area looks fine, say so. Few or zero findings is a valid result.',
    '- Fill `acceptance` for every acceptance criterion in the spec, with evidence.',
    '- Return the result through StructuredOutput.',
  ].join('\n')

phase('Review')

const reviews = await parallel(
  personas.map(p => () =>
    agent(prompt(p), { label: `review:${p}`, phase: 'Review', agentType: p, schema: SCHEMA, ...role('final-review') }).then(r =>
      r ? { persona: p, ...r } : null,
    ),
  ),
)

const returned = reviews.filter(Boolean)
const missing = personas.filter(p => !returned.some(r => r.persona === p))
if (missing.length) log(`no review from: ${missing.join(', ')}`)

return { base, worktree, reviews: returned, missing }
