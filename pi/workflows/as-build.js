/**
 * as-build: run an approved plan task by task. One fresh subagent per task,
 * working in a worktree the lead prepared. The verify command gates every
 * task. No per-task review: the single review happens afterwards (/review).
 *
 * Tasks inside a workstream run in order. Workstreams (disjoint file sets,
 * one worktree each) run in parallel.
 *
 * args: {
 *   specPath, planPath, verify,
 *   workstreams: [{ name, worktree, branch, tasks: [{ id, title, hard? }] }],
 *   tiers?: { high?, mid?, low? }
 * }
 * tiers maps each tier to an exact "<provider>/<id>"; see pi/references/model-tiers.md.
 */
export const meta = {
  name: 'as-build',
  description: 'Execute an approved plan task by task in prepared worktrees; the test command gates each task',
  phases: [{ title: 'Build' }],
}

const ROLES = {
  implement: { tier: 'mid', effort: 'medium' },
  'implement-hard': { tier: 'high', effort: 'high' },
  retry: { tier: 'above', effort: 'high' }, // one tier above the first attempt, capped at high
}

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

const { specPath, planPath, verify, workstreams } = args ?? {}
if (!specPath || !planPath || !verify || !Array.isArray(workstreams) || workstreams.length === 0)
  throw new Error('as-build needs args.specPath, args.planPath, args.verify and a non-empty args.workstreams')

const role = resolveRoles(ROLES)

const sh = s => `'${String(s).replace(/'/g, `'\\''`)}'`

const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    commit: { type: 'string', description: 'Short SHA of the task commit' },
    summary: { type: 'string', description: 'Two or three sentences: what changed' },
    tests: { type: 'string', description: 'Tests added or changed, and the verify result' },
    deviations: { type: 'string', description: 'Where you departed from the plan and why. Empty if none' },
    notes_for_next: { type: 'string', description: 'Facts later tasks need (new names, gotchas). Empty if none' },
    blocker: { type: 'string', description: 'If blocked: what, where, and the options you see' },
  },
  required: ['status', 'summary'],
}

const taskPrompt = (ws, task, notes, retry) =>
  [
    `You implement ONE task of an approved plan: ${task.id} "${task.title}".`,
    '',
    `Working directory: ${ws.worktree} (git worktree, branch ${ws.branch}).`,
    'Work only there. cd into it for every shell command, or use absolute paths inside it.',
    `Spec: ${specPath} (read-only). Plan: ${planPath} (read-only, lives outside the worktree, do not edit it).`,
    `Read the task section ${task.id} in the plan: acceptance, files, verify. Read the design section it builds on.`,
    retry
      ? '\nA previous attempt at this task failed: verification did not pass afterwards, or the agent stopped. ' +
        'Start with `git status` and `git log -3` in the worktree, keep what is sound, find the root cause, and finish the task.\n'
      : '',
    notes.length ? `Notes from earlier tasks:\n${notes.map(n => `- ${n}`).join('\n')}\n` : '',
    'Loop:',
    '1. Read the code the task touches. Follow existing conventions.',
    '2. RED: write a test for the acceptance criterion. Run it and see it fail for the right reason.',
    '   If the task has no testable behavior (config, docs, wiring), skip RED and say why in `tests`.',
    '3. GREEN: the minimal code that makes it pass.',
    `4. Run the full verify command: \`${verify}\`. Keep output short (quiet/reporter flags), read failures only.`,
    '5. Tidy only what this task wrote.',
    `6. Stage only the files you touched (never \`git add -A\`) and make a checkpoint commit, unsigned:`,
    `   \`git -c commit.gpgsign=false commit -m "<type>(<scope>): <summary> [${task.id}]"\`. These are squashed into one commit after the review.`,
    '',
    'Stop with status "blocked" instead of guessing when:',
    '- the spec or plan is ambiguous in a way that changes what gets built;',
    "- the plan's design does not fit the real code and fixing it needs changes beyond this task;",
    '- the step is risky or irreversible: migrations on real data, deleting data, auth or permission changes the plan does not name, secrets, deploys, pushing;',
    '- a test cannot be made to pass after a real root-cause attempt.',
    'Leave the worktree clean when blocked: commit nothing half-done, describe the state in `blocker`.',
    '',
    'Never: push, touch files outside the task, refactor neighbours, add features the plan does not name,',
    'skip, weaken, or delete tests, or silence lint and type checks.',
    '',
    'Report through StructuredOutput.',
  ].join('\n')

async function runStream(ws) {
  const done = []
  const notes = []
  const gate = `cd ${sh(ws.worktree)} && ${verify}`

  for (const task of ws.tasks) {
    const base = { phase: 'Build', gate, schema: RESULT }
    const first = task.hard ? 'implement-hard' : 'implement'
    let r = await agent(taskPrompt(ws, task, notes, false), {
      ...base,
      label: `${ws.name}:${task.id}`,
      ...role(first),
    })

    if (r === null) {
      log(`${ws.name}:${task.id} failed verification or stopped; one fresh retry`)
      r = await agent(taskPrompt(ws, task, notes, true), {
        ...base,
        label: `${ws.name}:${task.id}:retry`,
        ...role('retry', first),
      })
    }

    if (r === null)
      return { name: ws.name, branch: ws.branch, done, stoppedAt: task.id, reason: `\`${verify}\` did not pass after one retry` }
    if (r.status === 'blocked')
      return { name: ws.name, branch: ws.branch, done, stoppedAt: task.id, reason: r.blocker || r.summary, report: r }

    done.push({ id: task.id, ...r })
    if (r.notes_for_next) notes.push(`${task.id}: ${r.notes_for_next}`)
    log(`${ws.name}:${task.id} done ${r.commit ?? ''}`)
  }

  return { name: ws.name, branch: ws.branch, done, stoppedAt: null }
}

phase('Build')

const results =
  workstreams.length === 1
    ? [await runStream(workstreams[0])]
    : await parallel(workstreams.map(ws => () => runStream(ws)))

return {
  verify,
  results: results.map((r, i) => r ?? { name: workstreams[i].name, done: [], stoppedAt: '?', reason: 'workstream crashed' }),
}
