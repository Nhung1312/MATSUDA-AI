import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { buildSubmissionExport } from '../src/services/submissionExportService';
import type { Assignment, Submission } from '../src/types';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'), 'Mandatory offline guard is missing');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const inline = `data:image/png;base64,${png}`;
const imageUrl = 'https://example.test/student-photo.png';
let requests = 0;
(globalThis as any).__examOfflineFetch = async (url: unknown) => {
  assert.equal(String(url), imageUrl, 'Only an existing attachment may be fetched; never AI');
  requests++;
  return new Response(Uint8Array.from(atob(png), ch => ch.charCodeAt(0)), { headers: { 'content-type': 'image/png' } });
};
const assignment: Assignment = {
  id: 'export-a', title: 'Đề thực tế giả lập', grade: '7', topic: 'Phương trình', classId: 'c',
  type: 'text', pdfUrl: `data:application/pdf;base64,${btoa('%PDF-1.4\n%%EOF')}`,
  questions: [{ id: 'mc', order: 1, question: '2 + 2 = ?', type: 'multiple_choice', points: 0.25,
    correctAnswer: 'B', options: [{ id: 'A', text: '3' }, { id: 'B', text: '4' }], imageUrl: inline },
    { id: 'essay', order: 2, question: 'Giải phương trình x + 2 = 5.', type: 'essay', points: 0.3,
      correctAnswer: 'x = 3', explanation: 'x = 5 - 2 = 3.', rubric: 'Biến đổi: 0,1đ. Kết luận: 0,2đ.', options: [] }],
  durationMinutes: 15, deadline: '', allowViewResult: true, assignmentCode: 'fixture', createdAt: '', isPublished: true
};
const submission: Submission = {
  id: 'export-s', assignmentId: assignment.id, assignmentTitle: assignment.title,
  classId: 'c', className: '7A1', studentName: 'Học sinh <script>alert(1)</script>',
  totalScore: 0.5, maxScore: 0.55, correctCount: 1, wrongCount: 1, unansweredCount: 0, totalQuestions: 2,
  timeSpentSeconds: 30, startedAt: '', submittedAt: '2026-10-13T04:00:00Z', gradingStatus: 'graded',
  essayImages: [imageUrl], isShuffled: true,
  shuffledQuestions: assignment.questions.map(q => q.id === 'mc' ? { ...q, correctAnswer: 'D', options: [{ id: 'C', text: '3' }, { id: 'D', text: '4' }] } : q),
  answers: [{ questionId: 'mc', selectedAnswer: 'D', correctAnswer: 'D', isCorrect: true, pointsEarned: 0.25, maxPoints: 0.25 },
    { questionId: 'essay', selectedAnswer: '', studentSolutionText: 'x = 3\n<script>alert(2)</script>', essayImages: [inline, imageUrl],
      isCorrect: false, pointsEarned: 0.25, maxPoints: 0.3, aiScore: 0.1, teacherScore: 0.25, teacherReviewed: true,
      teacherFeedback: 'Đã xem ảnh và sửa điểm.', needsTeacherReview: true,
      stepGradingResponse: { success: true, analysis: [{ stepIndex: 1, studentLatex: 'x = 3', status: 'correct', comment: 'Kết luận đúng.', confidence: 0.95 }],
        firstErrorStep: null, firstErrorType: null, firstErrorExplanation: null, totalSteps: 1, correctStepsCount: 1,
        isAllCorrect: false, score: 0.1, maxScore: 0.3, feedback: 'Thiếu biến đổi.', analysisSource: 'ai', scoringMethod: 'rubric',
        modelUsed: 'fixture-only', needsTeacherReview: true, scoreBreakdown: [{ criterion: 'Biến đổi', maxPoints: 0.1, earnedPoints: 0, reason: 'Chưa viết.' }] } }]
};
const before = JSON.stringify({ assignment, submission });
const progress: number[] = [];
const result = await buildSubmissionExport(assignment, submission, (done) => progress.push(done));
assert.equal(JSON.stringify({ assignment, submission }), before, 'Export must not change any saved data');
assert.equal(result.missingAttachments, 0);
assert.equal(result.attachmentCount, 3);
assert.equal(requests, 1, 'Repeated photo URLs must download once');
assert.equal(progress.at(-1), 3);
assert.ok(!result.filename.includes('<') && !result.filename.includes('/'));
const destination = process.argv[2];
assert.ok(destination, 'Provide an absolute temporary output path for independent ZIP checks');
writeFileSync(destination, result.bytes);

(globalThis as any).__examOfflineFetch = async () => new Response('expired', { status: 403 });
const partial = await buildSubmissionExport(assignment, submission);
assert.equal(partial.missingAttachments, 1);
writeFileSync(destination.replace(/\.zip$/, '-partial.zip'), partial.bytes);

(globalThis as any).__examOfflineFetch = async () => new Response('<script>unsafe</script>', { headers: { 'content-type': 'text/html' } });
const wrongType = await buildSubmissionExport(assignment, submission);
assert.equal(wrongType.missingAttachments, 1);
await assert.rejects(buildSubmissionExport(assignment, { ...submission, assignmentId: 'other' }), /không thuộc/);
console.log('PASS: saved grades unchanged; image deduplication; snapshot with source/shuffled exam, rubric, AI and manual grades; attachment failures flagged; no AI or cloud writes');
console.log('Created synthetic archives for independent Python ZIP/HTML/PNG validation.');
