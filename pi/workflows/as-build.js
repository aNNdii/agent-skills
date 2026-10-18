/**
 * as-build: run an approved plan task by task. One fresh subagent per task,
 * working in a worktree the lead prepared. The verify command gates every
 * task. No per-task review: the single review happens afterwards (/review).
 *
 * Tasks inside a workstream run in order. Workstreams (disjoint file sets,
 * one worktree each) run in parallel.
 *
 * args: {
 *   specPath, planPath,
 *   verify: string,                    // verify per task, the default for every task
 *   finalVerify: string[],             // required; checked here, run by the lead
 *   commits?: 'checkpoints' | 'none',  // default 'checkpoints'
 *   progressPath: string,              // absolute, <spec dir>/build-progress, in no worktree
 *   workstreams: [{ name, worktree, branch, tasks: [{ id, title, hard?, verify? }] }],
 *   tiers?: { high?, mid?, low? }
 * }
 * tiers maps each tier to an exact "<provider>/<id>"; see pi/references/model-tiers.md.
 *
 * The gate of a task: cd <worktree> && <task verify>, then && printf '%s\n'
 * '<ws>:<Tn>' >> <progressPath>. In mode none it stages first and records the
 * staged tree: && git add -A && tree=$(git write-tree) && printf '%s %s\n'
 * '<ws>:<Tn>' "$tree" >> <progressPath>. The gate runs on status blocked too, so
 * a blocked result carries staleProgress: '<ws>:<Tn>'. The lead deletes the line
 * that starts with it and, in mode none, restores the index to the tree of the
 * last remaining line.
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

const { specPath, planPath, verify, finalVerify, progressPath, workstreams } = args ?? {}
const commits = args?.commits ?? 'checkpoints'

// A pipe, `||`, `;`, a lone `&` (background) or a line break outside quotes
// lets the gate pass on a red command: the gate reads only the exit code of the
// last one. `&&` and the redirections `>&`/`<&` (as in `2>&1`) stay allowed. A
// backslash outside quotes is rejected too: an escaped quote would fool the
// quote stripping.
const hasPipe = cmd =>
  /[|;&\n\r\\]/.test(cmd.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '').replace(/&&|[<>]&/g, ''))

const problems = []
const isText = v => typeof v === 'string' && v.trim() !== ''
const checkCommand = (label, cmd) => {
  if (!isText(cmd)) problems.push(`${label} must be a non-empty string`)
  else if (hasPipe(cmd))
    problems.push(
      `${label} has a pipe, ||, ;, a lone &, a line break or a backslash outside quotes: ${JSON.stringify(cmd)} (the gate sees only the last exit code; use the runner's quiet or reporter flags)`,
    )
}

if (!isText(specPath)) problems.push('specPath must be a non-empty string')
if (!isText(planPath)) problems.push('planPath must be a non-empty string')
checkCommand('verify', verify)
if (!Array.isArray(finalVerify) || finalVerify.length === 0)
  problems.push('finalVerify must be a non-empty list of commands')
else finalVerify.forEach((cmd, i) => checkCommand(`finalVerify[${i}]`, cmd))
if (commits !== 'checkpoints' && commits !== 'none')
  problems.push(`commits must be "checkpoints" or "none", got ${JSON.stringify(commits)}`)
if (!Array.isArray(workstreams) || workstreams.length === 0) problems.push('workstreams must be a non-empty list')
else {
  if (commits === 'none' && workstreams.length !== 1)
    problems.push(`commits "none" needs exactly one workstream, got ${workstreams.length}`)
  const names = new Set()
  workstreams.forEach((ws, i) => {
    for (const key of ['name', 'worktree', 'branch'])
      if (!isText(ws?.[key])) problems.push(`workstreams[${i}].${key} must be a non-empty string`)
    if (names.has(ws?.name)) problems.push(`duplicate workstream name ${JSON.stringify(ws.name)}`)
    names.add(ws?.name)
    if (!Array.isArray(ws?.tasks) || ws.tasks.length === 0) {
      problems.push(`workstreams[${i}].tasks must be a non-empty list`)
      return
    }
    const ids = new Set()
    ws.tasks.forEach((task, j) => {
      for (const key of ['id', 'title'])
        if (!isText(task?.[key])) problems.push(`workstreams[${i}].tasks[${j}].${key} must be a non-empty string`)
      if (ids.has(task?.id)) problems.push(`duplicate task id ${JSON.stringify(`${ws.name}:${task.id}`)}`)
      ids.add(task?.id)
      if (task?.verify !== undefined) checkCommand(`${ws.name}:${task?.id} verify`, task.verify)
    })
  })
}
if (isText(progressPath)) {
  if (!progressPath.startsWith('/')) problems.push(`progressPath must be absolute, got ${JSON.stringify(progressPath)}`)
  // The check below compares strings (no filesystem here), so `..` could hide a path inside a worktree.
  else if (progressPath.split('/').some(part => part === '.' || part === '..'))
    problems.push(`progressPath must not contain . or .. segments, got ${JSON.stringify(progressPath)}`)
  else if (Array.isArray(workstreams)) {
    const inside = workstreams.find(ws => {
      const wt = isText(ws?.worktree) ? ws.worktree.replace(/\/+$/, '') : null
      return wt !== null && (progressPath === wt || progressPath.startsWith(`${wt}/`))
    })
    if (inside)
      problems.push(`progressPath must lie outside every worktree, but it is inside worktree ${JSON.stringify(inside.worktree)}`)
  }
} else problems.push('progressPath must be a non-empty string')

if (problems.length) throw new Error(`as-build args rejected:\n- ${problems.join('\n- ')}`)

const role = resolveRoles(ROLES)

const sh = s => `'${String(s).replace(/'/g, `'\\''`)}'`

const taskVerify = task => task.verify ?? verify

const gateFor = (ws, task) => {
  const line = sh(`${ws.name}:${task.id}`)
  const record =
    commits === 'none'
      ? ['git add -A', 'tree=$(git write-tree)', `printf '%s %s\\n' ${line} "$tree" >> ${sh(progressPath)}`]
      : [`printf '%s\\n' ${line} >> ${sh(progressPath)}`]
  return [`cd ${sh(ws.worktree)}`, taskVerify(task), ...record].join(' && ')
}

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

const RESET = '`git restore . && git clean -fd`'

// Mode-specific lines. In mode none the index is the green state: the gate
// stages after a passing verify, so anything unstaged belongs to the current
// attempt (or, in the first task of a resumed run, to an interrupted one).
const retryLines = () =>
  commits === 'none'
    ? '\nA previous attempt at this task failed: verification did not pass afterwards, or the agent stopped. ' +
      'Start with `git status` in the worktree. The index holds the green tasks; unstaged changes and untracked files ' +
      `come from the failed attempt: keep what is sound or discard it with ${RESET}, then find the root cause and finish the task.\n`
    : '\nA previous attempt at this task failed: verification did not pass afterwards, or the agent stopped. ' +
      'Start with `git status` and `git log -3` in the worktree, keep what is sound, find the root cause, and finish the task.\n'

const leftoverLines = () =>
  '\nIf `git status` shows unstaged changes or untracked files before you start, they come from an earlier, ' +
  `interrupted attempt at this task: keep what is sound or discard it with ${RESET}.\n`

const finishLines = task =>
  commits === 'none'
    ? [
        '6. Do not stage or commit: no `git add`, `git commit`, `git stash` or `git reset`. The index holds the state of the green tasks;',
        '   the gate stages your work once the verify command passes.',
      ]
    : [
        `6. Commits on this branch are allowed. Stage only the files you touched (never \`git add -A\`) and make a checkpoint commit, unsigned:`,
        `   \`git -c commit.gpgsign=false commit -m "<type>(<scope>): <summary> [${task.id}]"\`. These are squashed into one commit after the review.`,
      ]

const blockedLine = () =>
  commits === 'none'
    ? `Before you report "blocked", run ${RESET} so only the staged green state remains, and describe the state in \`blocker\`.`
    : 'Leave the worktree clean when blocked: commit nothing half-done, describe the state in `blocker`.'

const taskPrompt = (ws, task, notes, { retry, first }) =>
  [
    `You implement ONE task of an approved plan: ${task.id} "${task.title}".`,
    '',
    `Working directory: ${ws.worktree} (git worktree, branch ${ws.branch}).`,
    'Work only there. cd into it for every shell command, or use absolute paths inside it.',
    `Spec: ${specPath} (read-only). Plan: ${planPath} (read-only, lives outside the worktree, do not edit it).`,
    `Read the task section ${task.id} in the plan: acceptance, files, verify. Read the design section it builds on.`,
    retry ? retryLines() : commits === 'none' && first ? leftoverLines() : '',
    notes.length ? `Notes from earlier tasks:\n${notes.map(n => `- ${n}`).join('\n')}\n` : '',
    'Loop:',
    '1. Read the code the task touches. Follow existing conventions.',
    '2. RED: write a test for the acceptance criterion. Run it and see it fail for the right reason.',
    '   If the task has no testable behavior (config, docs, wiring), skip RED and say why in `tests`.',
    '3. GREEN: the minimal code that makes it pass.',
    `4. Run the full verify command: \`${taskVerify(task)}\`. Keep output short (quiet/reporter flags), read failures only.`,
    '5. Tidy only what this task wrote.',
    ...finishLines(task),
    '',
    'No network access: no downloads, and do not install tools, packages or browsers. If something is missing, stop with status "blocked".',
    '',
    'Stop with status "blocked" instead of guessing when:',
    '- the spec or plan is ambiguous in a way that changes what gets built;',
    "- the plan's design does not fit the real code and fixing it needs changes beyond this task;",
    '- the step is risky or irreversible: migrations on real data, deleting data, auth or permission changes the plan does not name, secrets, deploys, pushing;',
    '- a test cannot be made to pass after a real root-cause attempt.',
    blockedLine(),
    '',
    'Never: push, touch files outside the task, refactor neighbours, add features the plan does not name,',
    'skip, weaken, or delete tests, or silence lint and type checks.',
    '',
    'Report through StructuredOutput.',
  ].join('\n')

async function runStream(ws) {
  const done = []
  const notes = []

  for (const [i, task] of ws.tasks.entries()) {
    const base = { phase: 'Build', gate: gateFor(ws, task), schema: RESULT }
    const first = task.hard ? 'implement-hard' : 'implement'
    let r = await agent(taskPrompt(ws, task, notes, { retry: false, first: i === 0 }), {
      ...base,
      label: `${ws.name}:${task.id}`,
      ...role(first),
    })

    if (r === null) {
      log(`${ws.name}:${task.id} failed verification or stopped; one fresh retry`)
      r = await agent(taskPrompt(ws, task, notes, { retry: true, first: i === 0 }), {
        ...base,
        label: `${ws.name}:${task.id}:retry`,
        ...role('retry', first),
      })
    }

    if (r === null)
      return {
        name: ws.name,
        branch: ws.branch,
        done,
        stoppedAt: task.id,
        reason: `\`${taskVerify(task)}\` did not pass after one retry`,
      }
    // The gate also runs on status blocked, so its progress line is stale and the lead deletes it.
    if (r.status === 'blocked')
      return {
        name: ws.name,
        branch: ws.branch,
        done,
        stoppedAt: task.id,
        reason: r.blocker || r.summary,
        report: r,
        staleProgress: `${ws.name}:${task.id}`,
      }

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
