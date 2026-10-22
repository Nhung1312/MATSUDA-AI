import React, { useEffect, useState } from 'react';
import { listPendingResultSaves, saveSubmissionConfirmed, saveContestSubmissionConfirmed } from '../services/submissionSaveService';
import type { PendingResult } from '../services/pendingResultStore';
import type { ResultRecord } from '../services/resultPersistence';
import type { Submission, ContestSubmission } from '../types';

interface Props {
  kind: PendingResult['kind']; relationId: string; studentName?: string;
  onSaved?: (submission: ResultRecord) => void;
  onBusyChange?: (busy: boolean) => void;
}
/** Explicit recovery only: separate attempts keep their own IDs, even for the same student. */
export function PendingResultSaves({ kind, relationId, studentName, onSaved, onBusyChange }: Props) {
  const [records, setRecords] = useState<PendingResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    const reload = () => { void listPendingResultSaves().then(items => {
      if (!live) return;
      setRecords(items.filter(item => item.kind === kind
        && ('assignmentId' in item.submission ? item.submission.assignmentId : item.submission.contestId) === relationId
        && (studentName === undefined || item.submission.studentName === studentName)));
    }).catch(() => {}); };
    reload(); window.addEventListener('submissions-confirmed', reload);
    return () => { live = false; window.removeEventListener('submissions-confirmed', reload); };
  }, [kind, relationId, studentName]);
  const retry = async (record: PendingResult) => {
    if (busy) return;
    setBusy(true); onBusyChange?.(true);
    try {
      const result = record.kind === 'result'
        ? await saveSubmissionConfirmed(record.submission as Submission, { intent: record.intent, operationId: record.operationId })
        : await saveContestSubmissionConfirmed(record.submission as ContestSubmission, { intent: record.intent, operationId: record.operationId });
      setNotice(result.cloudSaved ? 'Firebase đã xác nhận bản gửi.' : result.error || 'Chưa xác nhận lưu. Bản cũ vẫn được giữ để đối chiếu.');
      if (result.cloudSaved && result.submission) {
        setRecords(old => old.filter(item => item.operationId !== record.operationId));
        onSaved?.(result.submission);
      }
    } finally { setBusy(false); onBusyChange?.(false); }
  };
  if (!records.length && !notice) return null;
  return <div role="status" className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900">
    {records.length > 0 && <p>Có {records.length} bản gửi cũ chưa được Firebase xác nhận trên máy. Chọn đúng lượt để thử lưu lại; không chấm AI lại.</p>}
    {records.map(record => <button type="button" key={record.operationId} disabled={busy}
      className="block underline font-bold mt-2 disabled:opacity-50" onClick={() => void retry(record)}>
      Gửi lại {record.submission.studentName} — {new Date(record.savedAt).toLocaleString('vi-VN')} — {record.submission.id}
    </button>)}
    {notice && <p className="mt-2">{notice}</p>}
  </div>;
}
