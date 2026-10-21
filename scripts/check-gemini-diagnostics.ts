import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { aiService } from '../src/services/aiService';
import { VERIFICATION_MODEL, diagnoseGeminiError, apiKeyFingerprint } from '../src/services/geminiDiagnostics';
assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'));
const local = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => local.set(k, v), removeItem: (k: string) => local.delete(k) } });
let status = 200, payload: any = null, calls: any[] = [];
(globalThis as any).__examOfflineFetch = async (url: any, init: RequestInit) => {
  calls.push({ url: String(url), request: JSON.parse(String(init.body)), key: new Headers(init.headers).get('x-goog-api-key') });
  return new Response(JSON.stringify(status === 200
    ? { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(payload || { ok: true }) }] } }] }
    : { error: payload }), { status, headers: { 'content-type': 'application/json' } });
};
aiService.setApiKey('synthetic-saved-key');
aiService.setModel('gemini-3.1-pro-preview');
let result = await aiService.testConnection(undefined, VERIFICATION_MODEL);
assert.equal(result.success, true); assert.equal(result.modelUsed, VERIFICATION_MODEL); assert.equal(result.verificationModel, VERIFICATION_MODEL);
assert.equal(result.usesSavedKey, true); assert.equal(result.keyFingerprint, await apiKeyFingerprint('synthetic-saved-key'));
assert.equal(calls[0].key, 'synthetic-saved-key'); assert.ok(calls[0].url.includes(VERIFICATION_MODEL));
result = await aiService.testConnection('synthetic-unsaved-key', VERIFICATION_MODEL);
assert.equal(result.usesSavedKey, false); assert.notEqual(result.keyFingerprint, await apiKeyFingerprint('synthetic-saved-key'));
assert.equal(aiService.getApiKey(), 'synthetic-saved-key', 'Testing another key must not silently save it');
payload = [{ questionId: 'verify-saved', proposedAnswer: 'A', matchesCurrentAnswer: true, confidence: 'high', needsReview: false, reason: 'Synthetic' }];
const savedQuestion: any = { id: 'verify-saved', order: 1, question: '1+1?', type: 'multiple_choice', options: [{ id: 'A', text: '2' }, { id: 'B', text: '3' }], correctAnswer: 'A', points: 1 };
const verified = await aiService.verifyExamQuestions({ questions: [savedQuestion], force: true });
assert.equal(verified[0].needsReview, false);
assert.equal(calls.at(-1).key, 'synthetic-saved-key');
assert.ok(calls.at(-1).url.includes(VERIFICATION_MODEL));
assert.equal(aiService.getModel(), 'gemini-3.1-pro-preview', 'Verification never overwrites the general model selector');
for (const scenario of [
  { status: 400, message: 'API_KEY_INVALID: synthetic-secret-in-raw-url?key=private', kind: 'invalid_key' },
  { status: 404, message: 'Model NOT_FOUND key=private', kind: 'unsupported' },
  { status: 403, message: 'PERMISSION_DENIED key=private', kind: 'permission' },
  { status: 503, message: 'UNAVAILABLE key=private', kind: 'general' }
]) {
  status = scenario.status; payload = { code: status, message: scenario.message };
  const before = calls.length; result = await aiService.testConnection(undefined, VERIFICATION_MODEL);
  assert.equal(result.success, false); assert.equal(result.errorType, scenario.kind);
  assert.equal(calls.length - before, 1, 'A probe never retries or switches model');
  assert.ok(!JSON.stringify(result).includes('private') && !JSON.stringify(result).includes('synthetic-secret'));
}
const quotaPayload = (metric: string, id: string) => ({ code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota exhausted key=private', details: [
  { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: metric, quotaId: id,
    quotaDimensions: { model: VERIFICATION_MODEL, project: 'synthetic-paid-project' } }] },
  { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '75s' }
] });
status = 429; payload = quotaPayload('generativelanguage.googleapis.com/generate_content_paid_tier_requests', 'GenerateRequestsPerMinutePerProjectPerModel-PaidTier');
let before = calls.length; result = await aiService.testConnection(undefined, VERIFICATION_MODEL);
assert.equal(calls.length, before + 1); assert.equal(result.errorType, 'quota');
assert.match(result.message, /RPM/); assert.match(result.message, /PaidTier/); assert.match(result.message, /75s/);
assert.equal(result.diagnostic?.project, 'synthetic-paid-project'); assert.ok(!JSON.stringify(result).includes('private'));
before = calls.length;
await aiService.testConnection(undefined, VERIFICATION_MODEL);
assert.equal(calls.length, before, 'Repeated probe while cooling down must not send another request');
const q: any = { id: 'quota-test', order: 1, question: 'Tính 1+1', type: 'multiple_choice', options: [{ id: 'A', text: '2' }, { id: 'B', text: '3' }], correctAnswer: 'A', points: 1 };
await assert.rejects(() => aiService.verifyExamQuestions({ questions: [q], force: true }), (e: any) => e.status === 429);
assert.equal(calls.length, before, 'Verification shares the probe cooldown for the same saved key');
for (const [id, label] of [['GenerateContentInputTokensPerModelPerMinute-FreeTier', 'TPM'], ['GenerateRequestsPerDayPerProjectPerModel-FreeTier', 'RPD']]) {
  const diagnostic = diagnoseGeminiError({ status: 429, message: JSON.stringify({ error: quotaPayload('generativelanguage.googleapis.com/free_tier', id) }) }, VERIFICATION_MODEL);
  assert.match(diagnostic.message, new RegExp(label)); assert.match(diagnostic.message, /FreeTier/);
}
const unknown = diagnoseGeminiError({ status: 429, message: 'RESOURCE_EXHAUSTED' }, VERIFICATION_MODEL);
assert.equal(unknown.project, null); assert.equal(unknown.quotaMetrics.length, 0);
assert.match(unknown.message, /chưa trả chi tiết/);

// Actual settings button always probes the verification model, even if the
// general task selector is Pro or Lite. Rapid duplicate clicks share a lock.
const text = fs.readFileSync(new URL('../src/pages/teacher/TeacherSettings.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('settings.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.VariableDeclaration | undefined;
const visit = (n: ts.Node) => { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'handleTestConnection') handler = n; ts.forEachChild(n, visit); }; visit(ast); assert.ok(handler);
const js = ts.transpileModule(`const ${handler!.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let used: any[] = [], release: any;
const run = new Function('testLock', 'setTestingConnection', 'setTestResult', 'hybridAi', 'apiKeyInput', 'selectedModel', 'VERIFICATION_MODEL', js + '\nreturn handleTestConnection;')(
  { current: false }, () => {}, () => {}, { testConnection: (...args: any[]) => { used.push(args); return new Promise(resolve => { release = resolve; }); } },
  'synthetic-draft-key', 'gemini-3.1-flash-lite', VERIFICATION_MODEL);
const first = run(); await run(); assert.deepEqual(used, [['synthetic-draft-key', VERIFICATION_MODEL]]); release(result); await first;
assert.ok(text.includes('legacyKeyNotice') && text.includes('testResult.message'), 'Cleanup failure and full quota guidance must be visible');
console.log('GEMINI DIAGNOSTICS: PASS (actual SDK mocked offline): key identity, fixed verification model, JSON probe, invalid key, model/permission errors, RPM/TPM/RPD evidence, unknown cause, cooldown and no secret exposure');
