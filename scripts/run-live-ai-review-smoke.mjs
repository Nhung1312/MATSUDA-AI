import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';

/** Manual opt-in only. The parent guard permits one synthetic request to the AI endpoint,
 * and all result persistence uses the demo Firestore Emulator with the deployed Rules fixture.
 * Exercise the real TeacherResults event handlers, not a reimplementation of saving grades.
 */
export async function runLiveAIReviewSmoke({ fixture, service, save, buildSubmission, select, anon, teacher, teacherUid,
  TeacherResults, stepGradingService, realAnalyze, getLiveResponse, getLiveRequests }) {
  assert.equal(process.env.MATSUDA_LIVE_AI_SMOKE, '1');
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const image = fixture.essayImages[0];
  const questions = [
    { id: 'mcq', order: 1, question: '1+1=?', type: 'multiple_choice', points: .5, options: [{ id: 'A', text: '2' }], correctAnswer: 'A' },
    { id: 'q-essay', order: 2, question: fixture.questionText, type: 'essay', points: fixture.maxPoints,
      options: [], correctAnswer: fixture.correctAnswer, rubric: fixture.rubric }
  ];
  const assignment = { id: 'synthetic-live-ai-exam', assignmentCode: 'SYNTHETIC-LIVE-AI', title: 'Synthetic image smoke only',
    grade: fixture.grade, topic: fixture.topic, classId: 'c', totalPoints: 2.5, questions };
  select(anon);
  const submission = { ...buildSubmission({ assignment, studentAnswers: { mcq: 'A' }, studentSolutions: {},
    essayImagesByQuestion: { 'q-essay': [image] }, studentName: 'SYNTHETIC TEST ONLY', classId: 'c', className: 'SYNTHETIC',
    startedAt: '2026-01-01T00:00:00Z', submittedAt: '2026-01-01T00:01:00Z' }), id: 'synthetic-live-ai-submission' };
  const receipt = await save(submission, { intent: 'student' });
  assert.equal(receipt.cloudSaved, true); assert.equal(getLiveRequests(), 0);
  select(teacher, { uid: teacherUid });
  const saved = await service.getResultById(submission.id);
  assert.equal(saved.gradingStatus, 'pending_teacher_grading');
  assert.deepEqual(saved.answers[1].essayImages, [image]);
  assert.equal(saved.answers[0].pointsEarned, .5);
  stepGradingService.analyzeStepByStep = realAnalyze;

  let renderer;
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const label = node => node.children.map(child => typeof child === 'string' ? child : label(child)).join('');
  const button = text => {
    const found = renderer.root.findAll(node => node.type === 'button' && label(node) === text)[0];
    assert.ok(found, 'Missing actual UI action: ' + text); return found;
  };
  const mount = async record => {
    await act(async () => {
      renderer = create(React.createElement(TeacherResults, { assignments: [assignment], classes: [], submissions: [record],
        initialAssignmentId: assignment.id, initialSubmissionId: submission.id, onOpenShare() {} }));
      await tick();
    });
    assert.ok(renderer.root.findAllByType('img').some(node => node.props.src === image), 'Result page must render the exact uploaded image');
  };
  try {
    await mount(saved);
    assert.equal(getLiveRequests(), 0, 'Opening Results cannot automatically invoke AI');
    const start = Date.now();
    await act(async () => { await button('✨ Chấm bằng AI (Từng bước)').props.onClick(); await tick(); });
    const durationMs = Date.now() - start;
    const response = getLiveResponse();
    assert.equal(response?.httpStatus, 200);
    assert.equal(response.body.analysisSource, 'ai', 'A rule/unavailable fallback is not a live AI pass');
    assert.equal(response.body.success, true);
    assert.equal(getLiveRequests(), 1);
    const aiSaved = await service.getResultById(submission.id);
    const essay = aiSaved.answers[1];
    assert.deepEqual(essay.essayImages, [image]);
    assert.equal(essay.stepGradingResponse.analysisSource, 'ai');
    assert.deepEqual(essay.stepAnalysis, response.body.analysis);
    assert.equal(essay.firstErrorStep, 3);
    assert.ok(essay.stepAnalysis.some(step => step.status === 'first_error'));
    assert.ok(essay.stepAnalysis.some(step => step.status === 'cascading_error'));
    assert.equal(essay.needsTeacherReview, true); assert.equal(essay.teacherScore, undefined);
    assert.equal(aiSaved.isProvisional, true);
    assert.equal(button('Chốt kết quả').props.disabled, true, 'AI suggestion cannot finalize before teacher approval');

    await act(async () => {
      renderer.root.findAll(node => node.type === 'input' && node.props.type === 'number')[0].props.onChange({ target: { value: '1.25' } });
      renderer.root.findAll(node => node.type === 'input' && node.props.placeholder === 'Lời phê của giáo viên...')[0].props.onChange({ target: { value: 'SYNTHETIC approved comment' } });
    });
    await act(async () => { await button('Lưu').props.onClick(); await tick(); });
    assert.equal(button('Chốt kết quả').props.disabled, false);
    await act(async () => { await button('Chốt kết quả').props.onClick(); await tick(); });
    const finalized = await service.getResultById(submission.id);
    assert.equal(finalized.answers[1].teacherScore, 1.25);
    assert.equal(finalized.answers[1].teacherFeedback, 'SYNTHETIC approved comment');
    assert.equal(finalized.totalScore, 7); // (.5 + 1.25) / 2.5 * 10, existing UI calculation.
    assert.equal(finalized.gradingStatus, 'graded'); assert.equal(finalized.isProvisional, false);
    assert.deepEqual(finalized.answers[1].stepAnalysis, essay.stepAnalysis);
    await act(async () => { renderer.unmount(); }); renderer = undefined;
    await mount(await service.getResultById(submission.id));
    assert.equal(renderer.root.findAll(node => node.type === 'input' && node.props.type === 'number')[0].props.value, 1.25);
    assert.equal(getLiveRequests(), 1, 'Reload/open approved result cannot regrade automatically');
    select(anon);
    const duplicate = await save(submission, { intent: 'student' });
    assert.equal(duplicate.cloudSaved, true, 'Same-ID retry reuses the original receipt without a write');
    await assert.rejects(service.saveResult(submission, { intent: 'student', operationId: 'synthetic-stale-replay' }), error => error.code === 'permission-denied');
    select(teacher, { uid: teacherUid });
    const unchanged = await service.getResultById(submission.id);
    assert.equal(unchanged.answers[1].teacherScore, 1.25);
    return { status: 'PASS', projectId: 'demo-matsuda-submit-first', productionFirestoreWrites: 0,
      data: 'synthetic only', imageBytes: Buffer.from(image.split(',')[1], 'base64').length,
      liveAIRequests: getLiveRequests(), aiHttpStatus: response.httpStatus, analysisSource: response.body.analysisSource,
      modelUsed: response.body.modelUsed, aiDurationMs: durationMs, analyzedSteps: essay.stepAnalysis.length,
      firstErrorStep: essay.firstErrorStep, cascadingSteps: essay.stepAnalysis.filter(step => step.status === 'cascading_error').length,
      aiSuggestedPoints: essay.aiScore, teacherApprovedPoints: 1.25, reloadedTotalScore: finalized.totalScore,
      cacheFull: true, actualTeacherResultsHandlers: true, actualImageShown: true, reviewAndFinalizePersisted: true };
  } finally { if (renderer) await act(async () => { renderer.unmount(); }); }
}
