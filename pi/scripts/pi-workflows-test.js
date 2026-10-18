#!/usr/bin/env node

'use strict';

// Contract test for the pi workflow scripts in pi/workflows/*.js and their shared
// tiers block (see pi/references/model-tiers.md). Each script runs as an
// AsyncFunction with stubs for agent, parallel, pipeline, phase and log. The agent
// stub enforces the opts contract of pi-subagents' agentIn, so a script that would
// be rejected at runtime fails here.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const WORKFLOWS = path.join(__dirname, '..', 'workflows');
const TIERS_REFERENCE = path.join(__dirname, '..', 'references', 'model-tiers.md');
const README = path.join(__dirname, '..', 'README.md');
const AsyncFunction = (async () => {}).constructor;

// Snapshot of pi-subagents 0.22.0, src/workflow/worker-source.ts (EFFORT_LEVELS, AGENT_OPTIONS).
const EFFORT_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const AGENT_OPTIONS = ['label', 'phase', 'model', 'agentType', 'isolation', 'gate', 'resume', 'effort', 'schema'];

const START_MARKER = '// --- tiers: shared block.';
const END_MARKER = '// --- end tiers ---';

const SCRIPTS = ['as-spec-review', 'as-design-arena', 'as-final-review', 'as-build'];

// Minimal valid required args per script.
const ARGS = {
  'as-spec-review': { specPath: '/tmp/spec.md', repo: '/tmp/repo' },
  'as-design-arena': { specPath: '/tmp/spec.md', repo: '/tmp/repo', redFlagsPath: '/tmp/red-flags.md' },
  'as-final-review': { worktree: '/tmp/repo', base: 'main', specPath: '/tmp/spec.md', planPath: '/tmp/plan.md' },
  'as-build': {
    specPath: '/tmp/spec.md',
    planPath: '/tmp/plan.md',
    verify: 'true',
    finalVerify: ['true'],
    progressPath: '/tmp/build-progress',
    workstreams: [{
      name: 'ws',
      worktree: '/tmp/wt',
      branch: 'feat/x',
      tasks: [{ id: 'T1', title: 'normal task', hard: false }, { id: 'T2', title: 'hard task', hard: true }],
    }],
  },
};

// Label pattern -> [tier, effort], copied from the role table in the spec.
const EXPECT = {
  'as-spec-review': [[/^spec:/, ['high', 'high']]],
  'as-design-arena': [
    [/^ground$/, ['low', 'medium']],
    [/^design:/, ['high', 'high']],
    [/^judge$/, ['high', 'high']],
  ],
  'as-final-review': [[/^review:/, ['high', 'high']]],
  // T1 is implement (mid), T2 implement-hard (high); a retry runs one tier above its first attempt.
  'as-build': [
    [/^ws:T1$/, ['mid', 'medium']],
    [/^ws:T1:retry$/, ['high', 'high']],
    [/^ws:T2$/, ['high', 'high']],
    [/^ws:T2:retry$/, ['high', 'high']],
  ],
};

const FULL = { high: 'p/high', mid: 'p/mid', low: 'p/low' };

// tiers argument -> [model per tier after filling (missing = inherit), expected log line].
const FILLS = [
  [FULL, FULL, 'tiers: high=p/high, mid=p/mid, low=p/low'],
  [{ high: 'p/high' }, { high: 'p/high', mid: 'p/high', low: 'p/high' },
    'tiers: high=p/high, mid=p/high (from high), low=p/high (from mid)'],
  [{ mid: 'p/mid' }, { mid: 'p/mid', low: 'p/mid' }, 'tiers: high=inherit, mid=p/mid, low=p/mid (from mid)'],
  [{ low: 'p/low' }, { low: 'p/low' }, 'tiers: high=inherit, mid=inherit, low=p/low'],
  [{ high: 'p/high', low: 'p/low' }, { high: 'p/high', mid: 'p/high', low: 'p/low' },
    'tiers: high=p/high, mid=p/high (from high), low=p/low'],
  [{}, {}, 'tiers: high=inherit, mid=inherit, low=inherit'],
  // Split at the first slash: ids may contain slashes themselves (openrouter).
  [{ high: 'openrouter/anthropic/claude-opus-5-5' },
    { high: 'openrouter/anthropic/claude-opus-5-5', mid: 'openrouter/anthropic/claude-opus-5-5', low: 'openrouter/anthropic/claude-opus-5-5' },
    'tiers: high=openrouter/anthropic/claude-opus-5-5, mid=openrouter/anthropic/claude-opus-5-5 (from high), low=openrouter/anthropic/claude-opus-5-5 (from mid)'],
  [null, {}, 'tiers: none passed, agents inherit the model of their agent type (Explore) or else the session model'],
  [undefined, {}, 'tiers: none passed, agents inherit the model of their agent type (Explore) or else the session model'],
];

// Extra args -> pattern the error message must match. None of them may start an agent.
const REJECTS = [
  [{ tiers: [] }, /needs args\.tiers as an object/],
  [{ tiers: ['p/high'] }, /needs args\.tiers as an object/],
  [{ tiers: 'p/high' }, /needs args\.tiers as an object/],
  [{ tiers: 5 }, /needs args\.tiers as an object/],
  [{ tiers: { high: 'p/high', top: 'p/top' } }, /args\.tiers\.top is not a tier/],
  [{ tiers: { high: 'high-model' } }, /needs args\.tiers\.high as "<provider>\/<id>"/],
  [{ tiers: { mid: '/id' } }, /needs args\.tiers\.mid as "<provider>\/<id>"/],
  [{ tiers: { low: 'p/' } }, /needs args\.tiers\.low as "<provider>\/<id>"/],
  [{ tiers: { high: '' } }, /needs args\.tiers\.high as "<provider>\/<id>"/],
  [{ tiers: { high: 5 } }, /needs args\.tiers\.high as "<provider>\/<id>"/],
  [{ tiers: { high: null } }, /needs args\.tiers\.high as "<provider>\/<id>"/],
  [{ model: 'p/high' }, /no longer takes args\.model or args\.effort; pass args\.tiers/],
  [{ effort: 'high' }, /no longer takes args\.model or args\.effort; pass args\.tiers/],
  [{ model: 'p/high', tiers: FULL }, /no longer takes args\.model or args\.effort; pass args\.tiers/],
];

function readScript(name) {
  return fs.readFileSync(path.join(WORKFLOWS, `${name}.js`), 'utf8');
}

function loadScript(name) {
  const source = readScript(name);
  assert.match(source, /^export const meta/m, `${name}: expected "export const meta"`);
  const body = source.replace(/^export const meta/m, 'const meta');
  return new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', body);
}

// A value that satisfies the required fields of a JSON schema.
function canned(schema) {
  if (!schema || typeof schema !== 'object') return 'stub';
  if (Array.isArray(schema.enum)) return schema.enum[0];
  switch (schema.type) {
    case 'object': {
      const out = {};
      for (const key of schema.required ?? []) out[key] = canned(schema.properties?.[key]);
      return out;
    }
    case 'array': return [];
    case 'boolean': return false;
    case 'number':
    case 'integer': return 0;
    default: return 'stub';
  }
}

function checkAgentOpts(prompt, opts) {
  if (typeof prompt !== 'string' || prompt.trim() === '') throw new Error('agent(prompt) requires a non-empty string');
  const options = opts ?? {};
  for (const key of Object.keys(options)) {
    if (!AGENT_OPTIONS.includes(key)) throw new Error(`agent() opts.${key} is not a recognised option`);
  }
  if ('model' in options && (typeof options.model !== 'string' || options.model.trim() === '')) {
    throw new Error(`agent() opts.model must be a non-empty string when set, got ${JSON.stringify(options.model)}`);
  }
  if (options.effort !== undefined && !EFFORT_LEVELS.includes(options.effort)) {
    throw new Error(`agent() opts.effort must be one of: ${EFFORT_LEVELS.join(', ')}`);
  }
}

// Never throws. Returns what the script returned or threw, plus every agent call and event in order.
async function runScript(name, args, { answer } = {}) {
  const calls = [];
  const logs = [];
  const events = [];
  const agent = async (prompt, opts) => {
    checkAgentOpts(prompt, opts);
    const options = opts ?? {};
    calls.push({ label: options.label, opts: options, hasModelKey: Object.hasOwn(options, 'model') });
    events.push({ type: 'agent', label: options.label });
    if (answer) return answer(options, prompt);
    return options.schema ? canned(options.schema) : 'stub grounding';
  };
  const parallel = thunks => Promise.all(thunks.map(f => f()));
  const pipeline = async (items, ...stages) => {
    const out = [];
    for (const [index, item] of items.entries()) {
      let value = item;
      for (const stage of stages) value = await stage(value, item, index);
      out.push(value);
    }
    return out;
  };
  const phase = title => { events.push({ type: 'phase', title }); };
  const log = message => { logs.push(message); events.push({ type: 'log', message }); };
  let result = null;
  let error = null;
  try {
    result = await loadScript(name)(agent, parallel, pipeline, phase, log, args);
  } catch (e) {
    error = e;
  }
  return { result, error, calls, logs, events };
}

function sharedBlock(source) {
  const lines = source.split('\n');
  const starts = lines.flatMap((l, i) => (l.startsWith(START_MARKER) ? [i] : []));
  const ends = lines.flatMap((l, i) => (l === END_MARKER ? [i] : []));
  assert.equal(starts.length, 1, 'expected exactly one tiers start marker');
  assert.equal(ends.length, 1, 'expected exactly one tiers end marker');
  assert.ok(starts[0] < ends[0], 'tiers start marker must come before the end marker');
  return lines.slice(starts[0], ends[0] + 1).join('\n');
}

// Evaluates the shared block alone, taken from as-spec-review, with stub meta, log and args.
function runBlock(roles, args) {
  const logs = [];
  const block = sharedBlock(readScript('as-spec-review'));
  const fn = new Function('meta', 'log', 'args', 'roles', `${block}\nreturn resolveRoles(roles)`);
  try {
    const role = fn({ name: 'block-test' }, m => logs.push(m), args, roles);
    return { role, logs, error: null };
  } catch (error) {
    return { role: null, logs, error };
  }
}

function expectedFor(name, label) {
  const hit = EXPECT[name].find(([pattern]) => pattern.test(label));
  assert.ok(hit, `${name}: no expectation for agent label ${label}`);
  return hit[1];
}

// ---- shared block ----

const BLOCK_ROLES = {
  small: { tier: 'low', effort: 'medium' },
  normal: { tier: 'mid', effort: 'medium' },
  big: { tier: 'high', effort: 'high' },
  retry: { tier: 'above', effort: 'high' },
};

for (const [tiers, models, line] of FILLS) {
  test(`block: tiers ${JSON.stringify(tiers)} fills and logs once`, () => {
    const { role, logs, error } = runBlock(BLOCK_ROLES, { tiers });
    assert.equal(error, null);
    assert.deepEqual(logs, [line]);
    for (const [name, tier] of [['small', 'low'], ['normal', 'mid'], ['big', 'high']]) {
      const effort = BLOCK_ROLES[name].effort;
      const expected = models[tier] === undefined ? { effort } : { model: models[tier], effort };
      assert.deepEqual(role(name), expected, `${name} (${tier})`);
      assert.equal(Object.hasOwn(role(name), 'model'), models[tier] !== undefined, `${name}: model key presence`);
    }
  });
}

test('block: no args at all counts as no tiers', () => {
  const { role, logs, error } = runBlock(BLOCK_ROLES, undefined);
  assert.equal(error, null);
  assert.deepEqual(logs, ['tiers: none passed, agents inherit the model of their agent type (Explore) or else the session model']);
  assert.deepEqual(role('big'), { effort: 'high' });
});

test('block: args.model and args.effort set to null count as not passed', () => {
  const { role, error } = runBlock(BLOCK_ROLES, { model: null, effort: null, tiers: FULL });
  assert.equal(error, null);
  assert.deepEqual(role('big'), { model: 'p/high', effort: 'high' });
});

for (const [extra, pattern] of REJECTS) {
  test(`block: rejects ${JSON.stringify(extra)} without logging`, () => {
    const { role, logs, error } = runBlock(BLOCK_ROLES, extra);
    assert.equal(role, null);
    assert.ok(error instanceof Error, 'expected an Error');
    assert.match(error.message, /^block-test/);
    assert.match(error.message, pattern);
    assert.deepEqual(logs, []);
  });
}

test("block: tier 'above' resolves one tier over its base role, capped at high", () => {
  const { role } = runBlock(BLOCK_ROLES, { tiers: FULL });
  assert.deepEqual(role('retry', 'small'), { model: 'p/mid', effort: 'high' });
  assert.deepEqual(role('retry', 'normal'), { model: 'p/high', effort: 'high' });
  assert.deepEqual(role('retry', 'big'), { model: 'p/high', effort: 'high' });
});

test("block: tier 'above' inherits when the tier above has no model", () => {
  const { role } = runBlock(BLOCK_ROLES, { tiers: { mid: 'p/mid' } });
  assert.deepEqual(role('retry', 'small'), { model: 'p/mid', effort: 'high' });
  assert.deepEqual(role('retry', 'normal'), { effort: 'high' });
});

test('block: role guards', () => {
  const { role } = runBlock(BLOCK_ROLES, { tiers: FULL });
  assert.throws(() => role('nope'), /^Error: block-test: unknown role "nope"$/);
  assert.throws(() => role('toString'), /unknown role "toString"/);
  assert.throws(() => role('retry'), /role "retry" needs a base role with a fixed tier, got undefined/);
  assert.throws(() => role('retry', 'retry'), /role "retry" needs a base role with a fixed tier, got "retry"/);
  assert.throws(() => role('retry', 'nope'), /role "retry" needs a base role with a fixed tier, got "nope"/);
  assert.throws(() => role('big', 'small'), /role "big" has a fixed tier and takes no base role/);
});

// ---- scripts ----

test('shared block is byte-identical in every script', () => {
  const reference = sharedBlock(readScript('as-spec-review')).split('\n');
  for (const name of SCRIPTS) {
    const block = sharedBlock(readScript(name)).split('\n');
    const at = block.findIndex((line, i) => line !== reference[i]);
    const diff = at === -1 && block.length !== reference.length ? Math.min(block.length, reference.length) : at;
    assert.equal(diff, -1,
      `pi/workflows/${name}.js: tiers block differs from pi/workflows/as-spec-review.js at block line ${diff + 1}: ` +
      `${JSON.stringify(block[diff])} vs ${JSON.stringify(reference[diff])}`);
  }
});

for (const name of SCRIPTS) {
  test(`${name}: header comment documents tiers, not model or effort (AC10)`, () => {
    const header = readScript(name).match(/^\/\*\*[\s\S]*?\*\//);
    assert.ok(header, `${name}: expected a leading /** */ comment`);
    const lines = header[0].split('\n');
    const at = lines.findIndex(l => /^\s*\*\s*args:/.test(l));
    assert.ok(at !== -1, `${name}: expected an args: line in the header`);
    // A multi-line args block (the line ends in "{") runs up to its closing " * }".
    const end = /\{\s*$/.test(lines[at]) ? lines.findIndex((l, i) => i > at && /^\s*\*\s*\}/.test(l)) : at;
    assert.ok(end !== -1, `${name}: unterminated args: block in the header`);
    assert.match(lines.slice(at, end + 1).join('\n'), /\btiers\?/);
    assert.doesNotMatch(header[0], /\b(model|effort)\?/);
    assert.match(header[0], /pi\/references\/model-tiers\.md/);
  });
}

for (const name of SCRIPTS) {
  test(`${name}: full tiers give each role its model and effort (AC1)`, async () => {
    const { error, calls, events } = await runScript(name, { ...ARGS[name], tiers: FULL });
    assert.equal(error, null);
    assert.ok(calls.length > 0, 'expected at least one agent call');
    for (const call of calls) {
      const [tier, effort] = expectedFor(name, call.label);
      assert.equal(call.opts.model, FULL[tier], `${call.label}: model`);
      assert.equal(call.opts.effort, effort, `${call.label}: effort`);
    }
    assert.ok(events.findIndex(e => e.type === 'log') < events.findIndex(e => e.type === 'agent'));
  });

  for (const [tiers, models, line] of FILLS) {
    test(`${name}: tiers ${JSON.stringify(tiers)} fill upward and log one line first (AC3, AC4)`, async () => {
      const args = { ...ARGS[name] };
      if (tiers !== undefined) args.tiers = tiers;
      const { error, calls, logs, events } = await runScript(name, args);
      assert.equal(error, null);
      assert.ok(calls.length > 0, 'expected at least one agent call');
      assert.deepEqual(logs.filter(l => l.startsWith('tiers:')), [line]);
      const firstAgent = events.findIndex(e => e.type === 'agent');
      const tiersLog = events.findIndex(e => e.type === 'log' && e.message === line);
      assert.ok(tiersLog !== -1 && tiersLog < firstAgent, 'tiers line must come before the first agent()');
      for (const call of calls) {
        const [tier, effort] = expectedFor(name, call.label);
        assert.equal(call.hasModelKey, models[tier] !== undefined, `${call.label}: model key presence`);
        assert.equal(call.opts.model, models[tier], `${call.label}: model`);
        assert.equal(call.opts.effort, effort, `${call.label}: effort`);
      }
    });
  }

  for (const [extra, pattern] of REJECTS) {
    test(`${name}: rejects ${JSON.stringify(extra)} before any agent (AC5)`, async () => {
      const { error, calls, logs } = await runScript(name, { ...ARGS[name], ...extra });
      assert.ok(error instanceof Error, 'expected the script to throw');
      assert.match(error.message, new RegExp(`^${name}`));
      assert.match(error.message, pattern);
      assert.equal(calls.length, 0);
      assert.deepEqual(logs.filter(l => l.startsWith('tiers:')), []);
    });
  }

  test(`${name}: own required args are checked before tiers`, async () => {
    const { error, calls } = await runScript(name, { model: 'p/high' });
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /args\.tiers/);
    assert.equal(calls.length, 0);
  });
}

test('as-design-arena: ground, every design lens and the judge run with their roles', async () => {
  const { error, result, calls } = await runScript('as-design-arena', { ...ARGS['as-design-arena'], tiers: FULL });
  assert.equal(error, null);
  assert.deepEqual(calls.map(c => c.label), ['ground', 'design:minimal', 'design:domain', 'design:caller', 'judge']);
  assert.deepEqual(calls.map(c => c.opts.agentType), ['Explore', 'Plan', 'Plan', 'Plan', 'Plan']);
  assert.deepEqual(result.dropped, []);
  assert.ok(result.verdict);
});

test('as-final-review: every persona reviews as its own agent type', async () => {
  const { error, result, calls } = await runScript('as-final-review', { ...ARGS['as-final-review'], tiers: FULL });
  assert.equal(error, null);
  const personas = ['code-reviewer', 'security-auditor', 'test-engineer'];
  assert.deepEqual(calls.map(c => c.label), personas.map(p => `review:${p}`));
  assert.deepEqual(calls.map(c => c.opts.agentType), personas);
  assert.deepEqual(result.missing, []);
});

// Every first attempt fails, so each task gets its retry.
const failFirst = opts => (opts.label.endsWith(':retry') ? canned(opts.schema) : null);

for (const [tiers, models] of [[FULL, FULL], [{ mid: 'p/mid' }, { mid: 'p/mid', low: 'p/mid' }], [{}, {}]]) {
  test(`as-build: tiers ${JSON.stringify(tiers)} give first attempts and retries their roles`, async () => {
    const { error, result, calls } = await runScript('as-build', { ...ARGS['as-build'], tiers }, { answer: failFirst });
    assert.equal(error, null);
    assert.deepEqual(calls.map(c => c.label), ['ws:T1', 'ws:T1:retry', 'ws:T2', 'ws:T2:retry']);
    for (const call of calls) {
      const [tier, effort] = expectedFor('as-build', call.label);
      assert.equal(call.hasModelKey, models[tier] !== undefined, `${call.label}: model key presence`);
      assert.equal(call.opts.model, models[tier], `${call.label}: model`);
      assert.equal(call.opts.effort, effort, `${call.label}: effort`);
      assert.equal(call.opts.phase, 'Build');
      const id = call.label.split(':')[1];
      assert.equal(call.opts.gate, `cd '/tmp/wt' && true && printf '%s\\n' 'ws:${id}' >> '/tmp/build-progress'`);
    }
    assert.deepEqual(result.results[0].done.map(d => d.id), ['T1', 'T2']);
  });
}

test('as-build: no tiers means no model key on any agent, retries included', async () => {
  const { error, calls } = await runScript('as-build', ARGS['as-build'], { answer: failFirst });
  assert.equal(error, null);
  assert.equal(calls.length, 4);
  for (const call of calls) assert.equal(call.hasModelKey, false, `${call.label}: model key presence`);
});

// ---- repo-wide ----

test('every pi/workflows/*.js is covered by this test and carries the tiers block', () => {
  const files = fs.readdirSync(WORKFLOWS).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
  assert.deepEqual([...SCRIPTS].sort(), files, 'SCRIPTS must list every pi/workflows/*.js');
  for (const name of files) {
    assert.ok(Object.hasOwn(ARGS, name), `${name}: missing in ARGS`);
    assert.ok(Object.hasOwn(EXPECT, name), `${name}: missing in EXPECT`);
    assert.doesNotThrow(() => sharedBlock(readScript(name)), `${name}: tiers block`);
  }
});

test('pi/workflows/*.js names no model (AC2)', () => {
  for (const file of fs.readdirSync(WORKFLOWS).filter(f => f.endsWith('.js'))) {
    const lines = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8').split('\n');
    const hits = lines.flatMap((l, i) => (/opus|sonnet|haiku|claude|gpt/i.test(l) ? [`${file}:${i + 1}: ${l.trim()}`] : []));
    assert.deepEqual(hits, []);
  }
});

// ---- lead reference and README ----

test('pi/references/model-tiers.md describes how the lead resolves tiers (AC6)', () => {
  const ref = fs.readFileSync(TIERS_REFERENCE, 'utf8');
  const steps = ref.match(/^[1-6]\. .*$/gm) ?? [];
  assert.deepEqual(steps.map(s => s[0]), ['1', '2', '3', '4', '5', '6'], 'expected numbered steps 1-6');
  const [list, agents, family, pick, pass, tell] = steps;
  assert.match(list, /pi --list-models/);
  assert.match(list, /\$PI_PROVIDER/);
  assert.match(ref, /enabledModels/);
  assert.match(agents, /AGENTS\.md/);
  assert.match(family, /family table/i);
  assert.match(pick, /thinking/i);
  assert.match(pick, /newest/i);
  assert.match(pass, /provider\/id/);
  assert.match(tell, /one line/i);
  // Family table rows.
  assert.match(ref, /^\| *`high` *\|.*Claude Opus.*GPT Astra/m);
  assert.match(ref, /^\| *`mid` *\|.*Claude Sonnet.*GPT Sol/m);
  assert.match(ref, /^\| *`low` *\|.*Claude Haiku.*GPT Luna/m);
  assert.match(ref, /analogy/i);
  assert.match(ref, /^## What inherit means$/m, 'inherit is explained');
  assert.match(ref, /`Explore`.*`ground`/, 'the Explore default for ground is named');
  assert.match(ref, /first `\/`/, 'ids split at the first slash');
  assert.match(ref, /do not fill/i, 'the lead must not fill missing tiers itself');
  assert.match(ref, /pi --list-models` fails/, 'error path when listing models fails');
});

test('pi/references/model-tiers.md works through the cliproxyapi example (AC8)', () => {
  const ref = fs.readFileSync(TIERS_REFERENCE, 'utf8');
  for (const id of ['claude-fable-5-1', 'claude-haiku-4-5-20251001', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5']) {
    assert.match(ref, new RegExp(`^cliproxyapi +${id} `, 'm'), `listing row for ${id}`);
  }
  assert.match(ref, /high: 'cliproxyapi\/claude-opus-5-5'/);
  assert.match(ref, /mid: 'cliproxyapi\/claude-sonnet-5-5'/);
  assert.match(ref, /low: 'cliproxyapi\/claude-haiku-5-5'/);
  assert.match(ref, /`claude-fable-5-1`[^\n]*no tier[^\n]*unknown/i);
  assert.match(ref, /`claude-haiku-4-5-20251001`[^\n]*older[^\n]*thinking/i);
});

test('pi/README.md describes tiers, not models (AC10)', () => {
  const readme = fs.readFileSync(README, 'utf8');
  const lines = readme.split('\n');
  for (const id of ['SR', 'AR', 'RV']) {
    const label = lines.find(l => l.trim().startsWith(`subgraph ${id}[`));
    assert.ok(label, `diagram subgraph ${id}`);
    assert.match(label, / · high\/high · /, `subgraph ${id} names tier/effort`);
  }
  const workflows = lines.find(l => l.startsWith('- `pi/workflows/*.js`'));
  assert.match(workflows, /`args\.tiers`/);
  assert.match(workflows, /pi\/references\/model-tiers\.md/);
  assert.match(lines.find(l => l.startsWith('- `pi/references/`')), /model tiers/);
  const hits = lines.flatMap((l, i) => (/opus|sonnet|haiku|claude|gpt/i.test(l) ? [`pi/README.md:${i + 1}: ${l.trim()}`] : []));
  assert.deepEqual(hits, []);
});

// ---- skills pass tiers (AC7) ----

const SKILL_STEPS = { 'as-spec': '4', 'as-plan': '2', 'as-build': '2', 'as-review': '2' };

test('the as-* skills resolve tiers per the reference and pass them in args (AC7)', () => {
  for (const [skill, step] of Object.entries(SKILL_STEPS)) {
    const dir = path.join(__dirname, '..', 'skills', skill);
    const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
    const section = text.match(new RegExp(`^## ${step}\\. [^\\n]*\\n([\\s\\S]*?)(?=^## \\d)`, 'm'))?.[1];
    assert.ok(section, `${skill}: section ${step}`);
    const link = section.match(/Resolve `tiers` per `([^`]+)` and add it to `args` \(leave it out if nothing resolves\)/);
    assert.ok(link, `${skill} §${step}: resolve sentence with a link`);
    assert.equal(link[1], '../../references/model-tiers.md', `${skill}: link target`);
    assert.equal(path.resolve(dir, link[1]), TIERS_REFERENCE, `${skill}: link resolves to the reference`);
    assert.ok(fs.existsSync(path.resolve(dir, link[1])), `${skill}: linked file exists`);
    const args = skill === 'as-build' ? section.match(/```json\n([\s\S]*?)```/)?.[1] : section.match(/`args: \{([^}]*)\}`/)?.[1];
    assert.ok(args, `${skill} §${step}: args`);
    assert.match(args, skill === 'as-build' ? /"tiers": \{/ : /\btiers\b/, `${skill}: tiers in args`);
  }
});

test('as-spec-review: every lens returns with the spec-review role', async () => {
  const { error, result, calls } = await runScript('as-spec-review', { ...ARGS['as-spec-review'], tiers: FULL });
  assert.equal(error, null);
  assert.deepEqual(calls.map(c => c.label), ['spec:builder', 'spec:edge-cases', 'spec:scope']);
  for (const call of calls) assert.equal(call.opts.agentType, 'Plan');
  assert.deepEqual(result.missing, []);
});
