/**
 * Tests for prompt expansion (AC2) and the command wiring (AC1) of
 * pi/extensions/flow-fresh-context.ts. Run with `node --test pi/extensions/test/`.
 */
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import flowFreshContext, { PHASES, promptFile, expandPrompt } from '../flow-fresh-context.ts'

// The wiring tests expect the defaults: read the config from an empty dir, never ~/.pi/agent.
const agentDir = mkdtempSync(join(tmpdir(), 'flow-fresh-context-'))
process.env.PI_CODING_AGENT_DIR = agentDir
after(() => rmSync(agentDir, { recursive: true, force: true }))

test('strips the frontmatter and trims the body', () => {
  const file = '---\ndescription: "x"\nargument-hint: "[y]"\n---\n\nUse it. Request: $@\n'
  assert.equal(expandPrompt(file, 'go'), 'Use it. Request: go')
})

test('handles CRLF line endings and a BOM', () => {
  const file = '\uFEFF---\r\ndescription: x\r\n---\r\nLine one\r\nRequest: $@\r\n'
  assert.equal(expandPrompt(file, 'go'), 'Line one\nRequest: go')
})

test('keeps a body without frontmatter as is', () => {
  assert.equal(expandPrompt('Request: $ARGUMENTS', 'go'), 'Request: go')
})

test('splits arguments like a shell', () => {
  assert.equal(expandPrompt('Request: $@', '"a b" c'), 'Request: a b c')
  assert.equal(expandPrompt('First: $1, second: $2', "'a b' c"), 'First: a b, second: c')
})

test('uses the default for missing or empty arguments', () => {
  assert.equal(expandPrompt('Spec: ${@:-newest}', ''), 'Spec: newest')
  assert.equal(expandPrompt('Spec: ${@:-newest}', '""'), 'Spec: newest')
  assert.equal(expandPrompt('Spec: ${ARGUMENTS:-d}', '  '), 'Spec: d')
  assert.equal(expandPrompt('Spec: ${ARGUMENTS:-d}', 'x y'), 'Spec: x y')
})

test('substitutes positional arguments', () => {
  assert.equal(expandPrompt('$1|$2|$3', 'a b'), 'a|b|')
})

test('does not substitute placeholders inside arguments', () => {
  assert.equal(expandPrompt('Request: $@ and $1', '$@ $ARGUMENTS'), 'Request: $@ $ARGUMENTS and $@')
})

test('the five real prompts expand without leftover placeholders', () => {
  assert.deepEqual([...PHASES].sort(), ['build', 'flow', 'plan', 'review', 'spec'])
  for (const phase of PHASES) {
    const file = readFileSync(promptFile(phase), 'utf8')
    for (const args of ['', '"a b" c']) {
      const text = expandPrompt(file, args)
      assert.ok(text.length > 0, `${phase} with ${args}`)
      for (const leftover of ['$@', '$ARGUMENTS', '${']) {
        assert.ok(!text.includes(leftover), `${phase} with ${args} contains ${leftover}`)
      }
    }
  }
})

/** Minimal fakes for ExtensionAPI and ExtensionCommandContext: an empty session, so the `here` route. */
function setup (ctxOverrides: Record<string, unknown> = {}) {
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>()
  const sent: { text: unknown; options: unknown }[] = []
  const notes: { message: string; level: string }[] = []
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
    sessionManager: { getBranch: () => [] },
    ui: { notify: (message: string, level: string) => { notes.push({ message, level }) } },
    ...ctxOverrides
  }
  flowFreshContext(pi as never)
  return { commands, sent, notes, ctx }
}

test('registers one command per phase', () => {
  const { commands } = setup()
  assert.deepEqual([...commands.keys()].sort(), [...PHASES].sort())
})

test('sends the expanded prompt raw in the current session', async () => {
  const { commands, sent, ctx } = setup()
  await commands.get('spec')!.handler('"a b" c', ctx)
  const expected = expandPrompt(readFileSync(promptFile('spec'), 'utf8'), '"a b" c')
  assert.deepEqual(sent, [{ text: expected, options: { expandPromptTemplates: false } }])
  assert.ok(expected.endsWith('a b c'))
})

test('queues the prompt as a follow-up when the agent is busy', async () => {
  for (const busy of [{ isIdle: () => false }, { hasPendingMessages: () => true }]) {
    const { commands, sent, ctx } = setup(busy)
    await commands.get('plan')!.handler('', ctx)
    assert.deepEqual(sent.map((s) => s.options), [{ expandPromptTemplates: false, deliverAs: 'followUp' }])
  }
})

test('outside the TUI waits for the started run to end', async () => {
  let idle = true
  let waited = false
  const { commands, sent, ctx } = setup({
    mode: 'print',
    isIdle: () => idle,
    waitForIdle: async () => { waited = !idle }
  })
  const run = commands.get('build')!.handler('', ctx)
  setTimeout(() => { idle = false }, 30)
  await run
  assert.equal(sent.length, 1)
  assert.equal(waited, true)
})
