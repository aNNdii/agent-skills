/**
 * flow-fresh-context: registers /spec, /plan, /build, /review and /flow as extension commands.
 * Each command reads pi/prompts/<phase>.md, expands it like Pi's prompt templates and sends the
 * text raw (expandPromptTemplates off), so nothing recurses into this extension. decide() picks
 * the session: the current one, or a fresh one when this one already has history.
 *
 * Keep this the only .ts file directly under pi/extensions/: package.json loads every one of
 * them as an extension. Only erasable TypeScript, so Node's type stripping runs the tests.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

export type FreshSetting = boolean | 'ask'
const DEFAULTS = { spec: 'ask', plan: true, build: true, review: true, flow: 'ask' } satisfies Record<string, FreshSetting>
export type Phase = keyof typeof DEFAULTS
/** The one list of commands. */
export const PHASES = Object.keys(DEFAULTS) as Phase[]
export type Settings = Readonly<Record<Phase, FreshSetting>>
export interface ConfigResult { settings: Settings; warnings: string[] }

export interface Invocation {
  phase: Phase
  /** Raw text after "/<phase> ". */
  args: string
  /** ctx.mode */
  mode: string
  /** ctx.sessionManager.getBranch() */
  branch: readonly { readonly type: string }[]
  /** !ctx.isIdle() || ctx.hasPendingMessages() */
  busy: boolean
  setting: FreshSetting
}

export type Route =
  | { kind: 'here'; followUp: boolean }
  | { kind: 'fresh'; sessionName: string }
  | { kind: 'ask' }
  | { kind: 'busy' }

/** Session entry types that go into the LLM context. */
const CONTEXT_TYPES = new Set(['message', 'custom_message', 'branch_summary', 'compaction'])
const SESSION_NAME_MAX = 60
const FRESH = 'Fresh session'
const HERE = 'Continue here'

/** How long waitForSentRun waits for the sent prompt to start a run. */
const RUN_START_TIMEOUT_MS = 5000
const RUN_START_POLL_MS = 10

/** Absolute path of pi/prompts/<phase>.md, resolved from this file. */
export function promptFile (phase: Phase): string {
  return fileURLToPath(new URL(`../prompts/${phase}.md`, import.meta.url))
}

/** Raw .md text + raw args → prompt text, as Pi expands a prompt template. */
export function expandPrompt (file: string, args: string): string {
  return substitute(stripFrontmatter(file), parseArgs(args))
}

// The three helpers below copy Pi 1.3.0, which does not export them from its package index:
// stripFrontmatter ← dist/utils/frontmatter.js (extractFrontmatter) and dist/utils/text.js (stripBom),
// parseArgs ← dist/core/prompt-templates.js parseCommandArgs (lines 11–47),
// substitute ← dist/core/prompt-templates.js substituteArgs (lines 61–85).

function stripFrontmatter (content: string): string {
  const text = (content.startsWith('\uFEFF') ? content.slice(1) : content)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  if (!text.startsWith('---')) return text
  const end = text.indexOf('\n---', 3)
  if (end === -1) return text
  return text.slice(end + 4).trim()
}

/** Bash-style split; quoted empty strings ("" or '') stay as arguments. */
function parseArgs (input: string): string[] {
  const args: string[] = []
  let current = ''
  let hasToken = false
  let inQuote: string | null = null
  for (const char of input) {
    if (inQuote) {
      if (char === inQuote) inQuote = null
      else current += char
    } else if (char === '"' || char === "'") {
      inQuote = char
      hasToken = true
    } else if (/\s/.test(char)) {
      if (hasToken) {
        args.push(current)
        current = ''
        hasToken = false
      }
    } else {
      current += char
      hasToken = true
    }
  }
  if (hasToken) args.push(current)
  return args
}

/** Replaces placeholders in the template only; arguments are never substituted again. */
function substitute (content: string, args: string[]): string {
  const all = args.join(' ')
  return content.replace(
    /\$\{(\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
    (_match, defaultTarget, defaultValue, sliceStart, sliceLength, simple) => {
      if (defaultTarget) {
        const value = defaultTarget === '@' || defaultTarget === 'ARGUMENTS' ? all : args[parseInt(defaultTarget, 10) - 1]
        return value || defaultValue
      }
      if (sliceStart) {
        const start = Math.max(parseInt(sliceStart, 10) - 1, 0)
        return (sliceLength ? args.slice(start, start + parseInt(sliceLength, 10)) : args.slice(start)).join(' ')
      }
      if (simple === 'ARGUMENTS' || simple === '@') return all
      return args[parseInt(simple, 10) - 1] ?? ''
    }
  )
}

/**
 * Where the prompt goes, in this order: outside the TUI and without history it stays here;
 * then the setting decides, where /flow without arguments turns "ask" into true; a fresh
 * session while the agent is busy is refused before any dialog.
 */
export function decide (call: Invocation): Route {
  const here: Route = { kind: 'here', followUp: call.busy }
  if (call.mode !== 'tui' || !hasContext(call.branch)) return here
  const hasArgs = parseArgs(call.args).join(' ') !== ''
  const setting = call.phase === 'flow' && !hasArgs && call.setting === 'ask' ? true : call.setting
  if (setting === false) return here
  if (call.busy) return { kind: 'busy' }
  if (setting === true) return { kind: 'fresh', sessionName: sessionName(call.phase, call.args) }
  return { kind: 'ask' }
}

function hasContext (branch: Invocation['branch']): boolean {
  return branch.some((entry) => CONTEXT_TYPES.has(entry.type))
}

function sessionName (phase: Phase, args: string): string {
  return `/${phase} ${args}`.replace(/\s+/g, ' ').trim().slice(0, SESSION_NAME_MAX)
}

/** <agentDir>/as-flow.json; agentDir is PI_CODING_AGENT_DIR ('~' and '~/' expanded, resolved) or <home>/.pi/agent. */
export function configFile (env: Readonly<Record<string, string | undefined>> = process.env, home: string = homedir()): string {
  const dir = env.PI_CODING_AGENT_DIR
  if (!dir) return join(home, '.pi', 'agent', 'as-flow.json')
  const expanded = dir === '~' ? home : dir.startsWith('~/') ? join(home, dir.slice(2)) : dir
  return join(resolve(expanded), 'as-flow.json')
}

/**
 * text undefined means the file is missing. Each key of freshSession is checked on its own;
 * broken JSON or a freshSession that is no object gives one warning and all defaults.
 */
export function parseConfig (text: string | undefined, path: string): ConfigResult {
  const settings: Record<Phase, FreshSetting> = { ...DEFAULTS }
  if (text === undefined) return { settings, warnings: [] }
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch (err) {
    return { settings, warnings: [`${path}: invalid JSON (${errorText(err)}), using the defaults.`] }
  }
  if (!isObject(root)) return { settings, warnings: [`${path}: must be a JSON object, using the defaults.`] }
  const fresh = root.freshSession
  if (fresh === undefined) return { settings, warnings: [] }
  if (!isObject(fresh)) return { settings, warnings: [`${path}: "freshSession" must be an object, using the defaults.`] }
  const warnings: string[] = []
  for (const [key, value] of Object.entries(fresh)) {
    if (!Object.hasOwn(DEFAULTS, key)) {
      warnings.push(`${path}: unknown key "freshSession.${key}", ignored. Known: ${PHASES.join(', ')}.`)
    } else if (value !== true && value !== false && value !== 'ask') {
      warnings.push(`${path}: "freshSession.${key}" must be true, false or "ask", using the default.`)
    } else {
      settings[key as Phase] = value
    }
  }
  return { settings, warnings }
}

function isObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads the config on every call, so no /reload is needed. An unreadable file counts as broken. */
function readSettings (): ConfigResult {
  const path = configFile()
  let text: string | undefined
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as { code?: unknown }).code !== 'ENOENT') {
      return { settings: { ...DEFAULTS }, warnings: [`${path}: cannot read the config (${errorText(err)}), using the defaults.`] }
    }
  }
  return parseConfig(text, path)
}

function isBusy (ctx: ExtensionCommandContext): boolean {
  return !ctx.isIdle() || ctx.hasPendingMessages()
}

function errorText (err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Print and JSON mode exit once the command handler returns, so wait for the run the sent
 * prompt starts. Pi hands out no promise for it: poll until the agent is busy, then wait for idle.
 */
async function waitForSentRun (ctx: ExtensionCommandContext): Promise<void> {
  const deadline = Date.now() + RUN_START_TIMEOUT_MS
  while (ctx.isIdle()) {
    if (Date.now() >= deadline) return
    await new Promise((resolve) => setTimeout(resolve, RUN_START_POLL_MS))
  }
  await ctx.waitForIdle()
}

async function run (pi: ExtensionAPI, phase: Phase, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const path = promptFile(phase)
  let file: string
  try {
    file = readFileSync(path, 'utf8')
  } catch (err) {
    ctx.ui.notify(`Cannot read the prompt for /${phase} at ${path}: ${errorText(err)}`, 'error')
    return
  }
  const text = expandPrompt(file, args)
  const { settings, warnings } = readSettings()
  for (const warning of warnings) ctx.ui.notify(warning, 'warning')
  const call: Invocation = {
    phase,
    args,
    mode: ctx.mode,
    branch: ctx.sessionManager.getBranch(),
    busy: isBusy(ctx),
    setting: settings[phase]
  }
  let route = decide(call)
  if (route.kind === 'ask') {
    const choice = await ctx.ui.select(`Start /${phase} in a fresh session?`, [FRESH, HERE])
    if (choice === undefined) return
    route = decide({ ...call, busy: isBusy(ctx), setting: choice === FRESH })
  }
  switch (route.kind) {
    case 'busy':
      ctx.ui.notify(`Agent is busy, run /${phase} again when it is done.`, 'warning')
      return
    case 'fresh':
      await startFresh(ctx, phase, text, route.sessionName)
      return
    case 'here':
      pi.sendUserMessage(text, route.followUp ? { expandPromptTemplates: false, deliverAs: 'followUp' } : { expandPromptTemplates: false })
      if (ctx.mode !== 'tui') await waitForSentRun(ctx)
  }
}

/**
 * Replaces the session and sends the prompt through the new context. ctx and the captured pi are
 * stale after a successful switch. withSession never throws: Pi treats a throw there as fatal.
 */
async function startFresh (ctx: ExtensionCommandContext, phase: Phase, text: string, name: string): Promise<void> {
  const result = await ctx.newSession({
    parentSession: ctx.sessionManager.getSessionFile(),
    setup: async (sessionManager) => { sessionManager.appendSessionInfo(name) },
    withSession: async (next) => {
      try {
        next.ui.notify(`Fresh session for /${phase}. Previous session: /resume.`, 'info')
        void Promise.resolve()
          .then(() => next.sendUserMessage(text, { expandPromptTemplates: false }))
          .catch((err) => next.ui.notify(`Prompt for /${phase} not sent: ${errorText(err)}. Run /${phase} again.`, 'error'))
      } catch {
        // Nothing to report through: the new context itself failed.
      }
    }
  })
  if (result.cancelled) ctx.ui.notify(`/${phase}: new session cancelled, nothing sent.`, 'info')
}

export default function flowFreshContext (pi: ExtensionAPI): void {
  for (const phase of PHASES) {
    pi.registerCommand(phase, {
      description: `/${phase} in a fresh session when this one has history`,
      handler: (args, ctx) => run(pi, phase, args, ctx)
    })
  }
}
