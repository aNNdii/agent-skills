'use strict';

// Test host for the workflows in pi/workflows/. It runs a script the way
// pi-subagents runs it: `export` stripped from the meta declaration, the body
// wrapped in an async IIFE inside a fresh node:vm realm without code
// generation, args parsed inside the realm, and a prelude that makes
// Date.now()/new Date()/Math.random() throw. agent(), phase(), log() and
// parallel() are stubs that record the calls.
//
// Its name does not end in -test.js, so `node --test pi/scripts/*-test.js`
// loads it only through the tests that require it.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Same single-line prelude as pi-subagents' worker: a newline here would shift
// every line number in reported stack frames.
const PRELUDE =
  'const Date = (function () {' +
  ' const RealDate = globalThis.Date;' +
  ' const die = function (what) { throw new Error(what + " is unavailable in workflow scripts"); };' +
  ' RealDate.now = function () { return die("Date.now()"); };' +
  ' Math.random = function () { return die("Math.random()"); };' +
  ' return class WorkflowDate extends RealDate {' +
  ' constructor() { if (arguments.length === 0) die("new Date()"); super(...arguments); }' +
  ' };' +
  '})();';

function loadBody(scriptPath) {
  const source = fs.readFileSync(scriptPath, 'utf8');
  const declaration = /(^|[\r\n])[ \t]*export[ \t\r\n]+const[ \t\r\n]+meta[ \t\r\n]*=/.exec(source);
  assert.ok(declaration, `${path.basename(scriptPath)} must open with \`export const meta =\``);
  const exportAt = source.indexOf('export', declaration.index);
  return `${source.slice(0, exportAt)}${' '.repeat(6)}${source.slice(exportAt + 6)}`;
}

/**
 * Runs the real workflow script at scriptPath with stubbed globals.
 * reply(label, prompt) returns the agent's structured result, or null for a
 * failed gate or a stopped agent (all the script ever sees).
 * Returns { result, calls: [{ prompt, label, gate, effort, agentType, model }], logs }.
 */
async function runWorkflow(scriptPath, args, reply) {
  const calls = [];
  const logs = [];
  const sandbox = {
    agent: async (prompt, opts = {}) => {
      calls.push({
        prompt,
        label: opts.label,
        gate: opts.gate,
        effort: opts.effort,
        agentType: opts.agentType,
        model: opts.model,
      });
      const value = await reply(opts.label, prompt);
      return value === null || value === undefined ? null : realmParse(JSON.stringify(value));
    },
    parallel: async thunks =>
      Promise.all(
        thunks.map(async thunk => {
          try {
            return await thunk();
          } catch {
            return null;
          }
        }),
      ),
    phase: () => {},
    log: message => logs.push(String(message)),
  };
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const realmParse = vm.runInContext('JSON.parse', context);
  sandbox.args = args === undefined ? undefined : realmParse(JSON.stringify(args));
  const script = new vm.Script(`(async () => {${PRELUDE}\n${loadBody(scriptPath)}\n})()`, {
    filename: path.basename(scriptPath),
    lineOffset: -1,
  });
  const value = await script.runInContext(context);
  return { result: value === undefined ? undefined : JSON.parse(JSON.stringify(value)), calls, logs };
}

module.exports = { runWorkflow };
