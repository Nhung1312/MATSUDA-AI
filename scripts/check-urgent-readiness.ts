import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { FileParserService } from '../src/services/fileParserService';
import { sanitizeForFirestore, normalizeAssignmentDoc } from '../src/services/firestoreService';
import { ExamCloudSaveError, examPayloadBytes, formatExamSaveFailure } from '../src/utils/examSaveDiagnostics';
import { isEssayQuestion, normalizeQuestion, calculateQuestionsTotalPoints, toPointUnits } from '../src/utils/questionUtils';
import { wrapBareLatex } from '../src/utils/bareLatex';
import { GradingService } from '../src/services/gradingService';
import type { Assignment } from '../src/types';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Offline guard is mandatory');
const clone = (v: any) => JSON.parse(JSON.stringify(v));
const source = fs.readFileSync(new URL('./fixtures/toan6-20-cau.tex', import.meta.url), 'utf8');
const parsed = FileParserService.parseRawText(source, 'toan6-20-cau.txt', 'text');
const questions = FileParserService.convertToQuestions(parsed.items);
assert.equal(questions.length, 20);
assert.equal(questions.map(q => q.correctAnswer).join(''), 'DCBCBCBCBABAAACADBCA');
const original = JSON.stringify(questions);

// Render the actual shared React component used by teacher and student views.
const bundle = await build({ stdin: { contents: `import React from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { MathDisplay } from './src/components/MathDisplay';
  export const render = (text, inline) => renderToStaticMarkup(React.createElement(MathDisplay, {text, inline}));`,
  resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', write: false,
  loader: { '.css': 'empty' }, logLevel: 'silent' });
const module = { exports: {} as any };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const render: (text: string, inline?: boolean) => string = module.exports.render;
for (const role of ['teacher', 'student']) {
  const view = fs.readFileSync(new URL(role === 'teacher' ? '../src/pages/teacher/TeacherCreateAssignment.tsx' : '../src/pages/student/StudentExamPage.tsx', import.meta.url), 'utf8');
  assert.match(view, /import \{ MathDisplay \}/);
  for (const q of questions) {
    assert.equal(q.options.length, 4);
    for (const text of [q.question, ...q.options.map(o => o.text), q.explanation || '']) {
      for (const inline of [true, false]) {
        const html = render(text, inline);
        assert.ok(!/katex-error|\\\{|\\\}|\\frac|\\sqrt/.test(html), `${role}: invalid visible math in question ${q.order}`);
        assert.ok(!html.includes('\\True') && !html.includes('\\loigiai'));
      }
    }
  }
}
for (const text of [String.raw`Tập A=\{1;\frac{2}{3};\sqrt[3]{8}\}.`,
  String.raw`\left\{x\in\mathbb{N}\mid x\le 9\right\}`,
  String.raw`\dfrac {1+\sqrt{5}} {2}, x^{\frac{1}{2}}, \sqrt[3]{\frac{8}{27}}`,
  String.raw`\frac12+\sqrt2`,
  String.raw`a\in\mathbb{Q}, A\cap B, AB\perp CD, \overline{14*}, 5^2`,
  '\\begin{cases}x+y=3\\\\\nx-y=1\\end{cases}']) {
  assert.ok(!/katex-error/.test(render(text)), text);
  assert.ok(!/katex-error/.test(render(text, true)), text);
  assert.match(render(text), /class="katex"/);
}
assert.equal(wrapBareLatex(String.raw`Giữ $\frac{1}{2}$ và \(x^2\).`), String.raw`Giữ $\frac{1}{2}$ và \(x^2\).`);
assert.ok(!render(String.raw`$\href{javascript:alert(1)}{x}$`).includes('href="javascript:'));
assert.equal(JSON.stringify(questions), original, 'Rendering must not mutate imported source/answers/order');
console.log('PASS: actual 20-question source renders in the shared teacher/student component; bare sets, nested fractions, radicals, powers, symbols, multiline systems and existing delimiters');

function bind(file: string, name: string, deps: Record<string, any>, method = false): any {
  const ast = ts.createSourceFile(file, fs.readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => { if ((method ? ts.isMethodDeclaration(n) : ts.isVariableDeclaration(n)) && (n as any).name?.getText(ast) === name) found = n; ts.forEachChild(n, visit); };
  visit(ast); assert.ok(found, name);
  const code = method ? `class Subject { ${found!.getText(ast)} };` : `const ${found!.getText(ast)};`;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(deps), js + `\nreturn ${method ? 'Subject.' : ''}${name};`)(...Object.values(deps));
}

// Execute the actual local cache method: confirmed saves must suppress its
// default cloud auto-sync without changing the old default for other callers.
let extraCloudWrites = 0;
const saveCache = bind('../src/services/storageService.ts', 'saveAssignment', {
  localStorage: { setItem() {} }, STORAGE_KEYS: { ASSIGNMENTS: 'synthetic-cache' },
  auth: { currentUser: { uid: 'test-owner' } },
  FirestoreService: { saveExam: async () => { extraCloudWrites++; } }
}, true);
const cacheReceiver = { unmarkAssignmentAsDeleted() {}, getAssignments: () => [] };
saveCache.call(cacheReceiver, { id: 'cache', assignmentCode: 'CACHE' }, { syncCloud: false });
assert.equal(extraCloudWrites, 0);
saveCache.call(cacheReceiver, { id: 'cache', assignmentCode: 'CACHE' });
assert.equal(extraCloudWrites, 1, 'Old auto-sync default remains available');

let failure: any = null, writes = 0;
const records = new Map<string, any>();
const auth: any = { currentUser: { uid: 'test-owner', isAnonymous: false } };
const cloudDeps = { db: {}, auth, firebaseConfig: { projectId: 'synthetic-firebase-project' }, EXAMS_COLLECTION: 'exams',
  doc: (_db: any, _col: string, id: string) => id,
  setDoc: async (id: string, value: any) => { writes++; if (failure) throw failure; records.set(id, clone(value)); },
  sanitizeForFirestore, ExamCloudSaveError, examPayloadBytes, console: { log() {}, warn() {} } };
const saveExam = bind('../src/services/firestoreService.ts', 'saveExam', cloudDeps, true);
const assignment: Assignment = { id: 'test-exam', title: 'Toán 6', assignmentCode: 'TOAN6-TEST', questions,
  grade: '6', topic: 'Số tự nhiên', classId: 'all', className: '6A', durationMinutes: 45, deadline: '', allowViewResult: true,
  createdAt: '2026-10-21T00:00:00Z', isPublished: true };
await saveExam(assignment, { uid: 'test-owner' });
assert.equal(records.get(assignment.id).questions.length, 20);
const getExamByCode = bind('../src/services/firestoreService.ts', 'getExamByCode', {
  ...cloudDeps, normalizeAssignmentDoc, collection: () => 'exams', where: (...args: any[]) => args, query: (...args: any[]) => args,
  getDocs: async (query: any) => {
    const code = query[1][2]; const docs = [...records].filter(([_id, data]) => data.assignmentCode === code)
      .map(([id, data]) => ({ id, data: () => clone(data) }));
    return { empty: docs.length === 0, docs };
  }
}, true);
const byCode = await getExamByCode(' toan6-test ');
assert.equal(byCode.questions.length, 20); assert.equal(byCode.id, assignment.id);
assert.ok(examPayloadBytes(assignment) < 1048576, '20 text questions are below 1MiB; never blame size without evidence');
for (const code of ['permission-denied', 'unauthenticated', 'unavailable', 'resource-exhausted', 'invalid-argument']) {
  failure = { code, message: 'private raw payload must never appear' };
  await assert.rejects(() => saveExam(assignment), (e: any) => e.diagnostics.code === code
    && e.diagnostics.projectId === 'synthetic-firebase-project' && !e.message.includes('private raw'));
}
failure = null;
const beforeLarge = writes;
await assert.rejects(() => saveExam({ ...assignment, pdfUrl: 'a'.repeat(1048577) }), (e: any) => e.diagnostics.code === 'document-too-large');
assert.equal(writes, beforeLarge);
await assert.rejects(() => saveExam(assignment, { uid: 'wrong-owner' }), (e: any) => e.diagnostics.code === 'owner-mismatch');
console.log('PASS: actual Firestore save acknowledges success, preserves error codes/project/auth/size, rejects definite oversized fields and mismatched Firebase identities; diagnostic contains no raw payload');

function teacher() {
  const state: any = { lock: { current: false }, identity: { current: null }, notices: [], completed: [], alerts: [], local: [], failLocal: false, failAfter: false };
  const deps: any = { saveLock: state.lock, pendingIdentity: state.identity, setSaveNotice: (v: any) => state.notices.push(v),
    title: assignment.title, grade: '6', topic: assignment.topic, classId: 'all', classes: [], BILLING_ENABLED: false,
    user: { uid: 'test-owner' }, isEditing: false, editingAssignment: undefined, questions,
    examMode: 'text', durationMinutes: 45, deadline: '', allowViewResult: true, resultReviewMode: 'full', maxSubmissions: 1,
    targetTotalPoints: calculateQuestionsTotalPoints(questions), isEssayQuestion, normalizeQuestion, calculateQuestionsTotalPoints, toPointUnits,
    setIsSaving() {}, window: { confirm: () => true }, alert: (m: string) => state.alerts.push(m), formatExamSaveFailure,
    FirestoreService: { saveExam }, StorageService: { generateAssignmentCode: () => 'NEW-20', saveAssignment: (a: any, opts: any) => {
      assert.deepEqual(opts, { syncCloud: false }); if (state.failLocal) throw new Error('local quota'); state.local.push(clone(a)); } },
    onSaveSuccess: async (a: any) => { if (state.failAfter) throw new Error('navigation failure'); state.completed.push(clone(a)); } };
  return { state, run: () => bind('../src/pages/teacher/TeacherCreateAssignment.tsx', 'handleSave', deps)({ preventDefault() {} }) };
}
const failed = teacher(); failure = { code: 'permission-denied' };
await failed.run();
assert.equal(failed.state.completed.length, 0); assert.equal(failed.state.local.length, 0);
assert.match(failed.state.alerts.at(-1), /permission-denied/);
const retryId = failed.state.identity.current.id;
failure = null; await failed.run();
assert.equal(failed.state.completed[0].id, retryId, 'Retry keeps the same document and share code');
assert.equal(failed.state.completed[0].questions.length, 20);
for (const fail of ['failLocal', 'failAfter']) {
  const h = teacher(); h.state[fail] = true; await h.run();
  assert.ok(h.state.notices.filter(Boolean).at(-1).cloudSaved);
  assert.equal(h.state.notices.filter(Boolean).at(-1).code, 'NEW-20');
  assert.ok(h.state.alerts.every((m: string) => !m.includes('Chưa lưu được đề lên Firebase')));
}
assert.equal(JSON.stringify(questions), original, 'Failed save preserves the editor source');
// The new cloud exam is directly usable by the student grading path, but an
// unverified source key stays pending rather than generating false wrong marks.
const newlySaved = failed.state.completed[0];
const submission = GradingService.gradeSubmission({ assignment: newlySaved, studentName: 'Synthetic student', classId: 'all', className: '6A',
  studentAnswers: Object.fromEntries(questions.map(q => [q.id, q.correctAnswer])), startedAt: '2026-10-21T00:00:00Z',
  submittedAt: '2026-10-21T00:10:00Z', requireVerifiedObjectiveKeys: true });
assert.equal(submission.wrongCount, 0); assert.equal(submission.ungradedCount, 20);
console.log('PASS: actual teacher save/retry retains all 20 questions, only exposes a code after cloud ack, tolerates local/cache and post-save failures; student grading holds all unverified keys');

// Execute the actual profile write and cleanup methods with field-only mocks.
let profile: any = { geminiApiKey: 'synthetic-legacy-secret', classes: [{ id: '6A' }], isVip: true };
const profileDeps = { ...cloudDeps, TEACHERS_COLLECTION: 'teachers', deleteField: () => '__DELETE__',
  setDoc: async (_ref: any, data: any) => { assert.ok(!('geminiApiKey' in data)); profile = { ...profile, ...clone(data) }; },
  updateDoc: async (_ref: any, data: any) => { assert.deepEqual(data, { geminiApiKey: '__DELETE__' }); delete profile.geminiApiKey; } };
await bind('../src/services/firestoreService.ts', 'saveTeacherProfile', profileDeps, true)('test-owner', { geminiApiKey: 'never-upload', displayName: 'Teacher' });
await bind('../src/services/firestoreService.ts', 'removeLegacyTeacherGeminiApiKey', profileDeps, true)('test-owner');
assert.equal(profile.geminiApiKey, undefined); assert.deepEqual(profile.classes, [{ id: '6A' }]); assert.equal(profile.isVip, true);
await assert.rejects(() => bind('../src/services/firestoreService.ts', 'removeLegacyTeacherGeminiApiKey', profileDeps, true)('another-owner'));
console.log('PASS: actual profile writer rejects key syncing; authenticated-owner cleanup removes exactly the legacy field and preserves classes/subscription');
console.log('URGENT READINESS: PASS (offline fixtures; no real student, Firebase or Gemini calls)');
