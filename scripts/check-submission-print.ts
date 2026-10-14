import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSubmissionPrintHtml, cleanSavedPrintMath, renderSavedPrintFormula } from '../src/services/submissionPrintService';
import { sanitizeMathString } from '../src/utils/questionUtils';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Mandatory network guard missing');
for (const math of [String.raw`\frac{x+1}{x-1}`, String.raw`\begin{cases}3x-2y=11\\8x+2y=22\end{cases}`,
  String.raw`\sqrt{x^2+1}`, String.raw`\widehat{ABC}=60^\circ`, String.raw`\beta+\theta+\tan x`, String.raw`3\times\frac12`]) {
  const rendered = renderSavedPrintFormula(math);
  assert.match(rendered, /class="katex"/); assert.ok(!rendered.includes('class="ms-math-fallback"'));
}
const controls = String.raw`\b\b\begin{cases}x+y=1\\x-y=3\end{cases}`;
assert.ok(!cleanSavedPrintMath(controls).startsWith(String.raw`\b\b`));
assert.ok(cleanSavedPrintMath(controls).startsWith(String.raw`\begin`));
assert.equal(cleanSavedPrintMath(String.raw`\t\tGọi quãng đường: \frac{x}{40}`), String.raw`Gọi quãng đường: \frac{x}{40}`);
assert.equal(cleanSavedPrintMath(String.raw`\beta+\theta+\text{Toán}`), String.raw`\beta+\theta+\text{Toán}`);
assert.match(renderSavedPrintFormula(String.raw`\unknowncommand{x}`), /class="ms-math-fallback"/);
assert.equal(sanitizeMathString('\times'), String.raw`\times`);
assert.equal(sanitizeMathString('\text{Toán}'), String.raw`\text{Toán}`);
assert.equal(sanitizeMathString('\right)'), String.raw`\right)`);
assert.equal(sanitizeMathString('\neq'), String.raw`\neq`);
assert.equal(sanitizeMathString('2\times3'), String.raw`2\times3`);
assert.ok(!renderSavedPrintFormula('2\times3').includes('class="ms-math-fallback"'));
console.log('PASS: fractions, systems, roots, angles and valid b/t commands render; legacy escaped controls are cleaned only for display; invalid formulas remain readable');

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const q: any = { id: 'essay', order: 1, question: 'Giải hệ $x+y=1$', type: 'essay', points: 2,
  options: [], correctAnswer: 'x=2,y=-1', rubric: 'Mỗi bước đúng 1 điểm', explanation: '$x=2, y=-1$' };
const assignment: any = { id: 'print-fixture', title: '<script>alert(1)</script>', questions: [q], totalPoints: 2 };
const submission: any = { id: 'print-saved', assignmentId: assignment.id, studentName: 'Học sinh thử', className: '7A',
  totalScore: 2, maxScore: 2, gradingStatus: 'graded', submittedAt: '2026-10-14T00:01:00Z',
  essayImages: [png], answers: [{ questionId: q.id, selectedAnswer: 'TỰ_LUẬN', studentSolutionText: 'x=2,y=-1',
    essayImages: [png], pointsEarned: 2, maxPoints: 2, isCorrect: true, teacherScore: 2, teacherReviewed: true,
    aiFeedback: 'Đúng lời giải', stepGradingResponse: { score: 2, maxScore: 2, analysisSource: 'ai',
      analysis: [{ stepIndex: 1, studentLatex: controls, status: 'correct', comment: 'Giải đúng hệ phương trình.' }],
      scoreBreakdown: [{ criterion: 'Giải đúng', earnedPoints: 2, maxPoints: 2, reason: 'Đủ các bước' }] } }] };
const before = JSON.stringify({ assignment, submission });
const report = buildSubmissionPrintHtml(assignment, submission);
assert.equal(JSON.stringify({ assignment, submission }), before);
assert.ok(!report.includes('<script>')); assert.match(report, /&lt;script&gt;/);
assert.match(report, /Phân tích từng bước đã lưu/); assert.match(report, /Điểm theo từng tiêu chí/);
assert.match(report, /Barem nguồn/); assert.match(report, /Giáo viên đã duyệt/);
assert.ok(!report.includes('<h3>Lời giải đối chiếu</h3>'));
assert.ok(buildSubmissionPrintHtml(assignment, submission, { includeReferenceSolution: true }).includes('<h3>Lời giải đối chiếu</h3>'));
assert.equal((report.match(/<img /g) || []).length, 1, 'Shared photos print once without being cropped');
assert.ok(report.includes(png)); assert.ok(report.includes('object-fit:contain'));
assert.ok(!report.includes('object-fit:cover')); assert.ok(report.includes('size:A4 portrait'));
assert.throws(() => buildSubmissionPrintHtml({ ...assignment, id: 'other' }, submission));
const unsafe = buildSubmissionPrintHtml(assignment, { ...submission, essayImages: ['javascript:alert(1)'],
  answers: [{ ...submission.answers[0], essayImages: [] }] });
assert.ok(!unsafe.includes('src="javascript:'));
console.log('PASS: report uses saved step analysis/rubric/manual scores, preserves source data and exact original images, deduplicates common photos and blocks active HTML/unsafe photo URLs');

const outputDir = process.argv[2];
if (outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const cssFile = path.resolve('node_modules/katex/dist/katex.min.css');
  const fonts = pathToFileURL(path.resolve('node_modules/katex/dist/fonts') + '/').href;
  const css = fs.readFileSync(cssFile, 'utf8').replace(/url\(fonts\//g, `url(${fonts}`);
  fs.writeFileSync(path.join(outputDir, 'synthetic-print.html'), buildSubmissionPrintHtml(assignment, submission, { inlineCss: css }));
  if (process.argv[3]) {
    const real = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const original = JSON.stringify(real);
    const html = buildSubmissionPrintHtml(real.assignment, real.submission, { inlineCss: css });
    assert.match(html, /Có 4 câu cần giáo viên đối chiếu/);
    assert.match(html, /Bỏ trống: 3/);
    assert.equal(JSON.stringify(real), original);
    fs.writeFileSync(path.join(outputDir, 'historical-print.html'), html);
    console.log('PASS: historical uploaded snapshot keeps its saved score, warns about four inconsistent choices and separates three blank questions');
  }
}
console.log('Print report checks passed (no AI or cloud writes).');
