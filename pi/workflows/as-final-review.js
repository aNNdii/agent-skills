/**
 * as-final-review: the one review of the flow. Reviewer personas from
 * agents/ read the finished branch diff in parallel. The calling skill
 * (as-review) verifies and merges them per pi/references/panel-synthesis.md.
 *
 * args: { worktree, base, specPath, planPath, personas?: string[], model?, effort? }
 */
export const meta = {
  name: 'as-final-review',
  description: 'Final review: reviewer personas read the finished branch diff in parallel',
  phases: [{ title: 'Review' }],
}

const { worktree, base, specPath, planPath } = args ?? {}
if (!worktree || !base || !specPath || !planPath)
  throw new Error('as-final-review needs args.worktree, args.base, args.specPath and args.planPath')

const personas = args?.personas ?? ['code-reviewer', 'security-auditor', 'test-engineer']
const model = args?.model ?? 'opus'
const effort = args?.effort ?? 'high'

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
    `Change: \`git -C '${worktree}' diff ${base}...HEAD\` (start with --stat), commits: \`git -C '${worktree}' log --oneline ${base}..HEAD\`.`,
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
    agent(prompt(p), { label: `review:${p}`, phase: 'Review', agentType: p, model, effort, schema: SCHEMA }).then(r =>
      r ? { persona: p, ...r } : null,
    ),
  ),
)

const returned = reviews.filter(Boolean)
const missing = personas.filter(p => !returned.some(r => r.persona === p))
if (missing.length) log(`no review from: ${missing.join(', ')}`)

return { base, worktree, reviews: returned, missing }
