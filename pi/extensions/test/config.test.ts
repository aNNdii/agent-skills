/**
 * Tests for the per-phase config (AC7) of pi/extensions/flow-fresh-context.ts: the file location,
 * the parsing and the reading on every command. Run with `node --test pi/extensions/test/`.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import flowFreshContext, { configFile, parseConfig } from '../flow-fresh-context.ts'

const PATH = '/agent/as-flow.json'
const DEFAULTS = { spec: 'ask', plan: true, build: true, review: true, flow: 'ask' }

test('configFile: PI_CODING_AGENT_DIR unset or empty → <home>/.pi/agent', () => {
  assert.equal(configFile({}, '/home/u'), '/home/u/.pi/agent/as-flow.json')
  assert.equal(configFile({ PI_CODING_AGENT_DIR: '' }, '/home/u'), '/home/u/.pi/agent/as-flow.json')
})

test('configFile: "~", "~/x", absolute and relative directories', () => {
  assert.equal(configFile({ PI_CODING_AGENT_DIR: '~' }, '/home/u'), '/home/u/as-flow.json')
  assert.equal(configFile({ PI_CODING_AGENT_DIR: '~/x' }, '/home/u'), '/home/u/x/as-flow.json')
  assert.equal(configFile({ PI_CODING_AGENT_DIR: '/etc/pi/' }, '/home/u'), '/etc/pi/as-flow.json')
  assert.equal(configFile({ PI_CODING_AGENT_DIR: 'rel/dir' }, '/home/u'), resolve('rel/dir', 'as-flow.json'))
})

test('missing file or empty object → defaults, no warning', () => {
  assert.deepEqual(parseConfig(undefined, PATH), { settings: DEFAULTS, warnings: [] })
  assert.deepEqual(parseConfig('{}', PATH), { settings: DEFAULTS, warnings: [] })
  assert.deepEqual(parseConfig('{"freshSession":{}}', PATH), { settings: DEFAULTS, warnings: [] })
})

test('partial override keeps the other defaults', () => {
  const text = JSON.stringify({ freshSession: { spec: true, plan: false, flow: false, review: 'ask' } })
  assert.deepEqual(parseConfig(text, PATH), {
    settings: { spec: true, plan: false, build: true, review: 'ask', flow: false },
    warnings: []
  })
})

test('unknown key → warning with path and key, the rest applies', () => {
  const { settings, warnings } = parseConfig('{"freshSession":{"revew":false,"plan":false}}', PATH)
  assert.deepEqual(settings, { ...DEFAULTS, plan: false })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /\/agent\/as-flow\.json/)
  assert.match(warnings[0], /revew/)
})

test('own key __proto__ counts as unknown', () => {
  const { settings, warnings } = parseConfig('{"freshSession":{"__proto__":{"plan":false}}}', PATH)
  assert.deepEqual(settings, DEFAULTS)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /__proto__/)
  assert.match(warnings[0], /\/agent\/as-flow\.json/)
})

test('invalid value → warning with path and key, default for that key', () => {
  for (const value of ['"yes"', '1', 'null', '[]', '"true"']) {
    const { settings, warnings } = parseConfig(`{"freshSession":{"build":${value},"spec":false}}`, PATH)
    assert.deepEqual(settings, { ...DEFAULTS, spec: false }, value)
    assert.equal(warnings.length, 1, value)
    assert.match(warnings[0], /\/agent\/as-flow\.json/)
    assert.match(warnings[0], /build/)
  }
})

test('broken JSON or a freshSession that is no object → one warning, all defaults', () => {
  const texts = [
    '{"freshSession":', '', 'not json',
    '{"freshSession":null}', '{"freshSession":[]}', '{"freshSession":"plan"}', '{"freshSession":true}',
    'null', '[]', '"x"'
  ]
  for (const text of texts) {
    const { settings, warnings } = parseConfig(text, PATH)
    assert.deepEqual(settings, DEFAULTS, text)
    assert.equal(warnings.length, 1, text)
    assert.match(warnings[0], /\/agent\/as-flow\.json/, text)
  }
})

// The command reads the config of PI_CODING_AGENT_DIR on every call.

const dir = mkdtempSync(join(tmpdir(), 'flow-fresh-context-'))
process.env.PI_CODING_AGENT_DIR = dir
const file = join(dir, 'as-flow.json')
after(() => {
  try { chmodSync(file, 0o644) } catch {}
  rmSync(dir, { recursive: true, force: true })
})

function setup () {
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>()
  const sent: unknown[] = []
  const notes: { message: string; level: string }[] = []
  const newSessions: unknown[] = []
  const pi = {
    registerCommand: (name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
      commands.set(name, options)
    },
    sendUserMessage: (text: unknown) => { sent.push(text) }
  }
  const ctx = {
    mode: 'tui',
    isIdle: () => true,
    hasPendingMessages: () => false,
    waitForIdle: async () => {},
    sessionManager: { getBranch: () => [{ type: 'message' }], getSessionFile: () => '/sessions/old.jsonl' },
    ui: {
      notify: (message: string, level: string) => { notes.push({ message, level }) },
      select: async () => undefined
    },
    newSession: async (options: unknown) => {
      newSessions.push(options)
      return { cancelled: false }
    }
  }
  flowFreshContext(pi as never)
  const plan = () => commands.get('plan')!.handler('', ctx)
  return { plan, sent, notes, newSessions }
}

function reset () {
  rmSync(file, { recursive: true, force: true })
}

test('command: no config file → defaults, no warning', async () => {
  reset()
  const { plan, sent, notes, newSessions } = setup()
  await plan()
  assert.equal(newSessions.length, 1)
  assert.equal(sent.length, 0)
  assert.deepEqual(notes, [])
})

test('command: the config is read on every call, no reload needed', async () => {
  reset()
  const { plan, sent, newSessions } = setup()
  await plan()
  assert.equal(newSessions.length, 1)
  writeFileSync(file, '{"freshSession":{"plan":false}}')
  await plan()
  assert.equal(newSessions.length, 1)
  assert.equal(sent.length, 1)
})

test('command: config warnings are shown, the valid rest applies', async () => {
  reset()
  writeFileSync(file, '{"freshSession":{"revew":true,"plan":false}}')
  const { plan, sent, notes, newSessions } = setup()
  await plan()
  assert.equal(newSessions.length, 0)
  assert.equal(sent.length, 1)
  assert.equal(notes.length, 1)
  assert.equal(notes[0].level, 'warning')
  assert.ok(notes[0].message.includes(file))
  assert.match(notes[0].message, /revew/)
})

test('command: an unreadable config (EISDIR) → one warning, all defaults', async () => {
  reset()
  mkdirSync(file)
  const { plan, notes, newSessions } = setup()
  await plan()
  assert.equal(newSessions.length, 1)
  assert.equal(notes.length, 1)
  assert.equal(notes[0].level, 'warning')
  assert.ok(notes[0].message.includes(file))
})

test('command: an unreadable config (EACCES) → one warning, all defaults', { skip: process.getuid?.() === 0 && 'root reads any file' }, async () => {
  reset()
  writeFileSync(file, '{"freshSession":{"plan":false}}')
  chmodSync(file, 0o000)
  const { plan, sent, notes, newSessions } = setup()
  await plan()
  chmodSync(file, 0o644)
  assert.equal(newSessions.length, 1)
  assert.equal(sent.length, 0)
  assert.equal(notes.length, 1)
  assert.equal(notes[0].level, 'warning')
  assert.ok(notes[0].message.includes(file))
})
