import React, { useMemo, useRef, useState } from 'react';
import { Printer, X, Loader2 } from 'lucide-react';
import type { Assignment, Submission } from '../types';
import { buildSubmissionPrintHtml, buildBatchSubmissionPrintHtml } from '../services/submissionPrintService';

type SubmissionPrintModalProps = { assignment: Assignment; onClose: () => void } & (
  { submission: Submission; submissions?: never } | { submissions: Submission[]; submission?: never });

export function SubmissionPrintModal({ assignment, submission, submissions, onClose }: SubmissionPrintModalProps) {
  const isBatch = Array.isArray(submissions);
  const frame = useRef<HTMLIFrameElement>(null);
  const printLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [includeReferenceSolution, setIncludeReferenceSolution] = useState(false);
  // Freeze the saved values at opening. Printing never writes grades or runs AI.
  const [snapshot] = useState(() => JSON.parse(JSON.stringify({ assignment, submissions: submissions || [submission] })));
  const preview = useMemo(() => {
    try {
      const options = {
        stylesheetUrls: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(link => link.href),
        inlineCss: [...document.querySelectorAll('style')].map(style => style.textContent || '').join('\n'),
        includeReferenceSolution
      };
      return { html: isBatch ? buildBatchSubmissionPrintHtml(snapshot.assignment, snapshot.submissions, options)
        : buildSubmissionPrintHtml(snapshot.assignment, snapshot.submissions[0], options), error: '' };
    } catch (reason) { return { html: '', error: reason instanceof Error ? reason.message : 'Chưa dựng được phiếu chấm.' }; }
  }, [snapshot, includeReferenceSolution, isBatch]);

  const handlePrint = async () => {
    if (printLock.current || busy || !preview.html || !frame.current?.contentWindow || !frame.current.contentDocument) return;
    printLock.current = true;
    setBusy(true); setError('');
    const doc = frame.current.contentDocument;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const ready = async () => {
        await doc.fonts.ready;
        await Promise.all([...doc.images].map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
          img.addEventListener('load', () => resolve(), { once: true }); img.addEventListener('error', () => resolve(), { once: true });
        })));
        if ([...doc.images].some(img => !img.naturalWidth)) throw Error('Có ảnh chưa tải được. Hãy kiểm tra kết nối hoặc mở lại phiếu trước khi in.');
      };
      await Promise.race([ready(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Phiếu chưa tải đủ phông chữ hoặc ảnh. Hãy thử lại.')), isBatch ? 45000 : 15000); })]);
      if (!frame.current?.contentWindow || frame.current.contentDocument !== doc) throw Error('Phiếu đã thay đổi hoặc đóng; hãy mở lại trước khi in.');
      frame.current.contentWindow.focus(); frame.current.contentWindow.print();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa mở được hộp thoại in.'); }
    finally { if (timer) clearTimeout(timer); printLock.current = false; setBusy(false); }
  };

  return <div role="dialog" aria-modal="true" aria-label={isBatch ? 'Phiếu chấm PDF hàng loạt' : 'Phiếu chấm PDF chi tiết'} className="fixed inset-0 z-[80] bg-slate-900/80 p-2 sm:p-6 flex items-center justify-center">
    <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
      <div className="p-3 sm:p-4 border-b flex items-center justify-between gap-3">
        <div><h2 className="font-bold text-slate-900">{isBatch ? `Phiếu chấm PDF hàng loạt (${snapshot.submissions.length} lượt nộp)` : 'Phiếu chấm PDF chi tiết'}</h2><p className="text-xs text-slate-600">Dùng dữ liệu đã lưu. Bấm In / Lưu PDF, chọn “Lưu dưới dạng PDF” trong hộp thoại in.</p>
          {isBatch && <p className="text-xs text-slate-600">Lưu chung một tệp PDF, mỗi lượt nộp bắt đầu ở trang mới; các lượt nộp lại được giữ riêng.</p>}
          <label className="text-xs text-slate-600 flex items-center gap-2 mt-1"><input type="checkbox" checked={includeReferenceSolution} disabled={busy}
            onChange={event => { setLoaded(false); setIncludeReferenceSolution(event.target.checked); }} />Kèm thêm lời giải đối chiếu đầy đủ</label></div>
        <div className="flex items-center gap-2"><button type="button" onClick={handlePrint} disabled={busy || !loaded || !preview.html}
          className="px-3 py-2 rounded-lg bg-indigo-700 text-white font-bold text-sm flex gap-2 items-center disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} In / Lưu PDF</button>
          <button type="button" aria-label="Đóng phiếu" disabled={busy} onClick={onClose} className="p-2"><X className="w-5 h-5" /></button></div>
      </div>
      {(preview.error || error) && <p role="alert" className="p-3 text-sm bg-amber-50 text-amber-900">{preview.error || error}</p>}
      <iframe ref={frame} title="Bản xem trước phiếu chấm A4" sandbox="allow-same-origin allow-modals" srcDoc={preview.html}
        onLoad={() => setLoaded(true)} className="w-full bg-slate-100 border-0" style={{ height: '75vh' }} />
    </div>
  </div>;
}
