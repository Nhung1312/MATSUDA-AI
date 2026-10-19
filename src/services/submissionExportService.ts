import type { Assignment, Submission } from '../types';
import { getEssayGradingReference, getQuestionTypeLabel, isEssayQuestion } from '../utils/questionUtils';
import { getSubmissionSummary, getMultipleChoiceSelectionIssue, isSubmissionAnswerPending, hasTeacherGrade } from '../utils/submissionReviewUtils';
import { getSavedReportQuestion, getSavedGradingReference, getSubmissionReportSourceIssue } from '../utils/submissionReportUtils';

type Entry = { path: string; bytes: Uint8Array };
type Attachment = { source: string; path: string | null; error?: string };
type AttachmentData = { bytes: Uint8Array; extension: string };
// Per export run only: source URLs can expire or change between runs.
type AttachmentMemo = Map<string, Promise<AttachmentData>>;
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
const textEntry = (path: string, text: string): Entry => ({ path, bytes: encoder.encode(text) });
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const block = (title: string, value: unknown) => `<h4>${escape(title)}</h4><div class="text">${escape(value || 'Chưa có dữ liệu đã lưu.')}</div>`;

/** ZIP STORE: exact original bytes, UTF-8 paths, no dependency or image conversion. */
function zip(entries: Entry[]): Uint8Array {
  const chunks: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path), bytes = entry.bytes;
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true);
    lv.setUint16(12, 33, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true);
    lv.setUint16(26, name.length, true); local.set(name, 30);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true); cv.setUint16(14, 33, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); central.set(name, 46);
    chunks.push(local, bytes); directory.push(central); offset += local.length + bytes.length;
  }
  const directorySize = directory.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
  const output = new Uint8Array(offset + directorySize + end.length);
  let cursor = 0;
  for (const part of [...chunks, ...directory, end]) { output.set(part, cursor); cursor += part.length; }
  return output;
}

async function readAttachment(source: string): Promise<AttachmentData> {
  let bytes: Uint8Array, mime: string;
  const inline = source.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (inline) {
    mime = inline[1].toLowerCase();
    bytes = Uint8Array.from(atob(inline[2]), ch => ch.charCodeAt(0));
  } else {
    if (!/^https?:\/\//i.test(source)) throw new Error('Đường dẫn ảnh/tệp không hỗ trợ.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(source, { signal: controller.signal });
      if (!response.ok) throw new Error('Không tải được ảnh/tệp đã lưu.');
      mime = (response.headers.get('content-type') || '').split(';')[0].toLowerCase().trim();
      bytes = new Uint8Array(await response.arrayBuffer());
    } finally { clearTimeout(timeout); }
  }
  // Allow only inert image/PDF assets in the report, never HTML or active SVG.
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp', 'application/pdf': 'pdf' };
  const extension = extensions[mime];
  if (!extension || !bytes.length) throw new Error('Tệp ảnh/PDF trống hoặc chưa đọc được định dạng.');
  return { bytes, extension };
}

export async function buildSubmissionExport(assignment: Assignment, submission: Submission,
  onProgress?: (done: number, total: number) => void, attachmentMemo: AttachmentMemo = new Map()) {
  if (submission.assignmentId !== assignment.id) throw new Error('Bài nộp không thuộc đề đang chọn.');
  // Capture saved state before any asynchronous work; never write grades or call AI.
  const source: Assignment = JSON.parse(JSON.stringify(assignment));
  const saved: Submission = JSON.parse(JSON.stringify(submission));
  const exportedAt = new Date().toISOString();
  const audit = getSubmissionSummary(source, saved);
  const sourceIssue = getSubmissionReportSourceIssue(source, saved);
  const questions = saved.shuffledQuestions?.length ? saved.shuffledQuestions : source.questions;
  const sources = [...new Set([
    source.pdfUrl, ...(source.questions || []).map(q => q.imageUrl),
    ...(questions || []).map(q => q.imageUrl), ...(saved.essayImages || []),
    ...(saved.answers || []).flatMap(a => [...(a.essayImages || []), a.gradingReference?.imageUrl, a.aiGradingReference?.imageUrl])
  ].filter((url): url is string => typeof url === 'string' && !!url.trim()))];
  const entries: Entry[] = [], attachments: Attachment[] = [];
  let done = 0;
  onProgress?.(done, sources.length);
  for (let offset = 0; offset < sources.length; offset += 3) {
    const batch = sources.slice(offset, offset + 3);
    const results = await Promise.allSettled(batch.map(async url => {
      try {
        let pending = attachmentMemo.get(url);
        if (!pending) { pending = readAttachment(url); attachmentMemo.set(url, pending); }
        return await pending;
      }
      finally { onProgress?.(++done, sources.length); }
    }));
    results.forEach((result, idx) => {
      const url = batch[idx];
      if (result.status === 'fulfilled') {
        const path = `anh-va-de/tep-${String(offset + idx + 1).padStart(3, '0')}.${result.value.extension}`;
        entries.push({ path, bytes: result.value.bytes }); attachments.push({ source: url, path });
      } else attachments.push({ source: url, path: null, error: 'Không tải được tệp đính kèm. Cần gửi bổ sung tệp gốc.' });
    });
  }
  const assetPaths = new Map(attachments.map(item => [item.source, item.path]));
  const image = (url: string, title: string) => {
    const path = assetPaths.get(url);
    return path ? `<figure><img src="${escape(path)}" alt="${escape(title)}"><figcaption>${escape(title)}</figcaption></figure>`
      : `<p class="warning">${escape(title)}: chưa tải được ảnh, cần gửi bổ sung.</p>`;
  };
  const missing = attachments.filter(item => !item.path).length;
  const sections = (saved.answers || []).map((answer, idx) => {
    const q = getSavedReportQuestion(source, saved, answer.questionId);
    const original = (source.questions || []).find(item => item.id === answer.questionId);
    const savedReference = getSavedGradingReference(saved, answer);
    const currentReference = getEssayGradingReference(original || { correctAnswer: '' });
    const response = answer.stepGradingResponse;
    const steps = response?.analysis?.length ? response.analysis : answer.stepAnalysis || [];
    const selectedText = answer.selectedOptionText || q?.options?.find(o => o.id === answer.selectedAnswer)?.text;
    const essay = q ? isEssayQuestion(q) : !!(answer.studentSolutionText || answer.essayImages?.length);
    const pending = isSubmissionAnswerPending(source, saved, answer);
    const selectionIssue = !hasTeacherGrade(answer) && getMultipleChoiceSelectionIssue(q, answer);
    const photos = (answer.essayImages || []).map((url, i) => image(url, `Ảnh bài làm câu này ${i + 1}`)).join('');
    const rows = steps.map(step => `<tr><td>${escape(step.stepIndex)}${step.pageIndex === undefined ? '' : `<br>Ảnh ${escape(step.pageIndex + 1)}`}</td><td class="text">${escape(step.studentLatex || step.studentText)}</td><td>${escape(step.status)}<br>${escape(step.contentType || '')}<br>Tin cậy: ${escape(step.confidence)}</td><td class="text">${escape(step.comment)}${step.correctionLatex ? `<br>Sửa: ${escape(step.correctionLatex)}` : ''}${step.crossedOutExplanation ? `<br>Gạch bỏ: ${escape(step.crossedOutExplanation)}` : ''}</td></tr>`).join('');
    // Read-only quality flags: NEVER recalculate or overwrite archived student grades.
    const rubricCriteria = response?.scoreBreakdown || [];
    const criterionTotal = rubricCriteria.reduce((sum, item) => sum + (Number(item.earnedPoints) || 0), 0);
    const recordedAiScore = typeof answer.aiScore === 'number' && Number.isFinite(answer.aiScore) ? answer.aiScore
      : typeof response?.score === 'number' && Number.isFinite(response.score) ? response.score : null;
    const rubricScoreMismatch = rubricCriteria.length > 0 && recordedAiScore !== null
      && Math.abs(criterionTotal - recordedAiScore) > 0.011;
    const aiUnavailablePending = essay && pending && !hasTeacherGrade(answer)
      && (answer.aiGradingError || response?.analysisSource === 'unavailable');
    const scoreLabel = pending && !hasTeacherGrade(answer)
      ? 'Điểm đang lưu (tạm, chưa duyệt)' : 'Điểm đã lưu';
    const breakdown = response?.scoreBreakdown?.map(item => `<tr><td class="text">${escape(item.criterion)}</td><td>${escape(item.earnedPoints)}/${escape(item.maxPoints)}</td><td class="text">${escape(item.reason)}</td></tr>`).join('');
    return `<section><h2>Câu ${idx + 1}${q?.order === undefined ? '' : ` (số lưu trong đề: ${escape(q.order)})`} — ${escape(q ? getQuestionTypeLabel(q) : 'Chưa ghép được câu nguồn')}</h2>
      ${!original ? '<p class="warning">Không tìm thấy câu nguồn hiện tại; giữ dữ liệu của bài đã nộp để đối chiếu.</p>' : ''}
      ${block('Đề học sinh đã nhận', q?.question)}${q?.imageUrl ? image(q.imageUrl, 'Hình trong đề học sinh') : ''}
      ${q?.options?.length && !essay ? block('Phương án trên đề học sinh', q.options.map(o => `${o.id}. ${o.text}`).join('\n')) : ''}
      ${original && (original.question !== q?.question || original.imageUrl !== q?.imageUrl) ? block('Đề nguồn hiện tại (khác bản học sinh đã nhận)', original.question) + (original.imageUrl ? image(original.imageUrl, 'Hình nguồn hiện tại') : '') : ''}
      ${block('Đáp án theo đề học sinh', answer.correctAnswer || q?.correctAnswer)}
      ${block('Lời giải đã lưu cùng bài chấm', savedReference?.explanation)}${block('Barem/hướng dẫn chấm đã lưu', savedReference?.rubric)}
      ${answer.aiGradingReference ? block('Căn cứ phân tích AI mới (giữ nguyên điểm giáo viên đã duyệt)', answer.aiGradingReference.rubric || answer.aiGradingReference.explanation) : ''}
      ${answer.aiGradingReference?.imageUrl && answer.aiGradingReference.imageUrl !== savedReference?.imageUrl ? image(answer.aiGradingReference.imageUrl, 'Hình dùng cho phân tích AI mới, điểm giáo viên được giữ nguyên') : ''}
      ${savedReference?.imageUrl && savedReference.imageUrl !== q?.imageUrl ? image(savedReference.imageUrl, 'Hình nguồn đã lưu cùng phân tích chấm') : ''}
      <details><summary>Nguồn hiện tại để đối chiếu (có thể khác căn cứ chấm đã lưu)</summary>${block('Đáp án nguồn hiện tại', currentReference.correctAnswer)}${block('Lời giải nguồn hiện tại', original?.explanation)}${block('Barem nguồn hiện tại', original?.rubric)}</details>
      ${block('Bài làm học sinh', essay ? answer.studentSolutionText || answer.selectedAnswer : `${answer.selectedAnswer || 'Chưa trả lời'}${selectedText ? ` — ${selectedText}` : ''}`)}${photos}
      ${selectionIssue ? `<p class="warning">${escape(selectionIssue)} Điểm cũ và dữ liệu JSON được giữ nguyên.</p>` : ''}
      <p><b>${scoreLabel}: ${escape(answer.pointsEarned)}/${escape(answer.maxPoints)}</b> · Điểm AI: ${escape(answer.aiScore ?? response?.score ?? 'Chưa có')} · Điểm giáo viên: ${escape(answer.teacherScore ?? 'Chưa nhập')}</p>
      <p>${pending ? 'Cần giáo viên kiểm tra' : 'Theo trạng thái đã lưu'} · ${answer.teacherReviewed ? 'Giáo viên đã duyệt' : ''}</p>
      ${aiUnavailablePending ? '<p class="warning">AI chưa chấm được câu này. Giá trị 0 nếu có chỉ là số đang lưu tạm, KHÔNG phải điểm chấm chính thức. Cần giáo viên đối chiếu ảnh/bài làm và chấm.</p>' : ''}
      ${rubricScoreMismatch ? `<p class="warning">Điểm AI (${escape(recordedAiScore)}) khác tổng các tiêu chí (${escape(Math.round(criterionTotal * 10000) / 10000)}). Chưa được coi là điểm đã đối soát; cần giáo viên kiểm tra. Báo cáo không tự thay đổi điểm.</p>` : ''}
      ${block('Nhận xét AI', answer.aiFeedback || response?.feedback)}${block('Nhận xét giáo viên', answer.teacherFeedback)}
      ${steps.length ? `<h4>Phân tích từng bước đã lưu</h4><table><thead><tr><th>Bước</th><th>Nội dung AI đọc</th><th>Trạng thái</th><th>Nhận xét</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>Chưa có phân tích từng bước đã lưu. Xuất bài không chạy chấm mới.</p>'}
      ${block('Lỗi đầu tiên', answer.firstErrorExplanation || response?.firstErrorExplanation)}
      ${breakdown ? `<h4>Điểm theo tiêu chí của AI</h4><table><thead><tr><th>Tiêu chí</th><th>Điểm</th><th>Căn cứ</th></tr></thead><tbody>${breakdown}</tbody></table>` : ''}
      ${response?.referenceSolution ? block('Lời giải tham khảo do AI tạo (để đối chiếu)', JSON.stringify(response.referenceSolution, null, 2)) : ''}
      ${response?.modelUsed ? `<p>Mô hình đã lưu: ${escape(response.modelUsed)}; phương pháp: ${escape(response.scoringMethod || '')}; nguồn: ${escape(response.analysisSource)}</p>` : ''}
    </section>`;
  }).join('');
  const report = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bài đã chấm — ${escape(saved.studentName)}</title><style>
    body{font:16px/1.6 Arial,sans-serif;color:#17213c;margin:24px auto;padding:0 20px;max-width:1100px}h1{font-size:26px}h2{font-size:21px;color:#3730a3}h4{margin-bottom:6px}.text{white-space:pre-wrap;overflow-wrap:anywhere}section{border-top:2px solid #cbd5e1;padding:16px 0;margin-top:20px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}th{background:#eef2ff}img{display:block;max-width:100%;height:auto}figure{margin:16px 0}figcaption{font-size:13px;color:#475569}.warning{background:#fff7ed;padding:12px;color:#9a3412}@media print{body{margin:0;max-width:none}h2,h4{break-after:avoid}tr,figure{break-inside:avoid}th{background:#eee}}
    </style><body><h1>Bài làm và kết quả chấm đã lưu</h1><p><b>${escape(saved.studentName)}</b> · Lớp ${escape(saved.className)} · ${escape(source.title)}</p><p>Điểm: <b>${escape(saved.totalScore)}/${escape(saved.maxScore)}</b> · Trạng thái: ${escape(saved.gradingStatus || '')} ${saved.isProvisional || saved.needsTeacherReview ? '— cần giáo viên duyệt' : ''}</p><p>Nộp: ${escape(saved.submittedAt)} · Xuất: ${escape(exportedAt)}</p><p>Bản này giữ kết quả đã lưu tại thời điểm xuất. Công thức trong dữ liệu được giữ nguyên để đối chiếu với ảnh gốc.</p>
    ${missing ? `<p class="warning">Thiếu ${missing} tệp ảnh/PDF chưa tải được. Cần gửi bổ sung để kiểm tra đủ căn cứ.</p>` : ''}
    ${audit.pendingCount ? `<p class="warning">Có ${audit.pendingCount} câu cần đối chiếu theo dữ liệu đã lưu. Bản xuất không tự chấm lại hoặc sửa điểm.</p>` : ''}
    ${sourceIssue ? `<p class="warning">${escape(sourceIssue)}</p>` : ''}
    ${source.pdfUrl && assetPaths.get(source.pdfUrl) ? `<p><a href="${escape(assetPaths.get(source.pdfUrl))}">Mở đề PDF gốc</a></p>` : ''}
    ${saved.teacherFeedback ? block('Nhận xét chung của giáo viên', saved.teacherFeedback) : ''}
    ${(saved.essayImages || []).map((url, i) => image(url, `Ảnh bài làm đính kèm chung ${i + 1}`)).join('')}${sections}</body></html>`;
  entries.push(textEntry('bai-cham.html', report));
  // Refer to archived bytes rather than duplicating large base64 photos in JSON.
  const snapshot = { format: 'matsuda-graded-submission', version: 1, exportedAt, assignment: source, submission: saved,
    attachments: attachments.map(item => ({ ...item, source: item.source.startsWith('data:') ? `Ảnh/tệp nhúng (${item.source.slice(5).split(';')[0]})` : item.source })) };
  entries.push(textEntry('du-lieu-cham.json', JSON.stringify(snapshot, (key, value) =>
    key !== 'source' && typeof value === 'string' && assetPaths.get(value) ? assetPaths.get(value) : value, 2)));
  entries.push(textEntry('HUONG_DAN.txt', 'Giải nén và mở bai-cham.html để xem báo cáo; có thể in/lưu PDF từ trình duyệt.\nGửi nguyên tệp ZIP để đối chiếu đề, đáp án/barem, ảnh bài làm và kết quả AI từng bước.\nẢnh/PDF giữ nguyên tệp đã lưu, không cắt hoặc giảm kích thước. Nếu có cảnh báo thiếu tệp, gửi bổ sung ảnh/PDF gốc.\nĐiểm và nhận xét là dữ liệu đã lưu; bản xuất không tự chấm lại hoặc sửa điểm.\n'));
  const safeName = saved.studentName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'hoc_sinh';
  return { bytes: zip(entries), filename: `Bai_cham_${safeName}_${exportedAt.replace(/[:.]/g, '-')}.zip`, missingAttachments: missing, attachmentCount: attachments.length };
}

export async function downloadSubmissionExport(assignment: Assignment, submission: Submission,
  onProgress?: (done: number, total: number) => void) {
  const result = await buildSubmissionExport(assignment, submission, onProgress);
  const url = URL.createObjectURL(new Blob([result.bytes.buffer as ArrayBuffer], { type: 'application/zip' }));
  const link = document.createElement('a'); link.href = url; link.download = result.filename;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  return result;
}


// Export saved submissions in one archive without AI calls or database writes.
// Each sub-archive is identical in format to "Xuất bài đã chấm" for one student.
export const MAX_BATCH_EXPORT_SUBMISSIONS = 25;
const MAX_BATCH_EXPORT_BYTES = 120 * 1024 * 1024;

const safeArchivePart = (text: string) =>
  String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48) || 'unknown';

const csvValue = (value: unknown): string => {
  // Prevent spreadsheet formula execution when opening a student-supplied name.
  const raw = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
};

export async function buildBatchSubmissionExport(
  assignment: Assignment,
  submissions: Submission[],
  onProgress?: (done: number, total: number, studentName: string) => void
) {
  if (!submissions.length) throw new Error('Chưa có bài nộp nào trong bộ lọc để xuất.');
  if (submissions.length > MAX_BATCH_EXPORT_SUBMISSIONS) {
    throw new Error('Mỗi lần xuất tối đa ' + MAX_BATCH_EXPORT_SUBMISSIONS + ' lượt nộp. Hãy lọc theo tên hoặc chia thành nhiều đợt.');
  }
  // Validate the complete selection before fetching any attachment.
  const ids = new Set<string>();
  for (const item of submissions) {
    if (!item.id || item.assignmentId !== assignment.id || ids.has(item.id)) {
      throw new Error('Danh sách bài nộp không hợp lệ hoặc trùng ID; chưa xuất ZIP.');
    }
    ids.add(item.id);
  }

  // Capture the whole batch before the first asynchronous photo download. An edit
  // or filter change during export must not mix different versions of saved grades.
  assignment = JSON.parse(JSON.stringify(assignment));
  submissions = JSON.parse(JSON.stringify(submissions));

  const exportedAt = new Date().toISOString();
  const entries: Entry[] = [];
  const manifest: Array<Record<string, unknown>> = [];
  const counts = new Map<string, number>();
  const attachmentMemo: AttachmentMemo = new Map();
  let bytesTotal = 0, missingAttachments = 0;
  for (let i = 0; i < submissions.length; i++) {
    const item = submissions[i];
    const audit = getSubmissionSummary(assignment, item);
    const sourceReviewIssue = getSubmissionReportSourceIssue(assignment, item);
    const result = await buildSubmissionExport(assignment, item, undefined, attachmentMemo);
    bytesTotal += result.bytes.byteLength;
    if (bytesTotal > MAX_BATCH_EXPORT_BYTES) {
      throw new Error('Bộ ảnh/bài làm vượt giới hạn 120 MB cho một lần xuất. Hãy lọc và xuất ít bài hơn.');
    }
    const index = String(i + 1).padStart(3, '0');
    const path = 'bai-cham/' + index + '_' + safeArchivePart(item.studentName) + '.zip';
    entries.push({ path, bytes: result.bytes });
    missingAttachments += result.missingAttachments;
    const groupKey = [item.studentName, item.className].map(s =>
      String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi')).join('|');
    const order = (counts.get(groupKey) || 0) + 1;
    counts.set(groupKey, order);
    manifest.push({
      stt: i + 1, file: path, submissionId: item.id,
      studentName: item.studentName, className: item.className,
      submittedAt: item.submittedAt, attemptNumber: item.attemptNumber ?? null,
      sameNameClassOccurrence: order, submissionSource: item.submissionSource || 'unknown',
      gradingStatus: item.gradingStatus || 'unknown',
      needsTeacherReview: Boolean(item.needsTeacherReview || item.isProvisional || audit.pendingCount || sourceReviewIssue),
      savedNeedsTeacherReview: Boolean(item.needsTeacherReview || item.isProvisional),
      pendingAnswerCount: audit.pendingCount, sourceReviewIssue,
      score: item.totalScore, maxScore: item.maxScore,
      missingAttachments: result.missingAttachments
    });
    onProgress?.(i + 1, submissions.length, item.studentName);
  }

  const columns = [
    'STT', 'File ZIP', 'ID lượt nộp', 'Họ tên', 'Lớp', 'Thời điểm nộp',
    'Số lượt đã lưu', 'Thứ tự cùng họ tên/lớp trong bộ xuất', 'Nguồn bài',
    'Trạng thái chấm đã lưu', 'Cần giáo viên đối chiếu', 'Điểm', 'Điểm tối đa', 'Tệp đính kèm thiếu', 'Số câu cần đối chiếu'
  ];
  const csvRows: unknown[][] = manifest.map(row => [
    row.stt, row.file, row.submissionId, row.studentName, row.className, row.submittedAt,
    row.attemptNumber, row.sameNameClassOccurrence, row.submissionSource,
    row.gradingStatus, row.needsTeacherReview ? 'Có' : 'Không',
    row.score, row.maxScore, row.missingAttachments, row.pendingAnswerCount
  ]);
  entries.push(textEntry('BANG_KE_LUOT_NOP.csv', '\uFEFF' + [columns, ...csvRows].map(row => row.map(csvValue).join(',')).join('\r\n')));
  entries.push(textEntry('THONG_TIN_XUAT.json', JSON.stringify({
    format: 'matsuda-batch-graded-submissions', version: 1, exportedAt,
    assignmentId: assignment.id, assignmentTitle: assignment.title,
    exportedSubmissions: submissions.length, distinctNameClassGroups: counts.size,
    missingAttachments, note: 'Mỗi hàng là một lượt nộp, KHÔNG phải một học sinh duy nhất; các lượt cùng tên/lớp có thể là nộp lại. Không tự kết luận lượt nào là lỗi hoặc điểm cuối cùng.',
    submissions: manifest
  }, null, 2)));
  entries.push(textEntry('HUONG_DAN.txt',
    'Giải nén ZIP tổng. Mỗi tệp trong bai-cham/ là ZIP độc lập chứa bai-cham.html, du-lieu-cham.json và ảnh/PDF gốc đã lưu.\n' +
    'Mở BANG_KE_LUOT_NOP.csv để đối chiếu từng lượt nộp; KHÔNG tính số lượt nộp thành số học sinh.\n' +
    'Có thể lọc trên màn hình kết quả trước khi xuất. Bản xuất KHÔNG gọi AI, KHÔNG sửa điểm, KHÔNG xóa lượt nộp.\n' +
    'Chỉ chia sẻ dữ liệu học sinh với người được phép. Những tệp không tải được sẽ được báo số lượng; cần gửi tệp gốc bổ sung.\n'));
  const bytes = zip(entries);
  return {
    bytes, filename: 'Bai_cham_hang_loat_' + safeArchivePart(assignment.assignmentCode || assignment.id) +
      '_' + exportedAt.replace(/[:.]/g, '-') + '.zip',
    exportedCount: submissions.length, distinctStudentGroups: counts.size, missingAttachments
  };
}

export async function downloadBatchSubmissionExport(
  assignment: Assignment, submissions: Submission[],
  onProgress?: (done: number, total: number, studentName: string) => void
) {
  const result = await buildBatchSubmissionExport(assignment, submissions, onProgress);
  const url = URL.createObjectURL(new Blob([result.bytes.buffer as ArrayBuffer], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url; link.download = result.filename;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  return result;
}
