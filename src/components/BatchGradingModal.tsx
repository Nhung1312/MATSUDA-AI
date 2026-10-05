import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Sparkles, 
  Play, 
  Pause, 
  RotateCcw, 
  Download, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  FileText, 
  Image as ImageIcon, 
  Trash2, 
  Eye, 
  Check, 
  Filter,
  Users
} from 'lucide-react';
import { Assignment, Submission, StepAnalysis, StepErrorType } from '../types';
import { GradingService } from '../services/gradingService';
import { processQuestionImage } from '../utils/imageProcessUtils';
import { StepGradingBreakdown } from './StepGradingBreakdown';

export type BatchItemStatus = 'pending' | 'grading' | 'completed' | 'needs_review' | 'failed';

export interface BatchItem {
  id: string;
  studentName: string;
  studentClass: string;
  source: 'online' | 'paper';
  submission: Submission;
  status: BatchItemStatus;
  score: number | null;
  maxScore: number;
  totalErrors: number;
  firstErrorSummary?: string;
  needsTeacherReview: boolean;
  errorMsg?: string;
  updatedAt?: string;
}

interface BatchGradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment;
  submissions: Submission[];
  classStudents?: string[];
  onSubmissionsUpdated: (updatedSubmissions: Submission[]) => void;
}

export const BatchGradingModal: React.FC<BatchGradingModalProps> = ({
  isOpen,
  onClose,
  assignment,
  submissions,
  classStudents = [],
  onSubmissionsUpdated,
}) => {
  // Batch Items State
  const [items, setItems] = useState<BatchItem[]>([]);
  const [filterSource, setFilterSource] = useState<'all' | 'online' | 'paper'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed' | 'needs_review' | 'failed'>('all');
  const [skipAlreadyGraded, setSkipAlreadyGraded] = useState<boolean>(true);

  // Execution State
  const [isGrading, setIsGrading] = useState<boolean>(false);
  const [currentGradingIndex, setCurrentGradingIndex] = useState<number>(-1);
  const [progressText, setProgressText] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Inspection Modal
  const [inspectingItem, setInspectingItem] = useState<BatchItem | null>(null);

  // Add Paper Submission Form State
  const [showAddPaperForm, setShowAddPaperForm] = useState<boolean>(false);
  const [newPaperStudentName, setNewPaperStudentName] = useState<string>('');
  const [newPaperImages, setNewPaperImages] = useState<string[]>([]);
  const [isProcessingPaperImages, setIsProcessingPaperImages] = useState<boolean>(false);

  // Abort Controller Ref for Pause / Stop
  const abortControllerRef = useRef<AbortController | null>(null);

  // Đồng bộ danh sách bài nộp khi mở modal hoặc danh sách submissions thay đổi
  useEffect(() => {
    if (!isOpen) return;

    const mapped: BatchItem[] = submissions.map((sub) => {
      const isNeedsReview = !!sub.needsTeacherReview || sub.gradingStatus === 'needs_review';
      const isGraded = sub.gradingStatus === 'graded' || (sub.totalScore > 0 && sub.gradingStatus !== 'pending_teacher_grading');
      
      let status: BatchItemStatus = 'pending';
      if (isNeedsReview) {
        status = 'needs_review';
      } else if (isGraded) {
        status = 'completed';
      }

      const totalErrors = sub.errorSummary?.totalErrors ?? 0;
      let firstErrorSummary = undefined;
      if (sub.errorSummary?.firstErrorStep) {
        firstErrorSummary = `Bước ${sub.errorSummary.firstErrorStep} (${sub.errorSummary.firstErrorType || 'lỗi'})`;
      }

      const isPaper = sub.submissionSource === 'paper' || 
        (sub.essayImages && sub.essayImages.length > 0 && sub.answers.every(a => !a.selectedAnswer && !a.studentSolutionText));

      return {
        id: sub.id,
        studentName: sub.studentName || 'Học sinh',
        studentClass: sub.className || assignment.className || `Khối ${assignment.grade}`,
        source: isPaper ? 'paper' : 'online',
        submission: sub,
        status,
        score: isGraded || isNeedsReview ? sub.totalScore : null,
        maxScore: sub.maxScore || 10,
        totalErrors,
        firstErrorSummary,
        needsTeacherReview: isNeedsReview,
        updatedAt: sub.submittedAt
      };
    });

    setItems(mapped);
  }, [isOpen, submissions, assignment]);

  if (!isOpen) return null;

  // Lọc theo Nguồn và Trạng thái
  const filteredItems = items.filter((item) => {
    if (filterSource !== 'all' && item.source !== filterSource) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    return true;
  });

  // Số liệu thống kê
  const completedCount = items.filter((i) => i.status === 'completed').length;
  const needsReviewCount = items.filter((i) => i.status === 'needs_review').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const totalCount = items.length;

  const progressPercent = totalCount > 0 
    ? Math.round(((completedCount + needsReviewCount) / totalCount) * 100) 
    : 0;

  // Hiển thị thông báo Toast
  const showToast = (text: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  /**
   * Bắt đầu chấm bài hàng loạt (hoặc chỉ chấm lại bài lỗi)
   */
  const handleStartBatch = async (onlyFailed: boolean = false) => {
    if (isGrading) return;

    // Xác định danh sách học sinh cần chấm
    const targetItems = items.filter((item) => {
      if (onlyFailed) {
        return item.status === 'failed';
      }
      if (skipAlreadyGraded) {
        return item.status === 'pending' || item.status === 'failed';
      }
      return true;
    });

    if (targetItems.length === 0) {
      showToast('Không có bài nào cần chấm theo điều kiện đã chọn.', 'warning');
      return;
    }

    setIsGrading(true);
    abortControllerRef.current = new AbortController();
    const currentSubsMap = new Map(submissions.map((s) => [s.id, s]));

    let successCount = 0;
    let reviewCount = 0;
    let errorCount = 0;

    for (let i = 0; i < targetItems.length; i++) {
      if (abortControllerRef.current.signal.aborted) {
        showToast('Đã tạm dừng quá trình chấm bài hàng loạt.', 'warning');
        break;
      }

      const item = targetItems[i];
      setCurrentGradingIndex(i + 1);
      setProgressText(`Đang chấm bài ${i + 1}/${targetItems.length}: ${item.studentName}...`);

      // Cập nhật trạng thái 'grading' cho học sinh này
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'grading', errorMsg: undefined } : it))
      );

      try {
        const result = await GradingService.gradeSingleSubmissionWithAI({
          assignment,
          submission: item.submission,
          signal: abortControllerRef.current.signal,
          onProgress: (msg) => setProgressText(`[${item.studentName}] ${msg}`)
        });

        // Cập nhật kết quả thành công
        const newStatus: BatchItemStatus = result.needsTeacherReview ? 'needs_review' : 'completed';
        if (result.needsTeacherReview) reviewCount++; else successCount++;

        currentSubsMap.set(result.submission.id, result.submission);

        setItems((prev) =>
          prev.map((it) => {
            if (it.id === item.id) {
              return {
                ...it,
                status: newStatus,
                score: result.submission.totalScore,
                totalErrors: result.totalErrors,
                firstErrorSummary: result.firstError 
                  ? `Bước ${result.firstError.step} (${result.firstError.type})` 
                  : undefined,
                needsTeacherReview: result.needsTeacherReview,
                submission: result.submission,
                errorMsg: undefined
              };
            }
            return it;
          })
        );
      } catch (err: any) {
        if (abortControllerRef.current.signal.aborted) {
          break;
        }

        console.error(`[Batch Grading] Lỗi chấm bài học sinh ${item.studentName}:`, err);
        errorCount++;

        const errMsg = err?.message || 'Lỗi xử lý khi chấm bài với AI';
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'failed',
                  errorMsg: errMsg
                }
              : it
          )
        );

        // Giãn cách thêm nếu dính rate limit 429
        if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota')) {
          await new Promise((r) => setTimeout(r, 2500));
        }
      }

      // Giãn cách 800ms giữa các học sinh (Chuẩn an toàn Matsuda)
      if (i < targetItems.length - 1 && !abortControllerRef.current.signal.aborted) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    setIsGrading(false);
    setCurrentGradingIndex(-1);
    setProgressText('');

    // Cập nhật danh sách bài nộp lên View cha
    const updatedSubsList = Array.from(currentSubsMap.values());
    onSubmissionsUpdated(updatedSubsList);

    if (!abortControllerRef.current.signal.aborted) {
      showToast(
        `Hoàn tất chấm cả lớp! Đã chấm ${successCount + reviewCount} bài (${reviewCount} bài cần duyệt, ${errorCount} lỗi).`,
        errorCount > 0 ? 'warning' : 'success'
      );
    }
  };

  /**
   * Tạm dừng / Dừng chấm
   */
  const handleStopBatch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setProgressText('Đang dừng lại sau bài hiện tại...');
    }
  };

  /**
   * Chấm lại 1 học sinh đơn lẻ
   */
  const handleGradeSingle = async (item: BatchItem) => {
    if (isGrading) return;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: 'grading', errorMsg: undefined } : it))
    );

    try {
      const result = await GradingService.gradeSingleSubmissionWithAI({
        assignment,
        submission: item.submission
      });

      const newStatus: BatchItemStatus = result.needsTeacherReview ? 'needs_review' : 'completed';
      setItems((prev) =>
        prev.map((it) => {
          if (it.id === item.id) {
            return {
              ...it,
              status: newStatus,
              score: result.submission.totalScore,
              totalErrors: result.totalErrors,
              firstErrorSummary: result.firstError 
                ? `Bước ${result.firstError.step} (${result.firstError.type})` 
                : undefined,
              needsTeacherReview: result.needsTeacherReview,
              submission: result.submission,
              errorMsg: undefined
            };
          }
          return it;
        })
      );

      const updated = submissions.map((s) => (s.id === result.submission.id ? result.submission : s));
      onSubmissionsUpdated(updated);
      showToast(`Đã chấm xong bài của ${item.studentName}: ${result.submission.totalScore}đ`, 'success');
    } catch (err: any) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: 'failed', errorMsg: err?.message || 'Lỗi chấm bài' } : it
        )
      );
      showToast(`Không thể chấm bài của ${item.studentName}: ${err?.message}`, 'error');
    }
  };

  /**
   * Xử lý tải ảnh bài giấy của học sinh
   */
  const handleUploadPaperFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingPaperImages(true);
    try {
      const base64List: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await processQuestionImage(file, 1600, 0.88);
        base64List.push(compressed);
      }
      setNewPaperImages((prev) => [...prev, ...base64List]);
    } catch (err: any) {
      showToast('Không xử lý được ảnh bài làm. Hãy thử ảnh khác.', 'error');
    } finally {
      setIsProcessingPaperImages(false);
      e.target.value = '';
    }
  };

  /**
   * Lưu bài nộp giấy mới vào hàng đợi chấm
   */
  const handleSaveNewPaperSubmission = () => {
    const studentName = newPaperStudentName.trim();
    if (!studentName) {
      showToast('Hãy nhập hoặc chọn tên học sinh.', 'warning');
      return;
    }
    if (newPaperImages.length === 0) {
      showToast('Hãy thêm ít nhất 1 ảnh bài làm giấy.', 'warning');
      return;
    }

    const nowIso = new Date().toISOString();
    const newSubmissionId = `sub_paper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Tạo answers rỗng với ảnh đính kèm
    const answers = assignment.questions.map((q) => ({
      questionId: q.id,
      selectedAnswer: '',
      studentSolutionText: '',
      essayImages: newPaperImages,
      isCorrect: false,
      pointsEarned: 0,
      maxPoints: q.points || 1.0
    }));

    const newSub: Submission = {
      id: newSubmissionId,
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      classId: assignment.classId || 'class_default',
      className: assignment.className || `Lớp ${assignment.grade}`,
      studentName,
      answers,
      totalScore: 0,
      maxScore: 10,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 0,
      totalQuestions: assignment.questions.length,
      timeSpentSeconds: 0,
      startedAt: nowIso,
      submittedAt: nowIso,
      essayImages: newPaperImages,
      submissionSource: 'paper',
      hasEssayQuestions: true,
      gradingStatus: 'pending_teacher_grading'
    };

    // Thêm vào danh sách submissions
    const nextSubs = [newSub, ...submissions];
    onSubmissionsUpdated(nextSubs);

    // Reset form
    setNewPaperStudentName('');
    setNewPaperImages([]);
    setShowAddPaperForm(false);
    showToast(`Đã thêm bài nộp giấy của học sinh ${studentName}. Sẵn sàng chấm AI!`, 'success');
  };

  /**
   * Xuất Excel bảng điểm (CSV UTF-8 BOM chuẩn tiếng Việt như Matsuda)
   */
  const handleExportExcel = () => {
    if (items.length === 0) {
      showToast('Chưa có học sinh nào trong danh sách để xuất bảng điểm.', 'warning');
      return;
    }

    let csvContent = '\uFEFF'; // Byte Order Mark for Excel UTF-8 support
    csvContent += 'STT,Họ và tên,Lớp,Bài kiểm tra,Nguồn bài,Điểm số,Xếp loại,Trạng thái chấm,Số bước sai,Lỗi gốc đầu tiên,Cần GV duyệt,Lời phê của AI,Ngày chấm\r\n';

    items.forEach((item, idx) => {
      const stt = idx + 1;
      const name = `"${(item.studentName || '').replace(/"/g, '""')}"`;
      const cls = `"${(item.studentClass || '').replace(/"/g, '""')}"`;
      const title = `"${(assignment.title || '').replace(/"/g, '""')}"`;
      const source = item.source === 'paper' ? '"Bài giấy"' : '"Trực tuyến"';
      const score = item.score !== null ? item.score.toFixed(1) : '"Chưa có"';
      
      let tier = 'Chưa xếp loại';
      if (item.score !== null) {
        if (item.score >= 9.0) tier = 'Xuất sắc';
        else if (item.score >= 8.0) tier = 'Giỏi';
        else if (item.score >= 6.5) tier = 'Khá';
        else if (item.score >= 5.0) tier = 'Trung bình';
        else tier = 'Cần rèn luyện thêm';
      }
      const verdict = `"${tier}"`;

      let statusText = 'Chờ chấm';
      if (item.status === 'completed') statusText = 'Đã chấm xong';
      else if (item.status === 'needs_review') statusText = 'Cần GV đối chiếu';
      else if (item.status === 'failed') statusText = 'Lỗi chấm';
      else if (item.status === 'grading') statusText = 'Đang chấm';
      const status = `"${statusText}"`;

      const errCount = item.totalErrors;
      const firstErr = `"${(item.firstErrorSummary || 'Không có').replace(/"/g, '""')}"`;
      const reviewRequired = item.needsTeacherReview ? '"Có"' : '"Không"';
      
      // Lấy feedback từ câu tự luận
      const essayAns = item.submission.answers.find((a) => a.aiFeedback || a.teacherFeedback);
      const feedback = `"${(essayAns?.aiFeedback || essayAns?.teacherFeedback || 'Bài làm đạt yêu cầu').replace(/"/g, '""')}"`;
      const dateStr = `"${new Date(item.updatedAt || Date.now()).toLocaleDateString('vi-VN')}"`;

      csvContent += `${stt},${name},${cls},${title},${source},${score},${verdict},${status},${errCount},${firstErr},${reviewRequired},${feedback},${dateStr}\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BangDiem_Lop_${assignment.className || assignment.assignmentCode}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Đã xuất bảng điểm Excel thành công!', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-indigo-800 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-black tracking-tight">
                  Chấm hàng loạt bài kiểm tra bằng AI (Matsuda Batch Vision Engine)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-white/20 text-white">
                  Đợt 2 Lõi Chuẩn
                </span>
              </div>
              <p className="text-xs text-purple-100 font-medium line-clamp-1">
                {assignment.title} (Lớp {assignment.className || assignment.grade}) • Mã đề: {assignment.assignmentCode}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isGrading}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
            title="Đóng modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast Alert */}
        {toastMessage && (
          <div
            className={`px-6 py-2.5 text-xs font-bold flex items-center justify-between transition-all ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-b border-emerald-200'
                : toastMessage.type === 'warning'
                ? 'bg-amber-50 text-amber-900 border-b border-amber-200'
                : 'bg-rose-50 text-rose-900 border-b border-rose-200'
            }`}
          >
            <span>{toastMessage.text}</span>
            <button onClick={() => setToastMessage(null)} className="underline cursor-pointer">
              Đóng
            </button>
          </div>
        )}

        {/* KPI Dashboard Summary */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0 text-xs">
          <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Tổng số bài</span>
            <div className="text-lg font-black text-slate-900 mt-0.5">{totalCount}</div>
          </div>
          <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-emerald-600 uppercase">Đã chấm xong</span>
            <div className="text-lg font-black text-emerald-700 mt-0.5">{completedCount}</div>
          </div>
          <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-amber-600 uppercase">Cần GV duyệt ⚠️</span>
            <div className="text-lg font-black text-amber-700 mt-0.5">{needsReviewCount}</div>
          </div>
          <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-rose-600 uppercase">Lỗi xử lý</span>
            <div className="text-lg font-black text-rose-700 mt-0.5">{failedCount}</div>
          </div>
          <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Chờ chấm</span>
            <div className="text-lg font-black text-slate-700 mt-0.5">{pendingCount}</div>
          </div>
        </div>

        {/* Progress Bar (Visible when grading or completed) */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
            <span className="text-slate-700 flex items-center gap-1.5">
              {isGrading ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping inline-block" />
                  <span className="text-indigo-700">{progressText || 'Đang chấm bài cả lớp...'}</span>
                </>
              ) : (
                <span>Tiến độ chấm điểm toàn bộ: {completedCount + needsReviewCount}/{totalCount} bài ({progressPercent}%)</span>
              )}
            </span>
            <span className="text-slate-500">{progressPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isGrading ? 'bg-gradient-to-r from-purple-600 to-indigo-600 animate-pulse' : 'bg-emerald-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Control Toolbar */}
        <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Action Buttons */}
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {!isGrading ? (
              <button
                onClick={() => handleStartBatch(false)}
                disabled={items.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Bắt đầu chấm AI</span>
              </button>
            ) : (
              <button
                onClick={handleStopBatch}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Tạm dừng</span>
              </button>
            )}

            {failedCount > 0 && !isGrading && (
              <button
                onClick={() => handleStartBatch(true)}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl flex items-center space-x-1.5 active:scale-95 transition-all cursor-pointer"
                title="Chỉ chấm lại các bài bị lỗi hoặc mạng ngắt quãng"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Chấm lại bài lỗi ({failedCount})</span>
              </button>
            )}

            <button
              onClick={() => setShowAddPaperForm(!showAddPaperForm)}
              disabled={isGrading}
              className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs rounded-xl flex items-center space-x-1.5 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Thêm bài nộp giấy</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={items.length === 0 || isGrading}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center space-x-1.5 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel bảng điểm</span>
            </button>
          </div>

          {/* Filters & Options */}
          <div className="flex items-center space-x-3 text-xs flex-wrap gap-y-2">
            <label className="flex items-center space-x-1.5 font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={skipAlreadyGraded}
                onChange={(e) => setSkipAlreadyGraded(e.target.checked)}
                disabled={isGrading}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Bỏ qua bài đã có điểm</span>
            </label>

            <div className="flex items-center space-x-1">
              <span className="text-slate-400 font-semibold">Nguồn:</span>
              <select
                value={filterSource}
                onChange={(e: any) => setFilterSource(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Tất cả ({items.length})</option>
                <option value="online">Trực tuyến ({items.filter(i => i.source === 'online').length})</option>
                <option value="paper">Bài giấy ({items.filter(i => i.source === 'paper').length})</option>
              </select>
            </div>

            <div className="flex items-center space-x-1">
              <span className="text-slate-400 font-semibold">Lọc:</span>
              <select
                value={filterStatus}
                onChange={(e: any) => setFilterStatus(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="pending">Chờ chấm ({pendingCount})</option>
                <option value="completed">Đã chấm ({completedCount})</option>
                <option value="needs_review">Cần GV duyệt ({needsReviewCount})</option>
                <option value="failed">Lỗi ({failedCount})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Paper Submission Upload Sub-Form */}
        {showAddPaperForm && (
          <div className="px-6 py-4 bg-purple-50/70 border-b border-purple-200 space-y-3 shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-purple-900 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-purple-700" />
                <span>Thêm bài nộp giấy do Giáo viên chụp ảnh</span>
              </h3>
              <button
                onClick={() => setShowAddPaperForm(false)}
                className="text-xs text-purple-700 hover:underline cursor-pointer"
              >
                Đóng
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên học sinh:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPaperStudentName}
                    onChange={(e) => setNewPaperStudentName(e.target.value)}
                    placeholder="Nhập họ tên học sinh..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-purple-500"
                  />
                  {classStudents.length > 0 && (
                    <select
                      onChange={(e) => {
                        if (e.target.value) setNewPaperStudentName(e.target.value);
                      }}
                      className="px-2 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shrink-0"
                    >
                      <option value="">Chọn từ lớp...</option>
                      {classStudents.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ảnh bài làm giấy ({newPaperImages.length} ảnh):
                </label>
                <div className="flex items-center space-x-2">
                  <label className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center space-x-1.5 transition-colors">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{isProcessingPaperImages ? 'Đang nén ảnh...' : 'Chọn ảnh / Chụp ảnh'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      capture="environment"
                      onChange={handleUploadPaperFiles}
                      disabled={isProcessingPaperImages}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={handleSaveNewPaperSubmission}
                    disabled={!newPaperStudentName.trim() || newPaperImages.length === 0 || isProcessingPaperImages}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    Lưu vào hàng đợi chấm
                  </button>
                </div>
              </div>
            </div>

            {/* Thumbnail previews */}
            {newPaperImages.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                {newPaperImages.map((img, idx) => (
                  <div key={idx} className="relative group shrink-0 w-16 h-16 rounded-lg border border-purple-300 overflow-hidden bg-white">
                    <img src={img} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 bg-slate-900/60 text-white text-[9px] text-center">
                      Trang {idx + 1}
                    </span>
                    <button
                      onClick={() => setNewPaperImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Students Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <Users className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">Không có bài nộp nào phù hợp điều kiện lọc</p>
              <p className="text-xs text-slate-400">
                Thầy/Cô có thể nhấp "+ Thêm bài nộp giấy" để bổ sung bài làm học sinh bằng ảnh.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase font-black tracking-wider border-b border-slate-200">
                    <th className="py-3 px-3 text-center w-12">STT</th>
                    <th className="py-3 px-3">Học sinh & Lớp</th>
                    <th className="py-3 px-3 text-center">Nguồn</th>
                    <th className="py-3 px-3 text-center">Điểm số</th>
                    <th className="py-3 px-3 text-center">Trạng thái</th>
                    <th className="py-3 px-3">Chẩn đoán lỗi (Đợt 1 & 2)</th>
                    <th className="py-3 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredItems.map((item, index) => {
                    const isRowGrading = item.status === 'grading';

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isRowGrading ? 'bg-indigo-50/50' : ''
                        }`}
                      >
                        {/* STT */}
                        <td className="py-3 px-3 text-center text-slate-400 font-mono">
                          {index + 1}
                        </td>

                        {/* Student Name */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 text-xs sm:text-sm">
                            {item.studentName}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {item.studentClass}
                          </div>
                        </td>

                        {/* Source Badge */}
                        <td className="py-3 px-3 text-center">
                          {item.source === 'paper' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                              <ImageIcon className="w-2.5 h-2.5" />
                              <span>Bài giấy</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                              <FileText className="w-2.5 h-2.5" />
                              <span>Trực tuyến</span>
                            </span>
                          )}
                        </td>

                        {/* Score */}
                        <td className="py-3 px-3 text-center">
                          {item.score !== null ? (
                            <span
                              className={`inline-block px-2.5 py-1 rounded-xl font-extrabold text-xs border ${
                                item.score >= 8.0
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : item.score >= 6.5
                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                                  : item.score >= 5.0
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-rose-50 text-rose-800 border-rose-300'
                              }`}
                            >
                              {item.score.toFixed(1)}/{item.maxScore}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold">—</span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-3 text-center">
                          {item.status === 'grading' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
                              <span>Đang chấm...</span>
                            </span>
                          )}
                          {item.status === 'completed' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Đã chấm</span>
                            </span>
                          )}
                          {item.status === 'needs_review' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>Cần GV duyệt</span>
                            </span>
                          )}
                          {item.status === 'failed' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200" title={item.errorMsg}>
                              <X className="w-3 h-3 text-rose-600" />
                              <span>Lỗi chấm</span>
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>Chờ chấm</span>
                            </span>
                          )}
                        </td>

                        {/* Diagnosis Error Summary */}
                        <td className="py-3 px-3">
                          {item.status === 'completed' || item.status === 'needs_review' ? (
                            <div>
                              {item.totalErrors === 0 ? (
                                <span className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>Đúng hoàn toàn các bước</span>
                                </span>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="text-rose-700 font-bold text-[11px]">
                                    {item.firstErrorSummary || `Phát hiện ${item.totalErrors} bước sai`}
                                  </span>
                                  {item.needsTeacherReview && (
                                    <div className="text-[10px] text-amber-700 font-medium">
                                      ⚠️ Nét chữ mờ hoặc điểm cần đối chiếu
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : item.status === 'failed' ? (
                            <span className="text-rose-600 text-[11px] line-clamp-1" title={item.errorMsg}>
                              {item.errorMsg || 'Lỗi kết nối máy chủ AI'}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[11px]">Chưa phân tích</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center space-x-1.5">
                            {/* Inspect Details Button */}
                            {(item.status === 'completed' || item.status === 'needs_review') && (
                              <button
                                onClick={() => setInspectingItem(item)}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] rounded-lg border border-indigo-200 flex items-center space-x-1 transition-colors cursor-pointer"
                                title="Xem chi tiết từng bước & đối chiếu LaTeX"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Xem chi tiết</span>
                              </button>
                            )}

                            {/* Single Re-grade */}
                            <button
                              onClick={() => handleGradeSingle(item)}
                              disabled={isGrading}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                              title="Chấm lại học sinh này"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            Lõi chấm: <strong>Matsuda AI • Vision + Step Diagnostic</strong> (Chuẩn GDPT 2018)
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              disabled={isGrading}
              className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      {/* INSPECT DETAIL MODAL: Xem StepGradingBreakdown cho 1 học sinh cụ thể */}
      {inspectingItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-extrabold text-base flex items-center gap-2">
                  <span>Chẩn đoán chi tiết từng bước:</span>
                  <span className="text-amber-300">{inspectingItem.studentName}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Điểm tổng: {inspectingItem.score?.toFixed(1)}/10 • Nguồn: {inspectingItem.source === 'paper' ? 'Bài giấy' : 'Trực tuyến'}
                </p>
              </div>
              <button
                onClick={() => setInspectingItem(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {inspectingItem.submission.answers.map((ans, qIdx) => {
                const question = assignment.questions.find((q) => q.id === ans.questionId);
                const hasStepAnalysis = ans.stepAnalysis && ans.stepAnalysis.length > 0;

                return (
                  <div key={ans.questionId} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-900 text-xs">
                        Câu {qIdx + 1}: {question?.question || `Câu hỏi ${ans.questionId}`}
                      </div>
                      <span className="px-2 py-0.5 rounded-md font-bold text-xs bg-indigo-100 text-indigo-800">
                        {ans.pointsEarned}/{ans.maxPoints || 1} điểm
                      </span>
                    </div>

                    {/* StepGradingBreakdown nếu có */}
                    {hasStepAnalysis ? (
                      <StepGradingBreakdown
                        analysis={ans.stepAnalysis!}
                        firstErrorStep={ans.firstErrorStep}
                        firstErrorType={ans.firstErrorType}
                        firstErrorExplanation={ans.firstErrorExplanation}
                        needsTeacherReview={ans.needsTeacherReview}
                        maxPoints={ans.maxPoints}
                        currentScore={ans.pointsEarned}
                      />
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        {ans.aiFeedback || ans.teacherFeedback || 'Câu này được chấm điểm trực tiếp.'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setInspectingItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Đóng chi tiết
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
