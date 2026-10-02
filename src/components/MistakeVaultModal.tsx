import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  BookOpen, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  Sparkles, 
  Search, 
  Filter, 
  Award, 
  Trash2, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp,
  AlertCircle,
  Lightbulb,
  Check,
  Play,
  Flame,
  ArrowRight,
  GraduationCap,
  FileText,
  Layers,
  PlayCircle,
  ChevronRight,
  CheckCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useMistakeVaultStore } from '../store/useMistakeVaultStore';
import { MistakeRecord, GradeLevel } from '../types';
import { MathDisplay } from './MathDisplay';
import { aiService } from '../services/aiService';
import { soundEffects } from '../utils/soundEffects';

interface MistakeVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MistakeVaultModal: React.FC<MistakeVaultModalProps> = ({ isOpen, onClose }) => {
  const {
    mistakes,
    recordPracticeAttempt,
    markAsMastered,
    saveAiHint,
    removeMistake,
    clearMasteredMistakes,
    clearAllMistakes
  } = useMistakeVaultStore();

  const [selectedGrade, setSelectedGrade] = useState<'all' | GradeLevel>('all');
  const [selectedExamTitle, setSelectedExamTitle] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'unmastered' | 'all' | 'mastered'>('unmastered');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Interactive re-test states per mistake
  const [selectedOptionByMistake, setSelectedOptionByMistake] = useState<Record<string, string>>({});
  const [testResultByMistake, setTestResultByMistake] = useState<Record<string, { tested: boolean; isCorrect: boolean }>>({});
  const [loadingAiHint, setLoadingAiHint] = useState<Record<string, boolean>>({});
  const [showExplanation, setShowExplanation] = useState<Record<string, boolean>>({});

  // Mini Quiz Mode
  const [quizMode, setQuizMode] = useState<boolean>(false);
  const [quizIndex, setQuizIndex] = useState<number>(0);
  const [showConfirmClearAll, setShowConfirmClearAll] = useState<boolean>(false);

  // Grouping by Exam & Topic states
  const [viewGrouping, setViewGrouping] = useState<'by_exam' | 'by_topic' | 'all'>('by_exam');
  const [activeExamPractice, setActiveExamPractice] = useState<{ title: string; grade: GradeLevel; mistakes: MistakeRecord[] } | null>(null);
  const [examPracticeIndex, setExamPracticeIndex] = useState<number>(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Đảm bảo Modal chỉ render Portal khi đã mount thành công trên trình duyệt
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter mistakes
  const filteredMistakes = useMemo(() => {
    return mistakes.filter((m) => {
      if (selectedGrade !== 'all' && m.grade !== selectedGrade) return false;
      if (selectedExamTitle !== 'all') {
        const examTitle = m.assignmentTitle || m.assignmentId || 'Đề kiểm tra & Luyện tập chung';
        if (examTitle !== selectedExamTitle) return false;
      }
      if (statusFilter === 'unmastered' && m.mastered) return false;
      if (statusFilter === 'mastered' && !m.mastered) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchText = (m.question.question || '').toLowerCase();
        const matchTopic = (m.assignmentTitle || '').toLowerCase() + (m.question.topicHint || '').toLowerCase();
        if (!matchText.includes(q) && !matchTopic.includes(q)) return false;
      }
      return true;
    });
  }, [mistakes, selectedGrade, selectedExamTitle, statusFilter, searchQuery]);

  const activeCount = mistakes.filter((m) => !m.mastered).length;
  const masteredCount = mistakes.filter((m) => m.mastered).length;

  // List of all unique exams available in vault
  const allAvailableExams = useMemo(() => {
    const map = new Map<string, { title: string; count: number; unmastered: number; grade: GradeLevel }>();
    mistakes.forEach((m) => {
      const title = m.assignmentTitle || 'Đề luyện tập chung';
      if (!map.has(title)) {
        map.set(title, { title, count: 0, unmastered: 0, grade: m.grade });
      }
      const item = map.get(title)!;
      item.count++;
      if (!m.mastered) item.unmastered++;
    });
    return Array.from(map.values());
  }, [mistakes]);

  // Group by Exam
  const mistakesByExam = useMemo(() => {
    const map = new Map<string, { assignmentId: string; assignmentTitle: string; grade: GradeLevel; mistakes: MistakeRecord[] }>();
    filteredMistakes.forEach((m) => {
      const key = m.assignmentTitle || m.assignmentId || 'Đề kiểm tra & Luyện tập chung';
      if (!map.has(key)) {
        map.set(key, {
          assignmentId: m.assignmentId,
          assignmentTitle: m.assignmentTitle || 'Đề luyện tập chung',
          grade: m.grade,
          mistakes: []
        });
      }
      map.get(key)!.mistakes.push(m);
    });
    return Array.from(map.values());
  }, [filteredMistakes]);

  // Group by Topic
  const mistakesByTopic = useMemo(() => {
    const map = new Map<string, { topicName: string; grade: GradeLevel; mistakes: MistakeRecord[] }>();
    filteredMistakes.forEach((m) => {
      const key = m.question.topicHint || 'Chuyên đề kiến thức chung';
      if (!map.has(key)) {
        map.set(key, {
          topicName: key,
          grade: m.grade,
          mistakes: []
        });
      }
      map.get(key)!.mistakes.push(m);
    });
    return Array.from(map.values());
  }, [filteredMistakes]);

  // Lệnh return sớm phải đặt sau tất cả hooks
  if (!isOpen || !mounted) return null;

  // Trigger re-check answer
  const handleCheckAnswer = (mistake: MistakeRecord) => {
    const selected = selectedOptionByMistake[mistake.id];
    if (!selected) {
      alert('Vui lòng chọn một phương án trước khi kiểm tra.');
      return;
    }

    const isCorrect = selected.trim().toUpperCase() === mistake.question.correctAnswer.trim().toUpperCase();

    if (isCorrect) {
      soundEffects.playSuccess();
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 }
        });
      } catch {}
      recordPracticeAttempt(mistake.id, true);
      setTestResultByMistake((prev) => ({
        ...prev,
        [mistake.id]: { tested: true, isCorrect: true }
      }));
    } else {
      soundEffects.playFlag();
      recordPracticeAttempt(mistake.id, false);
      setTestResultByMistake((prev) => ({
        ...prev,
        [mistake.id]: { tested: true, isCorrect: false }
      }));
    }
  };

  // Request AI Hint
  const handleGetAiHint = async (mistake: MistakeRecord) => {
    if (mistake.aiHint) {
      setShowExplanation((prev) => ({
        ...prev,
        [mistake.id]: !prev[mistake.id]
      }));
      return;
    }

    setLoadingAiHint((prev) => ({ ...prev, [mistake.id]: true }));
    try {
      const hint = await aiService.explainAnswer({
        questionText: mistake.question.question,
        options: mistake.question.options,
        studentAnswer: mistake.studentAnswer,
        correctAnswer: mistake.question.correctAnswer,
        grade: mistake.grade
      });
      saveAiHint(mistake.id, hint);
      setShowExplanation((prev) => ({ ...prev, [mistake.id]: true }));
    } catch {
      alert('Không thể kết nối trợ lý AI lúc này. Bạn có thể xem lời giải chi tiết của giáo viên nhé!');
    } finally {
      setLoadingAiHint((prev) => ({ ...prev, [mistake.id]: false }));
    }
  };

  // Render single mistake card
  const renderMistakeCard = (m: MistakeRecord, idx: number) => {
    const currentSelected = selectedOptionByMistake[m.id] || '';
    const testResult = testResultByMistake[m.id];
    const isAiLoading = loadingAiHint[m.id];
    const isExpanded = showExplanation[m.id];

    return (
      <div
        key={m.id}
        className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-xs ${
          m.mastered
            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/80'
            : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700/80 hover:border-indigo-300'
        }`}
      >
        {/* Card Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
              Toán {m.grade}
            </span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-black text-slate-800 dark:text-slate-200">
              <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Đề: {m.assignmentTitle || 'Đề kiểm tra chung'}</span>
            </div>
            {m.question.topicHint && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60">
                <span>🎯 {m.question.topicHint}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                const targetTitle = m.assignmentTitle || m.assignmentId || 'Đề kiểm tra & Luyện tập chung';
                const matching = mistakes.filter(item => (item.assignmentTitle || item.assignmentId || 'Đề kiểm tra & Luyện tập chung') === targetTitle);
                setActiveExamPractice({
                  title: m.assignmentTitle || 'Đề kiểm tra',
                  grade: m.grade,
                  mistakes: matching
                });
                setExamPracticeIndex(0);
              }}
              className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 transition-colors flex items-center gap-1 cursor-pointer"
              title="Luyện tập lại các câu sai của đề này"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Luyện lại đề này</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {m.mastered ? (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Đã nắm vững</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Cần luyện lại</span>
              </span>
            )}

            <button
              onClick={() => removeMistake(m.id)}
              className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 hover:border-rose-300 transition-colors cursor-pointer shadow-2xs"
              title="Xóa câu này khỏi sổ tay"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-[11px]">Xóa</span>
            </button>
          </div>
        </div>

        {/* Question Prompt */}
        <div className="py-3 text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 space-y-2">
          <div className="flex items-start gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-black text-xs shrink-0 shadow-2xs">
              Câu {m.question.order || idx + 1}
            </span>
            <div className="flex-1 font-semibold text-slate-900 dark:text-white leading-relaxed">
              <MathDisplay text={m.question.question} content={m.question.question} />
            </div>
          </div>

          {/* Question Illustration Image */}
          {m.question.imageUrl && (
            <div className="mt-2.5 max-w-md rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-xs bg-white">
              <img 
                src={m.question.imageUrl} 
                alt="Hình vẽ minh họa đề bài" 
                className="max-h-64 object-contain w-full p-2" 
              />
            </div>
          )}
        </div>

        {/* Previous Wrong Answer Reminder */}
        <div className="mb-3 px-3 py-2 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>
              Lần thi trước bạn chọn: <strong>{m.studentAnswer}</strong> (Chưa chính xác). Hãy thử giải và chọn lại:
            </span>
          </div>
          {m.practiceCount > 0 && (
            <span className="text-[11px] text-slate-400 font-mono">
              Đã thử: {m.practiceCount} lần
            </span>
          )}
        </div>

        {/* Interactive Options Practice */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3">
          {(m.question.options || []).map((opt) => {
            const isSelected = currentSelected === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  soundEffects.playClick();
                  setSelectedOptionByMistake((prev) => ({
                    ...prev,
                    [m.id]: opt.id
                  }));
                }}
                className={`p-3 rounded-xl border text-left flex items-start space-x-2.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/70 ring-2 ring-indigo-500/50 text-indigo-900 dark:text-indigo-100 font-semibold'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {opt.id}
                </span>
                <div className="text-xs sm:text-sm font-medium flex-1">
                  <MathDisplay text={opt.text} content={opt.text} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Feedback Banner after re-checking */}
        {testResult && testResult.tested && (
          <div
            className={`p-3 rounded-xl my-2 text-xs font-bold flex items-center space-x-2 animate-in zoom-in-95 duration-150 ${
              testResult.isCorrect
                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border border-emerald-300'
                : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border border-rose-300'
            }`}
          >
            {testResult.isCorrect ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  🎉 Chính xác tuyệt vời! Bạn đã khắc phục thành công câu sai này và được ghi nhận là Đã Nắm Vững!
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  Đáp án vừa chọn vẫn chưa đúng. Bạn hãy bấm nút "Gợi ý bước giải từ AI" bên dưới để được hướng dẫn nhé!
                </span>
              </>
            )}
          </div>
        )}

        {/* Card Bottom Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleCheckAnswer(m)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-transform active:scale-95 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Kiểm tra đáp án</span>
            </button>

            <button
              onClick={() => handleGetAiHint(m)}
              disabled={isAiLoading}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-800/80 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              <span>{isAiLoading ? 'AI đang phân tích...' : m.aiHint ? 'Xem lại gợi ý AI' : 'Gợi ý bước giải AI'}</span>
            </button>
          </div>

          <button
            onClick={() => {
              soundEffects.playSuccess();
              markAsMastered(m.id);
            }}
            className="text-xs text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold transition-colors cursor-pointer"
          >
            {m.mastered ? '✓ Đã nắm vững' : 'Đánh dấu đã hiểu bài'}
          </button>
        </div>

        {/* Expanded AI Explanation / Teacher Solution */}
        {(isExpanded || m.aiHint) && (
          <div className="mt-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 space-y-2 text-xs text-slate-800 dark:text-slate-200">
            <div className="flex items-center space-x-1.5 font-bold text-amber-700 dark:text-amber-400 text-xs">
              <Lightbulb className="w-4 h-4" />
              <span>Hướng dẫn tư duy từng bước từ Trợ Lý AI:</span>
            </div>
            
            <div className="whitespace-pre-line leading-relaxed font-sans">
              {m.aiHint || 'Đang cập nhật hướng dẫn chi tiết...'}
            </div>

            {m.question.explanation && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="font-bold text-slate-600 dark:text-slate-400">
                  Đáp án chuẩn của Thầy/Cô:
                </span>{' '}
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                  {m.question.correctAnswer}
                </span>
                <div className="mt-1">
                  <MathDisplay text={m.question.explanation} content={m.question.explanation} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Sử dụng createPortal để bốc modal ra khỏi Navbar, với cấu hình fixed tuyệt đối 
  // và z-index cực cao (99999) để chắc chắn đè lên mọi thứ (kể cả Header)
  return createPortal(
    <div 
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, backgroundColor: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)' }}
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto">
        
        {/* MODAL HEADER */}
        <div className="px-5 sm:px-8 py-5 bg-gradient-to-r from-rose-600 via-pink-600 to-indigo-700 text-white flex items-center justify-between shadow-md select-none shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Sổ Tay Câu Sai (Mistake Vault)
                </h2>
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-black uppercase tracking-wider">
                  AI Phân Tích
                </span>
              </div>
              <p className="text-xs sm:text-sm text-rose-100 mt-0.5">
                Tự động gom nhặt câu làm sai sau mỗi bài thi • Luyện tập lấp lỗ hổng kiến thức
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Đóng sổ tay"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STATS & CONTROL BAR */}
        <div className="px-5 sm:px-8 py-3.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold shadow-2xs">
              <AlertCircle className="w-4 h-4 text-rose-500" />
              <span>Cần khắc phục:</span>
              <span className="font-black text-rose-600 dark:text-rose-400">{activeCount} câu</span>
            </div>

            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Đã nắm vững:</span>
              <span className="font-black text-emerald-600 dark:text-emerald-400">{masteredCount} câu</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {masteredCount > 0 && (
              <button
                onClick={clearMasteredMistakes}
                className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-semibold px-2.5 py-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                title="Dọn dẹp các câu đã luyện tập thành thạo"
              >
                Dọn câu đã xong
              </button>
            )}

            {mistakes.length > 0 && (
              <>
                {showConfirmClearAll ? (
                  <div className="flex items-center space-x-1.5 bg-rose-50 dark:bg-rose-950/80 p-1 rounded-xl border border-rose-200 dark:border-rose-900">
                    <span className="text-[11px] font-bold text-rose-800 dark:text-rose-200 pl-1.5">
                      Xóa toàn bộ sổ tay?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        clearAllMistakes();
                        setShowConfirmClearAll(false);
                      }}
                      className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                    >
                      Đồng ý xóa
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConfirmClearAll(false)}
                      className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConfirmClearAll(true)}
                    className="text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 font-semibold px-2.5 py-1.5 rounded-xl border border-transparent hover:border-rose-200 transition-colors cursor-pointer flex items-center space-x-1"
                    title="Xóa toàn bộ câu sai trong sổ tay"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Xóa toàn bộ sổ tay</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* FILTERS & SEARCH ROW */}
        <div className="px-5 sm:px-8 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setSelectedGrade('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                selectedGrade === 'all'
                  ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Tất cả khối
            </button>
            {(['6', '7', '8', '9'] as GradeLevel[]).map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGrade(g)}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  selectedGrade === g
                    ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Lớp {g}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setStatusFilter('unmastered')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center space-x-1 ${
                statusFilter === 'unmastered'
                  ? 'bg-white dark:bg-rose-600 text-rose-700 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <span>🔴 Chưa sửa</span>
              <span className="font-mono text-[10px]">({activeCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('mastered')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center space-x-1 ${
                statusFilter === 'mastered'
                  ? 'bg-white dark:bg-emerald-600 text-emerald-700 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <span>🟢 Đã nắm vững</span>
              <span className="font-mono text-[10px]">({masteredCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Tất cả ({mistakes.length})
            </button>
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo chuyên đề, từ khóa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* VIEW GROUPING SWITCH ROW */}
        <div className="px-5 sm:px-8 py-2.5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-1.5 font-bold text-slate-500 dark:text-slate-400">
            <span>Cách xem:</span>
            <div className="flex items-center bg-white dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setViewGrouping('by_exam');
                  setActiveExamPractice(null);
                }}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center space-x-1.5 ${
                  viewGrouping === 'by_exam'
                    ? 'bg-rose-600 text-white font-black shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Theo từng đề thi ({mistakesByExam.length})</span>
              </button>
              <button
                onClick={() => {
                  setViewGrouping('by_topic');
                  setActiveExamPractice(null);
                }}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center space-x-1.5 ${
                  viewGrouping === 'by_topic'
                    ? 'bg-rose-600 text-white font-black shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Theo chuyên đề ({mistakesByTopic.length})</span>
              </button>
              <button
                onClick={() => {
                  setViewGrouping('all');
                  setActiveExamPractice(null);
                }}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center space-x-1.5 ${
                  viewGrouping === 'all'
                    ? 'bg-rose-600 text-white font-black shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <span>Toàn bộ câu sai ({filteredMistakes.length})</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {allAvailableExams.length > 0 && (
              <div className="flex items-center space-x-1.5 text-xs">
                <span className="font-bold text-slate-500 dark:text-slate-400">Lọc đề thi:</span>
                <select
                  value={selectedExamTitle}
                  onChange={(e) => setSelectedExamTitle(e.target.value)}
                  className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 max-w-[260px] truncate cursor-pointer shadow-2xs"
                >
                  <option value="all">📂 Tất cả đề thi ({allAvailableExams.length} đề)</option>
                  {allAvailableExams.map((ex) => (
                    <option key={ex.title} value={ex.title}>
                      {ex.title} ({ex.unmastered > 0 ? `${ex.unmastered} câu cần sửa` : 'Đã xong'})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              💡 Bấm <strong>"Luyện lại đề này"</strong> để làm lại các câu sai của bài thi đó!
            </div>
          </div>
        </div>

        {/* ACTIVE EXAM PRACTICE MODE */}
        {activeExamPractice ? (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-500 to-indigo-600 text-white flex flex-wrap items-center justify-between gap-3 shadow-md">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setActiveExamPractice(null)}
                  className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <span>← Thoát luyện tập</span>
                </button>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase">
                      Toán {activeExamPractice.grade}
                    </span>
                    <h3 className="font-extrabold text-sm sm:text-base">
                      Luyện tập câu sai: {activeExamPractice.title}
                    </h3>
                  </div>
                  <p className="text-xs text-rose-100 mt-0.5">
                    Tập trung rèn luyện các câu bạn từng làm sai trong đề thi này
                  </p>
                </div>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-white text-rose-700 font-black text-xs shadow-xs">
                Câu {examPracticeIndex + 1} / {activeExamPractice.mistakes.length}
              </div>
            </div>

            {activeExamPractice.mistakes[examPracticeIndex] && (
              <div className="space-y-4">
                {renderMistakeCard(activeExamPractice.mistakes[examPracticeIndex], examPracticeIndex)}
                
                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                  <button
                    disabled={examPracticeIndex === 0}
                    onClick={() => setExamPracticeIndex(prev => Math.max(0, prev - 1))}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-30 cursor-pointer shadow-2xs"
                  >
                    ← Câu trước
                  </button>

                  <div className="flex items-center gap-1.5">
                    {activeExamPractice.mistakes.map((m, i) => {
                      const isDone = m.mastered || testResultByMistake[m.id]?.isCorrect;
                      return (
                        <button
                          key={i}
                          onClick={() => setExamPracticeIndex(i)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${
                            i === examPracticeIndex
                              ? 'bg-rose-600 text-white ring-2 ring-rose-400 font-black'
                              : isDone
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>

                  {examPracticeIndex < activeExamPractice.mistakes.length - 1 ? (
                    <button
                      onClick={() => setExamPracticeIndex(prev => prev + 1)}
                      className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-xs flex items-center space-x-1"
                    >
                      <span>Câu tiếp theo</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        soundEffects.playSuccess();
                        alert('🎉 Chúc mừng bạn đã hoàn thành đợt luyện tập câu sai của đề này!');
                        setActiveExamPractice(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-md flex items-center space-x-1"
                    >
                      <CheckCheck className="w-4 h-4" />
                      <span>Hoàn thành bài luyện</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* MAIN LIST CONTENT */
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
            {filteredMistakes.length === 0 ? (
              <div className="text-center py-16 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
                <div className="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-white">
                  {mistakes.length === 0
                    ? 'Sổ tay câu sai đang trống!'
                    : 'Không có câu hỏi nào khớp với bộ lọc'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                  {mistakes.length === 0
                    ? 'Sau khi làm bài kiểm tra hoặc đề luyện tập, nếu có câu nào chưa đúng, hệ thống sẽ tự động lưu vào đây để bạn luyện lại.'
                    : 'Hãy thử chọn khối lớp khác hoặc chuyển sang xem các câu đã nắm vững.'}
                </p>
              </div>
            ) : viewGrouping === 'by_exam' ? (
              <div className="space-y-4">
                {mistakesByExam.map((exam) => {
                  const isCollapsed = collapsedGroups[exam.assignmentTitle];
                  const examMastered = exam.mistakes.filter(m => m.mastered).length;
                  const examUnmastered = exam.mistakes.length - examMastered;

                  return (
                    <div
                      key={exam.assignmentTitle}
                      className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-xs overflow-hidden"
                    >
                      <div className="p-4 sm:p-5 bg-gradient-to-r from-rose-50/60 via-indigo-50/30 to-slate-50 dark:from-slate-800 dark:to-slate-800/60 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-inner">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                                Toán {exam.grade}
                              </span>
                              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-white">
                                {exam.assignmentTitle}
                              </h3>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                              <span>Tổng {exam.mistakes.length} câu sai</span>
                              <span>•</span>
                              <span className="text-rose-600 dark:text-rose-400 font-bold">{examUnmastered} câu cần sửa</span>
                              <span>•</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{examMastered} câu đã hiểu</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => {
                              setActiveExamPractice({
                                title: exam.assignmentTitle,
                                grade: exam.grade,
                                mistakes: exam.mistakes
                              });
                              setExamPracticeIndex(0);
                            }}
                            className="px-3.5 py-1.5 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer"
                          >
                            <PlayCircle className="w-4 h-4" />
                            <span>Luyện tập lại đề này ({exam.mistakes.length} câu)</span>
                          </button>
                          <button
                            onClick={() => toggleGroup(exam.assignmentTitle)}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            title="Đóng / mở danh sách câu"
                          >
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div className="p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/30">
                          {exam.mistakes.map((m, idx) => renderMistakeCard(m, idx))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : viewGrouping === 'by_topic' ? (
              <div className="space-y-4">
                {mistakesByTopic.map((topic) => {
                  const isCollapsed = collapsedGroups[topic.topicName];
                  const topicMastered = topic.mistakes.filter(m => m.mastered).length;
                  const topicUnmastered = topic.mistakes.length - topicMastered;

                  return (
                    <div
                      key={topic.topicName}
                      className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-xs overflow-hidden"
                    >
                      <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-50/60 via-purple-50/30 to-slate-50 dark:from-slate-800 dark:to-slate-800/60 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-inner">
                            <Layers className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                Toán {topic.grade}
                              </span>
                              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-white">
                                {topic.topicName}
                              </h3>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                              <span>Tổng {topic.mistakes.length} câu</span>
                              <span>•</span>
                              <span className="text-rose-600 dark:text-rose-400 font-bold">{topicUnmastered} câu cần sửa</span>
                              <span>•</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{topicMastered} câu đã hiểu</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => {
                              setActiveExamPractice({
                                title: topic.topicName,
                                grade: topic.grade,
                                mistakes: topic.mistakes
                              });
                              setExamPracticeIndex(0);
                            }}
                            className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer"
                          >
                            <PlayCircle className="w-4 h-4" />
                            <span>Luyện chuyên đề này ({topic.mistakes.length} câu)</span>
                          </button>
                          <button
                            onClick={() => toggleGroup(topic.topicName)}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            title="Đóng / mở danh sách câu"
                          >
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div className="p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/30">
                          {topic.mistakes.map((m, idx) => renderMistakeCard(m, idx))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              filteredMistakes.map((m, idx) => renderMistakeCard(m, idx))
            )}
          </div>
        )}

        {/* MODAL FOOTER */}
        <div className="px-5 sm:px-8 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 select-none shrink-0">
          <div className="flex items-center space-x-1.5">
            <span className="font-bold text-indigo-600 dark:text-indigo-400">🌟 Phương pháp học chủ động:</span>
            <span>Mỗi lần sửa đúng 1 câu sai là một lần nâng cao điểm số bài thi chính thức!</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
          >
            Đóng sổ tay
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
