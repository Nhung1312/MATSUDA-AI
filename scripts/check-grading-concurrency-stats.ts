import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { GradingService } from '../src/services/gradingService';
import { StorageService } from '../src/services/storageService';
import { FirestoreService } from '../src/services/firestoreService';
import { stepGradingService } from '../src/services/stepGradingService';
import { selectBatchGradingItems } from '../src/utils/batchGradingUtils';
import { getStudentSubmissionOverview, selectLatestStudentSubmissions } from '../src/utils/studentSubmissionUtils';
import { isEssayQuestion, getEssayGradingReference } from '../src/utils/questionUtils';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Mandatory offline guard missing');
const local = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value),
  removeItem: (key: string) => local.delete(key)
} });
const clone = (value: any) => JSON.parse(JSON.stringify(value));
const source = (file: string) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function bind(file: string, name: string, dependencies: Record<string, any>): any {
  const text = source(file), ast = ts.createSourceFile('view.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(found, name);
  const js = ts.transpileModule(`const ${found!.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const scope = Object.entries(dependencies).filter(([key]) => key !== name);
  return new Function(...scope.map(([key]) => key), js + `\nreturn ${name};`)(...scope.map(([, value]) => value));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const batchFile = 'src/components/BatchGradingModal.tsx', teacherFile = 'src/pages/teacher/TeacherResults.tsx';
const question: any = { id: 'q', order: 1, question: 'Giải x+1=2.', type: 'essay', points: 1, options: [], correctAnswer: 'x=1', rubric: 'Đúng lời giải: 1 điểm.' };
const assignment: any = { id: 'concurrency-stats', title: 'Đề thử', grade: '7', topic: 'Phương trình', classId: 'c', className: '7A', totalPoints: 10, questions: [question] };
const submission = (id: string, name: string, score = 0, when = '2026-10-16T00:00:00Z'): any => ({
  id, assignmentId: assignment.id, assignmentTitle: assignment.title, studentName: name, classId: 'c', className: '7A',
  submittedAt: when, startedAt: when, timeSpentSeconds: 30, maxScore: 10, totalScore: score, gradingStatus: 'graded',
  shuffledQuestions: [question], answers: [{ questionId: 'q', selectedAnswer: '', studentSolutionText: 'x=1', pointsEarned: score / 10, maxPoints: 1, isCorrect: score === 10 }]
});
const aiResult: any = { success: true, analysisSource: 'ai', analysis: [{ stepIndex: 1, studentLatex: 'x=1', status: 'correct', confidence: 1, comment: 'Đúng.' }],
  score: 1, maxScore: 1, isAllCorrect: true, feedback: 'Đúng.', firstErrorStep: null, firstErrorType: null,
  firstErrorExplanation: null, needsTeacherReview: false };
const originalInit = StorageService.initDemoData, originalCloud = FirestoreService.saveResult, originalAI = stepGradingService.analyzeStepByStep;
StorageService.initDemoData = () => {};
let cloudWrites: any[] = [], aiCalls = 0;
let cloud: () => Promise<void> = async () => {};
FirestoreService.saveResult = async sub => { cloudWrites.push(clone(sub)); await cloud(); };

function harness(core = GradingService) {
  const first = submission('first', 'Nguyễn An');
  const state: any = { lock: { current: false }, single: null, running: false, calls: [],
    items: [{ id: first.id, studentName: first.studentName, source: 'online', status: 'pending', submission: first }] };
  const deps = () => ({
    // Intentionally stale React state: the ref must block a second click before the next render.
    isGrading: false, gradingOperationLock: state.lock, setGradingSingleId: (id: any) => { state.single = id; },
    setIsGrading: (value: boolean) => { state.running = value; }, items: state.items, assignment,
    submissions: state.items.map((item: any) => item.submission), selectBatchGradingItems,
    filterSource: 'all', filterStatus: 'all', skipAlreadyGraded: false, abortControllerRef: { current: null },
    setCurrentGradingIndex: () => {}, setProgressText: () => {}, showToast: () => {},
    setItems: (fn: any) => { state.items = fn(state.items); }, GradingService: core,
    onSubmissionsUpdated: () => {}
  });
  return { state, row: () => bind(batchFile, 'handleGradeSingle', deps())(state.items[0]),
    batch: () => bind(batchFile, 'handleStartBatch', deps())() };
}

try {
  for (const firstAction of ['row', 'batch'] as const) {
    const aiStarted = deferred<void>(), aiRelease = deferred<void>(), cloudStarted = deferred<void>(), cloudRelease = deferred<void>();
    aiCalls = 0; cloudWrites = [];
    stepGradingService.analyzeStepByStep = async () => { aiCalls++; aiStarted.resolve(); await aiRelease.promise; return clone(aiResult); };
    cloud = async () => { cloudStarted.resolve(); await cloudRelease.promise; };
    const h = harness(), running = h[firstAction]();
    await aiStarted.promise;
    await Promise.all([h.row(), h.batch(), h.row()]);
    assert.equal(aiCalls, 1); assert.equal(h.state.lock.current, true);
    aiRelease.resolve(); await cloudStarted.promise;
    await Promise.all([h.row(), h.batch()]);
    assert.equal(cloudWrites.length, 1, 'The lock must remain held during the cloud acknowledgement');
    cloudRelease.resolve(); await running;
    assert.equal(h.state.lock.current, false); assert.equal(h.state.single, null); assert.equal(h.state.running, false);
    cloud = async () => {};
    await h.row();
    assert.equal(cloudWrites.length, 2, 'A subsequent intentional regrade remains available');
  }
  for (const firstAction of ['row', 'batch'] as const) {
    let failures = 0;
    const h = harness({ gradeSingleSubmissionWithAI: async () => { failures++; throw Error('Synthetic grading failure'); } } as any);
    await h[firstAction](); assert.equal(h.state.lock.current, false);
    assert.equal(h.state.single, null); assert.equal(h.state.running, false);
    await h.row(); assert.equal(failures, 2, 'Errors must release the lock for retry');
  }
  cloud = async () => { throw Error('Synthetic cloud acknowledgement failure'); };
  stepGradingService.analyzeStepByStep = async () => clone(aiResult);
  for (const firstAction of ['row', 'batch'] as const) {
    const h = harness(); await h[firstAction]();
    assert.equal(h.state.lock.current, false); assert.equal(h.state.single, null);
    assert.ok(h.state.items[0].cloudSaveWarning);
  }
  console.log('PASS: exact single/batch handlers serialize rapid and mixed clicks before React rerenders, hold the lock through cloud saving, and release it after success/failure');

  // Use the real storage auto-sync implementation so a hidden second write cannot escape the test.
  cloud = async () => {}; cloudWrites = [];
  await StorageService.saveSubmissionAsync(submission('async-save', 'Async'));
  assert.equal(cloudWrites.length, 1);
  cloud = async () => { throw Error('Synthetic save failure'); }; cloudWrites = [];
  await StorageService.saveSubmissionAsync(submission('async-offline', 'Offline'));
  assert.equal(cloudWrites.length, 1);
  assert.ok(StorageService.getSubmissions().some(sub => sub.id === 'async-offline'));

  const unlimitedSubmit = async (failCloud: boolean) => {
    cloudWrites = []; cloud = failCloud ? async () => { throw Error('Synthetic offline'); } : async () => {};
    const state: any = { lock: { current: false }, finished: [], error: '' };
    const handler = bind('src/pages/student/StudentExamPage.tsx', 'submitExam', {
      isSubmittingRef: state.lock, isSubmittingWithAI: false, setShowSubmitModal: () => {}, setIsSubmittingWithAI: () => {},
      setSubmissionStage: () => {}, setSubmissionError: (message: string) => { state.error = message; }, assignment, currentAssignment: assignment,
      participant: {}, studentName: 'Nộp không giới hạn', classId: 'c', className: '7A', document: { fullscreenElement: null },
      submissionLimitService: { check: async () => ({ assignment, limit: 0, remaining: null }) }, SubmissionLimitError: class extends Error {},
      studentSolutions: { q: 'x=1' }, essayImagesByQuestion: {}, generalPdfImages: [], answers: {},
      startedAt: '2026-10-16T00:00:00Z', tabSwitchCount: 0, violationEvents: [], isPdfMode: false,
      isEssayQuestion, getEssayGradingReference, GradingService, stepGradingService: { analyzeStepByStep: async () => clone(aiResult) },
      FirestoreService, StorageService, useMistakeVaultStore: { getState: () => ({ addMistakesFromSubmission: () => {} }) },
      draftStorageKey: 'synthetic-draft', soundEffects: { playSuccess: () => {} }, onFinishExam: (sub: any) => state.finished.push(sub)
    });
    localStorage.setItem('synthetic-draft', 'unfinished-student-work');
    await Promise.all([handler(), handler()]);
    console.log('TRACE submit outcome', { failCloud, cloudWrites: cloudWrites.length, finished: state.finished.length, error: state.error, lock: state.lock.current });
    assert.equal(cloudWrites.length, 1, 'Unlimited submission must not also use StorageService auto-sync');
    assert.equal(state.finished.length, failCloud ? 0 : 1, 'Never announce success after cloud failure');
    assert.equal(state.lock.current, false);
    if (failCloud) {
      assert.ok(state.error.includes('Chưa xác nhận'), 'Student must see a retry warning');
      assert.equal(localStorage.getItem('synthetic-draft'), 'unfinished-student-work',
        'Failed cloud save must preserve the draft');
    } else {
      assert.ok(StorageService.getSubmissions().some(s => s.id === state.finished[0].id));
      assert.equal(localStorage.getItem('synthetic-draft'), null, 'Accepted save removes the draft');
    }
  };
  await unlimitedSubmit(false); await unlimitedSubmit(true);
  console.log('PASS: submit first, one cloud write per attempt; cloud failure retains draft and never shows a false submission success');

  const attempts: any[] = [
    submission('an-old', 'Nguyễn An', 10, '2026-10-15T00:00:00Z'),
    submission('an-new', '  NGUYỄN   AN '.normalize('NFD'), 6, '2026-10-16T00:00:00Z'),
    submission('binh-old', 'Trần Bình', 8, '2026-10-15T00:00:00Z'),
    submission('binh-new', 'Trần Bình', 2, '2026-10-16T00:00:00Z')
  ];
  const before = JSON.stringify(attempts), roster: any[] = [{ id: 'an', name: 'Nguyễn An', classId: 'c' }, { id: 'binh', name: 'Trần Bình', classId: 'c' }, { id: 'chua-nop', name: 'Lê Chưa Nộp', classId: 'c' }];
  const overview = getStudentSubmissionOverview(assignment, attempts, roster);
  const stats = GradingService.computeAssignmentStats(assignment, roster.length, overview.statisticsSubmissions);
  assert.equal(stats.submittedCount, 2); assert.equal(stats.unsubmittedCount, 1);
  assert.equal(stats.averageScore, 4); assert.equal(stats.highestScore, 6); assert.equal(stats.lowestScore, 2);
  assert.equal(stats.questionAnalyses[0].totalResponses, 2);
  assert.deepEqual(overview.unsubmittedStudents.map(s => s.id), ['chua-nop']);
  assert.deepEqual(selectLatestStudentSubmissions(assignment, attempts).map(s => s.id).sort(), ['an-new', 'binh-new']);
  assert.equal(GradingService.computeAssignmentStats(assignment, 3, attempts).submittedCount, 2);
  assert.equal(JSON.stringify(attempts), before);

  const allClasses = { ...assignment, classId: 'all' };
  const acrossClasses = [submission('class-a', 'Nguyễn An'), { ...submission('class-b', 'Nguyễn An'), className: '7B', classId: 'b' },
    { ...submission('class-a-again', 'Nguyễn An', 1, '2026-10-17T00:00:00Z'), className: 'Lớp 7 A' }];
  assert.equal(selectLatestStudentSubmissions(allClasses, acrossClasses).length, 2);
  const ids = [{ ...submission('id-a', 'Trùng Tên'), studentId: 'a' }, { ...submission('id-b', 'Trùng Tên'), studentId: 'b' }];
  assert.equal(selectLatestStudentSubmissions(assignment, ids).length, 2, 'Distinct IDs with the same name stay separate');
  assert.equal(selectLatestStudentSubmissions(assignment, [...ids, submission('ambiguous', 'Trùng Tên')]).length, 3);
  const sameNames: any[] = [{ id: 'a', name: 'Trùng Tên', classId: 'c' }, { id: 'b', name: 'Trùng Tên', classId: 'c' }];
  const named = getStudentSubmissionOverview(assignment, [ids[0], submission('ambiguous', 'Trùng Tên')], sameNames);
  assert.equal(named.statisticsSubmissions.length, 1); assert.equal(named.unmatchedSubmissions.length, 1);
  assert.deepEqual(named.unsubmittedStudents.map(s => s.id), ['b']);
  const foreign = getStudentSubmissionOverview(assignment, [...attempts, submission('unknown', 'Không Trong Lớp'),
    { ...submission('wrong-class', 'Nguyễn An'), className: '7B' },
    { ...submission('unknown-id', 'Nguyễn An'), studentId: 'not-in-roster' },
    { ...submission('other-exam', 'Nguyễn An'), assignmentId: 'other' }], roster);
  assert.equal(foreign.statisticsSubmissions.length, 2); assert.equal(foreign.unmatchedSubmissions.length, 3);
  const linkedLegacy = [{ ...submission('known-id', 'Nguyễn An', 10, '2026-10-15T00:00:00Z'), studentId: 'an' },
    { ...submission('new-paper', ' Nguyễn An ', 4), submissionSource: 'paper' }];
  assert.deepEqual(selectLatestStudentSubmissions(assignment, linkedLegacy).map(s => s.id), ['new-paper']);
  const tie = [{ ...submission('tie-a', 'Nguyễn An'), attemptNumber: 1 }, { ...submission('tie-b', 'Nguyễn An'), attemptNumber: 2 },
    { ...submission('invalid', 'Nguyễn An', 9, 'invalid-date'), attemptNumber: 99 }];
  for (const list of [tie, [...tie].reverse()]) assert.equal(selectLatestStudentSubmissions(assignment, list)[0].id, 'tie-b');
  assert.equal(getStudentSubmissionOverview(assignment, attempts, []).statisticsSubmissions.length, 0);
  assert.equal(getStudentSubmissionOverview(assignment, attempts).statisticsSubmissions.length, 2);
  console.log('PASS: latest attempts determine one score/response per student; Unicode, repeated attempts, class separation, stable IDs, ambiguous names, outsiders, missing roster and timestamp ties are handled without editing history');

  // Verify the actual teacher computed views and downloadable CSV, not a duplicate rendering policy.
  const viewDeps: any = { currentAssignment: assignment, currentSubmissions: attempts, classStudents: roster,
    targetClass: { students: roster }, getStudentSubmissionOverview, GradingService, useMemo: (fn: any) => fn(),
    isAnswerPendingTeacherReview: () => false, searchStudent: '', submissionReviewFilter: 'all', sortBy: 'name', sortOrder: 'asc' };
  viewDeps.studentOverview = bind(teacherFile, 'studentOverview', viewDeps);
  viewDeps.statisticsSubmissions = viewDeps.studentOverview.statisticsSubmissions;
  assert.equal(bind(teacherFile, 'stats', viewDeps).submittedCount, 2);
  assert.equal(bind(teacherFile, 'leaderboardList', viewDeps).length, 2);
  assert.equal(bind(teacherFile, 'classErrorMatrix', viewDeps).rows.length, 2);
  assert.equal(bind(teacherFile, 'sortedSubmissions', viewDeps).length, 4, 'History table keeps every attempt');
  let download: any;
  const link: any = { setAttribute: (key: string, value: string) => { link[key] = value; }, click: () => { download = link.href; } };
  bind(teacherFile, 'handleExportCSV', { ...viewDeps, document: { createElement: () => link, body: { appendChild: () => {}, removeChild: () => {} } } })();
  const csv = decodeURI(download);
  assert.equal(csv.split('\n').length, 5, 'CSV retains all four attempts plus its header');
  assert.equal(JSON.stringify(attempts), before);
  const unknownRoster = { ...viewDeps, targetClass: null, classStudents: [] };
  unknownRoster.studentOverview = bind(teacherFile, 'studentOverview', unknownRoster);
  unknownRoster.statisticsSubmissions = unknownRoster.studentOverview.statisticsSubmissions;
  assert.equal(bind(teacherFile, 'stats', unknownRoster).totalAssigned, 0, 'Never invent a class size of 10');
  const repeated = [attempts[0], attempts[1], { ...attempts[1], id: 'an-third', submittedAt: '2026-10-17T00:00:00Z' }];
  const oneStudent = getStudentSubmissionOverview(assignment, repeated, roster.slice(0, 2));
  const oneStats = GradingService.computeAssignmentStats(assignment, 2, oneStudent.statisticsSubmissions);
  assert.equal(oneStats.submittedCount, 1); assert.equal(oneStats.unsubmittedCount, 1);
  assert.equal(oneStats.submittedCount / oneStats.totalAssigned * 100, 50, 'Three attempts by one student represent 50% of a two-student class');
  console.log('PASS: exact teacher stats, ranking and diagnostic matrix use the same two students; table and CSV retain all four historical attempts');
  console.log('GRADING CONCURRENCY / STUDENT STATS: PASS (offline synthetic fixtures only)');
} finally {
  StorageService.initDemoData = originalInit; FirestoreService.saveResult = originalCloud; stepGradingService.analyzeStepByStep = originalAI;
}
