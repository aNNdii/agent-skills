/**
 * Tests for the routing decision (AC3, AC4, AC5) and the fresh-session wiring (AC5, AC6) of
 * pi/extensions/flow-fresh-context.ts. Run with `node --test pi/extensions/test/`.
 */
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import flowFreshContext, { decide, expandPrompt, promptFile } from '../flow-fresh-context.ts'
import type { FreshSetting, Invocation, Phase } from '../flow-fresh-context.ts'

// The wiring tests expect the defaults: read the config from an empty dir, never ~/.pi/agent.
const agentDir = mkdtempSync(join(tmpdir(), 'flow-fresh-context-'))
process.env.PI_CODING_AGENT_DIR = agentDir
after(() => rmSync(agentDir, { recursive: true, force: true }))

const HISTORY = [{ type: 'message' }]

function call (overrides: Partial<Invocation> = {}): Invocation {
  return { phase: 'plan', args: '', mode: 'tui', branch: HISTORY, busy: false, setting: true, ...overrides }
}

test('outside the TUI stays in the current session', () => {
  for (const mode of ['print', 'json', 'rpc']) {
    assert.deepEqual(decide(call({ mode })), { kind: 'here', followUp: false })
    assert.deepEqual(decide(call({ mode, busy: true })), { kind: 'here', followUp: true })
  }
})

test('a branch without context stays in the current session', () => {
  const noContext = ['custom', 'model_change', 'thinking_level_change', 'label', 'session_info', 'usage', 'context_edit']
  for (const branch of [[], noContext.map((type) => ({ type }))]) {
    for (const setting of [true, 'ask', false] as FreshSetting[]) {
      assert.deepEqual(decide(call({ branch, setting })), { kind: 'here', followUp: false })
      assert.deepEqual(decide(call({ branch, setting, busy: true })), { kind: 'here', followUp: true })
    }
  }
})

test('every context entry type alone counts as history', () => {
  for (const type of ['message', 'custom_message', 'branch_summary', 'compaction']) {
    assert.deepEqual(decide(call({ branch: [{ type: 'label' }, { type }] })), { kind: 'fresh', sessionName: '/plan' })
  }
})

test('setting × busy', () => {
  assert.deepEqual(decide(call({ setting: false })), { kind: 'here', followUp: false })
  assert.deepEqual(decide(call({ setting: false, busy: true })), { kind: 'here', followUp: true })
  assert.deepEqual(decide(call({ setting: true })), { kind: 'fresh', sessionName: '/plan' })
  assert.deepEqual(decide(call({ setting: true, busy: true })), { kind: 'busy' })
  assert.deepEqual(decide(call({ setting: 'ask' })), { kind: 'ask' })
  assert.deepEqual(decide(call({ setting: 'ask', busy: true })), { kind: 'busy' })
})

test('/flow without arguments turns "ask" into fresh, false stays false', () => {
  for (const args of ['', '  ', '""', "''"]) {
    assert.deepEqual(decide(call({ phase: 'flow', args, setting: 'ask' })), { kind: 'fresh', sessionName: `/flow ${args}`.trim() })
    assert.deepEqual(decide(call({ phase: 'flow', args, setting: false })), { kind: 'here', followUp: false })
  }
  assert.deepEqual(decide(call({ phase: 'flow', args: 'new thing', setting: 'ask' })), { kind: 'ask' })
  assert.deepEqual(decide(call({ phase: 'flow', args: 'new thing', setting: false })), { kind: 'here', followUp: false })
})

test('the /flow rule applies only to flow', () => {
  for (const phase of ['spec', 'plan', 'build', 'review'] as Phase[]) {
    assert.deepEqual(decide(call({ phase, args: '', setting: 'ask' })), { kind: 'ask' })
  }
})

test('session name: whitespace collapsed, trimmed, at most 60 characters', () => {
  assert.deepEqual(decide(call({ args: 'a\n b' })), { kind: 'fresh', sessionName: '/plan a b' })
  assert.deepEqual(decide(call({ args: '\tx\t\ty \n' })), { kind: 'fresh', sessionName: '/plan x y' })
  assert.deepEqual(decide(call({ phase: 'flow', args: '""', setting: 'ask' })), { kind: 'fresh', sessionName: '/flow ""' })
  const name = (decide(call({ args: 'x'.repeat(100) })) as { sessionName: string }).sessionName
  assert.equal(name, `/plan ${'x'.repeat(54)}`)
  assert.equal(name.length, 60)
})

/** Fakes for ExtensionAPI and ExtensionCommandContext, enough for every route. */
function setup (ctxOverrides: Record<string, unknown> = {}) {
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>()
  const sent: { text: unknown; options: unknown }[] = []
  const notes: { message: string; level: string }[] = []
  const newSessions: Record<string, unknown>[] = []
  const pi = {
    registerCommand: (name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
      commands.set(name, options)
    },
    sendUserMessage: (text: unknown, options: unknown) => { sent.push({ text, options }) }
  }
  const ctx = {
    mode: 'tui',
    isIdle: () => true,
    hasPendingMessages: () => false,
    waitForIdle: async () => {},
    sessionManager: { getBranch: () => HISTORY, getSessionFile: () => '/sessions/old.jsonl' },
    ui: {
      notify: (message: string, level: string) => { notes.push({ message, level }) },
      select: async () => undefined as string | undefined
    },
    newSession: async (options: Record<string, unknown>) => {
      newSessions.push(options)
      return { cancelled: false }
    },
    ...ctxOverrides
  }
  flowFreshContext(pi as never)
  return { commands, sent, notes, newSessions, ctx }
}

/** A replacement context as passed to withSession. */
function nextContext (send: (text: unknown, options: unknown) => Promise<void>) {
  const notes: { message: string; level: string }[] = []
  return { notes, next: { sendUserMessage: send, ui: { notify: (message: string, level: string) => { notes.push({ message, level }) } } } }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('fresh: new session with parent, name and the raw prompt via the new context', async () => {
  const { commands, sent, notes, newSessions, ctx } = setup()
  await commands.get('plan')!.handler('a\n b', ctx)
  assert.equal(sent.length, 0)
  assert.equal(notes.length, 0)
  assert.equal(newSessions.length, 1)
  const options = newSessions[0] as {
    parentSession: string
    setup: (sm: unknown) => Promise<void>
    withSession: (next: unknown) => Promise<void>
  }
  assert.equal(options.parentSession, '/sessions/old.jsonl')

  const names: string[] = []
  await options.setup({ appendSessionInfo: (name: string) => { names.push(name); return 'id' } })
  assert.deepEqual(names, ['/plan a b'])

  const nextSent: { text: unknown; options: unknown }[] = []
  const { notes: nextNotes, next } = nextContext(async (text, opts) => { nextSent.push({ text, options: opts }) })
  await options.withSession(next)
  await tick()
  assert.deepEqual(nextNotes, [{ message: 'Fresh session for /plan. Previous session: /resume.', level: 'info' }])
  const expected = expandPrompt(readFileSync(promptFile('plan'), 'utf8'), 'a\n b')
  assert.deepEqual(nextSent, [{ text: expected, options: { expandPromptTemplates: false } }])
})

test('fresh: a failed send is reported and withSession does not throw', async () => {
  const { commands, newSessions, ctx } = setup()
  await commands.get('build')!.handler('', ctx)
  const { withSession } = newSessions[0] as { withSession: (next: unknown) => Promise<void> }

  const rejecting = nextContext(async () => { throw new Error('No API key') })
  await withSession(rejecting.next)
  await tick()
  assert.deepEqual(rejecting.notes.at(-1), { message: 'Prompt for /build not sent: No API key. Run /build again.', level: 'error' })

  const throwing = nextContext(() => { throw new Error('sync boom') })
  await withSession(throwing.next)
  await tick()
  assert.deepEqual(throwing.notes.at(-1), { message: 'Prompt for /build not sent: sync boom. Run /build again.', level: 'error' })

  await assert.doesNotReject(withSession({ ui: { notify: () => { throw new Error('stale') } }, sendUserMessage: async () => {} }))
})

test('fresh: a cancelled new session sends nothing and says so', async () => {
  const { commands, sent, notes, ctx } = setup({ newSession: async () => ({ cancelled: true }) })
  await commands.get('review')!.handler('', ctx)
  assert.equal(sent.length, 0)
  assert.deepEqual(notes, [{ message: '/review: new session cancelled, nothing sent.', level: 'info' }])
})

test('fresh but busy: warning only, before any dialog', async () => {
  for (const phase of ['plan', 'spec']) {
    let asked = false
    const { commands, sent, notes, newSessions, ctx } = setup({ isIdle: () => false })
    ;(ctx.ui as { select: unknown }).select = async () => { asked = true; return 'Fresh session' }
    await commands.get(phase)!.handler('x', ctx)
    assert.equal(asked, false)
    assert.equal(sent.length, 0)
    assert.equal(newSessions.length, 0)
    assert.deepEqual(notes, [{ message: `Agent is busy, run /${phase} again when it is done.`, level: 'warning' }])
  }
})

test('ask: dialog with "Fresh session" first; each answer routes', async () => {
  const dialogs: { title: string; options: string[] }[] = []
  const answer = (choice: string | undefined) => async (title: string, options: string[]) => {
    dialogs.push({ title, options })
    return choice
  }

  const fresh = setup()
  fresh.ctx.ui.select = answer('Fresh session')
  await fresh.commands.get('spec')!.handler('x', fresh.ctx)
  assert.equal(fresh.newSessions.length, 1)
  assert.equal(fresh.sent.length, 0)
  assert.deepEqual(dialogs[0], { title: 'Start /spec in a fresh session?', options: ['Fresh session', 'Continue here'] })

  const here = setup()
  here.ctx.ui.select = answer('Continue here')
  await here.commands.get('spec')!.handler('x', here.ctx)
  assert.equal(here.newSessions.length, 0)
  assert.deepEqual(here.sent.map((s) => s.options), [{ expandPromptTemplates: false }])

  const escape = setup()
  escape.ctx.ui.select = answer(undefined)
  await escape.commands.get('spec')!.handler('x', escape.ctx)
  assert.equal(escape.newSessions.length, 0)
  assert.equal(escape.sent.length, 0)
  assert.equal(escape.notes.length, 0)
})

test('ask: the agent turning busy during the dialog is checked again', async () => {
  let idle = true
  const fresh = setup({ isIdle: () => idle })
  fresh.ctx.ui.select = async () => { idle = false; return 'Fresh session' }
  await fresh.commands.get('spec')!.handler('x', fresh.ctx)
  assert.equal(fresh.newSessions.length, 0)
  assert.deepEqual(fresh.notes.map((n) => n.level), ['warning'])

  idle = true
  const here = setup({ isIdle: () => idle })
  here.ctx.ui.select = async () => { idle = false; return 'Continue here' }
  await here.commands.get('spec')!.handler('x', here.ctx)
  assert.deepEqual(here.sent.map((s) => s.options), [{ expandPromptTemplates: false, deliverAs: 'followUp' }])
})
