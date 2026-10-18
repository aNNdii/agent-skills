'use strict';

// Tests for pi/workflows/as-build.js, run in the vm host of
// pi/scripts/workflow-host.js the way pi-subagents runs it.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { runWorkflow } = require('./workflow-host.js');

const SCRIPT = path.join(__dirname, '..', 'workflows', 'as-build.js');

const DONE = { status: 'done', commit: 'abc1234', summary: 'Did the task.' };
const BLOCKED = { status: 'blocked', summary: 'Stopped.', blocker: 'The plan is ambiguous.' };

const run = (args, reply = () => DONE) => runWorkflow(SCRIPT, args, reply);

const PROGRESS = '/r/.specs/x/build-progress';
const WS = {
  name: 'main',
  worktree: '/wt/x',
  branch: 'feat/x',
  tasks: [
    { id: 'T1', title: 'Gate' },
    { id: 'T2', title: 'Pipe', verify: 'node --test pi/scripts/as-build-test.js' },
  ],
};
const ARGS = {
  specPath: '/r/.specs/x/spec.md',
  planPath: '/r/.specs/x/plan.md',
  verify: 'node --test pi/scripts/',
  finalVerify: ['node --test pi/scripts/', 'node scripts/validate-skills.js'],
  progressPath: PROGRESS,
  workstreams: [WS],
};

const gateOf = (calls, label) => calls.find(c => c.label === label).gate;

test('commits defaults to checkpoints: the gate verifies and appends the progress line', async () => {
  const { result, calls } = await run(ARGS);
  assert.equal(
    gateOf(calls, 'main:T1'),
    `cd '/wt/x' && node --test pi/scripts/ && printf '%s\\n' 'main:T1' >> '${PROGRESS}'`,
  );
  assert.deepEqual(result.results[0].stoppedAt, null);
  assert.equal(result.verify, ARGS.verify);
});

test('a task verify replaces the default verify in its gate', async () => {
  const { calls } = await run({ ...ARGS, commits: 'checkpoints' });
  assert.equal(
    gateOf(calls, 'main:T2'),
    `cd '/wt/x' && node --test pi/scripts/as-build-test.js && printf '%s\\n' 'main:T2' >> '${PROGRESS}'`,
  );
});

test('commits none stages the green state and records its tree before writing progress', async () => {
  const { calls } = await run({ ...ARGS, commits: 'none' });
  const record = id =>
    `git add -A && tree=$(git write-tree) && printf '%s %s\\n' 'main:${id}' "$tree" >> '${PROGRESS}'`;
  assert.equal(gateOf(calls, 'main:T1'), `cd '/wt/x' && node --test pi/scripts/ && ${record('T1')}`);
  assert.equal(gateOf(calls, 'main:T2'), `cd '/wt/x' && node --test pi/scripts/as-build-test.js && ${record('T2')}`);
});

test('the none gate in a real repo stages nothing when verify is red and records the staged tree when green', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'as-build-none-'));
  const worktree = path.join(dir, 'wt');
  const progressPath = path.join(dir, 'build-progress');
  const git = (...a) => spawnSync('git', ['-C', worktree, ...a], { encoding: 'utf8' });
  const runGate = async (verify, id) => {
    const ws = { ...WS, worktree, tasks: [{ id, title: 't' }] };
    const { calls } = await run({ ...ARGS, commits: 'none', verify, progressPath, workstreams: [ws] });
    return spawnSync('sh', ['-c', calls[0].gate], { encoding: 'utf8' }).status;
  };
  try {
    fs.mkdirSync(worktree);
    assert.equal(git('init', '-q').status, 0);
    fs.writeFileSync(path.join(worktree, 'a.txt'), 'a\n');
    assert.notEqual(await runGate('false', 'T1'), 0);
    assert.equal(git('diff', '--cached', '--name-only').stdout, '');
    assert.equal(fs.existsSync(progressPath), false);
    assert.equal(await runGate('true', 'T2'), 0);
    assert.equal(git('diff', '--cached', '--name-only').stdout, 'a.txt\n');
    const tree = git('write-tree').stdout.trim();
    assert.match(tree, /^[0-9a-f]{40,64}$/);
    assert.equal(fs.readFileSync(progressPath, 'utf8'), `main:T2 ${tree}\n`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the retry runs behind the same gate', async () => {
  let first = true;
  const { calls } = await run(ARGS, label => {
    if (label === 'main:T1' && first) {
      first = false;
      return null;
    }
    return DONE;
  });
  assert.equal(gateOf(calls, 'main:T1:retry'), gateOf(calls, 'main:T1'));
});

test('the gate runs in the worktree and appends one progress line only when verify passes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'as-build-gate-'));
  const worktree = path.join(dir, 'wt');
  fs.mkdirSync(worktree);
  const progressPath = path.join(dir, "build 'progress'");
  const runGate = async (verify, id) => {
    const ws = { ...WS, name: "ws 'a'", worktree, tasks: [{ id, title: 't' }] };
    const { calls } = await run({ ...ARGS, verify, progressPath, workstreams: [ws] });
    return spawnSync('sh', ['-c', calls[0].gate], { encoding: 'utf8' }).status;
  };
  try {
    assert.equal(await runGate('true', 'T1'), 0);
    assert.notEqual(await runGate('false', 'T2'), 0);
    assert.equal(await runGate(`test -f "../build 'progress'"`, 'T3'), 0);
    assert.equal(fs.readFileSync(progressPath, 'utf8'), "ws 'a':T1\nws 'a':T3\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the workflow rejects missing finalVerify or progressPath', async () => {
  for (const key of ['finalVerify', 'progressPath']) {
    const args = { ...ARGS };
    delete args[key];
    await assert.rejects(run(args), new RegExp(key));
  }
});

const REJECTED = /^as-build args rejected:\n- /;
const WS_B = { ...WS, name: 'b', worktree: '/wt/b', branch: 'feat/b' };

// Asserts that the args are rejected with one collected error naming each problem.
async function rejects(args, ...problems) {
  await assert.rejects(run(args), error => {
    assert.match(error.message, REJECTED);
    for (const problem of problems) assert.match(error.message, problem);
    assert.equal(error.message.split('\n- ').length - 1, problems.length, error.message);
    return true;
  });
}

test('missing args are listed together in one error', async () => {
  await rejects(
    { workstreams: [WS] },
    /specPath/,
    /planPath/,
    /verify must/,
    /finalVerify/,
    /progressPath/,
  );
  await rejects(undefined, /specPath/, /planPath/, /verify must/, /finalVerify/, /progressPath/, /workstreams/);
  await rejects({ ...ARGS, workstreams: [] }, /workstreams/);
  await rejects({ ...ARGS, finalVerify: [] }, /finalVerify/);
});

test('missing workstream and task fields are listed', async () => {
  await rejects(
    { ...ARGS, workstreams: [{ name: 'main', worktree: '/wt/x', tasks: [{ id: 'T1' }] }, { ...WS_B, tasks: [] }] },
    /workstreams\[0\]\.branch/,
    /workstreams\[0\]\.tasks\[0\]\.title/,
    /workstreams\[1\]\.tasks must/,
  );
});

test('an unknown commits value is rejected', async () => {
  await rejects({ ...ARGS, commits: 'squash' }, /commits .*"squash"/);
});

test('commits none needs exactly one workstream', async () => {
  await rejects({ ...ARGS, commits: 'none', workstreams: [WS, WS_B] }, /exactly one workstream/);
  const { result } = await run({ ...ARGS, workstreams: [WS, WS_B] });
  assert.equal(result.results.length, 2);
});

test('a pipe, ||, ;, a lone &, a line break or a backslash outside quotes is rejected in every verify command', async () => {
  await rejects({ ...ARGS, verify: 'npm test | tail -5' }, /verify .*pipe.*npm test \| tail -5/);
  await rejects({ ...ARGS, verify: 'npm test || true' }, /verify .*pipe/);
  await rejects({ ...ARGS, verify: 'npm test; true' }, /verify .*pipe/);
  await rejects({ ...ARGS, verify: 'npm test |& cat' }, /verify .*pipe/);
  await rejects({ ...ARGS, verify: 'false & true' }, /verify .*pipe/);
  await rejects({ ...ARGS, verify: 'npm test &> out.log' }, /verify .*pipe/);
  await rejects({ ...ARGS, verify: 'false\ntrue' }, /verify .*pipe/);
  await rejects({ ...ARGS, verify: 'false\r\ntrue' }, /verify .*pipe/);
  await rejects({ ...ARGS, verify: "echo \\' | true \\'" }, /verify .*pipe/);
  await rejects({ ...ARGS, finalVerify: ['node --test', 'npm run e2e | cat'] }, /finalVerify\[1\] .*pipe/);
  const ws = { ...WS, tasks: [{ id: 'T1', title: 't', verify: 'a && b ; c' }] };
  await rejects({ ...ARGS, workstreams: [ws] }, /main:T1 verify .*pipe/);
});

test('a pipe, ||, ;, & or a backslash inside quotes, && and 2>&1 are allowed', async () => {
  for (const verify of [
    `node --test --test-name-pattern 'a|b'`,
    `grep -E "x||y" f`,
    `echo 'a;b' "c|d"`,
    `npm test 2>&1`,
    `a && b >&2`,
    `echo 'x & y' "a\\b"`,
  ]) {
    const { result } = await run({ ...ARGS, verify });
    assert.equal(result.verify, verify);
  }
});

test('progressPath must be absolute, without . or .. segments, and outside every worktree', async () => {
  await rejects({ ...ARGS, progressPath: '.specs/x/build-progress' }, /progressPath .*absolute/);
  await rejects({ ...ARGS, progressPath: '/wt/x/.specs/build-progress' }, /progressPath .*worktree .*\/wt\/x/);
  await rejects({ ...ARGS, progressPath: '/wt/x' }, /progressPath .*worktree/);
  await rejects({ ...ARGS, progressPath: '/r/../wt/x/build-progress' }, /progressPath .*\.\. segments/);
  await rejects({ ...ARGS, progressPath: '/r/./x/build-progress' }, /progressPath .*\.\. segments/);
  const dotted = await run({ ...ARGS, progressPath: '/r/.specs/x..y/build-progress' });
  assert.equal(dotted.result.results[0].stoppedAt, null);
  const { result } = await run({ ...ARGS, progressPath: '/wt/xy/build-progress' });
  assert.equal(result.results[0].stoppedAt, null);
});

test('duplicate workstream names and duplicate task ids are rejected', async () => {
  await rejects({ ...ARGS, workstreams: [WS, { ...WS_B, name: 'main' }] }, /duplicate workstream name .*main/);
  const ws = { ...WS, tasks: [{ id: 'T1', title: 'a' }, { id: 'T1', title: 'b' }] };
  await rejects({ ...ARGS, workstreams: [ws] }, /duplicate task id .*main:T1/);
  const { result } = await run({ ...ARGS, workstreams: [WS, { ...WS_B, tasks: WS.tasks }] });
  assert.equal(result.results.length, 2);
});

test('all problems are collected into one error', async () => {
  await rejects(
    { ...ARGS, verify: 'npm test | tail -5', commits: 'none', workstreams: [WS, WS_B] },
    /pipe/,
    /exactly one workstream/,
  );
});

const promptOf = (calls, label) => calls.find(c => c.label === label).prompt;
const RESET = 'git restore . && git clean -fd';
const failOnce = target => {
  let failed = false;
  return label => {
    if (label === target && !failed) {
      failed = true;
      return null;
    }
    return DONE;
  };
};

test('every prompt forbids network access and downloads', async () => {
  for (const commits of ['checkpoints', 'none']) {
    const { calls } = await run({ ...ARGS, commits }, failOnce('main:T2'));
    for (const { prompt } of calls) {
      assert.match(prompt, /no network access/i);
      assert.match(prompt, /download/i);
      assert.match(prompt, /install/i);
      assert.match(prompt, /status "blocked"/);
    }
  }
});

test('checkpoints prompts allow commits on the branch and keep the [Tn] commit step', async () => {
  const { calls } = await run(ARGS);
  const prompt = promptOf(calls, 'main:T2');
  assert.match(prompt, /Commits on this branch are allowed\./);
  assert.match(prompt, /commit -m "<type>\(<scope>\): <summary> \[T2\]"/);
  assert.doesNotMatch(prompt, /git restore/);
});

test('step 4 names the verify command of the task', async () => {
  const { calls } = await run(ARGS);
  assert.match(promptOf(calls, 'main:T1'), /4\. Run the full verify command: `node --test pi\/scripts\/`/);
  assert.match(promptOf(calls, 'main:T2'), /4\. Run the full verify command: `node --test pi\/scripts\/as-build-test\.js`/);
});

test('none prompts forbid staging and committing and name the index as the green state', async () => {
  const { calls } = await run({ ...ARGS, commits: 'none' });
  for (const { prompt } of calls) {
    assert.match(prompt, /`git add`, `git commit`, `git stash` or `git reset`/);
    assert.match(prompt, /index holds the state of the green tasks/i);
    assert.doesNotMatch(prompt, /Commits on this branch are allowed/);
    assert.doesNotMatch(prompt, /checkpoint commit/);
    assert.doesNotMatch(prompt, /\[T\d\]/);
  }
});

test('none prompts reset to the index before reporting blocked', async () => {
  const { calls } = await run({ ...ARGS, commits: 'none' });
  for (const { prompt } of calls) assert.ok(prompt.includes(`Before you report "blocked", run \`${RESET}\``), prompt);
});

test('the none retry prompt says unstaged changes come from the failed attempt', async () => {
  const { calls } = await run({ ...ARGS, commits: 'none' }, failOnce('main:T2'));
  const retry = promptOf(calls, 'main:T2:retry');
  assert.match(retry, /A previous attempt at this task failed/);
  assert.match(retry, /unstaged .*come from the failed attempt/i);
  assert.ok(retry.includes(`keep what is sound or discard it with \`${RESET}\``), retry);
  assert.doesNotMatch(promptOf(calls, 'main:T2'), /previous attempt|failed attempt/);
});

test('only the first none prompt of the run has the conditional leftover hint', async () => {
  const { calls } = await run({ ...ARGS, commits: 'none' }, failOnce('main:T1'));
  const hint = /If `git status` shows unstaged changes or untracked files before you start/;
  assert.match(promptOf(calls, 'main:T1'), hint);
  assert.doesNotMatch(promptOf(calls, 'main:T1:retry'), hint);
  assert.doesNotMatch(promptOf(calls, 'main:T2'), hint);
  const checkpoints = await run(ARGS);
  assert.doesNotMatch(promptOf(checkpoints.calls, 'main:T1'), hint);
});

test('a blocked task stops the workstream and reports its progress line as stale', async () => {
  const { result, calls } = await run(ARGS, label => (label === 'main:T2' ? BLOCKED : DONE));
  const [stream] = result.results;
  assert.equal(stream.stoppedAt, 'T2');
  assert.equal(stream.staleProgress, 'main:T2');
  assert.equal(stream.reason, BLOCKED.blocker);
  assert.deepEqual(stream.done.map(t => t.id), ['T1']);
  assert.ok(!calls.some(c => c.label === 'main:T2:retry'));
});

test('a task that fails twice stops without a stale progress line and names its verify', async () => {
  const { result } = await run(ARGS, label => (label.startsWith('main:T2') ? null : DONE));
  const [stream] = result.results;
  assert.equal(stream.stoppedAt, 'T2');
  assert.ok(!('staleProgress' in stream));
  assert.equal(stream.reason, '`node --test pi/scripts/as-build-test.js` did not pass after one retry');
  const done = await run(ARGS);
  assert.ok(!('staleProgress' in done.result.results[0]));
});

test('the host runs the real script deterministically', async () => {
  const { logs } = await run(ARGS);
  assert.ok(logs.some(l => l.startsWith('main:T2 done')));
});
