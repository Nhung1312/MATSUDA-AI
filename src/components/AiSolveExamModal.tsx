import React, { useState, useEffect } from 'react';
import { Question, Assignment, ExamTemplate } from '../types';
import { aiService } from '../services/aiService';
import { MathDisplay } from './MathDisplay';
import { isEssayQuestion } from '../utils/questionUtils';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  X, 
  Loader2, 
  Save, 
  HelpCircle, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  Copy, 
  ShieldCheck, 
  RefreshCw, 
  FileText, 
  RotateCcw, 
  CheckCheck, 
  Flag, 
  Key 
} from 'lucide-react';

export interface SolvedQuestionInfo {
  correctAnswer: string;
  explanation: string;
  rubric?: string;
  confidence?: 'high' | 'medium' | 'needs_review';
  pass1Answer?: string;
  pass2Answer?: string;
  sanityCheckNote?: string;
}

interface AiSolveExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  examTitle: string;
  grade?: string;
  topic?: string;
  questions: Question[];
  onApplyAnswers: (updatedQuestions: Question[]) => Promise<void> | void;
}

export const AiSolveExamModal: React.FC<AiSolveExamModalProps> = ({
  isOpen,
  onClose,
  examTitle,
  grade = '7',
  topic = 'Toán THCS',
  questions = [],
  onApplyAnswers
}) => {
  const [isSolving, setIsSolving] = useState(false);
  const [reverifyingId, setReverifyingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [solvedMap, setSolvedMap] = useState<Record<string, SolvedQuestionInfo>>({});
  const [userSelectedMap, setUserSelectedMap] = useState<Record<string, string>>({});
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});
  const [showQuickPaste, setShowQuickPaste] = useState(false);
  const [quickPasteText, setQuickPasteText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'verified' | 'needs_review' | 'changed'>('all');
  const [hasApiKey, setHasApiKey] = useState<boolean>(aiService.hasApiKey());
  const [tempApiKey, setTempApiKey] = useState<string>('');
  const [manualSuspectMap, setManualSuspectMap] = useState<Record<string, boolean>>({});

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen && questions.length > 0) {
      setHasApiKey(aiService.hasApiKey());
      const initialMap: Record<string, string> = {};
      const initialSolvedMap: Record<string, SolvedQuestionInfo> = {};
      const initialSuspectMap: Record<string, boolean> = {};

      questions.forEach((q) => {
        const isEssay = isEssayQuestion(q);
        initialMap[q.id] = isEssay ? (q.correctAnswer || '') : (q.correctAnswer || 'A').toUpperCase();
        if (q.verificationStatus || q.sanityCheckNote || q.confidence || q.rubric) {
          const isReview = q.confidence === 'needs_review' || q.verificationStatus === 'needs_review';
          initialSolvedMap[q.id] = {
            correctAnswer: q.correctAnswer || (isEssay ? '' : 'A'),
            explanation: q.explanation || '',
            rubric: q.rubric || '',
            confidence: isReview ? 'needs_review' : 'high',
            pass1Answer: q.pass1Answer || q.correctAnswer,
            pass2Answer: q.pass2Answer || q.correctAnswer,
            sanityCheckNote: q.sanityCheckNote
          };
          if (isReview) {
            initialSuspectMap[q.id] = true;
          }
        }
      });

      setUserSelectedMap(initialMap);
      setSolvedMap(initialSolvedMap);
      setManualSuspectMap(initialSuspectMap);
      setProgress({ current: 0, total: questions.length });
    }
  }, [isOpen, questions]);

  if (!isOpen) return null;

  // Handle saving API key inline
  const handleSaveInlineApiKey = () => {
    if (!tempApiKey.trim()) {
      alert('Vui lòng dán mã Gemini API Key hợp lệ.');
      return;
    }
    aiService.setApiKey(tempApiKey.trim());
    setHasApiKey(true);
    setTempApiKey('');
    alert('Đã lưu Gemini API Key thành công! Giờ Thầy/Cô có thể bấm "Bắt đầu AI Giải & Thẩm định kép".');
  };

  // Run AI solver with dual-pass verification
  const handleStartSolving = async () => {
    if (!aiService.hasApiKey()) {
      alert('Chưa có Gemini API Key. Thầy/Cô vui lòng nhập API Key ở thanh màu vàng bên trên hoặc trong mục Cài Đặt.');
      return;
    }

    setIsSolving(true);
    setProgress({ current: 0, total: questions.length });

    try {
      const results = await aiService.solveExamQuestions({
        questions,
        grade,
        topic,
        onProgress: (current, total) => {
          setProgress({ current, total });
        }
      });

      const newSolvedMap: Record<string, SolvedQuestionInfo> = {};
      const newUserMap = { ...userSelectedMap };
      const newSuspectMap = { ...manualSuspectMap };

      results.forEach((res) => {
        const isDiscrepancy = res.confidence === 'needs_review' || (res.pass1Answer && res.pass2Answer && res.pass1Answer !== res.pass2Answer);
        newSolvedMap[res.questionId] = {
          correctAnswer: res.correctAnswer,
          explanation: res.explanation,
          rubric: res.rubric,
          confidence: res.confidence || 'high',
          pass1Answer: res.pass1Answer,
          pass2Answer: res.pass2Answer,
          sanityCheckNote: res.sanityCheckNote
        };
        // Auto select AI answer
        newUserMap[res.questionId] = res.correctAnswer;
        if (isDiscrepancy) {
          newSuspectMap[res.questionId] = true;
        }
      });

      setSolvedMap(newSolvedMap);
      setUserSelectedMap(newUserMap);
      setManualSuspectMap(newSuspectMap);

      const reviewCount = results.filter(r => r.confidence === 'needs_review' || (r.pass1Answer && r.pass2Answer && r.pass1Answer !== r.pass2Answer)).length;
      if (reviewCount > 0) {
        setFilterMode('needs_review');
      }
    } catch (err: any) {
      console.error('Lỗi khi AI giải đề:', err);
      alert(err?.message || 'Có lỗi xảy ra trong quá trình giải đề. Vui lòng kiểm tra lại kết nối mạng hoặc Gemini API Key.');
    } finally {
      setIsSolving(false);
    }
  };

  // Re-verify a single question
  const handleSolveSingle = async (q: Question) => {
    setReverifyingId(q.id);
    try {
      const res = await aiService.solveSingleQuestion({
        question: q,
        grade,
        topic
      });
      setSolvedMap(prev => ({
        ...prev,
        [q.id]: {
          correctAnswer: res.correctAnswer,
          explanation: res.explanation,
          rubric: res.rubric || q.rubric,
          confidence: res.confidence || 'high',
          pass1Answer: res.pass1Answer,
          pass2Answer: res.pass2Answer,
          sanityCheckNote: res.sanityCheckNote
        }
      }));
      setUserSelectedMap(prev => ({
        ...prev,
        [q.id]: res.correctAnswer
      }));
    } catch (err) {
      alert('Không thể giải câu này lúc này.');
    } finally {
      setReverifyingId(null);
    }
  };

  // Quick paste parser (handles "1A 2B 3C" or "1:A, 2:B" or "ABCD...")
  const handleApplyQuickPaste = () => {
    if (!quickPasteText.trim()) return;

    const text = quickPasteText.trim();
    const newUserMap = { ...userSelectedMap };

    // Format 1: "1A 2B 3C" or "1.A 2.B" or "Câu 1: A"
    const pairRegex = /(?:Câu\s*)?(\d+)[\s.:=_-]*([A-D])/gi;
    let match;
    let count = 0;
    while ((match = pairRegex.exec(text)) !== null) {
      const qNum = parseInt(match[1], 10);
      const ansLetter = match[2].toUpperCase();
      const targetQ = questions.find(q => q.order === qNum) || questions[qNum - 1];
      if (targetQ) {
        newUserMap[targetQ.id] = ansLetter;
        count++;
      }
    }

    // Format 2: Continuous string like "ABCDABCD..." if no numbered pairs found
    if (count === 0) {
      const cleanLetters = text.replace(/[^A-Da-d]/g, '').toUpperCase();
      if (cleanLetters.length > 0) {
        questions.forEach((q, idx) => {
          if (idx < cleanLetters.length) {
            newUserMap[q.id] = cleanLetters[idx];
            count++;
          }
        });
      }
    }

    if (count > 0) {
      setUserSelectedMap(newUserMap);
      setShowQuickPaste(false);
      setQuickPasteText('');
      alert(`Đã nhận diện và điền thành công đáp án cho ${count} câu hỏi!`);
    } else {
      alert('Không nhận diện được định dạng đáp án. Vui lòng nhập dạng: 1A 2B 3C... hoặc chuỗi ABCD...');
    }
  };

  // Select all AI answers
  const handleSelectAllAi = () => {
    const newUserMap = { ...userSelectedMap };
    Object.keys(solvedMap).forEach((qId) => {
      if (solvedMap[qId]) {
        newUserMap[qId] = solvedMap[qId].correctAnswer;
      }
    });
    setUserSelectedMap(newUserMap);
  };

  // Save changes
  const handleConfirmApply = async () => {
    setIsSaving(true);
    try {
      const updatedQuestions: Question[] = questions.map((q) => {
        const isEssay = isEssayQuestion(q);
        const chosenAnswer = isEssay
          ? (userSelectedMap[q.id] !== undefined ? userSelectedMap[q.id] : (q.correctAnswer || ''))
          : (userSelectedMap[q.id] || q.correctAnswer || 'A');
        const aiInfo = solvedMap[q.id];
        const isNeedReview = aiInfo 
          ? (aiInfo.confidence === 'needs_review' || (aiInfo.pass1Answer && aiInfo.pass2Answer && aiInfo.pass1Answer !== aiInfo.pass2Answer))
          : (q.verificationStatus === 'needs_review');

        return {
          ...q,
          type: isEssay ? 'essay' : (q.type || 'multiple_choice'),
          correctAnswer: chosenAnswer,
          explanation: aiInfo?.explanation || q.explanation || '',
          rubric: aiInfo?.rubric || q.rubric || '',
          verificationStatus: isNeedReview ? 'needs_review' : (aiInfo ? 'verified' : q.verificationStatus),
          sanityCheckNote: aiInfo?.sanityCheckNote || q.sanityCheckNote,
          confidence: aiInfo?.confidence || q.confidence,
          pass1Answer: isEssay ? undefined : (aiInfo?.pass1Answer || q.pass1Answer),
          pass2Answer: isEssay ? undefined : (aiInfo?.pass2Answer || q.pass2Answer)
        };
      });

      await onApplyAnswers(updatedQuestions);
      onClose();
    } catch (err) {
      console.error('Lỗi khi lưu đáp án:', err);
      alert('Có lỗi khi lưu đáp án. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  // Stats calculation
  const solvedCount = Object.keys(solvedMap).length;
  const changedCount = questions.filter(q => (userSelectedMap[q.id] || q.correctAnswer) !== q.correctAnswer).length;

  const isQuestionSuspect = (q: Question) => {
    if (manualSuspectMap[q.id]) return true;
    const s = solvedMap[q.id];
    if (s && (s.confidence === 'needs_review' || (s.pass1Answer && s.pass2Answer && s.pass1Answer !== s.pass2Answer))) return true;
    if (q.verificationStatus === 'needs_review') return true;
    return false;
  };

  const verifiedCount = questions.filter(q => {
    const s = solvedMap[q.id];
    return s && !isQuestionSuspect(q);
  }).length;

  const needsReviewCount = questions.filter(isQuestionSuspect).length;
  const needsReviewQuestions = questions.filter(isQuestionSuspect);

  // Filter questions for review
  const filteredQuestions = questions.filter((q) => {
    const currentVal = q.correctAnswer || 'A';
    const chosenVal = userSelectedMap[q.id] || currentVal;

    if (filterMode === 'needs_review') {
      return isQuestionSuspect(q);
    }
    if (filterMode === 'verified') {
      const s = solvedMap[q.id];
      return s && !isQuestionSuspect(q);
    }
    if (filterMode === 'changed') {
      return chosenVal !== currentVal;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
        
        {/* COMPACT HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-700 text-white shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center space-x-1.5 bg-white/20 px-2.5 py-0.5 rounded-full text-xs font-bold text-white mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>AI Thẩm Định Kép & Thử Ngược (Dual-Pass Verification)</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight">
                AI Tự Động Giải Đề & Đối Soát Độc Lập 2 Lần
              </h2>
              <p className="text-xs text-indigo-100 mt-0.5">
                Bài thi: <strong>{examTitle}</strong> • Khối {grade} • {questions.length} câu hỏi
              </p>
            </div>

            <button
              onClick={onClose}
              disabled={isSolving || isSaving}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* INLINE API KEY WARNING IF NOT CONFIGURED */}
        {!hasApiKey && (
          <div className="px-4 sm:px-5 py-3 bg-amber-50 dark:bg-amber-950/70 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 animate-in fade-in">
            <div className="flex items-center space-x-2">
              <Key className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold">Chưa cấu hình Gemini API Key:</span>{' '}
                <span>Vui lòng dán API Key để kích hoạt AI Giải đề & Thẩm định đối soát kép.</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                placeholder="Dán Gemini API Key (AIzaSy...)"
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 w-48 sm:w-64"
              />
              <button
                onClick={handleSaveInlineApiKey}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer transition-colors shadow-xs shrink-0"
              >
                Lưu Key
              </button>
            </div>
          </div>
        )}

        {/* DUAL-PASS AUDIT SUMMARY BANNER */}
        {solvedCount > 0 && (
          <div className="px-4 sm:px-5 py-3 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-violet-50/40 dark:from-slate-800/80 dark:to-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <CheckCheck className="w-5 h-5 text-emerald-300" />
              </div>
              <div>
                <div className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <span>Kết quả Đối Soát Độc Lập 2 Vòng</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                    Khớp {verifiedCount}/{solvedCount} câu
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {needsReviewCount > 0 
                    ? `Phát hiện ${needsReviewCount} câu có độ chênh giữa Lượt 1 và Lượt 2, đề xuất Thầy/Cô kiểm tra nhanh.`
                    : 'Tất cả câu hỏi đã được giải xuôi và thử ngược trùng khớp 100% không phát hiện mâu thuẫn.'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Trùng khớp: <strong>{verifiedCount}/{questions.length}</strong></span>
              </div>

              {needsReviewCount > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {needsReviewQuestions.map(q => {
                    const s = solvedMap[q.id];
                    return (
                      <button
                        key={q.id}
                        onClick={() => {
                          setFilterMode('needs_review');
                          setTimeout(() => {
                            const el = document.getElementById(`q_item_${q.id}`);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 50);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black border border-amber-600 flex items-center gap-1.5 cursor-pointer transition-all shadow-md active:scale-95 animate-pulse"
                        title="Bấm để xem ngay câu hỏi này"
                      >
                        <AlertTriangle className="w-4 h-4 text-white" />
                        <span>Xem ngay Câu {q.order} {s?.pass1Answer && s?.pass2Answer ? `(Lượt 1: ${s?.pass1Answer} vs Lượt 2: ${s?.pass2Answer})` : ''}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TOOLBAR & CONTROLS */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleStartSolving}
              disabled={isSolving}
              className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isSolving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang thẩm định ({progress.current}/{progress.total})...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>{solvedCount > 0 ? 'Thẩm định kép lại toàn bộ đề' : 'Bắt đầu AI Giải & Thẩm định kép'}</span>
                </>
              )}
            </button>

            {solvedCount > 0 && (
              <button
                onClick={handleSelectAllAi}
                className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
              >
                Chọn tất cả đáp án AI
              </button>
            )}

            <button
              onClick={() => setShowQuickPaste(!showQuickPaste)}
              className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-xl border border-indigo-200 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
            >
              {showQuickPaste ? 'Đóng ô dán đáp án' : 'Dán chuỗi đáp án có sẵn'}
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Tất cả ({questions.length})
            </button>
            {solvedCount > 0 && (
              <button
                onClick={() => setFilterMode('verified')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  filterMode === 'verified'
                    ? 'bg-emerald-600 text-white'
                    : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                <span>Khớp 100% ({verifiedCount})</span>
              </button>
            )}
            <button
              onClick={() => setFilterMode('needs_review')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterMode === 'needs_review'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : needsReviewCount > 0
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 hover:bg-amber-200'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className={`w-3 h-3 ${needsReviewCount > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-slate-400'}`} />
              <span>Nghi vấn ({needsReviewCount})</span>
            </button>
            <button
              onClick={() => setFilterMode('changed')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterMode === 'changed'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Đã đổi ({changedCount})
            </button>
          </div>
        </div>

        {/* QUICK PASTE PANEL */}
        {showQuickPaste && (
          <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/60 animate-in slide-in-from-top-2">
            <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-200 mb-1">
              Dán bảng đáp án (Hỗ trợ: "1A 2B 3C..." hoặc "1.A 2.B" hoặc chuỗi "ABCDABCD...")
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={quickPasteText}
                onChange={(e) => setQuickPasteText(e.target.value)}
                placeholder="Ví dụ: 1A 2C 3B 4D 5A 6B..."
                className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <button
                onClick={handleApplyQuickPaste}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Áp dụng
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE FILTER NOTICE */}
        {filterMode === 'needs_review' && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Đang lọc: Hiển thị {filteredQuestions.length} câu hỏi có nghi vấn giữa 2 lượt giải độc lập.</span>
            </div>
            <button
              onClick={() => setFilterMode('all')}
              className="px-2.5 py-1 bg-white dark:bg-slate-800 text-amber-900 dark:text-amber-300 font-bold text-xs rounded-xl border border-amber-300 hover:bg-amber-100 cursor-pointer transition-colors shadow-2xs"
            >
              Hiện lại tất cả ({questions.length} câu)
            </button>
          </div>
        )}

        {/* MAIN QUESTION LIST TABLE */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {filteredQuestions.length === 0 ? (
            <div className="text-center py-12 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-white">
                {filterMode === 'needs_review'
                  ? 'Tuyệt vời! Không có câu hỏi nào có nghi vấn'
                  : 'Không có câu hỏi nào trong danh mục này'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                {filterMode === 'needs_review'
                  ? (solvedCount > 0 
                      ? 'Tất cả các câu hỏi đã thẩm định đều có kết quả Lượt 1 (tính xuôi) và Lượt 2 (thử ngược) trùng khớp 100%.'
                      : 'Chưa có câu nào được thẩm định. Thầy/Cô hãy bấm "Bắt đầu AI Giải & Thẩm định kép" để quét toàn bộ đề.')
                  : 'Hãy thử chọn tab khác để xem danh sách câu hỏi.'}
              </p>
              {filterMode === 'needs_review' && (
                <button
                  onClick={() => setFilterMode('all')}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-xs"
                >
                  Xem lại tất cả ({questions.length} câu)
                </button>
              )}
            </div>
          ) : (
            filteredQuestions.map((q) => {
              const isEssay = isEssayQuestion(q);
              const currentOriginal = q.correctAnswer || (isEssay ? '' : 'A');
              const aiSol = solvedMap[q.id];
              const selectedAnswer = userSelectedMap[q.id] !== undefined ? userSelectedMap[q.id] : currentOriginal;
              const isAiProvided = !!aiSol;
              const isDiff = selectedAnswer !== currentOriginal && (!isEssay || selectedAnswer.trim() !== '');
              const isExpanded = expandedExplanations[q.id];
              const isReverifying = reverifyingId === q.id;

              const isDiscrepancy = isQuestionSuspect(q);
              const isVerifiedHigh = aiSol && !isDiscrepancy;

              return (
                <div
                  key={q.id}
                  id={`q_item_${q.id}`}
                  className={`p-4 rounded-2xl border transition-all ${
                    isDiscrepancy
                      ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/80 shadow-xs'
                      : isDiff
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                      : isEssay
                      ? 'bg-purple-50/30 dark:bg-purple-950/10 border-purple-200/80 dark:border-purple-800/50'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    
                    {/* Left: Question text & Options & Verification notes */}
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-black text-xs flex items-center justify-center shrink-0">
                            {q.order}
                          </span>
                          <span className={`text-xs font-bold ${isEssay ? 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 rounded-md' : 'text-slate-500'}`}>
                            {isEssay ? 'Câu hỏi tự luận' : 'Trắc nghiệm (4 phương án)'}
                          </span>
                          {isDiff && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] font-bold">
                              {isEssay ? `Đáp số: ${selectedAnswer}` : `Đã đổi từ ${currentOriginal} ➜ ${selectedAnswer}`}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setManualSuspectMap(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 border ${
                              manualSuspectMap[q.id]
                                ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                            title={manualSuspectMap[q.id] ? 'Bỏ ghim câu nghi vấn' : 'Ghim câu này vào mục nghi vấn'}
                          >
                            <Flag className={`w-3 h-3 ${manualSuspectMap[q.id] ? 'fill-white text-white' : ''}`} />
                            <span>{manualSuspectMap[q.id] ? 'Đang nghi vấn' : 'Ghim nghi vấn'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                        <MathDisplay math={q.question} />
                      </div>

                      {/* DUAL-PASS VERIFICATION STATUS BADGE */}
                      {isDiscrepancy && (
                        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200 flex flex-col gap-1.5 animate-in fade-in">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-extrabold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                              {aiSol?.pass1Answer && aiSol?.pass2Answer && aiSol.pass1Answer !== aiSol.pass2Answer ? (
                                <span>Phát hiện nghi vấn giữa 2 lượt giải: Lượt 1 ra <strong>{aiSol.pass1Answer}</strong>, Lượt 2 thử ngược ra <strong>{aiSol.pass2Answer}</strong></span>
                              ) : (
                                <span>Câu hỏi được đánh dấu nghi vấn cần Thầy/Cô đối soát đáp án</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              {aiSol?.pass1Answer && (
                                <button
                                  type="button"
                                  onClick={() => setUserSelectedMap(prev => ({ ...prev, [q.id]: aiSol.pass1Answer! }))}
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                                    selectedAnswer === aiSol.pass1Answer
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-amber-200/80 text-amber-900 hover:bg-amber-300'
                                  }`}
                                >
                                  Chọn {aiSol.pass1Answer} (Lượt 1)
                                </button>
                              )}
                              {aiSol?.pass2Answer && (
                                <button
                                  type="button"
                                  onClick={() => setUserSelectedMap(prev => ({ ...prev, [q.id]: aiSol.pass2Answer! }))}
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                                    selectedAnswer === aiSol.pass2Answer
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-amber-200/80 text-amber-900 hover:bg-amber-300'
                                  }`}
                                >
                                  Chọn {aiSol.pass2Answer} (Lượt 2)
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSolveSingle(q)}
                                disabled={isReverifying}
                                className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 hover:bg-indigo-50 cursor-pointer flex items-center gap-1"
                              >
                                {isReverifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                <span>Giải lại câu này</span>
                              </button>
                            </div>
                          </div>
                          {aiSol?.sanityCheckNote && (
                            <div className="text-[11px] text-amber-800 dark:text-amber-300 italic">
                              Chi tiết đối soát: {aiSol.sanityCheckNote}
                            </div>
                          )}
                        </div>
                      )}

                      {isVerifiedHigh && (
                        <div className="p-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="font-bold">Đã thẩm định:</span>
                            <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                              {isEssay
                                ? 'Đã giải chi tiết & xây dựng Rubric chấm chuẩn'
                                : `Trùng khớp 100% (Lượt 1: ${aiSol.pass1Answer || aiSol.correctAnswer} - Lượt 2: ${aiSol.pass2Answer || aiSol.correctAnswer})`}
                            </span>
                          </div>
                          {aiSol.sanityCheckNote && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                              {aiSol.sanityCheckNote}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Rubric display for Essay Questions */}
                      {isEssay && (aiSol?.rubric || q.rubric) && (
                        <div className="p-2.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 text-xs">
                          <div className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5 mb-1">
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            <span>Hướng dẫn chấm & Thang điểm (Rubric):</span>
                          </div>
                          <div className="whitespace-pre-line text-purple-900 dark:text-purple-200 text-[11px] leading-relaxed font-sans bg-white/80 dark:bg-slate-900/60 p-2 rounded-lg border border-purple-100 dark:border-purple-900/40">
                            {aiSol?.rubric || q.rubric}
                          </div>
                        </div>
                      )}

                      {/* Options preview (Chỉ hiển thị cho câu trắc nghiệm) */}
                      {!isEssay && q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                          {q.options.map((opt) => {
                            const isChosen = selectedAnswer === opt.id;
                            const isAiChoice = aiSol?.correctAnswer === opt.id;

                            return (
                              <div
                                key={opt.id}
                                onClick={() => setUserSelectedMap(prev => ({ ...prev, [q.id]: opt.id }))}
                                className={`p-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all border ${
                                  isChosen
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-bold'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                  isChosen
                                    ? 'bg-white text-indigo-600'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                }`}>
                                  {opt.id}
                                </span>
                                <div className="truncate flex-1">
                                  <MathDisplay math={opt.text} />
                                </div>
                                {isAiChoice && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-black shrink-0 ${
                                    isChosen ? 'bg-amber-300 text-slate-900' : 'bg-violet-100 text-violet-700'
                                  }`}>
                                    AI chọn
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Right: Answer Selector & AI status */}
                    <div className="sm:w-60 shrink-0 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-2">
                      {isEssay ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-300">
                              Đáp số / Kết luận:
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold">
                              Tự luận
                            </span>
                          </div>
                          <input
                            type="text"
                            value={selectedAnswer}
                            onChange={(e) => setUserSelectedMap(prev => ({ ...prev, [q.id]: e.target.value }))}
                            placeholder="VD: x = 2; y = 5..."
                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-purple-300 dark:border-purple-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                          />
                          {aiSol?.correctAnswer && aiSol.correctAnswer !== selectedAnswer && (
                            <button
                              type="button"
                              onClick={() => setUserSelectedMap(prev => ({ ...prev, [q.id]: aiSol.correctAnswer }))}
                              className="text-[10px] text-purple-700 dark:text-purple-300 hover:underline flex items-center gap-1 cursor-pointer font-semibold text-left"
                            >
                              <span>Dùng đáp số AI: <strong className="text-purple-900 dark:text-purple-100">{aiSol.correctAnswer}</strong></span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                            Đáp án áp dụng:
                          </span>
                          
                          {/* A B C D Radio selector buttons */}
                          <div className="grid grid-cols-4 gap-1">
                            {['A', 'B', 'C', 'D'].map((letter) => (
                              <button
                                key={letter}
                                type="button"
                                onClick={() => setUserSelectedMap(prev => ({ ...prev, [q.id]: letter }))}
                                className={`py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                  selectedAnswer === letter
                                    ? 'bg-indigo-600 text-white shadow-xs scale-105'
                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {letter}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Re-verify Single Question Button */}
                      <button
                        onClick={() => handleSolveSingle(q)}
                        disabled={isReverifying}
                        className="w-full py-1.5 px-2 bg-violet-50 dark:bg-violet-950/60 hover:bg-violet-100 text-violet-700 dark:text-violet-300 text-[11px] font-bold rounded-lg border border-violet-200 dark:border-violet-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isReverifying ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600" />
                            <span>Đang giải...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3 text-violet-600" />
                            <span>
                              {isEssay
                                ? (isAiProvided ? 'AI giải & lập lại biểu điểm' : 'AI giải & lập biểu điểm')
                                : (isAiProvided ? 'Thẩm định lại câu này' : 'AI giải & đối soát câu này')}
                            </span>
                          </>
                        )}
                      </button>

                      {/* Toggle Explanation button */}
                      {(aiSol?.explanation || q.explanation) && (
                        <button
                          onClick={() => setExpandedExplanations(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                          className="w-full text-center text-[10px] text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-0.5 font-semibold cursor-pointer"
                        >
                          <span>{isExpanded ? 'Thu gọn lời giải' : 'Xem lời giải chi tiết'}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Collapsible Explanation Box */}
                  {isExpanded && (aiSol?.explanation || q.explanation) && (
                    <div className="mt-3 p-3 bg-violet-50/70 dark:bg-violet-950/40 rounded-xl border border-violet-200 dark:border-violet-900 text-xs text-slate-700 dark:text-slate-300 space-y-1 animate-in fade-in">
                      <div className="flex items-center space-x-1 font-bold text-violet-900 dark:text-violet-300">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Lời giải chi tiết chuẩn mực sư phạm:</span>
                      </div>
                      <div className="leading-relaxed">
                        <MathDisplay math={aiSol?.explanation || q.explanation || ''} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            Đã chọn đáp án cho <strong>{Object.keys(userSelectedMap).length}</strong>/{questions.length} câu • {changedCount > 0 ? `Đã thay đổi ${changedCount} đáp án` : 'Chưa có thay đổi'}
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>

            <button
              onClick={handleConfirmApply}
              disabled={isSaving}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Xác nhận & Cập nhật đáp án chuẩn</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
