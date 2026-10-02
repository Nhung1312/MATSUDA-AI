import React, { useState } from 'react';
import { 
  Check, 
  X, 
  AlertTriangle, 
  Flag, 
  ArrowLeft, 
  Send, 
  Clock, 
  Eye, 
  FileText, 
  CheckCircle2, 
  ChevronRight,
  HelpCircle,
  Sparkles,
  Layers,
  ListFilter
} from 'lucide-react';
import { Question } from '../types';
import { isEssayQuestion } from '../utils/questionUtils';
import { MathDisplay } from './MathDisplay';

interface ExamReviewSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  questions: Question[];
  answers: Record<string, string>;
  studentSolutions?: Record<string, string>;
  essayImagesByQuestion?: Record<string, string[]>;
  flaggedQuestions: string[];
  onSelectOption: (questionId: string, optionId: string) => void;
  onJumpToQuestion: (index: number) => void;
  timeLeft: number;
  studentName: string;
  className: string;
  assignmentTitle: string;
  tabSwitchCount?: number;
}

export const ExamReviewSheetModal: React.FC<ExamReviewSheetModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  questions,
  answers,
  studentSolutions = {},
  essayImagesByQuestion = {},
  flaggedQuestions,
  onSelectOption,
  onJumpToQuestion,
  timeLeft,
  studentName,
  className,
  assignmentTitle,
  tabSwitchCount = 0
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'detailed'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'unanswered' | 'flagged'>('all');
  const [selectedInspectIndex, setSelectedInspectIndex] = useState<number | null>(null);
  const [showConfirmSubmitAlert, setShowConfirmSubmitAlert] = useState(false);

  if (!isOpen) return null;

  // Format time
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Helper check status of each question
  const getQuestionStatus = (q: Question) => {
    const isEssay = isEssayQuestion(q);
    const hasAnswer = !isEssay 
      ? !!answers[q.id] 
      : (!!studentSolutions[q.id] || (essayImagesByQuestion[q.id] && essayImagesByQuestion[q.id].length > 0) || !!answers[q.id]);
    const isFlagged = flaggedQuestions.includes(q.id);
    return { hasAnswer, isFlagged, isEssay };
  };

  const answeredCount = questions.filter(q => getQuestionStatus(q).hasAnswer).length;
  const unansweredCount = questions.length - answeredCount;
  const flaggedCount = flaggedQuestions.length;
  const progressPercent = Math.round((answeredCount / questions.length) * 100);

  // Filtered questions
  const filteredQuestions = questions.map((q, idx) => ({ q, idx })).filter(({ q }) => {
    const status = getQuestionStatus(q);
    if (filterType === 'unanswered') return !status.hasAnswer;
    if (filterType === 'flagged') return status.isFlagged;
    return true;
  });

  const handleConfirmSubmitClick = () => {
    if (unansweredCount > 0) {
      setShowConfirmSubmitAlert(true);
    } else {
      onSubmit();
    }
  };

  const inspectedQuestion = selectedInspectIndex !== null ? questions[selectedInspectIndex] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full h-[92vh] max-h-[850px] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* TOP HEADER */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-700 text-white px-5 sm:px-7 py-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center font-black shrink-0 border border-white/20">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full text-indigo-100">
                  Phiếu duyệt bài làm
                </span>
                <span className="text-xs text-indigo-200 truncate">
                  Lớp: <strong className="text-white">{className}</strong> • Thí sinh: <strong className="text-white">{studentName}</strong>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black truncate text-white">
                {assignmentTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {/* Countdown Badge */}
            <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-black border ${
              timeLeft <= 180 
                ? 'bg-rose-500/20 text-rose-200 border-rose-400/40 animate-pulse' 
                : 'bg-white/10 text-white border-white/20'
            }`}>
              <Clock className="w-3.5 h-3.5" />
              <span>{timeFormatted}</span>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white cursor-pointer"
              title="Đóng phiếu, tiếp tục làm bài"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* STATS & QUICK FILTER BAR */}
        <div className="bg-slate-50 dark:bg-slate-800/60 px-5 sm:px-7 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Progress bar info */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Tiến độ:</span>
              <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                {answeredCount}/{questions.length} câu
              </span>
              <span className="text-xs font-bold text-slate-400">({progressPercent}%)</span>
            </div>

            <div className="hidden sm:block w-32 bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex items-center space-x-1.5 text-xs font-bold">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs border border-indigo-200 dark:border-indigo-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
              }`}
            >
              Tất cả ({questions.length})
            </button>

            <button
              onClick={() => setFilterType('unanswered')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center space-x-1 ${
                filterType === 'unanswered'
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-rose-500" />
              <span>Chưa làm ({unansweredCount})</span>
            </button>

            {flaggedCount > 0 && (
              <button
                onClick={() => setFilterType('flagged')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center space-x-1 ${
                  filterType === 'flagged'
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                }`}
              >
                <Flag className="w-3 h-3 text-amber-500" />
                <span>Cần xem lại ({flaggedCount})</span>
              </button>
            )}

            {/* Toggle view mode */}
            <div className="hidden md:flex ml-2 pl-2 border-l border-slate-300 dark:border-slate-700 items-center space-x-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg cursor-pointer ${viewMode === 'grid' ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300' : 'text-slate-400 hover:text-slate-600'}`}
                title="Xem dạng phiếu lưới OMR"
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`p-1.5 rounded-lg cursor-pointer ${viewMode === 'detailed' ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300' : 'text-slate-400 hover:text-slate-600'}`}
                title="Xem danh sách chi tiết"
              >
                <ListFilter className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* MAIN BODY AREA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* Note Banner */}
          <div className="bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl p-3.5 text-xs text-indigo-900 dark:text-indigo-200 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Hãy rà soát kỹ các đáp án đã chọn. Bạn có thể <strong>click trực tiếp vào từng câu</strong> để đổi đáp án hoặc chuyển đến câu đó.
              </span>
            </div>
            {unansweredCount > 0 && (
              <span className="shrink-0 bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Còn {unansweredCount} câu chưa chọn!
              </span>
            )}
          </div>

          {/* VIEW MODE: GRID (PHIẾU TRẢ LỜI OMR TIÊU CHUẨN) */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredQuestions.map(({ q, idx }) => {
                const { hasAnswer, isFlagged, isEssay } = getQuestionStatus(q);
                const selectedVal = answers[q.id];
                const isInspecting = selectedInspectIndex === idx;

                return (
                  <div
                    key={q.id}
                    onClick={() => setSelectedInspectIndex(idx)}
                    className={`relative p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      isInspecting 
                        ? 'ring-2 ring-indigo-500 shadow-md border-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/30'
                        : hasAnswer
                          ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-indigo-300 hover:shadow-xs'
                          : 'border-rose-300 dark:border-rose-900/70 bg-rose-50/30 dark:bg-rose-950/20 hover:border-rose-400'
                    }`}
                  >
                    {/* Top Row: Question number & Flag */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        Câu {q.order || (idx + 1)}
                        {isFlagged && <Flag className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onClose();
                          onJumpToQuestion(idx);
                        }}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                      >
                        Đến câu <ChevronRight className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    {/* Middle: Selection Status */}
                    <div className="py-1">
                      {isEssay ? (
                        <div className={`text-xs font-bold px-2 py-1 rounded-xl text-center flex items-center justify-center gap-1 ${
                          hasAnswer
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          <FileText className="w-3 h-3" />
                          <span>{hasAnswer ? 'Đã làm TL ✓' : 'Chưa làm'}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          {['A', 'B', 'C', 'D'].map((letter) => {
                            const isChosen = selectedVal === letter;
                            return (
                              <button
                                key={letter}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectOption(q.id, letter);
                                }}
                                className={`w-7 h-7 rounded-xl font-black text-xs transition-all active:scale-90 flex items-center justify-center ${
                                  isChosen
                                    ? 'bg-indigo-600 text-white shadow-xs scale-105 ring-2 ring-indigo-300 dark:ring-indigo-700'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                              >
                                {letter}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Bottom Status text */}
                    <div className="mt-2 text-right">
                      {hasAnswer ? (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Đã chọn
                        </span>
                      ) : (
                        <span className="text-[10px] font-black text-rose-500 dark:text-rose-400 flex items-center justify-end gap-0.5 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> Chưa làm
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE: DETAILED LIST */}
          {viewMode === 'detailed' && (
            <div className="space-y-3">
              {filteredQuestions.map(({ q, idx }) => {
                const { hasAnswer, isFlagged, isEssay } = getQuestionStatus(q);
                const selectedVal = answers[q.id];

                return (
                  <div
                    key={q.id}
                    className={`p-4 rounded-2xl border-2 transition-all ${
                      hasAnswer
                        ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850'
                        : 'border-rose-300 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center space-x-2">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs ${
                          hasAnswer ? 'bg-indigo-600 text-white' : 'bg-rose-500 text-white'
                        }`}>
                          {q.order || (idx + 1)}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {isEssay ? 'Tự luận' : 'Trắc nghiệm'} • {q.points || 0.5} điểm
                        </span>
                        {isFlagged && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            <Flag className="w-3 h-3" /> Đang xem xét
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          onClose();
                          onJumpToQuestion(idx);
                        }}
                        className="px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> Làm câu này
                      </button>
                    </div>

                    {/* Question text snippet */}
                    <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 mb-3 line-clamp-2">
                      <MathDisplay text={q.question} />
                    </div>

                    {/* Multiple choice options selector */}
                    {!isEssay && q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map(opt => {
                          const isSelected = selectedVal === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => onSelectOption(q.id, opt.id)}
                              className={`p-2.5 rounded-xl border text-left text-xs font-semibold flex items-center gap-2 transition-all ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-950 dark:text-indigo-100 ring-1 ring-indigo-300'
                                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              <span className={`w-6 h-6 rounded-lg font-black flex items-center justify-center shrink-0 text-xs ${
                                isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              }`}>
                                {opt.id}
                              </span>
                              <span className="break-words flex-1 text-xs">
                                <MathDisplay text={opt.text} />
                              </span>
                              {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* INLINE INSPECTOR MODAL IF CLICKED A QUESTION */}
          {inspectedQuestion && viewMode === 'grid' && (
            <div className="mt-4 p-4 rounded-2xl bg-indigo-50/80 dark:bg-slate-800 border-2 border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-600" />
                  <span>Soi nhanh Câu {inspectedQuestion.order || (selectedInspectIndex! + 1)}</span>
                </h4>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      onClose();
                      onJumpToQuestion(selectedInspectIndex!);
                    }}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    Mở toàn màn hình
                  </button>
                  <button
                    onClick={() => setSelectedInspectIndex(null)}
                    className="text-xs text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 mb-3">
                <MathDisplay text={inspectedQuestion.question} />
              </div>

              {!isEssayQuestion(inspectedQuestion) && inspectedQuestion.options && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {inspectedQuestion.options.map(opt => {
                    const isSelected = answers[inspectedQuestion.id] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => onSelectOption(inspectedQuestion.id, opt.id)}
                        className={`p-2 rounded-xl border text-left text-xs font-medium flex items-center gap-2 transition-all ${
                          isSelected
                            ? 'border-indigo-600 bg-white dark:bg-slate-900 text-indigo-950 dark:text-white ring-2 ring-indigo-300'
                            : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 hover:bg-white text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-md font-black flex items-center justify-center shrink-0 text-xs ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700'
                        }`}>
                          {opt.id}
                        </span>
                        <span className="truncate flex-1">
                          <MathDisplay text={opt.text} />
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:px-7 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-2xl text-slate-700 dark:text-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại làm tiếp</span>
          </button>

          <div className="flex items-center space-x-3">
            {unansweredCount > 0 && (
              <span className="hidden sm:inline-block text-xs font-bold text-rose-600">
                (Còn {unansweredCount} câu chưa làm)
              </span>
            )}

            <button
              type="button"
              onClick={handleConfirmSubmitClick}
              className="px-6 sm:px-8 py-3 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Xác nhận Nộp bài thi</span>
            </button>
          </div>
        </div>

        {/* UNANSWERED WARNING ALERT MODAL */}
        {showConfirmSubmitAlert && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-rose-300 dark:border-rose-800 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7" />
              </div>

              <div>
                <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
                  Bạn vẫn còn {unansweredCount} câu chưa làm!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Các câu chưa chọn đáp án sẽ được tính là 0 điểm. Bạn có chắc chắn muốn nộp bài ngay bây giờ không?
                </p>
              </div>

              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-2xl text-xs text-rose-700 dark:text-rose-300 font-medium">
                Đã hoàn thành: <strong>{answeredCount} / {questions.length}</strong> câu
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmSubmitAlert(false)}
                  className="flex-1 py-3 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors"
                >
                  Để tôi kiểm tra lại
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmSubmitAlert(false);
                    onSubmit();
                  }}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95"
                >
                  Vẫn nộp bài
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
