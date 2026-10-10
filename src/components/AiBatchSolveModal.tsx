import React, { useState, useEffect, useRef } from 'react';
import { Assignment, Question } from '../types';
import { aiService } from '../services/aiService';
import { StorageService } from '../services/storageService';
import { FirestoreService } from '../services/firestoreService';
import { soundEffects } from '../utils/soundEffects';
import { isEssayQuestion } from '../utils/questionUtils';
import { getQuestionVerificationFingerprint, isQuestionVerifiedCurrent, shouldVerifyQuestion } from '../utils/verificationUtils';
import confetti from 'canvas-confetti';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Loader2, 
  Play, 
  Pause, 
  Square, 
  ShieldCheck, 
  BookOpen, 
  Clock, 
  Check, 
  Flame, 
  ArrowRight,
  Layers,
  FileText
} from 'lucide-react';

export interface ExamBatchItem {
  assignment: Assignment;
  totalQuestions: number;
  solvedCount?: number;
  verifiedCount?: number;
  needsReviewCount?: number;
  status: 'pending' | 'solving' | 'completed' | 'error';
  errorMsg?: string;
  completedAt?: string;
}

interface AiBatchSolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAssignments: Assignment[];
  onFinished: () => Promise<void> | void;
}

export const AiBatchSolveModal: React.FC<AiBatchSolveModalProps> = ({
  isOpen,
  onClose,
  selectedAssignments = [],
  onFinished
}) => {
  const [items, setItems] = useState<ExamBatchItem[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [currentQuestionProgress, setCurrentQuestionProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [isCompletedAll, setIsCompletedAll] = useState<boolean>(false);

  // Use refs to handle pausing / stopping gracefully across async loops
  const stopRequestedRef = useRef<boolean>(false);
  const pauseRequestedRef = useRef<boolean>(false);
  const isRunningRef = useRef<boolean>(false);

  // Initialize items when modal opens
  useEffect(() => {
    if (isOpen && selectedAssignments.length > 0) {
      const initialItems: ExamBatchItem[] = selectedAssignments.map(asg => {
        const questions = asg.questions || [];
        return {
          assignment: asg,
          totalQuestions: questions.length,
          verifiedCount: questions.filter(isQuestionVerifiedCurrent).length,
          needsReviewCount: questions.filter(q => q.verificationStatus === 'needs_review' || q.needsReview).length,
          status: 'pending'
        };
      });
      setItems(initialItems);
      setIsRunning(false);
      setCurrentIndex(-1);
      setCurrentQuestionProgress({ current: 0, total: 0 });
      setIsCompletedAll(false);
      stopRequestedRef.current = false;
      pauseRequestedRef.current = false;
      isRunningRef.current = false;
    }
  }, [isOpen, selectedAssignments]);

  if (!isOpen) return null;

  const totalExams = items.length;
  const completedCount = items.filter(i => i.status === 'completed').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const overallPercent = totalExams > 0 ? Math.round((completedCount / totalExams) * 100) : 0;

  // Run the batch verification loop
  const handleStartBatch = async () => {
    if (isRunningRef.current) return;
    setIsRunning(true);
    isRunningRef.current = true;
    stopRequestedRef.current = false;
    pauseRequestedRef.current = false;

    let localItems = [...items];

    // Find the starting index (first item that is not yet completed)
    let startIdx = localItems.findIndex(i => i.status === 'pending' || i.status === 'error');
    if (startIdx === -1) {
      startIdx = 0;
    }

    for (let i = startIdx; i < localItems.length; i++) {
      // Check if user requested pause or stop
      if (stopRequestedRef.current || pauseRequestedRef.current) {
        break;
      }

      const item = localItems[i];
      if (item.status === 'completed') continue;

      setCurrentIndex(i);
      
      // Update item status to solving
      localItems[i] = { ...localItems[i], status: 'solving', errorMsg: undefined };
      setItems([...localItems]);

      const asg = item.assignment;
      const questions = asg.questions || [];

      // Không chạy lại câu đã xác minh từ trước (Requirement F)
      const questionsToVerify = questions.filter(shouldVerifyQuestion);

      // Nếu tất cả các câu đã được thẩm định đạt chuẩn từ trước
      if (questionsToVerify.length === 0 && questions.length > 0) {
        localItems[i] = {
          ...localItems[i],
          status: 'completed',
          verifiedCount: questions.length,
          needsReviewCount: 0,
          completedAt: new Date().toLocaleTimeString('vi-VN')
        };
        setItems([...localItems]);
        continue;
      }

      try {
        setCurrentQuestionProgress({ current: 0, total: questionsToVerify.length });

        // Gọi AI Thẩm định đối soát (Gemini 3.8 Flash, Dual-Pass 2 vòng)
        // Tuyệt đối không fallback sang Lite, gặp 429 dừng ngay
        const verifiedResults = await aiService.verifyExamQuestions({
          questions: questionsToVerify,
          grade: asg.grade,
          topic: asg.topic,
          onProgress: (cur, tot) => {
            setCurrentQuestionProgress({ current: cur, total: tot });
          }
        });

        // Hợp nhất kết quả thẩm định:
        // TUYỆT ĐỐI KHÔNG TỰ Ý SỬA correctAnswer, question, options, explanation (Requirement D)
        let vCount = 0;
        let nrCount = 0;

        const updatedQuestions: Question[] = questions.map((q) => {
          const found = verifiedResults.find(r => r.questionId === q.id);
          if (found) {
            const isNeedReview = found.needsReview || found.confidence === 'needs_review' || !found.matchesCurrentAnswer;
            if (isNeedReview) {
              nrCount++;
            } else {
              vCount++;
            }

            return {
              ...q,
              verificationStatus: isNeedReview ? 'needs_review' : 'verified',
              needsReview: isNeedReview,
              verificationFingerprint: isNeedReview ? undefined : getQuestionVerificationFingerprint(q),
              confidence: found.confidence,
              pass1Answer: found.pass1Answer,
              pass2Answer: found.pass2Answer,
              sanityCheckNote: found.sanityCheckNote,
              aiProposedAnswer: found.proposedAnswer,
              aiReason: found.reason
            };
          }

          // Đối với các câu đã xác minh trước đó
          if (isQuestionVerifiedCurrent(q)) {
            vCount++;
          } else if (q.verificationStatus === 'needs_review' || q.needsReview) {
            nrCount++;
          }
          return q;
        });

        // Kết quả thẩm định đề (Requirement G):
        // Nếu tất cả câu đạt => verified, eligibleForSampleBank = true
        // Nếu còn câu nghi ngờ => needs_review, eligibleForSampleBank = false
        const allVerified = updatedQuestions.length > 0 && updatedQuestions.every(isQuestionVerifiedCurrent);
        const hasSuspicious = updatedQuestions.some(q => q.verificationStatus === 'needs_review' || q.needsReview === true);

        const updatedAssignment: Assignment = {
          ...asg,
          questions: updatedQuestions,
          verificationStatus: allVerified ? 'verified' : (hasSuspicious ? 'needs_review' : 'unverified'),
          eligibleForSampleBank: allVerified ? true : false
        };

        // Lưu kết quả ngay sau mỗi đề thi (Requirement F)
        StorageService.saveAssignment(updatedAssignment);
        try {
          await FirestoreService.saveExam(updatedAssignment);
        } catch (fErr) {
          console.warn('Lỗi lưu Firestore đề:', fErr);
        }

        // Đánh dấu hoàn tất đề
        localItems[i] = {
          ...localItems[i],
          assignment: updatedAssignment,
          status: 'completed',
          verifiedCount: vCount,
          needsReviewCount: nrCount,
          completedAt: new Date().toLocaleTimeString('vi-VN')
        };
        setItems([...localItems]);

      } catch (err: any) {
        console.error(`Lỗi thẩm định đề ${asg.title}:`, err);
        const is429 = err?.status === 429 || err?.isQuota || String(err?.message || err).includes('429') || String(err?.message || err).includes('RESOURCE_EXHAUSTED') || String(err?.message || err).includes('quota');

        if (is429) {
          // Gặp 429 thì DỪNG TIẾN TRÌNH NGAY, không retry liên tục, không fallback (Requirement F)
          stopRequestedRef.current = true;
          localItems[i] = {
            ...localItems[i],
            status: 'error',
            errorMsg: 'Dừng tiến trình do vượt hạn mức API (429 RESOURCE_EXHAUSTED). Đã bảo toàn kết quả các đề thẩm định trước đó.'
          };
          setItems([...localItems]);
          break; // Thoát vòng lặp batch ngay lập tức
        } else {
          localItems[i] = {
            ...localItems[i],
            status: 'error',
            errorMsg: err?.message || 'Lỗi kết nối khi thẩm định đề'
          };
          setItems([...localItems]);
        }
      }

      // Nghỉ nhẹ 1.5s giữa các đề để giữ RPM ổn định
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    setIsRunning(false);
    isRunningRef.current = false;

    // Kiểm tra hoàn tất toàn bộ
    const allDone = localItems.every(i => i.status === 'completed');
    if (allDone && !stopRequestedRef.current && !pauseRequestedRef.current) {
      setIsCompletedAll(true);
      soundEffects.playSuccess();
      try {
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch {}
    }
  };

  const handlePause = () => {
    pauseRequestedRef.current = true;
    setIsRunning(false);
    isRunningRef.current = false;
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    pauseRequestedRef.current = true;
    setIsRunning(false);
    isRunningRef.current = false;
  };

  const handleFinishAndClose = async () => {
    handleStop();
    await onFinished();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="px-6 py-4.5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-300 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-black text-lg sm:text-xl text-white tracking-tight">
                  AI Thẩm Định Kho Đề Hàng Loạt (Gemini 3.8 Flash)
                </h3>
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider">
                  Dual-Pass 2 Vòng
                </span>
              </div>
              <p className="text-xs text-violet-100 mt-0.5">
                Thẩm định tính chính xác của đề thi, phát hiện câu nghi vấn • Bảo toàn 100% đề gốc và bảng đáp án hiện tại
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (isRunning) {
                if (window.confirm('Tiến trình đang chạy. Bạn có chắc muốn dừng lại và đóng?')) {
                  handleFinishAndClose();
                }
              } else {
                handleFinishAndClose();
              }
            }}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STATS & PROGRESS DASHBOARD */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-3">
          
          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <div className="px-3 py-1.5 rounded-xl bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-200 font-bold border border-violet-200 dark:border-violet-800 flex items-center space-x-1.5 shadow-2xs">
                <Layers className="w-3.5 h-3.5 text-violet-600" />
                <span>Tổng số đề chọn:</span>
                <strong className="text-sm font-black">{totalExams} đề</strong>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1.5 shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Đã thẩm định:</span>
                <strong className="text-sm font-black">{completedCount} đề</strong>
              </div>

              {errorCount > 0 && (
                <div className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-800 flex items-center space-x-1.5 shadow-2xs">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Chưa xong:</span>
                  <strong className="text-sm font-black">{errorCount} đề</strong>
                </div>
              )}
            </div>

            {/* Current Active Status Indicator */}
            {isRunning && currentIndex >= 0 && items[currentIndex] && (
              <div className="flex items-center space-x-2 text-violet-700 dark:text-violet-300 font-semibold animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                <span>Đang thẩm định: Đề {currentIndex + 1}/{totalExams} ({currentQuestionProgress.current}/{currentQuestionProgress.total} câu)</span>
              </div>
            )}
          </div>

          {/* Overall Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-700 dark:text-slate-300">Tiến độ thẩm định:</span>
              <span className="text-violet-700 dark:text-violet-400 font-black">{overallPercent}% ({completedCount}/{totalExams} đề)</span>
            </div>
            <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden p-0.5 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* EXAM LIST STATUS */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 px-2">
            <span>Danh sách đề thi thẩm định đối soát:</span>
            <span>Trạng thái</span>
          </div>

          {items.map((item, idx) => {
            const isCurrentSolving = isRunning && idx === currentIndex;
            const isCompleted = item.status === 'completed';
            const isError = item.status === 'error';
            const isPending = item.status === 'pending';

            return (
              <div
                key={item.assignment.id}
                className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                  isCurrentSolving
                    ? 'bg-violet-50/70 dark:bg-violet-950/40 border-violet-400 dark:border-violet-700 shadow-sm ring-2 ring-violet-400/30'
                    : isCompleted
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/80'
                    : isError
                    ? 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900'
                    : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                }`}
              >
                {/* Exam Info */}
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    isCompleted
                      ? 'bg-emerald-600 text-white'
                      : isCurrentSolving
                      ? 'bg-violet-600 text-white'
                      : isError
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {idx + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {item.assignment.title}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold">
                        {item.assignment.assignmentCode}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        • Khối {item.assignment.grade}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{item.totalQuestions} câu hỏi</span>
                      {isCurrentSolving && (
                        <span className="text-violet-600 font-bold">
                          • Đang đối soát câu {currentQuestionProgress.current}/{currentQuestionProgress.total}...
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-emerald-600 font-medium">
                          • Hoàn tất lúc {item.completedAt}
                        </span>
                      )}
                      {isError && (
                        <span className="text-rose-600 font-medium">
                          • {item.errorMsg}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="shrink-0 flex items-center space-x-2">
                  {isCurrentSolving && (
                    <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-violet-100 dark:bg-violet-900 text-violet-800 dark:text-violet-200 text-xs font-bold animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600" />
                      <span>Đang đối soát...</span>
                    </span>
                  )}

                  {isCompleted && (
                    <div className="flex items-center space-x-1.5">
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Đã thẩm định</span>
                      </span>
                      {item.needsReviewCount && item.needsReviewCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 text-[11px] font-bold" title="Có câu hỏi phát hiện sự khác biệt cần xem lại">
                          <span>{item.needsReviewCount} câu cần xem lại</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold" title="Đã thẩm định 100% đạt chuẩn">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>100% chuẩn</span>
                        </span>
                      )}
                    </div>
                  )}

                  {isError && (
                    <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 text-xs font-bold">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>Chưa xong</span>
                    </span>
                  )}

                  {isPending && (
                    <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs font-semibold">
                      Chờ đến lượt
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* BOTTOM ACTION TOOLBAR */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Tự động lưu vào bộ nhớ máy và Cloud sau mỗi đề thi. AI không tự ý sửa đáp án gốc.</span>
          </div>

          <div className="flex items-center space-x-2.5">
            {!isRunning && !isCompletedAll && (
              <button
                type="button"
                onClick={handleStartBatch}
                className="inline-flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>
                  {completedCount > 0 ? `Tiếp tục thẩm định (${totalExams - completedCount} đề còn lại)` : `Bắt đầu thẩm định ${totalExams} đề`}
                </span>
              </button>
            )}

            {isRunning && (
              <>
                <button
                  type="button"
                  onClick={handlePause}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Pause className="w-4 h-4" />
                  <span>Tạm dừng</span>
                </button>

                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
                >
                  <Square className="w-4 h-4" />
                  <span>Dừng hẳn</span>
                </button>
              </>
            )}

            {isCompletedAll && (
              <button
                type="button"
                onClick={handleFinishAndClose}
                className="inline-flex items-center space-x-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Hoàn tất & Cập nhật danh sách</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
