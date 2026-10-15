import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { buildBatchSubmissionPrintHtml, createBatchPrintSnapshot, MAX_BATCH_PRINT_SUBMISSIONS } from '../src/services/submissionPrintService';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Offline network guard missing');
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const question: any = { id: 'q', order: 1, type: 'essay', question: 'Giải $x+1=2$.', correctAnswer: 'x=1', points: 1, options: [], rubric: 'Kết luận: 1 điểm.' };
const assignment: any = { id: 'a', title: 'Đề thử', questions: [question], totalPoints: 1 };
const first: any = { id: 's1', assignmentId: 'a', studentName: 'Học sinh thử', className: '7A', totalScore: .8, maxScore: 1, gradingStatus: 'graded',
  shuffledQuestions: [question], essayImages: [photo], answers: [{ questionId: 'q', selectedAnswer: 'TỰ_LUẬN', studentSolutionText: '$x=1$', essayImages: [photo],
    teacherScore: .8, teacherReviewed: true, pointsEarned: .8, maxPoints: 1, isCorrect: false, stepGradingResponse: {
      analysis: [{ stepIndex: 1, studentLatex: String.raw`\frac{x}{2}=\frac12`, status: 'correct', comment: 'Đúng.' }]
    } }] };
const second = { ...first, id: 's2', gradingStatus: 'needs_review', needsTeacherReview: true, isProvisional: true };
const original = JSON.stringify({ assignment, first, second });
const html = buildBatchSubmissionPrintHtml(assignment, [second, first]);
assert.equal((html.match(/<html /g) || []).length, 1);
assert.equal((html.match(/<head>/g) || []).length, 1);
assert.equal((html.match(/<body /g) || []).length, 1);
assert.equal((html.match(/<article class="ms-student-report"/g) || []).length, 2);
assert.ok(html.indexOf('data-submission-id="s2"') < html.indexOf('data-submission-id="s1"'), 'Preserve the filtered display order and both attempts of the same student');
assert.equal((html.match(/<img /g) || []).length, 2, 'One full original photo per student, even when shared with their answer');
assert.match(html, /class="katex"/); assert.match(html, /0,8/); assert.match(html, /CẦN GIÁO VIÊN ĐỐI CHIẾU/);
assert.match(html, /\.ms-report>\.ms-student-report\+\.ms-student-report\{break-before:page/);
assert.equal(JSON.stringify({ assignment, first, second }), original);
assert.throws(() => buildBatchSubmissionPrintHtml(assignment, []), /Chưa có/);
assert.throws(() => buildBatchSubmissionPrintHtml(assignment, [first, first]), /trùng ID/);
assert.throws(() => buildBatchSubmissionPrintHtml(assignment, [{ ...first, assignmentId: 'other' }]), /khác đề/);
assert.throws(() => buildBatchSubmissionPrintHtml(assignment, Array.from({ length: MAX_BATCH_PRINT_SUBMISSIONS + 1 }, (_, index) => ({ ...first, id: String(index) }))), /tối đa/);
assert.throws(() => createBatchPrintSnapshot(assignment, [{ ...first, teacherFeedback: 'x'.repeat(25 * 1024 * 1024) }]), /quá lớn/);
console.log('PASS: one A4 document preserves order, separate attempts, saved/manual scores, math and original images; page starts and count/size/identity limits are explicit');

function bind(text: string, name: string, dependencies: Record<string, any>) {
  const source = ts.createSourceFile('ui.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) declaration = node; ts.forEachChild(node, visit); };
  visit(source); assert.ok(declaration, name);
  const js = ts.transpileModule(`const ${declaration.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), js + `\nreturn ${name};`)(...Object.values(dependencies));
}
const teacherSource = fs.readFileSync(new URL('../src/pages/teacher/TeacherResults.tsx', import.meta.url), 'utf8');
let frozen: any, notice: any;
const selected = [structuredClone(second)], liveAssignment = structuredClone(assignment);
bind(teacherSource, 'handleBatchPrint', { currentAssignment: liveAssignment, reviewBusy: false, exportingBatchArchive: false,
  sortedSubmissions: selected, createBatchPrintSnapshot, setBatchPrintData: (value: any) => { frozen = value; }, setBatchArchiveNotice: (value: any) => { notice = value; } })();
liveAssignment.title = 'Đổi sau khi mở'; selected[0].totalScore = 0;
assert.equal(frozen.assignment.title, assignment.title); assert.equal(frozen.submissions.length, 1); assert.equal(frozen.submissions[0].totalScore, .8);
assert.equal(notice, undefined);
console.log('PASS: the exact teacher handler captures only filtered attempts before later grade/filter/source edits');

const modalSource = fs.readFileSync(new URL('../src/components/SubmissionPrintModal.tsx', import.meta.url), 'utf8');
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function printer(doc: any) {
  let printed = 0, error = '', timeout: (() => void) | undefined;
  const frame: any = { current: { contentDocument: doc, contentWindow: { focus: () => {}, print: () => { printed++; } } } };
  const lock = { current: false };
  const print = bind(modalSource, 'handlePrint', { frame, printLock: lock, busy: false, isBatch: true, preview: { html: '<html></html>' },
    setBusy: () => {}, setError: (value: string) => { error = value; },
    setTimeout: (action: () => void) => { timeout = action; return 1; }, clearTimeout: () => {} });
  return { print, frame, lock, get printed() { return printed; }, get error() { return error; }, expire: () => timeout!() };
}
const ready = printer({ fonts: { ready: Promise.resolve() }, images: [{ complete: true, naturalWidth: 1 }] });
await ready.print(); assert.equal(ready.printed, 1); assert.equal(ready.error, '');
const missing = printer({ fonts: { ready: Promise.resolve() }, images: [{ complete: true, naturalWidth: 0 }] });
await missing.print(); assert.equal(missing.printed, 0); assert.match(missing.error, /ảnh chưa tải/);
let release: () => void = () => {};
const waiting = printer({ fonts: { ready: new Promise<void>(resolve => { release = resolve; }) }, images: [] });
const pending = waiting.print(); await tick(); await waiting.print(); assert.equal(waiting.printed, 0);
release(); await pending; assert.equal(waiting.printed, 1);
const timeout = printer({ fonts: { ready: new Promise(() => {}) }, images: [] });
const stalled = timeout.print(); await tick(); timeout.expire(); await stalled;
assert.equal(timeout.printed, 0); assert.match(timeout.error, /chưa tải đủ/);
const changed = printer({ fonts: { ready: Promise.resolve() }, images: [] });
const stale = changed.print(); changed.frame.current.contentDocument = {}; await stale;
assert.equal(changed.printed, 0); assert.match(changed.error, /thay đổi hoặc đóng/);
console.log('PASS: exact print handler waits for fonts/photos, blocks duplicate clicks, and refuses missing assets, timeouts or a replaced preview');
console.log('Batch print checks passed (no AI, network or student database writes).');
