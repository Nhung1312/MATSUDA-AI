import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { StorageService } from '../src/services/storageService';
import { FirestoreService, normalizeAssignmentDoc, sanitizeForFirestore } from '../src/services/firestoreService';
import { getTeacherSyncDiagnostics, setTeacherSyncDiagnostics } from '../src/services/teacherSyncDiagnostics';
assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'));
const clone = (value: any) => JSON.parse(JSON.stringify(value));
function bind(file: string, name: string, deps: Record<string, any>, method = false): any {
  const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => { if ((method ? ts.isMethodDeclaration(n) : ts.isVariableDeclaration(n)) && (n as any).name?.getText(ast) === name) found = n; ts.forEachChild(n, visit); }; visit(ast); assert.ok(found, name);
  const code = method ? `class Subject { ${found!.getText(ast)} }` : `const ${found!.getText(ast)};`;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(deps), js + `\nreturn ${method ? 'Subject.' : ''}${name};`)(...Object.values(deps));
}
let writes = 0;
const oldDisk = new Map([['toan_thcs_initialized_v4', 'true'], ['toan_thcs_assignments_v4', JSON.stringify(Array.from({ length: 7 }, (_, i) => ({ id: `old-${i}`, questions: [] })))],
  ['toan_thcs_deleted_assignment_keys_v4', JSON.stringify(['ARCHIVE-1'])]]);
const diskBefore = JSON.stringify([...oldDisk]);
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => oldDisk.get(k) ?? null,
  setItem: () => { writes++; throw Object.assign(new Error('Synthetic full storage'), { name: 'QuotaExceededError' }); },
  removeItem: () => { throw Error('No deletion authorized'); }
} });
const exams: any[] = Array.from({ length: 119 }, (_, i) => ({ id: `archive-${i}`, assignmentCode: `ARCHIVE-${i}`, title: `Archive ${i}`,
  teacherId: i < 7 ? 'uid-current' : 'uid-historical', teacherEmail: 'teacher@example.invalid', grade: '9', topic: 'Toán', classId: 'all', className: '9A',
  questions: [{ id: `q-${i}`, order: 1, question: '1+1=?', type: 'multiple_choice', correctAnswer: 'A', points: .25,
    options: [{ id: 'A', text: '2' }, { id: 'B', text: '3' }], imageUrl: 'data:image/png;base64,' + 'x'.repeat(20000) }],
  durationMinutes: 45, deadline: '', createdAt: '2026-10-01T00:00:00Z', isPublished: true, allowViewResult: true }));
const oldSubmission: any = { id: 'old-student', assignmentId: exams[0].id, studentName: 'Synthetic old student', totalScore: 7.75, maxScore: 10,
  answers: [{ questionId: 'old-question', pointsEarned: 7.75, maxPoints: 10, teacherFeedback: 'Keep the original teacher grade' }] };
let profile: any = { classes: [], deletedAssignmentKeys: [], cloudInitialized: true };
let failProfile = false, failEmail = false;
const snapshots = (items: any[]) => ({ size: items.length, forEach: (fn: any) => items.forEach(d => fn({ id: d.id, data: () => clone(d) })) });
const readDocs = async (q: any) => {
  const [, filter] = q;
  if (failEmail && filter?.[0] === 'teacherEmail') throw { code: 'permission-denied' };
  return snapshots(exams.filter(d => !filter || d[filter[0]] === filter[2]));
};
const getExams = bind('src/services/firestoreService.ts', 'getExams', {
  db: {}, EXAMS_COLLECTION: 'exams', collection: () => 'exams', query: (...v: any[]) => v, where: (...v: any[]) => v,
  getDocs: readDocs, getDocsFromServer: readDocs, normalizeAssignmentDoc, console: { warn() {} }
}, true);
let cloudWrites = 0;
const view: any = { assignments: [], classes: [], submissions: [] };
const deps = { cloudRefreshVersion: { current: 0 }, currentTeacherUid: { current: 'uid-current' },
  user: { uid: 'uid-current', email: 'teacher@example.invalid' }, auth: { currentUser: { uid: 'uid-current' } }, firebaseConfig: { projectId: 'synthetic-project' },
  StorageService, setTeacherSyncDiagnostics, setClasses: (v: any) => { view.classes = v; }, setAssignments: (v: any) => { view.assignments = v; },
  setSubmissions: (v: any) => { view.submissions = v; }, console: { warn() {} },
  FirestoreService: { getTeacherProfile: async (_uid: string, opts: any) => {
    assert.equal(opts.requireServer, true); if (failProfile) throw { code: 'permission-denied' }; return profile;
  }, getExams, getAllResults: async () => [clone(oldSubmission)],
  saveExam: () => { cloudWrites++; }, saveTeacherProfile: () => { cloudWrites++; }, saveTeacherClasses: () => { cloudWrites++; }, saveResult: () => { cloudWrites++; } }
};
const refresh = bind('src/App.tsx', 'refreshAllData', deps);
await refresh();
assert.equal(view.assignments.length, 119); assert.equal(StorageService.getAssignments().length, 119);
assert.equal(view.submissions[0].totalScore, 7.75); assert.equal(StorageService.getSubmissions()[0].totalScore, 7.75);
assert.equal(writes, 0, 'The entire 119-exam archive must never be forced into LocalStorage');
assert.equal(cloudWrites, 0); assert.equal(JSON.stringify([...oldDisk]), diskBefore);
assert.deepEqual(view.classes, []);
let diagnostic = getTeacherSyncDiagnostics();
assert.equal(diagnostic.uidMatches, 7); assert.equal(diagnostic.emailMatches, 119); assert.equal(diagnostic.cloudExams, 119);
assert.equal(diagnostic.classesState, 'empty'); assert.equal(diagnostic.status, 'ready');
console.log('PASS: actual App refresh loads 119 cloud exams over stale 7-exam/full disk cache, scopes UID/email reads, retains old scores, and performs zero disk/cloud writes');

failEmail = true; await refresh();
assert.equal(view.assignments.length, 7); diagnostic = getTeacherSyncDiagnostics();
assert.equal(diagnostic.status, 'partial'); assert.equal(diagnostic.emailQueryFailed, true);
failEmail = false; await refresh();
failProfile = true; await refresh();
assert.equal(view.assignments.length, 119); assert.equal(getTeacherSyncDiagnostics().errorCode, 'permission-denied');
failProfile = false; profile = { cloudInitialized: true }; await refresh();
assert.equal(getTeacherSyncDiagnostics().classesState, 'field-missing'); assert.equal(cloudWrites, 0);
profile = null; await refresh(); assert.equal(getTeacherSyncDiagnostics().classesState, 'profile-missing'); assert.equal(cloudWrites, 0);
console.log('PASS: query errors are distinct from empty/missing classes; no sign-in migration, no empty profile writes and no silent UID/email ownership merge');

// A stale async response from account A must never replace account B's view.
let release: any;
const oldRead = deps.FirestoreService.getTeacherProfile;
deps.FirestoreService.getTeacherProfile = () => new Promise(resolve => { release = resolve; });
const pending = refresh();
deps.currentTeacherUid.current = 'uid-new'; release({ classes: [] }); await pending;
assert.equal(view.assignments.length, 119);
deps.currentTeacherUid.current = 'uid-current'; deps.FirestoreService.getTeacherProfile = oldRead;

// An acknowledged verification save must survive full disk storage, issue one
// cloud write, and reload with the same source, key and historical submission.
const originalExam = clone(exams[0]), saved = new Map<string, any>();
const updatedQuestions = originalExam.questions.map((q: any) => ({ ...q, verificationStatus: 'verified', needsReview: false,
  teacherVerified: true, verificationFingerprint: 'synthetic-valid-fingerprint', pass1Answer: 'A' }));
const source = fs.readFileSync(new URL('../src/pages/teacher/TeacherAssignments.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('assignments.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let apply: ts.Expression | undefined;
const visit = (n: ts.Node) => { if (ts.isJsxAttribute(n) && n.name.getText(ast) === 'onApplyAnswers' && n.initializer && ts.isJsxExpression(n.initializer)) apply = n.initializer.expression; ts.forEachChild(n, visit); }; visit(ast); assert.ok(apply);
const js = ts.transpileModule(`const apply = ${apply!.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const applyDeps = { aiSolvingAssignment: originalExam, StorageService,
  FirestoreService: { saveExam: async (a: any) => { cloudWrites++; saved.set(a.id, sanitizeForFirestore(a)); } },
  alert() {}, setAiSolvingAssignment() {}, onRefresh: async () => {} };
const applyVerification = new Function(...Object.keys(applyDeps), js + '\nreturn apply;')(...Object.values(applyDeps));
const before = cloudWrites;
await applyVerification(updatedQuestions);
assert.equal(cloudWrites, before + 1); assert.equal(writes, 0);
const reloaded = normalizeAssignmentDoc(saved.get(originalExam.id), originalExam.id);
assert.equal(reloaded.questions[0].verificationStatus, 'verified');
assert.equal(reloaded.questions[0].question, originalExam.questions[0].question);
assert.equal(reloaded.questions[0].correctAnswer, originalExam.questions[0].correctAnswer);
assert.equal(oldSubmission.totalScore, 7.75); assert.equal(exams[0].questions[0].verificationStatus, undefined);
assert.equal(JSON.stringify([...oldDisk]), diskBefore);
StorageService.setCloudCacheOwner('new-account');
assert.ok(!StorageService.getAssignments().some(a => a.id === originalExam.id), 'Account switch must release only the memory snapshot');
assert.equal(JSON.stringify([...oldDisk]), diskBefore);
console.log('PASS: actual teacher verification save writes Cloud once, reloads verified metadata with source/key intact, tolerates full disk and never changes an old student submission');
// Preserve explicit local edit/delete behavior when the disk is writable;
// memory snapshots must not make deleted items reappear.
const mutableDisk = new Map<string, string>([['toan_thcs_initialized_v4', 'true']]);
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => mutableDisk.get(k) ?? null, setItem: (k: string, v: string) => mutableDisk.set(k, v), removeItem: (k: string) => mutableDisk.delete(k)
} });
StorageService.setCloudCacheOwner('mutable-fixture');
StorageService.cacheCloudAssignments([clone(exams[0])]);
StorageService.deleteAssignment(exams[0].id, exams[0].assignmentCode);
assert.equal(StorageService.getAssignments().length, 0);
StorageService.cacheCloudClasses([]);
const newClass: any = { id: 'synthetic-class', name: '9A', students: [], grade: '9' };
StorageService.saveClass(newClass); assert.equal(StorageService.getClasses()[0].id, newClass.id);
StorageService.deleteClass(newClass.id); assert.equal(StorageService.getClasses().length, 0);
const profileMethod = bind('src/services/firestoreService.ts', 'getTeacherProfile', {
  db: {}, doc: () => 'profile', TEACHERS_COLLECTION: 'teachers', console: { warn() {} },
  getDoc: async () => ({ exists: () => true, data: () => ({ geminiApiKey: 'synthetic-secret', classes: [] }) }),
  getDocFromServer: async () => ({ exists: () => true, data: () => ({ geminiApiKey: 'synthetic-secret' }) })
}, true);
const rawProfile = await profileMethod('uid-current', { requireServer: true });
assert.equal(rawProfile.classes, undefined, 'Missing classes must not normalize into a fabricated empty field');
assert.equal(rawProfile.geminiApiKey, undefined);
assert.deepEqual((await profileMethod('uid-current')).classes, []);
console.log('PASS: explicit local class/exam edits remain visible; profile reads distinguish missing/empty classes and never expose a stored Gemini key');

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.ok(!app.includes('const syncTeacherCloudData ='), 'Automatic cache-to-cloud migration must be removed');
assert.equal(JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).git.deploymentEnabled['fix/verification-cloud-cache-20261021'], false);
console.log('CLOUD CACHE: PASS (read/write adapters mocked; no Production access)');
