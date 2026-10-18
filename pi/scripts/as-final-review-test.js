'use strict';

// Tests for pi/workflows/as-final-review.js, run in the vm host of
// pi/scripts/workflow-host.js the way pi-subagents runs it.

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { runWorkflow } = require('./workflow-host.js');

const SCRIPT = path.join(__dirname, '..', 'workflows', 'as-final-review.js');
const REVIEW = { summary: 'Looks fine.', findings: [] };
const ARGS = {
  worktree: '/wt/x',
  base: 'main',
  specPath: '/r/.specs/x/spec.md',
  planPath: '/r/.specs/x/plan.md',
};
const PERSONAS = ['code-reviewer', 'security-auditor', 'test-engineer'];

const run = (args, reply = () => REVIEW) => runWorkflow(SCRIPT, args, reply);

test('commits defaults to checkpoints: every persona reviews the branch diff and the log', async () => {
  const { result, calls } = await run(ARGS);
  assert.deepEqual(calls.map(c => c.agentType), PERSONAS);
  for (const { prompt } of calls) {
    assert.ok(prompt.includes("`git -C '/wt/x' diff main...HEAD`"), prompt);
    assert.ok(prompt.includes("`git -C '/wt/x' log --oneline main..HEAD`"), prompt);
    assert.ok(!prompt.includes('--cached'), prompt);
  }
  assert.deepEqual(result.reviews.map(r => r.persona), PERSONAS);
  assert.deepEqual(result.missing, []);
});

test('commits none: every persona reviews the staged result against the merge-base', async () => {
  const { calls } = await run({ ...ARGS, commits: 'none' });
  assert.equal(calls.length, PERSONAS.length);
  for (const { prompt } of calls) {
    assert.ok(prompt.includes("`git -C '/wt/x' diff --cached $(git -C '/wt/x' merge-base HEAD main)`"), prompt);
    assert.ok(prompt.includes('staged, not committed'), prompt);
    assert.ok(!prompt.includes('...HEAD'), prompt);
  }
});

test('an unknown commits value is rejected before any agent runs', async () => {
  let ran = false;
  await assert.rejects(
    run({ ...ARGS, commits: 'squash' }, () => {
      ran = true;
      return REVIEW;
    }),
    /commits must be 'checkpoints' or 'none', got "squash"/,
  );
  assert.equal(ran, false);
});

test('a persona without a result is reported as missing', async () => {
  const { result, logs } = await run(ARGS, label => (label === 'review:security-auditor' ? null : REVIEW));
  assert.deepEqual(result.missing, ['security-auditor']);
  assert.ok(logs.some(l => l.includes('security-auditor')));
});
