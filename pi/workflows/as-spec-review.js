/**
 * as-spec-review: three lenses read a draft spec and return questions, each with
 * a concrete recommendation. The calling skill (as-spec) merges them per
 * pi/references/panel-synthesis.md.
 *
 * args: { specPath, repo, model?, effort?, lenses?: (string | {key, brief})[] }
 */
export const meta = {
  name: 'as-spec-review',
  description: 'Spec review: several lenses read a draft spec and return questions with recommendations',
  phases: [{ title: 'Review' }],
}

const specPath = args?.specPath
const repo = args?.repo
if (!specPath || !repo) throw new Error('as-spec-review needs args.specPath and args.repo (absolute paths)')

const model = args?.model ?? 'opus'
const effort = args?.effort ?? 'medium'

const DEFAULT_LENSES = [
  {
    key: 'builder',
    brief:
      'Builder. You must implement this from the spec alone, with no way to ask the author. ' +
      'Find every point where you would have to guess, or where two reasonable builders would build different things.',
  },
  {
    key: 'edge-cases',
    brief:
      'Edge cases and failure. Empty, invalid, huge, or duplicate input; concurrency; partial failure and retries; ' +
      'permissions; existing data and migration. Which behaviors does the spec leave undefined?',
  },
  {
    key: 'scope',
    brief:
      'Scope and intent. Are goals, non-goals, and boundaries right and consistent with the codebase? ' +
      'Is anything over-built or missing for the stated goal? Is every acceptance criterion checkable?',
  },
]

const lenses = (args?.lenses ?? DEFAULT_LENSES).map(l => (typeof l === 'string' ? { key: l, brief: l } : l))

const SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Two to four words' },
          question: { type: 'string', description: 'One sentence' },
          why: { type: 'string', description: 'What goes wrong if this stays open' },
          recommendation: { type: 'string', description: 'A concrete answer, not "it depends"' },
          reasoning: { type: 'string', description: 'One line. Name the condition that would flip it' },
          impact: { type: 'string', enum: ['blocks-build', 'changes-design', 'minor'] },
          source: { type: 'string', description: 'file:line or spec section that prompted it, if any' },
        },
        required: ['topic', 'question', 'recommendation', 'reasoning', 'impact'],
      },
    },
    looks_fine: { type: 'array', items: { type: 'string' }, description: 'Areas you checked and found sound' },
  },
  required: ['questions'],
}

const prompt = lens =>
  [
    'You review a draft spec before anything is built.',
    `Lens: ${lens.brief}`,
    '',
    `Spec: ${specPath}`,
    `Repository (read-only, explore as needed): ${repo}`,
    '',
    'Rules:',
    '- Read the spec in full. Check its claims against the code where it matters.',
    '- If the code or the spec already answers a question, do not ask it.',
    '- Every question gets a concrete recommendation and a one-line reason. "It depends" is not a recommendation: pick one and name the condition that would flip it.',
    '- Only raise points whose answer changes what gets built, or real spec defects (contradiction, uncheckable criterion). No wording or style nits.',
    '- At most 8 questions. Fewer is fine. An empty list is a valid answer if the spec is sound for your lens.',
    '- Do not edit, create, or delete any file.',
    '- Return the result through StructuredOutput.',
  ].join('\n')

phase('Review')

const results = await parallel(
  lenses.map(lens => () =>
    agent(prompt(lens), {
      label: `spec:${lens.key}`,
      phase: 'Review',
      agentType: 'Plan',
      model,
      effort,
      schema: SCHEMA,
    }).then(r => (r ? { lens: lens.key, ...r } : null)),
  ),
)

const returned = results.filter(Boolean)
const missing = lenses.map(l => l.key).filter(k => !returned.some(r => r.lens === k))
if (missing.length) log(`no result from: ${missing.join(', ')}`)

return { specPath, lenses: returned, missing }
