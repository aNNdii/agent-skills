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
 *   model?
 * }
 */
export const meta = {
  name: 'as-build',
  description: 'Execute an approved plan task by task in prepared worktrees; the test command gates each task',
  phases: [{ title: 'Build' }],
}

const { specPath, planPath, verify, workstreams } = args ?? {}
if (!specPath || !planPath || !verify || !Array.isArray(workstreams) || workstreams.length === 0)
  throw new Error('as-build needs args.specPath, args.planPath, args.verify and a non-empty args.workstreams')

const model = args?.model // omitted: inherit the lead's model

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
    `6. Stage only the files you touched (never \`git add -A\`) and commit: "<type>(<scope>): <summary> [${task.id}]".`,
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
    const base = { phase: 'Build', model, gate, schema: RESULT }
    let r = await agent(taskPrompt(ws, task, notes, false), {
      ...base,
      label: `${ws.name}:${task.id}`,
      effort: task.hard ? 'high' : 'medium',
    })

    if (r === null) {
      log(`${ws.name}:${task.id} failed verification or stopped; one fresh retry`)
      r = await agent(taskPrompt(ws, task, notes, true), {
        ...base,
        label: `${ws.name}:${task.id}:retry`,
        effort: 'high',
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
