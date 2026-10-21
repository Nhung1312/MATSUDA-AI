import katex from 'katex';
import type { Assignment, Submission, StudentAnswer } from '../types';
import { isEssayQuestion, sanitizeMathString } from '../utils/questionUtils';
import { getStudentQuestion, getCorrectOptionLabel, getMultipleChoiceSelectionIssue, getSubmissionSummary, isSubmissionAnswerPending, isSubmissionAnswerBlank, getSubmissionSourceIssue } from '../utils/submissionReviewUtils';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const number = (value: number) => Number.isFinite(value) ? String(Math.round(value * 10000) / 10000).replace('.', ',') : '—';
const date = (value?: string) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa có';

// Presentation cleanup only: raw questions, student work and grades are never rewritten.
export function cleanSavedPrintMath(value: string): string {
  return sanitizeMathString(value).replace(/\\[bt](?![a-z])/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

export function renderSavedPrintFormula(value: string, display = false): string {
  const formula = cleanSavedPrintMath(value).replace(/^\$\$?|\$\$?$/g, '').trim();
  try { return katex.renderToString(formula, { displayMode: display, throwOnError: true, trust: false, strict: 'ignore', output: 'html' }); }
  catch { return `<span class="ms-math-fallback">${escape(formula)}</span>`; }
}

export function renderSavedPrintText(value?: string): string {
  if (!value) return '<span class="ms-muted">Chưa có dữ liệu</span>';
  const text = cleanSavedPrintMath(value);
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\n$]+\$|\\\([^]*?\\\))/g);
  return parts.map(part => {
    if (part.startsWith('$$') && part.endsWith('$$')) return renderSavedPrintFormula(part.slice(2, -2), true);
    if (part.startsWith('\\[') && part.endsWith('\\]')) return renderSavedPrintFormula(part.slice(2, -2), true);
    if (part.startsWith('\\(') && part.endsWith('\\)')) return renderSavedPrintFormula(part.slice(2, -2));
    if (part.startsWith('$') && part.endsWith('$')) return renderSavedPrintFormula(part.slice(1, -1));
    return escape(part).replace(/\n/g, '<br>');
  }).join('');
}

function stepMath(value?: string) {
  if (!value) return renderSavedPrintText(value);
  const clean = cleanSavedPrintMath(value);
  if (/[đĐăĂâÂêÊôÔơƠưƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(clean) && !/\\(?:text|mathrm)\{/.test(clean)) {
    const colon = clean.lastIndexOf(':');
    if (colon >= 0 && /\\(?:frac|sqrt|begin|left)/.test(clean.slice(colon + 1))) {
      return renderSavedPrintText(clean.slice(0, colon + 1)) + ' ' + renderSavedPrintFormula(clean.slice(colon + 1));
    }
    return renderSavedPrintText(clean);
  }
  return renderSavedPrintFormula(clean);
}

const safeImage = (source: string) => /^(?:https?:\/\/|data:image\/(?:png|jpeg|webp|gif|avif|bmp);base64,|blob:)/i.test(source);
const photo = (source: string, title: string) => safeImage(source)
  ? `<figure class="ms-photo"><figcaption>${escape(title)}</figcaption><img src="${escape(source)}" alt="${escape(title)}"></figure>`
  : '<p class="ms-warning">Ảnh không có địa chỉ hợp lệ; cần gửi bản gốc để đối chiếu.</p>';
const statusNames: Record<string, string> = { correct: 'Đúng', first_error: 'Lỗi đầu tiên', cascading_error: 'Lỗi kéo theo',
  independent_error: 'Lỗi khác', incorrect: 'Sai', incomplete: 'Chưa hoàn thiện', uncertain: 'Cần kiểm tra', skipped: 'Không tính điểm' };

export function buildSubmissionPrintHtml(assignment: Assignment, submission: Submission,
  options: { stylesheetUrls?: string[]; inlineCss?: string; includeReferenceSolution?: boolean } = {}): string {
  if (assignment.id !== submission.assignmentId) throw Error('Phiếu không thuộc bài giao đang chọn.');
  const summary = getSubmissionSummary(assignment, submission);
  const sourceIssue = getSubmissionSourceIssue(assignment, submission);
  const pending = summary.pendingCount > 0 || submission.isProvisional || submission.needsTeacherReview
    || submission.gradingStatus !== 'graded' || Boolean(sourceIssue);
  const scoreMismatch = Math.abs(summary.totalScore - submission.totalScore) > .0001;
  const printedPhotos = new Map<string, string>();
  const reportPhoto = (src: string, title: string) => {
    const earlier = printedPhotos.get(src);
    if (earlier) return `<p class="ms-muted">Ảnh dùng chung: xem ${escape(earlier)} ở phía trên.</p>`;
    printedPhotos.set(src, title); return photo(src, title);
  };
  const answers = [...submission.answers].sort((a, b) => {
    const qa = getStudentQuestion(assignment, submission, a.questionId), qb = getStudentQuestion(assignment, submission, b.questionId);
    return Number(isEssayQuestion(qa)) - Number(isEssayQuestion(qb)) || (qa?.order || 0) - (qb?.order || 0);
  });
  const sections = answers.map((answer, index) => {
    const question = getStudentQuestion(assignment, submission, answer.questionId);
    const essay = question && isEssayQuestion(question);
    const waiting = isSubmissionAnswerPending(assignment, submission, answer);
    const blank = isSubmissionAnswerBlank(submission, answer, question);
    const issue = !answer.teacherReviewed && (getMultipleChoiceSelectionIssue(question, answer) || answer.selectionReviewIssue);
    const source = assignment.questions.find(q => q.id === answer.questionId);
    const key = question && getCorrectOptionLabel(question);
    const correctText = !essay && question?.options?.find(option => option.id === key)?.text;
    const response = answer.stepGradingResponse;
    const steps = response?.analysis?.length ? response.analysis : answer.stepAnalysis || [];
    const rows = response?.scoreBreakdown?.map(row => `<tr><td>${renderSavedPrintText(row.criterion)}</td><td>${number(row.earnedPoints)}/${number(row.maxPoints)}</td><td>${renderSavedPrintText(row.reason)}</td></tr>`).join('');
    const stepCards = steps.map(step => {
      const cancelled = ['cancelled', 'crossed_out', 'excluded'].includes(step.contentType || '');
      const label = cancelled ? 'Đã gạch bỏ - không tính điểm' : statusNames[step.status] || 'Cần đối chiếu';
      return `<div class="ms-step"><div class="ms-step-head"><b>Bước ${escape(step.stepIndex ?? (step as any).stepNumber)}${step.pageIndex !== undefined && (answer.essayImages?.length || submission.essayImages?.length) ? ` · Ảnh ${step.pageIndex + 1}` : ''}</b><span class="${step.status === 'correct' && !cancelled ? 'ms-ok' : 'ms-check'}">${label}</span></div>
        <div class="ms-formula">${stepMath(step.studentLatex || step.studentText)}</div>
        ${step.comment ? `<p class="ms-comment">${renderSavedPrintText(step.comment)}</p>` : ''}
        ${step.correctionLatex ? `<p><b>Hướng dẫn sửa:</b> ${stepMath(step.correctionLatex)}</p>` : ''}
        ${step.crossedOutExplanation ? `<p>${renderSavedPrintText(step.crossedOutExplanation)}</p>` : ''}</div>`;
    }).join('');
    const work = essay ? answer.studentSolutionText || (answer.selectedAnswer !== 'TỰ_LUẬN' ? answer.selectedAnswer : '')
      : `${answer.selectedAnswer || 'Bỏ trống'}${answer.selectedOptionText ? ` - ${answer.selectedOptionText}` : ''}`;
    const reference = response?.referenceSolution;
    return `<section class="ms-question ${essay ? 'ms-essay' : 'ms-mcq'}${blank ? ' ms-blank' : ''}"><div class="ms-question-intro"><h2>Câu ${question?.order || index + 1} <span>${essay ? 'Tự luận' : 'Trắc nghiệm'}</span>
      <strong>${number(answer.pointsEarned)}/${number(answer.maxPoints)} điểm</strong></h2>
      <p class="ms-state ${waiting ? 'ms-check' : answer.isCorrect ? 'ms-ok' : ''}">${waiting ? 'Cần giáo viên đối chiếu' : blank ? 'Bỏ trống' : answer.isCorrect ? 'Đúng' : 'Cần xem lại'}</p>
      ${!source ? '<p class="ms-warning">Không còn câu này trong đề nguồn hiện tại. Giữ bản đã nộp để đối chiếu.</p>' : ''}
      <div class="ms-stem">${renderSavedPrintText(question?.question)}</div></div>
      ${question?.imageUrl ? reportPhoto(question.imageUrl, 'Hình trong đề học sinh') : ''}
      ${issue ? `<p class="ms-warning">${escape(issue)} Điểm trên phiếu là điểm đã lưu, chưa tự tính lại.</p>` : ''}
      <div class="ms-work"><b>Bài làm học sinh:</b><div>${blank ? 'Chưa có lời giải hoặc ảnh bài làm cho câu này.' : renderSavedPrintText(work)}</div></div>
      ${!essay ? `<p><b>Đáp án nguồn theo đề học sinh:</b> ${escape(key || 'Chưa có')}${correctText ? ' - ' + renderSavedPrintText(correctText) : ''}</p>` : ''}
      ${(answer.essayImages || []).map((src, i) => reportPhoto(src, `Ảnh bài làm câu ${question?.order || index + 1}, ảnh ${i + 1}`)).join('')}
      ${stepCards ? `<h3>Phân tích từng bước đã lưu</h3>${stepCards}` : essay && !blank ? '<p class="ms-muted">Chưa có phân tích từng bước đã lưu. Xuất phiếu không chạy chấm lại.</p>' : ''}
      ${answer.firstErrorExplanation || response?.firstErrorExplanation ? `<p class="ms-warning"><b>Lỗi đầu tiên:</b> ${renderSavedPrintText(answer.firstErrorExplanation || response?.firstErrorExplanation || '')}</p>` : ''}
      ${rows ? `<h3>Điểm theo từng tiêu chí</h3><table><thead><tr><th>Tiêu chí</th><th>Điểm</th><th>Căn cứ</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      ${answer.aiFeedback || response?.feedback ? `<p><b>Nhận xét AI đã lưu:</b> ${renderSavedPrintText(answer.aiFeedback || response?.feedback)}</p>` : ''}
      ${answer.teacherReviewed ? `<p><b>Giáo viên đã duyệt:</b> ${number(answer.teacherScore ?? answer.pointsEarned)}/${number(answer.maxPoints)} điểm${answer.teacherFeedback ? ' - ' + renderSavedPrintText(answer.teacherFeedback) : ''}</p>` : ''}
      ${essay && options.includeReferenceSolution && (source?.explanation || reference) ? `<div class="ms-reference"><h3>Lời giải đối chiếu</h3>${source?.explanation
        ? renderSavedPrintText(source.explanation)
        : (reference?.steps || []).map(step => `<p>${stepMath(step.solutionLatex)}</p>`).join('')}</div>` : ''}
      ${essay && source?.rubric ? `<p><b>Barem nguồn:</b> ${renderSavedPrintText(source.rubric)}</p>` : ''}
    </section>`;
  }).join('');
  const sheets = (options.stylesheetUrls || []).filter(url => /^https?:\/\//.test(url)).map(url => `<link rel="stylesheet" href="${escape(url)}">`).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Phiếu chấm - ${escape(submission.studentName)} - ${escape(assignment.title)}</title>${sheets}
    <style>${options.inlineCss || ''}</style><style>${SUBMISSION_PRINT_CSS}</style></head><body class="ms-report">
    <header class="ms-header"><div>TOÁN MATSUDA AI</div><h1>PHIẾU KẾT QUẢ & PHÂN TÍCH BÀI LÀM</h1><p>${escape(assignment.title)}</p></header>
    <div class="ms-overview"><div><p><b>Học sinh:</b> ${escape(submission.studentName)}</p><p><b>Lớp:</b> ${escape(submission.className || 'Chưa có')}</p>
      <p><b>Nộp bài:</b> ${escape(date(submission.submittedAt))}</p></div><div class="ms-score"><span>Điểm đã lưu</span><strong>${number(submission.totalScore)}<small>/${number(submission.maxScore || 10)}</small></strong><b>${pending || scoreMismatch ? 'CẦN GIÁO VIÊN ĐỐI CHIẾU / CHỐT' : 'ĐÃ HOÀN TẤT CHẤM'}</b></div></div>
    <div class="ms-summary">Đúng: ${summary.correctCount} · Sai/chưa đúng trọn vẹn: ${summary.wrongCount} · Bỏ trống: ${summary.unansweredCount} · Chờ duyệt: ${summary.pendingCount} · Tổng: ${summary.totalQuestions}</div>
    ${summary.pendingCount ? `<p class="ms-warning">Có ${summary.pendingCount} câu cần giáo viên đối chiếu. Không dùng điểm đã lưu làm điểm chính thức trước khi hoàn tất duyệt.</p>` : ''}
    ${sourceIssue ? `<p class="ms-warning">${escape(sourceIssue)}</p>` : ''}
    ${scoreMismatch ? '<p class="ms-warning">Điểm tổng đã lưu chưa khớp điểm từng câu. Phiếu giữ nguyên điểm đã lưu; cần giáo viên kiểm tra trước khi chốt.</p>' : ''}
    ${submission.teacherFeedback ? `<p><b>Nhận xét chung của giáo viên:</b> ${renderSavedPrintText(submission.teacherFeedback)}</p>` : ''}
    ${sections}
    ${(submission.essayImages || []).map((src, i) => reportPhoto(src, `Ảnh bài làm gốc ${i + 1}/${submission.essayImages!.length}`)).join('')}
    <footer class="ms-footer">Xuất từ kết quả đã lưu · Không gọi AI hoặc sửa điểm · Mã lượt nộp: ${escape(submission.id)}</footer>
    </body></html>`;
}

export const SUBMISSION_PRINT_CSS = `
@page{size:A4 portrait;margin:12mm;@bottom-center{content:"Trang " counter(page) " / " counter(pages);font:9px Arial;color:#64748b}}
html{background:#fff;color:#17213c}body.ms-report{box-sizing:border-box;font:12px/1.55 Arial,sans-serif;margin:0 auto;padding:18px;max-width:900px;background:#fff;color:#17213c}
.ms-report *{box-sizing:border-box}.ms-report p{margin:5px 0}.ms-header{background:#1e40af;color:#fff;padding:15px 18px;border-radius:8px;margin-bottom:12px;break-inside:avoid}.ms-header>div{font-size:10px;letter-spacing:1.5px}.ms-header h1{font-size:19px;font-weight:700;line-height:1.3;margin:4px 0}.ms-header p{font-size:13px}
.ms-overview{display:flex;justify-content:space-between;gap:16px;break-inside:avoid;margin:10px 0}.ms-overview>div{min-width:0}.ms-score{min-width:160px;border:1px solid #bfdbfe;padding:10px;text-align:center;border-radius:8px;color:#1e40af}.ms-score>span,.ms-score>b{display:block;font-size:10px}.ms-score>strong{display:block;font-size:30px;line-height:1.4}.ms-score small{font-size:15px;color:#64748b}.ms-summary{padding:8px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;break-inside:avoid}
.ms-question{margin:15px 0 0;padding:10px 0 8px;border-top:2px solid #cbd5e1;break-inside:auto}.ms-report h2{font-size:14px;font-weight:700;color:#1e3a8a;display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 6px;break-after:avoid}.ms-report h2>span{font-size:10px;font-weight:400;color:#64748b}.ms-report h2>strong{margin-left:auto;font-size:12px}.ms-report h3{font-size:12px;font-weight:700;margin:9px 0 5px;break-after:avoid}.ms-state{font-size:10px;font-weight:700}.ms-stem{margin:6px 0;overflow-wrap:anywhere}.ms-work{padding:8px 10px;border:1px solid #e2e8f0;border-radius:5px;margin:6px 0}.ms-work>div{margin-top:3px;overflow-wrap:anywhere}
.ms-step{border:1px solid #dbe3ef;border-radius:5px;padding:8px 10px;margin:6px 0;break-inside:avoid}.ms-step-head{display:flex;justify-content:space-between;gap:12px;font-size:11px}.ms-formula{margin:6px 0;max-width:100%;overflow-wrap:anywhere}.ms-comment{padding:5px 7px;background:#f1f5f9;color:#334155}.ms-ok{color:#166534}.ms-check{color:#92400e}.ms-muted{color:#64748b}.ms-warning{background:#fffbeb;border-left:3px solid #d97706;color:#78350f;padding:7px 10px;margin:8px 0;overflow-wrap:anywhere;break-inside:avoid}.ms-reference{background:#f8fafc;padding:8px;margin:8px 0}
.ms-report table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;margin:5px 0}.ms-report th,.ms-report td{border:1px solid #cbd5e1;padding:6px;vertical-align:top;text-align:left;overflow-wrap:anywhere}.ms-report th{background:#eff6ff}.ms-report th:nth-child(2){width:65px}.ms-report tr{break-inside:avoid}.ms-photo{margin:12px 0;padding:8px;border:1px solid #dbe3ef;break-inside:avoid}.ms-photo img{display:block;max-width:100%;max-height:215mm;width:auto;height:auto;object-fit:contain;margin:8px auto 0}.ms-photo figcaption{font-size:11px;font-weight:700}.ms-footer{border-top:1px solid #cbd5e1;margin-top:14px;padding-top:6px;color:#64748b;font-size:9px;overflow-wrap:anywhere;break-inside:avoid}.ms-math-fallback{font-family:monospace;white-space:pre-wrap;overflow-wrap:anywhere}.ms-report .katex{font-size:1.06em}.ms-report .katex-display{margin:.4em 0;max-width:100%}
@media print{body.ms-report{padding:0;max-width:none;width:auto}body.ms-report,body.ms-report *{visibility:visible!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ms-header{border-radius:0}.ms-mcq,.ms-blank,.ms-question-intro{break-inside:avoid}.ms-report .katex-display{overflow:visible}.ms-report .ms-photo img{object-fit:contain!important}.ms-report>:nth-last-child(2){break-after:avoid}}
`;
