import React, { useState, useEffect, useRef } from 'react';
import { Assignment, Question } from '../types';
import { aiService } from '../services/aiService';
import { StorageService } from '../services/storageService';
import { FirestoreService } from '../services/firestoreService';
import { soundEffects } from '../utils/soundEffects';
import { isEssayQuestion } from '../utils/questionUtils';
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
  solvedCount: number;
  status: 'pending' | 'solving' | 'completed' | 'error';
  errorMsg?: string;
  completedAt?: string;
  verifiedCount?: number;
  needsReviewCount?: number;
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
        const mcqs = questions.filter(q => q.type === 'multiple_choice' || (q.options && q.options.length >= 2));
        return {
          assignment: asg,
          totalQuestions: mcqs.length,
          solvedCount: 0,
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

  // Run the batch solving loop
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

      try {
        setCurrentQuestionProgress({ current: 0, total: item.totalQuestions });

        // Call AI to solve this assignment's questions
        const solvedResults = await aiService.solveExamQuestions({
          questions,
          grade: asg.grade,
          topic: asg.topic,
          onProgress: (cur, tot) => {
            setCurrentQuestionProgress({ current: cur, total: tot });
          }
        });

        // Merge solved answers into question list
        let verifiedCount = 0;
        let needsReviewCount = 0;

        const updatedQuestions: Question[] = questions.map((q) => {
          const found = solvedResults.find(r => r.questionId === q.id);
          const isEssay = isEssayQuestion(q);
          if (found) {
            const isNeedReview = found.confidence === 'needs_review' || (found.pass1Answer && found.pass2Answer && found.pass1Answer !== found.pass2Answer);
            if (isNeedReview) {
              needsReviewCount++;
            } else {
              verifiedCount++;
            }

            return {
              ...q,
              type: isEssay ? 'essay' : (q.type || 'multiple_choice'),
              correctAnswer: found.correctAnswer,
              explanation: found.explanation || q.explanation,
              rubric: found.rubric || q.rubric || '',
              verificationStatus: isNeedReview ? 'needs_review' : 'verified',
              sanityCheckNote: found.sanityCheckNote,
              confidence: found.confidence,
              pass1Answer: isEssay ? undefined : (found.pass1Answer || q.pass1Answer),
              pass2Answer: isEssay ? undefined : (found.pass2Answer || q.pass2Answer)
            };
          }
          return q;
        });

        const updatedAssignment: Assignment = {
          ...asg,
          questions: updatedQuestions
        };

        // Save to StorageService and FirestoreService immediately
        StorageService.saveAssignment(updatedAssignment);
        try {
          await FirestoreService.saveExam(updatedAssignment);
        } catch (fErr) {
          console.warn('Lỗi lưu Firestore đề:', fErr);
        }

        // Mark item completed
        localItems[i] = {
          ...localItems[i],
          assignment: updatedAssignment,
          status: 'completed',
          solvedCount: solvedResults.length,
          verifiedCount,
          needsReviewCount,
          completedAt: new Date().toLocaleTimeString('vi-VN')
        };
        setItems([...localItems]);

      } catch (err: any) {
        console.error(`Lỗi giải đề ${asg.title}:`, err);
        localItems[i] = {
          ...localItems[i],
          status: 'error',
          errorMsg: err?.message || 'Lỗi kết nối hoặc vượt hạn mức tạm thời'
        };
        setItems([...localItems]);
      }

      // Small throttle pause between exams to prevent hitting API rate limits and 503 spikes
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    setIsRunning(false);
    isRunningRef.current = false;

    // Check if all are done
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
                  AI Giải Đề Hàng Loạt & Lập Đáp Án Chuẩn
                </h3>
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider">
                  Chạy Tự Động
                </span>
              </div>
              <p className="text-xs text-violet-100 mt-0.5">
                Tự động giải toán từng câu, điền đáp án chuẩn xác và lưu đồng bộ • Bảo toàn 100% dữ liệu gốc
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
                <span>Đã giải xong:</span>
                <strong className="text-sm font-black">{completedCount} đề</strong>
              </div>

              {errorCount > 0 && (
                <div className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-800 flex items-center space-x-1.5 shadow-2xs">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Cần thử lại:</span>
                  <strong className="text-sm font-black">{errorCount} đề</strong>
                </div>
              )}
            </div>

            {/* Current Active Status Indicator */}
            {isRunning && currentIndex >= 0 && items[currentIndex] && (
              <div className="flex items-center space-x-2 text-violet-700 dark:text-violet-300 font-semibold animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                <span>Đang xử lý: Đề {currentIndex + 1}/{totalExams} ({currentQuestionProgress.current}/{currentQuestionProgress.total} câu)</span>
              </div>
            )}
          </div>

          {/* Overall Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-700 dark:text-slate-300">Tiến độ hoàn thành:</span>
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
            <span>Danh sách đề thi được phân công AI giải:</span>
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
                      <span>{item.totalQuestions} câu trắc nghiệm</span>
                      {isCurrentSolving && (
                        <span className="text-violet-600 font-bold">
                          • Đang giải câu {currentQuestionProgress.current}/{currentQuestionProgress.total}...
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-emerald-600 font-medium">
                          • Đã hoàn thiện lúc {item.completedAt}
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
                      <span>Đang giải...</span>
                    </span>
                  )}

                  {isCompleted && (
                    <div className="flex items-center space-x-1.5">
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Đã giải</span>
                      </span>
                      {item.needsReviewCount && item.needsReviewCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[11px] font-bold" title="Có câu hỏi phát hiện sự khác biệt giữa giải xuôi và thử ngược">
                          <span>{item.needsReviewCount} câu nghi vấn</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold" title="Đã thẩm định kép 2 vòng trùng khớp 100%">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>Khớp 100%</span>
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
            <span>Tự động lưu vào bộ nhớ máy và Cloud sau mỗi đề thi hoàn tất.</span>
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
                  {completedCount > 0 ? `Tiếp tục giải (${totalExams - completedCount} đề còn lại)` : `Bắt đầu giải ${totalExams} đề`}
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
