import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { filterBatchGradingItems, selectBatchGradingItems, type BatchSourceFilter, type BatchStatusFilter } from '../src/utils/batchGradingUtils';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Offline network guard missing');
const source = fs.readFileSync(new URL('../src/components/BatchGradingModal.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('batch.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.VariableDeclaration | undefined;
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleStartBatch') handler = node;
  ts.forEachChild(node, visit);
};
visit(tree); assert.ok(handler);
const handlerJs = ts.transpileModule(`const ${handler.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const fixtures = ['online', 'paper'].flatMap(source => ['pending', 'completed', 'needs_review', 'failed'].map(status => ({
  id: `${source}-${status}`, source, status, studentName: `${source} ${status}`, submission: { id: `${source}-${status}`, assignmentId: 'a', totalScore: 0 }
}))) as any[];
const before = JSON.stringify(fixtures);
const sources: BatchSourceFilter[] = ['all', 'online', 'paper'];
const statuses: BatchStatusFilter[] = ['all', 'pending', 'completed', 'needs_review', 'failed'];

async function run(filterSource: BatchSourceFilter, filterStatus: BatchStatusFilter, skipAlreadyGraded: boolean, onlyFailed: boolean,
  stopOn?: 'quota' | 'cloud') {
  let items = structuredClone(fixtures), parent: any[] | undefined;
  const calls: string[] = [], toasts: string[] = [];
  const dependencies = { isGrading: false, skipAlreadyGraded, items, filterSource, filterStatus, selectBatchGradingItems,
    assignment: { id: 'a' }, submissions: items.map(item => item.submission), abortControllerRef: { current: null },
    setIsGrading: () => {}, setCurrentGradingIndex: () => {}, setProgressText: () => {},
    setItems: (fn: any) => { items = fn(items); },
    GradingService: { gradeSingleSubmissionWithAI: async ({ submission }: any) => {
      calls.push(submission.id);
      // Simulate a rerender changing the available list. The run must retain its selected IDs.
      items = [...items, { id: 'arrived-mid-run', source: 'paper', status: 'pending', submission: { id: 'arrived-mid-run' } }];
      return { submission: { ...submission, totalScore: 1 }, needsTeacherReview: false, totalErrors: 0,
        quotaExceeded: stopOn === 'quota', persistence: { cloudSaved: stopOn !== 'cloud' } };
    } },
    onSubmissionsUpdated: (updated: any[]) => { parent = updated; }, showToast: (text: string) => { toasts.push(text); },
    setTimeout: (callback: () => void) => { callback(); return 0; }
  };
  const actual = new Function(...Object.keys(dependencies), handlerJs + '\nreturn handleStartBatch;')(...Object.values(dependencies));
  await actual(onlyFailed);
  return { calls, parent, toasts };
}

let combinations = 0;
for (const filterSource of sources) for (const filterStatus of statuses) for (const skip of [false, true]) for (const onlyFailed of [false, true]) {
  const visible = filterBatchGradingItems(fixtures, filterSource, filterStatus);
  const allowed = visible.filter(item => onlyFailed ? item.status === 'failed' : !skip || ['pending', 'failed'].includes(item.status));
  const actual = await run(filterSource, filterStatus, skip, onlyFailed);
  assert.deepEqual(actual.calls, allowed.map(item => item.id), `${filterSource}/${filterStatus}/skip=${skip}/retry=${onlyFailed}`);
  assert.ok(actual.calls.every(id => visible.some(item => item.id === id)));
  if (allowed.length) {
    assert.ok(actual.parent);
    const untouched = fixtures.filter(item => !actual.calls.includes(item.id));
    for (const item of untouched) assert.deepEqual(actual.parent!.find(sub => sub.id === item.id), item.submission);
    assert.ok(actual.toasts.some(text => text.includes(`/${allowed.length} bài`)));
  } else {
    assert.equal(actual.parent, undefined); assert.equal(actual.toasts.length, 1);
  }
  combinations++;
}
assert.equal(JSON.stringify(fixtures), before);
for (const reason of ['quota', 'cloud'] as const) {
  const stopped = await run('paper', 'all', true, false, reason);
  assert.deepEqual(stopped.calls, ['paper-pending']);
  assert.ok(!stopped.toasts.some(text => text.includes('Hoàn tất')));
}
assert.match(source, /disabled=\{gradingTargetCount === 0\}/);
assert.match(source, /Bắt đầu chấm AI \(\{gradingTargetCount\} bài\)/);
assert.match(source, /value=\{filterSource\}\s+disabled=\{isGrading\}/);
assert.match(source, /value=\{filterStatus\}\s+disabled=\{isGrading\}/);
console.log(`PASS: ${combinations} source/status/skip/retry combinations execute the exact UI handler; outside-filter records stay unchanged; selection stays fixed during rerenders`);
console.log('PASS: empty queues make no calls; quota/unconfirmed cloud saves stop the selected queue; UI counts and filter locking match the execution scope');
console.log('Batch filter checks passed (no AI, network or database writes).');
