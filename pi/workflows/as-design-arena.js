/**
 * as-design-arena: ground the affected code once, let 2-3 runners with
 * structurally different lenses design against the same spec, then a judge
 * scores them and proposes a base plus grafts. The calling skill (as-plan)
 * picks, grafts, and writes the plan.
 *
 * Adapted from pstack's architect + arena skills (MIT, Lauren Tan).
 *
 * args: { specPath, repo, redFlagsPath, model?, lenses?: (string | {key, brief})[], notes? }
 */
export const meta = {
  name: 'as-design-arena',
  description: 'Design arena: grounding, competing design candidates, cross-judge with base and grafts',
  phases: [{ title: 'Ground' }, { title: 'Design' }, { title: 'Judge' }],
}

const { specPath, repo, redFlagsPath } = args ?? {}
if (!specPath || !repo || !redFlagsPath)
  throw new Error('as-design-arena needs args.specPath, args.repo and args.redFlagsPath (absolute paths)')

const model = args?.model ?? 'opus'
const notes = args?.notes ? `\nNotes from the lead:\n${args.notes}\n` : ''

const DEFAULT_LENSES = [
  {
    key: 'minimal',
    brief:
      'Minimal change. The smallest design that fully meets the spec. Reuse existing modules and patterns. ' +
      'Add a new concept only if it removes more complexity than it adds.',
  },
  {
    key: 'domain',
    brief:
      'Domain model first. Get the core types and data structures right: state machines or discriminated unions over flags, ' +
      'one owner per piece of state, illegal states unrepresentable. Let the code follow the data.',
  },
  {
    key: 'caller',
    brief:
      'Caller first. Write the ideal call sites and API before anything else. A deep module with a small interface, ' +
      'explicit errors and boundaries, easy to test from the outside.',
  },
]
const lenses = (args?.lenses ?? DEFAULT_LENSES).map(l => (typeof l === 'string' ? { key: l, brief: l } : l))

// ---------- Ground ----------
phase('Ground')

const grounding = await agent(
  [
    'Build the grounding a designer needs before changing this codebase. Read-only.',
    `Spec: ${specPath}`,
    `Repository: ${repo}`,
    notes,
    'Report, in at most ~800 words, with file paths:',
    '- The subsystem(s) the spec touches: how they work today, main types and entry points.',
    '- Conventions a new change must follow (structure, naming, error handling, test style).',
    '- The test command(s) and how long they take, if you can tell.',
    '- Existing code that could be reused, and constraints the design must respect.',
    'Pointers and summaries, not file dumps. Do not edit any file.',
  ].join('\n'),
  { label: 'ground', phase: 'Ground', agentType: 'Explore', model, effort: 'medium' },
)

if (!grounding) throw new Error('grounding agent returned nothing')

// ---------- Design ----------
phase('Design')

const DESIGN = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'The shape in three to five sentences' },
    usage: { type: 'string', description: 'Two or three real call sites, as code' },
    types_and_signatures: { type: 'string', description: 'Types and signatures as code, bodies `not implemented`' },
    module_map: { type: 'string', description: 'Files/modules: new, changed, deleted, and what each owns' },
    data_flow: { type: 'string', description: 'Input to output through the design' },
    tasks: { type: 'array', items: { type: 'string' }, description: 'Vertical slices in build order, one line each' },
    risks: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'string' }, description: 'Alternatives you considered and why they lost' },
    red_flags_check: { type: 'string', description: 'Which red flags you checked and how the design avoids them' },
  },
  required: ['summary', 'usage', 'types_and_signatures', 'module_map', 'tasks', 'rejected'],
}

const runnerPrompt = lens =>
  [
    'You produce ONE candidate design for an approved spec. Other runners design the same spec through other lenses.',
    `Your lens: ${lens.brief}`,
    '',
    `Spec: ${specPath}`,
    `Repository (read-only): ${repo}`,
    `Design red flags to screen against: ${redFlagsPath}`,
    notes,
    'Grounding from an explorer (verify anything you rely on):',
    grounding,
    '',
    'Discipline:',
    '- Caller usage first: write two or three real call sites, then derive types and signatures from them.',
    '- Data structures first: trace each main access pattern through the structure. "We add a cache later" means the structure is wrong.',
    '- Prefer a small interface hiding real complexity. No wire or framework types on the public surface.',
    '- If two actors can write the same state, give it one owner or split it.',
    '- Validate at boundaries, keep logic pure inside. One source of truth per invariant.',
    '- Short call chains. If tracing the flow takes more than three files, flatten.',
    '- Every acceptance criterion in the spec must be covered by the design.',
    '- Tasks are vertical slices, each ending in a passing test, at most ~5 files each.',
    '',
    'Commit to your lens. Do not hedge toward a safe middle; the differences between candidates are the signal.',
    'Do not edit any file. Return the design through StructuredOutput.',
  ].join('\n')

const designs = await parallel(
  lenses.map(lens => () =>
    agent(runnerPrompt(lens), {
      label: `design:${lens.key}`,
      phase: 'Design',
      agentType: 'Plan',
      model,
      effort: 'high',
      schema: DESIGN,
    }).then(d => (d ? { lens: lens.key, ...d } : null)),
  ),
)

const candidates = designs.filter(Boolean)
const dropped = lenses.map(l => l.key).filter(k => !candidates.some(c => c.lens === k))
if (dropped.length) log(`no design from: ${dropped.join(', ')}`)
if (candidates.length === 0) throw new Error('no design candidate returned')

// ---------- Judge ----------
phase('Judge')

const VERDICT = {
  type: 'object',
  properties: {
    rubric: { type: 'array', items: { type: 'string' } },
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          candidate: { type: 'string' },
          per_criterion: {
            type: 'array',
            items: {
              type: 'object',
              properties: { criterion: { type: 'string' }, score: { type: 'number' }, note: { type: 'string' } },
              required: ['criterion', 'score'],
            },
          },
          red_flags: { type: 'array', items: { type: 'string' } },
        },
        required: ['candidate', 'per_criterion'],
      },
    },
    converged: { type: 'boolean', description: 'True if the candidates share essentially one shape' },
    recommended_base: { type: 'string' },
    why: { type: 'string' },
    grafts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { from: { type: 'string' }, idea: { type: 'string' }, why: { type: 'string' } },
        required: ['from', 'idea', 'why'],
      },
    },
    forks: {
      type: 'array',
      description: 'Real decisions where candidates differ and the spec does not decide',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                option: { type: 'string' },
                candidates: { type: 'array', items: { type: 'string' } },
                reasoning: { type: 'string' },
              },
              required: ['option', 'reasoning'],
            },
          },
          recommendation: { type: 'string' },
        },
        required: ['question', 'options', 'recommendation'],
      },
    },
  },
  required: ['rubric', 'scores', 'converged', 'recommended_base', 'why', 'grafts', 'forks'],
}

const judgePrompt = [
  'You judge competing design candidates for one approved spec. You did not write any of them.',
  `Spec: ${specPath}`,
  `Repository (read-only, check claims against the code): ${repo}`,
  `Design red flags: ${redFlagsPath}`,
  '',
  'Rubric: derive 4-6 criteria. Always include: covers every acceptance criterion; fits the existing code and conventions;',
  'simplicity (smallest public surface, fewest new concepts); free of red flags; testability. Score 1-5 per criterion.',
  '',
  'Then: recommend the base a future maintainer can extend most safely (tie: smaller interface, cleaner boundary),',
  'list 0-3 grafts worth porting from the others, and list forks: decisions where candidates differ and the spec does not decide.',
  'Every fork gets a recommendation. Do not invent forks over style. Do not edit any file.',
  '',
  'Candidates:',
  ...candidates.map(c => `\n## Candidate "${c.lens}"\n${JSON.stringify(c, null, 2)}`),
].join('\n')

const verdict = await agent(judgePrompt, {
  label: 'judge',
  phase: 'Judge',
  agentType: 'Plan',
  model,
  effort: 'high',
  schema: VERDICT,
})

if (!verdict) log('judge returned nothing; the lead must pick without a cross-check')

return { grounding, candidates, dropped, verdict }
