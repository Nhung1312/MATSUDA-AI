import React, { useState, useEffect } from 'react';
import { Question } from '../types';
import { aiService, QuestionVerificationResult } from '../services/aiService';
import { MathDisplay } from './MathDisplay';
import { isEssayQuestion } from '../utils/questionUtils';
import { getQuestionVerificationFingerprint, hasVerificationReference, isQuestionVerifiedCurrent, shouldVerifyQuestion } from '../utils/verificationUtils';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  X, 
  Loader2, 
  Save, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  ShieldCheck, 
  RotateCcw, 
  Key,
  Edit3 
} from 'lucide-react';

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
  const [verificationMap, setVerificationMap] = useState<Record<string, QuestionVerificationResult>>({});
  const [userSelectedMap, setUserSelectedMap] = useState<Record<string, string>>({});
  const [manualDecisionMap, setManualDecisionMap] = useState<Record<string, 'keep' | 'accept_ai' | 'custom'>>({});
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});
  const [showQuickPaste, setShowQuickPaste] = useState(false);
  const [quickPasteText, setQuickPasteText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'verified' | 'needs_review' | 'changed'>('all');
  const [hasApiKey, setHasApiKey] = useState<boolean>(aiService.hasApiKey());
  const [tempApiKey, setTempApiKey] = useState<string>('');

  // Khởi tạo state khi mở modal
  useEffect(() => {
    if (isOpen && questions.length > 0) {
      setHasApiKey(aiService.hasApiKey());
      const initialMap: Record<string, string> = {};
      const initialVerificationMap: Record<string, QuestionVerificationResult> = {};
      const initialDecisionMap: Record<string, 'keep' | 'accept_ai' | 'custom'> = {};

      questions.forEach((q) => {
        const isEssay = isEssayQuestion(q) || q.type === 'short_answer';
        initialMap[q.id] = isEssay ? (q.correctAnswer || '') : (q.correctAnswer || 'A').toUpperCase();

        if (q.pass1Answer || q.sanityCheckNote || q.confidence || q.aiProposedAnswer || q.verificationStatus) {
          const isSuspect = q.verificationStatus === 'needs_review' || q.needsReview === true || q.confidence === 'needs_review' ||
            (q.verificationStatus === 'verified' && !isQuestionVerifiedCurrent(q));
          initialVerificationMap[q.id] = {
            questionId: q.id,
            order: q.order,
            currentAnswer: q.correctAnswer || (isEssay ? '' : 'A'),
            proposedAnswer: q.aiProposedAnswer || q.pass1Answer || q.correctAnswer || 'A',
            matchesCurrentAnswer: !isSuspect,
            confidence: (q.confidence as any) || (isSuspect ? 'needs_review' : 'high'),
            reason: q.aiReason || q.sanityCheckNote || (isSuspect ? 'Phát hiện nghi vấn cần giáo viên xem lại' : 'Trùng khớp đáp án hiện tại'),
            needsReview: isSuspect,
            pass1Answer: q.pass1Answer,
            pass2Answer: q.pass2Answer,
            sanityCheckNote: q.sanityCheckNote
          };
        }
      });

      setUserSelectedMap(initialMap);
      setVerificationMap(initialVerificationMap);
      setManualDecisionMap(initialDecisionMap);
      setProgress({ current: 0, total: questions.length });
    }
  }, [isOpen, questions]);

  if (!isOpen) return null;

  // Lưu API Key trực tiếp nếu chưa có
  const handleSaveInlineApiKey = () => {
    if (!tempApiKey.trim()) {
      alert('Vui lòng dán mã Gemini API Key hợp lệ.');
      return;
    }
    aiService.setApiKey(tempApiKey.trim());
    setHasApiKey(true);
    setTempApiKey('');
    alert('Đã lưu Gemini API Key thành công! Giờ Thầy/Cô có thể bấm "Bắt đầu AI Thẩm định đề thi".');
  };

  // Mặc định chỉ thẩm định câu chưa xác nhận hoặc đã thay đổi nội dung.
  // Chạy lại toàn bộ chỉ khi giáo viên yêu cầu rõ ràng (tốn lượt AI).
  const handleStartVerification = async (forceAll = false) => {
    const pendingQuestions = forceAll ? questions : questions.filter(shouldVerifyQuestion);
    if (pendingQuestions.length === 0) {
      alert('Tất cả câu hỏi đã được duyệt, không cần gọi AI lại.');
      return;
    }
    if (!aiService.hasApiKey()) {
      alert('Chưa có Gemini API Key. Thầy/Cô vui lòng nhập API Key ở thanh màu vàng bên trên hoặc trong mục Cài Đặt.');
      return;
    }

    setIsSolving(true);
    setProgress({ current: 0, total: pendingQuestions.length });

    try {
      const results = await aiService.verifyExamQuestions({
        questions: pendingQuestions,
        grade,
        topic,
        onProgress: (current, total) => setProgress({ current, total })
      });

      const updates: Record<string, QuestionVerificationResult> = {};
      for (const result of results) updates[result.questionId] = result;
      setVerificationMap(prev => ({ ...prev, ...updates }));
      // Không dùng một lựa chọn thủ công từ trước để che kết quả đối soát mới.
      setManualDecisionMap(prev => {
        const next = { ...prev };
        for (const q of pendingQuestions) delete next[q.id];
        return next;
      });
      if (results.some(r => r.needsReview || !r.matchesCurrentAnswer || r.confidence === 'needs_review')) {
        setFilterMode('needs_review');
      }
    } catch (err: any) {
      console.error('Lỗi khi AI thẩm định đề:', err);
      alert(err?.message || 'Có lỗi trong quá trình thẩm định. Vui lòng kiểm tra mạng hoặc Gemini API Key.');
    } finally {
      setIsSolving(false);
    }
  };

  // Thẩm định lại 1 câu hỏi đơn lẻ
  const handleSolveSingle = async (q: Question) => {
    setReverifyingId(q.id);
    try {
      const res = await aiService.verifySingleQuestion({
        question: q,
        grade,
        topic
      });
      setVerificationMap(prev => ({
        ...prev,
        [q.id]: res
      }));
    } catch (err: any) {
      alert(err?.message || 'Không thể đối soát lại câu này lúc này.');
    } finally {
      setReverifyingId(null);
    }
  };

  // 1. DUYỆT CÂU NGHI NGỜ: [Giữ đáp án hiện tại] (Requirement E)
  const handleKeepCurrent = (q: Question) => {
    if (!hasVerificationReference(q)) {
      alert('Câu chưa có đáp án hoặc hướng dẫn chấm. Hãy bổ sung trước khi xác nhận.');
      return;
    }
    const isEssay = isEssayQuestion(q) || q.type === 'short_answer';
    const orig = q.correctAnswer || (isEssay ? '' : 'A');
    setUserSelectedMap(prev => ({ ...prev, [q.id]: orig }));
    setManualDecisionMap(prev => ({ ...prev, [q.id]: 'keep' }));
  };

  // 2. DUYỆT CÂU NGHI NGỜ: [Chấp nhận đáp án AI] (Requirement E)
  const handleAcceptAi = (q: Question, aiAns: string) => {
    if (!aiAns) return;
    setUserSelectedMap(prev => ({ ...prev, [q.id]: aiAns }));
    setManualDecisionMap(prev => ({ ...prev, [q.id]: 'accept_ai' }));
  };

  // 3. DUYỆT CÂU NGHI NGỜ: [Tự sửa] (Requirement E)
  const handleCustomAnswer = (q: Question, customAns: string) => {
    setUserSelectedMap(prev => ({ ...prev, [q.id]: customAns }));
    setManualDecisionMap(prev => ({ ...prev, [q.id]: 'custom' }));
  };

  // Dán nhanh chuỗi đáp án (1A 2B 3C... hoặc ABCD...)
  const handleApplyQuickPaste = () => {
    if (!quickPasteText.trim()) return;

    const text = quickPasteText.trim();
    const newUserMap = { ...userSelectedMap };
    const newDecisionMap = { ...manualDecisionMap };

    const pairRegex = /(?:Câu\s*)?(\d+)[\s.:=_-]*([A-D])/gi;
    let match;
    let count = 0;
    while ((match = pairRegex.exec(text)) !== null) {
      const qNum = parseInt(match[1], 10);
      const ansLetter = match[2].toUpperCase();
      const targetQ = questions.find(q => q.order === qNum) || questions[qNum - 1];
      if (targetQ && !isEssayQuestion(targetQ) && targetQ.type !== 'short_answer') {
        newUserMap[targetQ.id] = ansLetter;
        newDecisionMap[targetQ.id] = 'custom';
        count++;
      }
    }

    if (count === 0) {
      const cleanLetters = text.replace(/[^A-Da-d]/g, '').toUpperCase();
      if (cleanLetters.length > 0) {
        questions.forEach((q, idx) => {
          if (idx < cleanLetters.length && !isEssayQuestion(q) && q.type !== 'short_answer') {
            newUserMap[q.id] = cleanLetters[idx];
            newDecisionMap[q.id] = 'custom';
            count++;
          }
        });
      }
    }

    if (count > 0) {
      setUserSelectedMap(newUserMap);
      setManualDecisionMap(newDecisionMap);
      setShowQuickPaste(false);
      setQuickPasteText('');
      alert(`Đã nhận diện và điền thành công đáp án cho ${count} câu hỏi!`);
    } else {
      alert('Không nhận diện được định dạng đáp án. Vui lòng nhập dạng: 1A 2B 3C... hoặc chuỗi ABCD...');
    }
  };

  // Kiểm tra câu hỏi có đang ở diện nghi ngờ cần xem lại
  const isQuestionSuspect = (q: Question) => {
    // Nếu giáo viên đã bấm chọn quyết định (Giữ hiện tại, chấp nhận AI, hoặc tự sửa) thì đã duyệt xong
    if (manualDecisionMap[q.id]) return false;
    const v = verificationMap[q.id];
    if (v) {
      return v.needsReview || !v.matchesCurrentAnswer || v.confidence === 'needs_review';
    }
    return q.verificationStatus === 'needs_review' || q.needsReview === true ||
      (q.verificationStatus === 'verified' && !isQuestionVerifiedCurrent(q));
  };

  // Xác nhận và lưu kết quả thẩm định (Requirement G)
  const handleConfirmApply = async () => {
    setIsSaving(true);
    try {
      const updatedQuestions: Question[] = questions.map((q) => {
        const isEssay = isEssayQuestion(q) || q.type === 'short_answer';
        const chosenAnswer = isEssay
          ? (userSelectedMap[q.id] !== undefined ? userSelectedMap[q.id] : (q.correctAnswer || ''))
          : (userSelectedMap[q.id] || q.correctAnswer || 'A');
        const vInfo = verificationMap[q.id];
        const decision = manualDecisionMap[q.id];

        let vStatus: 'verified' | 'needs_review';
        let needsRev: boolean;

        if (decision) {
          // Chỉ xác nhận khi đã có đáp án/barem sau thay đổi.
          const hasReference = hasVerificationReference({ ...q, correctAnswer: chosenAnswer });
          vStatus = hasReference ? 'verified' : 'needs_review';
          needsRev = !hasReference;
        } else if (vInfo) {
          if (vInfo.needsReview || !vInfo.matchesCurrentAnswer || vInfo.confidence === 'needs_review') {
            vStatus = 'needs_review';
            needsRev = true;
          } else {
            vStatus = 'verified';
            needsRev = false;
          }
        } else {
          vStatus = q.verificationStatus === 'verified' && isQuestionVerifiedCurrent(q) ? 'verified' : 'needs_review';
          needsRev = vStatus !== 'verified';
        }

        // Fingerprint must use the exact values persisted below. Legacy questions may
        // have no type; changing that on save must not immediately invalidate approval.
        const savedType = q.type === 'short_answer' ? 'short_answer' : (isEssay ? 'essay' : (q.type || 'multiple_choice'));
        const verifiedSource = {
          ...q,
          type: savedType,
          correctAnswer: chosenAnswer,
          explanation: q.explanation || '',
          rubric: q.rubric || ''
        };
        return {
          ...q,
          type: savedType,
          correctAnswer: chosenAnswer,
          explanation: q.explanation || '',
          rubric: q.rubric || '',
          verificationStatus: vStatus,
          needsReview: needsRev,
          verificationFingerprint: vStatus === 'verified'
            ? getQuestionVerificationFingerprint(verifiedSource)
            : undefined,
          sanityCheckNote: vInfo?.sanityCheckNote || q.sanityCheckNote,
          confidence: vInfo?.confidence || q.confidence,
          pass1Answer: vInfo?.pass1Answer || q.pass1Answer,
          pass2Answer: vInfo?.pass2Answer || q.pass2Answer,
          aiProposedAnswer: vInfo?.proposedAnswer || q.aiProposedAnswer,
          aiReason: vInfo?.reason || q.aiReason
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

  // Thống kê số lượng
  const verifiedCount = questions.filter(q => {
    if (manualDecisionMap[q.id]) return true;
    const v = verificationMap[q.id];
    return v && !isQuestionSuspect(q);
  }).length;

  const needsReviewCount = questions.filter(isQuestionSuspect).length;
  const needsReviewQuestions = questions.filter(isQuestionSuspect);
  const changedCount = questions.filter(q => (userSelectedMap[q.id] || q.correctAnswer) !== q.correctAnswer).length;

  // Lọc câu hỏi hiển thị
  const filteredQuestions = questions.filter((q) => {
    const currentVal = q.correctAnswer || 'A';
    const chosenVal = userSelectedMap[q.id] || currentVal;

    if (filterMode === 'needs_review') {
      return isQuestionSuspect(q);
    }
    if (filterMode === 'verified') {
      return !isQuestionSuspect(q) && (!!verificationMap[q.id] || !!manualDecisionMap[q.id]);
    }
    if (filterMode === 'changed') {
      return chosenVal !== currentVal;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4 overflow-hidden animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-6xl h-[94dvh] max-h-[94dvh] min-h-0 flex flex-col overflow-hidden">
        
        {/* COMPACT HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-700 text-white shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center space-x-1.5 bg-white/20 px-2.5 py-0.5 rounded-full text-xs font-bold text-white mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>AI Thẩm Định Kho Đề (Gemini 3.8 Flash • Dual-Pass 2 Vòng)</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight">
                AI Thẩm Định Đề Thi & Đối Soát Độc Lập
              </h2>
              <p className="text-xs text-indigo-100 mt-0.5">
                Bài thi: <strong>{examTitle}</strong> • Khối {grade} • {questions.length} câu hỏi • Bảo toàn tuyệt đối đề gốc và đáp án
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

        {/* CẢNH BÁO NẾU CHƯA NHẬP API KEY */}
        {!hasApiKey && (
          <div className="px-4 sm:px-5 py-3 bg-amber-50 dark:bg-amber-950/70 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 animate-in fade-in">
            <div className="flex items-center space-x-2">
              <Key className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold">Chưa cấu hình Gemini API Key:</span>{' '}
                <span>Vui lòng dán API Key để kích hoạt AI Thẩm định đối soát đề thi.</span>
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

        {/* TỔNG KẾT: giữ tiêu đề và các nút câu nghi vấn ở các hàng độc lập */}
        {(Object.keys(verificationMap).length > 0 || Object.keys(manualDecisionMap).length > 0) && (
          <div className="px-3 sm:px-5 py-2.5 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-violet-50/40 dark:from-slate-800/80 dark:to-slate-800/40 border-b border-slate-200 dark:border-slate-800 shrink-0 min-w-0 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-2">
                  <span className="min-w-0">Kết quả Thẩm định &amp; Đối soát đề</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold whitespace-nowrap">
                    Đạt {verifiedCount}/{questions.length} câu
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                  {needsReviewCount > 0
                    ? `Còn ${needsReviewCount} câu nghi vấn cần Thầy/Cô kiểm tra và xác nhận bên dưới.`
                    : 'Các câu hỏi đã được đối soát, không còn câu nghi vấn.'}
                </p>
              </div>
              <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="whitespace-nowrap">Đã thẩm định: {verifiedCount}/{questions.length}</span>
              </div>
            </div>
            {needsReviewCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 min-w-0" aria-label="Đi đến câu nghi vấn">
                <span className="text-rose-700 dark:text-rose-300 font-bold mr-1">Câu cần duyệt:</span>
                {needsReviewQuestions.slice(0, 8).map(q => {
                  const v = verificationMap[q.id];
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setFilterMode('needs_review');
                        setTimeout(() => {
                          document.getElementById(`q_item_${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 50);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold border border-rose-600 flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                      title={`Xem câu ${q.order}${v?.pass1Answer ? ` – AI đề xuất: ${v.pass1Answer}` : ''}`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Câu {q.order}</span>
                    </button>
                  );
                })}
                {needsReviewQuestions.length > 8 && (
                  <span className="text-rose-700 dark:text-rose-300 font-semibold">+{needsReviewQuestions.length - 8} câu khác ở danh sách dưới</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* THANH CÔNG CỤ ĐIỀU KHIỂN */}
        <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleStartVerification(false)}
              disabled={isSolving || (!questions.some(shouldVerifyQuestion))}
              className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isSolving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang thẩm định ({progress.current}/{progress.total})...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>{questions.some(shouldVerifyQuestion) ? `Thẩm định câu chưa đạt (${questions.filter(shouldVerifyQuestion).length})` : 'Tất cả đã được thẩm định'}</span>
                </>
              )}
            </button>

            {questions.every(isQuestionVerifiedCurrent) && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Chạy lại AI cho toàn bộ ${questions.length} câu sẽ tiêu tốn thêm lượt Gemini. Bạn có muốn tiếp tục?`)) {
                    void handleStartVerification(true);
                  }
                }}
                disabled={isSolving}
                className="px-3 py-2 rounded-xl border border-amber-300 text-amber-800 dark:text-amber-300 text-xs font-bold disabled:opacity-50"
              >
                Thẩm định lại tất cả (tốn lượt AI)
              </button>
            )}

            <button
              onClick={() => setShowQuickPaste(!showQuickPaste)}
              className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-xl border border-indigo-200 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
            >
              {showQuickPaste ? 'Đóng ô dán đáp án' : 'Dán chuỗi đáp án có sẵn'}
            </button>
          </div>

          {/* Bộ lọc tab câu hỏi */}
          <div className="flex flex-wrap items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs min-w-0">
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
            <button
              onClick={() => setFilterMode('verified')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterMode === 'verified'
                  ? 'bg-emerald-600 text-white'
                  : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>Đạt chuẩn ({verifiedCount})</span>
            </button>
            <button
              onClick={() => setFilterMode('needs_review')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterMode === 'needs_review'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : needsReviewCount > 0
                  ? 'bg-rose-100 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200 hover:bg-rose-200'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className={`w-3 h-3 ${needsReviewCount > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-400'}`} />
              <span>Chỉ hiện câu cần xem lại ({needsReviewCount})</span>
            </button>
            <button
              onClick={() => setFilterMode('changed')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterMode === 'changed'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Đã sửa ({changedCount})
            </button>
          </div>
        </div>

        {/* BẢNG DÁN NHANH ĐÁP ÁN */}
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

        {/* THÔNG BÁO KHI ĐANG LỌC CÂU NGHI VẤN */}
        {filterMode === 'needs_review' && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-xs text-rose-900 dark:text-rose-200 flex flex-wrap items-center justify-between gap-2 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Đang lọc: Hiển thị {filteredQuestions.length} câu hỏi có nghi vấn cần xem lại. Thầy/Cô bấm các nút hành động bên dưới để xác nhận.</span>
            </div>
            <button
              onClick={() => setFilterMode('all')}
              className="px-2.5 py-1 bg-white dark:bg-slate-800 text-rose-900 dark:text-rose-300 font-bold text-xs rounded-xl border border-rose-300 hover:bg-rose-100 cursor-pointer transition-colors shadow-2xs"
            >
              Hiện lại tất cả ({questions.length} câu)
            </button>
          </div>
        )}

        {/* DANH SÁCH CÂU HỎI & BẢNG ĐỐI SOÁT */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-4">
          {filteredQuestions.length === 0 ? (
            <div className="text-center py-12 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-white">
                {filterMode === 'needs_review'
                  ? 'Tuyệt vời! Không có câu hỏi nào nghi vấn'
                  : 'Không có câu hỏi nào trong danh mục này'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                {filterMode === 'needs_review'
                  ? 'Tất cả câu hỏi đã được đối soát trùng khớp 100% hoặc đã được Thầy/Cô duyệt xác nhận.'
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
              const isEssay = isEssayQuestion(q) || q.type === 'short_answer';
              const currentOriginal = q.correctAnswer || (isEssay ? '' : 'A');
              const vInfo = verificationMap[q.id];
              const selectedAnswer = userSelectedMap[q.id] !== undefined ? userSelectedMap[q.id] : currentOriginal;
              const isDiff = selectedAnswer !== currentOriginal && (!isEssay || selectedAnswer.trim() !== '');
              const isExpanded = expandedExplanations[q.id];
              const isReverifying = reverifyingId === q.id;

              const isSuspect = isQuestionSuspect(q);
              const isVerifiedHigh = !isSuspect && (!!vInfo || !!manualDecisionMap[q.id]);

              return (
                <div
                  key={q.id}
                  id={`q_item_${q.id}`}
                  className={`p-4 min-w-0 scroll-mt-4 rounded-2xl border transition-all ${
                    isSuspect
                      ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800/80 shadow-xs'
                      : isDiff
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    
                    {/* Phần bên trái: Đề bài, options & Hộp đối soát thẩm định */}
                    <div className="flex-1 min-w-0 space-y-2">
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
                      </div>

                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                        <MathDisplay math={q.question} />
                      </div>

                      {/* HỘP HIỂN THỊ KẾT QUẢ THẨM ĐỊNH LƯỢT 1 & LƯỢT 2 + 3 NÚT DUYỆT (Requirement E) */}
                      {vInfo && (
                        <div className={`p-3 rounded-2xl border text-xs space-y-2.5 ${
                          isSuspect
                            ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                            : 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                        }`}>
                          {/* Trạng thái thẩm định */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              {isSuspect ? (
                                <div className="flex items-center space-x-1.5 text-rose-700 dark:text-rose-300 font-extrabold">
                                  <AlertCircle className="w-4 h-4 text-rose-600 animate-pulse" />
                                  <span>CÂU NGHI NGỜ CẦN XEM LẠI</span>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-1.5 text-emerald-700 dark:text-emerald-300 font-extrabold">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  <span>ĐÃ THẨM ĐỊNH ĐẠT CHUẨN</span>
                                </div>
                              )}
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                vInfo.confidence === 'high' 
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200' 
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200'
                              }`}>
                                Độ tin cậy: {vInfo.confidence === 'high' ? 'Cao' : 'Nghi ngờ'}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSolveSingle(q)}
                              disabled={isReverifying}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 hover:bg-indigo-50 cursor-pointer flex items-center gap-1 shadow-2xs"
                            >
                              {isReverifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                              <span>Thẩm định lại câu này</span>
                            </button>
                          </div>

                          {/* Chi tiết đáp án hiện tại, Lượt 1, Lượt 2 */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 text-xs">
                            <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                              <span className="text-[10px] text-slate-500 block uppercase font-bold">Đáp án hiện tại của đề</span>
                              <span className="text-sm font-black text-slate-800 dark:text-slate-100">{q.correctAnswer || '(Chưa có)'}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                              <span className="text-[10px] text-slate-500 block uppercase font-bold">AI Lượt 1 (Giải nhanh)</span>
                              <span className="text-sm font-black text-indigo-700 dark:text-indigo-300">{vInfo.pass1Answer || vInfo.proposedAnswer || '(Chưa rõ)'}</span>
                            </div>
                            <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                              <span className="text-[10px] text-slate-500 block uppercase font-bold">AI Lượt 2 (Độc lập/Thử ngược)</span>
                              <span className="text-sm font-black text-purple-700 dark:text-purple-300">
                                {vInfo.pass2Answer ? vInfo.pass2Answer : '(Không gọi - Lượt 1 đã khớp)'}
                              </span>
                            </div>
                          </div>

                          {/* Lý do AI đưa ra */}
                          {vInfo.reason && (
                            <div className="text-[11px] text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/40 p-2 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                              <strong>Căn cứ đối soát:</strong> {vInfo.reason}
                            </div>
                          )}

                          {/* 3 NÚT DUYỆT CÂU NGHI NGỜ DÀNH CHO GIÁO VIÊN (Requirement 8) */}
                          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* [Giữ đáp án hiện tại] */}
                              <button
                                type="button"
                                onClick={() => handleKeepCurrent(q)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 border shadow-2xs ${
                                  manualDecisionMap[q.id] === 'keep'
                                    ? 'bg-slate-800 text-white border-slate-900 ring-2 ring-slate-400'
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>[Giữ đáp án hiện tại: {q.correctAnswer || 'A'}]</span>
                              </button>

                              {/* [Chấp nhận đáp án AI] */}
                              {vInfo.proposedAnswer && (
                                <button
                                  type="button"
                                  onClick={() => handleAcceptAi(q, vInfo.proposedAnswer)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 border shadow-2xs ${
                                    manualDecisionMap[q.id] === 'accept_ai'
                                      ? 'bg-violet-600 text-white border-violet-700 ring-2 ring-violet-400'
                                      : 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700 hover:bg-violet-100'
                                  }`}
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                  <span>[Chấp nhận đáp án AI: {vInfo.proposedAnswer}]</span>
                                </button>
                              )}

                              {/* [Tự sửa] */}
                              <div className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 px-2 py-1 rounded-xl border border-amber-300 dark:border-amber-700">
                                <span className="text-[11px] font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                                  <Edit3 className="w-3 h-3 text-amber-600" />
                                  <span>[Tự sửa]:</span>
                                </span>
                                {!isEssay ? (
                                  ['A', 'B', 'C', 'D'].map((letter) => (
                                    <button
                                      key={letter}
                                      type="button"
                                      onClick={() => handleCustomAnswer(q, letter)}
                                      className={`w-6 h-6 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                        manualDecisionMap[q.id] === 'custom' && selectedAnswer === letter
                                          ? 'bg-amber-600 text-white shadow-xs'
                                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-slate-200 dark:border-slate-700'
                                      }`}
                                    >
                                      {letter}
                                    </button>
                                  ))
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const inputEl = document.querySelector(`input[value="${selectedAnswer}"]`) as HTMLInputElement;
                                      if (inputEl) inputEl.focus();
                                    }}
                                    className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100"
                                  >
                                    Nhập kết quả bên phải
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Trạng thái xác nhận của GV */}
                            {manualDecisionMap[q.id] && (
                              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Đã chọn: {selectedAnswer}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Thông báo nếu câu đã đạt chuẩn từ trước */}
                      {!vInfo && isVerifiedHigh && (
                        <div className="p-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="font-bold">Đã thẩm định:</span>
                          <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                            {q.sanityCheckNote || 'Câu hỏi đã được xác minh đạt chuẩn 100%.'}
                          </span>
                        </div>
                      )}

                      {/* Options preview cho trắc nghiệm */}
                      {!isEssay && q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                          {q.options.map((opt) => {
                            const isChosen = selectedAnswer === opt.id;
                            const isAiChoice = vInfo?.proposedAnswer === opt.id;

                            return (
                              <div
                                key={opt.id}
                                onClick={() => handleCustomAnswer(q, opt.id)}
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
                                <div className="min-w-0 flex-1 overflow-x-auto">
                                  <MathDisplay math={opt.text} />
                                </div>
                                {isAiChoice && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-black shrink-0 ${
                                    isChosen ? 'bg-amber-300 text-slate-900' : 'bg-violet-100 text-violet-700'
                                  }`}>
                                    AI đề xuất
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Phần bên phải: Bảng chọn đáp án [Tự sửa] & Thao tác */}
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
                            onChange={(e) => handleCustomAnswer(q, e.target.value)}
                            placeholder="VD: x = 2; y = 5..."
                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-purple-300 dark:border-purple-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400">
                              [Tự sửa đáp án]:
                            </span>
                            {selectedAnswer && (
                              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                                Đang chọn: {selectedAnswer}
                              </span>
                            )}
                          </div>
                          
                          {/* Các nút bấm chọn phương án A B C D */}
                          <div className="grid grid-cols-4 gap-1">
                            {['A', 'B', 'C', 'D'].map((letter) => (
                              <button
                                key={letter}
                                type="button"
                                onClick={() => handleCustomAnswer(q, letter)}
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

                      {/* Xem lời giải chi tiết */}
                      {q.explanation && (
                        <button
                          onClick={() => setExpandedExplanations(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                          className="w-full text-center text-[10px] text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-0.5 font-semibold cursor-pointer pt-1"
                        >
                          <span>{isExpanded ? 'Thu gọn lời giải' : 'Xem lời giải chi tiết'}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Lời giải chi tiết collapsible */}
                  {isExpanded && q.explanation && (
                    <div className="mt-3 p-3 bg-violet-50/70 dark:bg-violet-950/40 rounded-xl border border-violet-200 dark:border-violet-900 text-xs text-slate-700 dark:text-slate-300 space-y-1 animate-in fade-in">
                      <div className="flex items-center space-x-1 font-bold text-violet-900 dark:text-violet-300">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Lời giải hiện tại của đề:</span>
                      </div>
                      <div className="leading-relaxed">
                        <MathDisplay math={q.explanation} />
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
            {needsReviewCount === 0 && (verifiedCount > 0 || Object.keys(manualDecisionMap).length > 0) ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Không còn câu nghi ngờ • Đề thi đủ chuẩn chuyển thành <strong>ĐÃ THẨM ĐỊNH (verified)</strong></span>
              </span>
            ) : needsReviewCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Còn {needsReviewCount} câu nghi vấn • Cần Thầy/Cô duyệt trước khi chuyển sang Đã thẩm định</span>
              </span>
            ) : (
              <span>Đã duyệt/khớp <strong>{verifiedCount}</strong>/{questions.length} câu • {changedCount > 0 ? `Đã thay đổi ${changedCount} đáp án` : 'Chưa có thay đổi'}</span>
            )}
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
              className={`flex-1 sm:flex-none px-6 py-2.5 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                needsReviewCount === 0 && (verifiedCount > 0 || Object.keys(manualDecisionMap).length > 0)
                  ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400/50'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : needsReviewCount === 0 && (verifiedCount > 0 || Object.keys(manualDecisionMap).length > 0) ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-200" />
                  <span>Lưu & Chuyển sang ĐÃ THẨM ĐỊNH (verified)</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Lưu kết quả thẩm định</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
