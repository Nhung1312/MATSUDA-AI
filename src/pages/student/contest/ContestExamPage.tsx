import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Contest, 
  Question, 
  ContestSubmission, 
  ViolationEvent 
} from '../../../types';
import { FirestoreService } from '../../../services/firestoreService';
import { StorageService } from '../../../services/storageService';
import { GradingService } from '../../../services/gradingService';
import { shuffleContestQuestions, getContestStatus } from '../../../utils/contestUtils';
import { MathDisplay } from '../../../components/MathDisplay';
import { isEssayQuestion, getQuestionTypeLabel } from '../../../utils/questionUtils';
import { ScientificCalculatorModal } from '../../../components/ScientificCalculatorModal';
import { DigitalScratchpadModal } from '../../../components/DigitalScratchpadModal';
import { compressImage } from '../../../utils/antiCheatUtils';
import { 
  Trophy, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Send, 
  Calculator, 
  Edit, 
  Camera, 
  Upload, 
  Trash2, 
  Eye, 
  Flag, 
  ChevronLeft, 
  ChevronRight, 
  HelpCircle,
  ShieldAlert,
  Save,
  Sparkles
} from 'lucide-react';

export const ContestExamPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  // Student info
  const studentName = localStorage.getItem('toan_thcs_student_name') || '';
  const studentClass = localStorage.getItem('toan_thcs_student_class') || '';

  const [contest, setContest] = useState<Contest | null>(null);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Student answers state
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [solutions, setSolutions] = useState<Record<string, string>>({});
  const [essayImages, setEssayImages] = useState<Record<string, string[]>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({});

  // Timing state
  const [startTimeStr, setStartTimeStr] = useState<string>('');
  const [totalSecondsRemaining, setTotalSecondsRemaining] = useState<number>(0);
  const timerRef = useRef<any>(null);

  // Anti-cheat state
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [violationEvents, setViolationEvents] = useState<ViolationEvent[]>([]);
  const [showViolationWarning, setShowViolationWarning] = useState<boolean>(false);
  const isFilePickerActiveRef = useRef<boolean>(false);

  // Utility tools
  const [showCalculator, setShowCalculator] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef<boolean>(false);
  const effectiveEndMsRef = useRef<number>(0);
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // Draft Key
  const draftKey = `contest_draft_${code}_${studentName}_${studentClass}`;

  // 1. Initial Load & Setup
  useEffect(() => {
    if (!studentName || !studentClass) {
      navigate(`/contest/${code}`);
      return;
    }
    loadContestAndDraft();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [code]);

  const loadContestAndDraft = async () => {
    try {
      if (!code) return;
      const found = await FirestoreService.getContestByCode(code);
      if (!found) {
        alert('Không tìm thấy cuộc thi!');
        navigate('/');
        return;
      }

      // Kiểm tra trạng thái cuộc thi
      const contestStatus = getContestStatus(found);
      if (contestStatus === 'ended') {
        alert('Cuộc thi này đã kết thúc thời gian thi!');
        navigate(`/contest/${code}/ranking`);
        return;
      }

      setContest(found);

      // Kiểm tra xem đã có bài nộp trước đó chưa
      const existingSubs = StorageService.getContestSubmissions(found.id);
      const studentKey = `${studentName.trim()}_${studentClass.trim()}`.toLowerCase();
      const hasDone = existingSubs.some(s => `${s.studentName.trim()}_${s.studentClass.trim()}`.toLowerCase() === studentKey);
      if (hasDone && found.maxAttempts === 1) {
        alert('Em đã nộp bài cho cuộc thi này rồi!');
        navigate(`/contest/${code}/ranking`);
        return;
      }

      // Kiểm tra draft đã lưu trước đó
      const localDraftRaw = localStorage.getItem(draftKey);
      let draftData = localDraftRaw ? JSON.parse(localDraftRaw) : null;

      let startedAt: string;
      let preparedQuestions: Question[];

      if (draftData && draftData.startedAt && draftData.examQuestions) {
        // Khôi phục từ draft
        startedAt = draftData.startedAt;
        preparedQuestions = draftData.examQuestions;
        setAnswers(draftData.answers || {});
        setSolutions(draftData.solutions || {});
        setEssayImages(draftData.essayImages || {});
        setFlaggedQuestions(draftData.flagged || {});
        setTabSwitchCount(draftData.tabSwitchCount || 0);
        setViolationEvents(draftData.violationEvents || []);
      } else {
        // Lượt thi mới
        startedAt = new Date().toISOString();
        preparedQuestions = shuffleContestQuestions(
          found.questions,
          found.shuffleQuestions,
          found.shuffleOptions
        );

        // Lưu ngay bản ghi khởi tạo ban đầu để refresh trang không bị reset startedAt
        const initialDraft = {
          contestId: found.id,
          contestCode: found.code,
          studentName,
          studentClass,
          startedAt,
          examQuestions: preparedQuestions,
          answers: {},
          solutions: {},
          essayImages: {},
          flagged: {},
          tabSwitchCount: 0,
          violationEvents: [],
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(draftKey, JSON.stringify(initialDraft));
      }

      setStartTimeStr(startedAt);
      setExamQuestions(preparedQuestions);

      // Tính số giây còn lại dựa trên thời lượng và thời hạn đóng cuộc thi
      const startMs = new Date(startedAt).getTime();
      const durationEndMs = startMs + found.durationMinutes * 60 * 1000;
      const contestEndMs = found.endTime ? new Date(found.endTime).getTime() : durationEndMs;
      const effectiveEndMs = Math.min(durationEndMs, contestEndMs);
      effectiveEndMsRef.current = effectiveEndMs;

      const remainingSeconds = Math.max(0, Math.floor((effectiveEndMs - Date.now()) / 1000));
      setTotalSecondsRemaining(remainingSeconds);

      if (remainingSeconds <= 0) {
        // Đã quá giờ
        handleAutoSubmit(found, preparedQuestions, draftData?.answers || {}, draftData?.solutions || {}, draftData?.essayImages || {}, startedAt);
      } else {
        startTimer(effectiveEndMs);
      }
    } catch (e) {
      console.error(e);
      alert('Lỗi tải cuộc thi: ' + String(e));
    }
  };

  // 2. Timer Loop dựa trên đồng hồ thực tế (chống tua giờ, chống sleep/throttle trình duyệt)
  const startTimer = (targetEndMs: number) => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((targetEndMs - Date.now()) / 1000));
      setTotalSecondsRemaining(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 1000);
  };

  // Theo dõi khi hết giờ -> tự động nộp bài
  useEffect(() => {
    if (totalSecondsRemaining === 0 && contest && examQuestions.length > 0 && !isSubmittingRef.current) {
      handleAutoSubmit(contest, examQuestions, answers, solutions, essayImages, startTimeStr);
    }
  }, [totalSecondsRemaining]);

  // 3. Giám sát gian lận (Anti-cheat)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (isFilePickerActiveRef.current) return;

      if (document.hidden) {
        recordViolation('Rời khỏi màn hình làm bài thi');
      }
    };

    const handleWindowBlur = () => {
      if (isFilePickerActiveRef.current) return;
      recordViolation('Chuyển sang ứng dụng hoặc tab khác');
    };

    const recordViolation = (reason: string) => {
      setTabSwitchCount(prev => {
        const next = prev + 1;
        setShowViolationWarning(true);
        return next;
      });

      setViolationEvents(prev => [
        ...prev,
        {
          type: 'TAB_SWITCH',
          timestamp: new Date().toISOString(),
          durationSeconds: 1
        }
      ]);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  // 4. Tự động lưu nháp (Auto-save)
  const saveDraft = useCallback(() => {
    if (!contest || examQuestions.length === 0) return;

    const draft = {
      contestId: contest.id,
      contestCode: contest.code,
      studentName,
      studentClass,
      startedAt: startTimeStr,
      examQuestions,
      answers,
      solutions,
      essayImages,
      flagged: flaggedQuestions,
      tabSwitchCount,
      violationEvents,
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(draftKey, JSON.stringify(draft));
    setLastSavedTime(new Date().toLocaleTimeString('vi-VN'));

    // Lưu Firestore Draft (Debounced ngầm)
    FirestoreService.saveContestDraft(contest.id, studentName, draft).catch(err => {
      console.warn('Lưu Firestore draft thất bại:', err);
    });
  }, [contest, examQuestions, answers, solutions, essayImages, flaggedQuestions, tabSwitchCount, violationEvents, startTimeStr, draftKey]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      saveDraft();
    }, 2000);
    return () => clearTimeout(timeout);
  }, [answers, solutions, essayImages, flaggedQuestions]);

  // 5. Thao tác trả lời
  const handleSelectAnswer = (questionId: string, optionId: string) => {
    if (totalSecondsRemaining <= 0 || isSubmitting || isSubmittingRef.current) return;
    setAnswers(prev => ({
      ...prev,
      [questionId]: optionId
    }));
  };

  const handleSolutionTextChange = (questionId: string, text: string) => {
    if (totalSecondsRemaining <= 0 || isSubmitting || isSubmittingRef.current) return;
    setSolutions(prev => ({
      ...prev,
      [questionId]: text
    }));
  };

  const handleToggleFlag = (questionId: string) => {
    setFlaggedQuestions(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  // Tải ảnh tự luận
  const handleUploadEssayImage = async (questionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (totalSecondsRemaining <= 0 || isSubmitting || isSubmittingRef.current) return;
    isFilePickerActiveRef.current = true;
    setTimeout(() => {
      isFilePickerActiveRef.current = false;
    }, 5000);

    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const file = files[0];
      const compressed = await compressImage(file, 1200, 0.75);
      setEssayImages(prev => ({
        ...prev,
        [questionId]: [...(prev[questionId] || []), compressed]
      }));
    } catch (err) {
      alert('Không thể tải ảnh: ' + String(err));
    } finally {
      e.target.value = '';
    }
  };

  const handleRemoveEssayImage = (questionId: string, imgIdx: number) => {
    if (totalSecondsRemaining <= 0 || isSubmitting || isSubmittingRef.current) return;
    setEssayImages(prev => ({
      ...prev,
      [questionId]: (prev[questionId] || []).filter((_, idx) => idx !== imgIdx)
    }));
  };

  // Chèn ký hiệu Toán nhanh vào bài tự luận
  const handleInsertMathSymbol = (questionId: string, symbol: string) => {
    if (totalSecondsRemaining <= 0 || isSubmitting || isSubmittingRef.current) return;
    const cur = solutions[questionId] || '';
    setSolutions(prev => ({
      ...prev,
      [questionId]: cur + symbol
    }));
  };

  // 6. Nộp bài
  const handleAutoSubmit = async (
    c: Contest,
    qList: Question[],
    ans: Record<string, string>,
    sol: Record<string, string>,
    imgs: Record<string, string[]>,
    started: string
  ) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const submittedAt = new Date().toISOString();
      const submission = GradingService.gradeContestSubmission({
        contest: { ...c, questions: qList },
        studentAnswers: ans,
        studentSolutions: sol,
        essayImagesByQuestion: imgs,
        studentName,
        studentClass,
        startedAt: started || new Date().toISOString(),
        submittedAt,
        tabSwitchCount,
        violationEvents,
        isShuffled: c.shuffleQuestions || c.shuffleOptions
      });

      // Lưu Local & Firestore
      StorageService.saveContestSubmission(submission);
      await FirestoreService.saveContestSubmission(submission);

      // Xóa draft
      localStorage.removeItem(draftKey);

      navigate(`/contest/${c.code}/result/${submission.id}`);
    } catch (e) {
      console.error(e);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      alert('Lỗi khi nộp bài: ' + String(e));
    }
  };

  const handleManualSubmit = async () => {
    if (!contest || examQuestions.length === 0 || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const submittedAt = new Date().toISOString();
      const submission = GradingService.gradeContestSubmission({
        contest: { ...contest, questions: examQuestions },
        studentAnswers: answers,
        studentSolutions: solutions,
        essayImagesByQuestion: essayImages,
        studentName,
        studentClass,
        startedAt: startTimeStr || new Date().toISOString(),
        submittedAt,
        tabSwitchCount,
        violationEvents,
        isShuffled: contest.shuffleQuestions || contest.shuffleOptions
      });

      StorageService.saveContestSubmission(submission);
      await FirestoreService.saveContestSubmission(submission);

      localStorage.removeItem(draftKey);
      navigate(`/contest/${contest.code}/result/${submission.id}`);
    } catch (e) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      alert('Nộp bài gặp sự cố: ' + String(e));
    }
  };

  // Đếm số câu chưa làm
  const unansweredCount = examQuestions.filter(q => {
    const isEssay = isEssayQuestion(q);
    if (isEssay) {
      const txt = (solutions[q.id] || '').trim();
      const imgs = essayImages[q.id] || [];
      return !txt && imgs.length === 0;
    }
    return !(answers[q.id] || '').trim();
  }).length;

  // Format timer text
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentQ = examQuestions[currentIndex];
  const isCurrentEssay = currentQ ? isEssayQuestion(currentQ) : false;

  // Cảnh báo màu thời gian
  const isTimerCritical = totalSecondsRemaining <= 60; // < 1 min
  const isTimerWarning = totalSecondsRemaining <= 300; // < 5 min

  if (!contest || examQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-white text-center space-y-3">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold">Đang chuẩn bị đề thi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col select-none">
      {/* 1. TOP BAR */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between shadow-xs">
        {/* Info Left */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black shadow-xs">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-xs sm:text-sm font-black truncate max-w-xs md:max-w-md">
              {contest.title}
            </h1>
            <p className="text-[11px] text-slate-500">
              Thí sinh: <strong className="text-slate-800 dark:text-slate-200">{studentName}</strong> • Lớp {studentClass}
            </p>
          </div>
        </div>

        {/* TIMER CENTER */}
        <div className={`flex items-center space-x-2 px-4 py-1.5 rounded-2xl font-mono text-base sm:text-lg font-black tracking-wider transition-colors shadow-2xs ${
          isTimerCritical 
            ? 'bg-rose-600 text-white animate-pulse' 
            : isTimerWarning 
            ? 'bg-amber-500 text-white' 
            : 'bg-slate-900 dark:bg-slate-800 text-white'
        }`}>
          <Clock className="w-4 h-4" />
          <span>{formatTimer(totalSecondsRemaining)}</span>
        </div>

        {/* Tools & Submit Right */}
        <div className="flex items-center space-x-2">
          {/* Scientific Calculator */}
          <button
            onClick={() => setShowCalculator(true)}
            title="Máy tính bỏ túi"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            <Calculator className="w-4 h-4" />
          </button>

          {/* Scratchpad */}
          <button
            onClick={() => setShowScratchpad(true)}
            title="Bảng vẽ nháp"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>

          {/* Submit Button */}
          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Nộp bài</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* LEFT / CENTER: ACTIVE QUESTION DISPLAY (3 Columns) */}
        <div className="lg:col-span-3 flex flex-col space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-xs flex-1 flex flex-col justify-between">
            {/* Question Header */}
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <span className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 font-black text-sm flex items-center justify-center">
                    {currentIndex + 1}
                  </span>
                  <div>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                      Câu {currentIndex + 1} / {examQuestions.length}
                    </span>
                    <span className="ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {getQuestionTypeLabel(currentQ.type)} • {currentQ.points || 1}đ
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleToggleFlag(currentQ.id)}
                  className={`flex items-center space-x-1 px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                    flaggedQuestions[currentQ.id]
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>{flaggedQuestions[currentQ.id] ? 'Đã đánh dấu xem lại' : 'Đánh dấu'}</span>
                </button>
              </div>

              {/* Question Text with KaTeX */}
              <div className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-relaxed py-2">
                <MathDisplay content={currentQ.question} />
                {currentQ.imageUrl && (
                  <div className="my-3 flex justify-center">
                    <img 
                      src={currentQ.imageUrl} 
                      alt="Hình vẽ câu hỏi" 
                      className="max-h-72 max-w-full object-contain rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs" 
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ANSWER INPUT SECTION */}
            <div className="py-6">
              {/* TYPE 1: MULTIPLE CHOICE */}
              {currentQ.type === 'multiple_choice' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentQ.options?.map((opt) => {
                    const isSelected = (answers[currentQ.id] || '').toUpperCase() === opt.id.toUpperCase();
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={totalSecondsRemaining <= 0 || isSubmitting}
                        onClick={() => handleSelectAnswer(currentQ.id, opt.id)}
                        className={`p-4 rounded-2xl border text-left flex items-start space-x-3 transition-all ${
                          totalSecondsRemaining <= 0 || isSubmitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'bg-orange-50/80 dark:bg-orange-950/40 border-orange-500 dark:border-orange-500 shadow-xs ring-2 ring-orange-500/20'
                            : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-orange-600 text-white'
                            : 'bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                        }`}>
                          {opt.id}
                        </span>
                        <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 pt-0.5 leading-normal">
                          <MathDisplay content={opt.text} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* TYPE 2: TRUE / FALSE */}
              {currentQ.type === 'true_false' && (
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  {['A', 'B'].map((val) => {
                    const label = val === 'A' ? 'Đúng' : 'Sai';
                    const isSelected = (answers[currentQ.id] || '').toUpperCase() === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        disabled={totalSecondsRemaining <= 0 || isSubmitting}
                        onClick={() => handleSelectAnswer(currentQ.id, val)}
                        className={`p-4 rounded-2xl border font-black text-base transition-all flex items-center justify-center space-x-2 ${
                          totalSecondsRemaining <= 0 || isSubmitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          isSelected
                            ? val === 'A'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                              : 'bg-rose-600 text-white border-rose-600 shadow-md'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <span>{val === 'A' ? '✓' : '✗'}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* TYPE 3: SHORT ANSWER */}
              {currentQ.type === 'short_answer' && (
                <div className="max-w-md mx-auto space-y-2">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                    Nhập câu trả lời ngắn (số hoặc kết quả):
                  </label>
                  <input
                    type="text"
                    disabled={totalSecondsRemaining <= 0 || isSubmitting}
                    value={answers[currentQ.id] || ''}
                    onChange={(e) => handleSelectAnswer(currentQ.id, e.target.value)}
                    placeholder="Ví dụ: 12, 3/4, -5..."
                    className="w-full px-4 py-3 text-sm font-bold font-mono rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-orange-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              )}

              {/* TYPE 4: ESSAY (TỰ LUẬN) */}
              {isCurrentEssay && (
                <div className="space-y-4">
                  {/* Math Symbols Toolbar */}
                  <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-xs">
                    <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Chèn nhanh:</span>
                    {['\\sqrt{x}', '\\frac{a}{b}', 'x^2', '\\pi', '\\le', '\\ge', '\\ne', '\\Delta', '\\alpha'].map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        disabled={totalSecondsRemaining <= 0 || isSubmitting}
                        onClick={() => handleInsertMathSymbol(currentQ.id, `$${sym}$`)}
                        className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-orange-100 dark:hover:bg-orange-950 font-mono text-[11px] shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <MathDisplay content={`$${sym}$`} />
                      </button>
                    ))}
                  </div>

                  {/* Solution Textarea */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nhập lời giải tự luận:
                    </label>
                    <textarea
                      rows={5}
                      disabled={totalSecondsRemaining <= 0 || isSubmitting}
                      value={solutions[currentQ.id] || ''}
                      onChange={(e) => handleSolutionTextChange(currentQ.id, e.target.value)}
                      placeholder="Gõ các bước biến đổi, lập luận hoặc giải thích của em..."
                      className="w-full p-3.5 text-xs sm:text-sm font-mono rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Upload Image Section */}
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                        <Camera className="w-4 h-4 text-orange-500" />
                        <span>Chụp / Tải ảnh bài làm viết tay:</span>
                      </span>

                      <label className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-2xs ${
                        totalSecondsRemaining <= 0 || isSubmitting ? 'opacity-60 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
                      }`}>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Tải ảnh lên</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={totalSecondsRemaining <= 0 || isSubmitting}
                          capture="environment"
                          onChange={(e) => handleUploadEssayImage(currentQ.id, e)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Preview Uploaded Images */}
                    {essayImages[currentQ.id] && essayImages[currentQ.id].length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {essayImages[currentQ.id].map((imgUrl, imgIdx) => (
                          <div key={imgIdx} className="relative group">
                            <img
                              src={imgUrl}
                              alt="Bài làm"
                              className="w-20 h-20 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                            />
                            {totalSecondsRemaining > 0 && !isSubmitting && (
                              <button
                                type="button"
                                onClick={() => handleRemoveEssayImage(currentQ.id, imgIdx)}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        Em có thể viết ra giấy nháp rồi chụp ảnh đính kèm vào đây (tự động nén dung lượng cao).
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Nav Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={currentIndex === 0 || !contest.allowGoBack}
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                className="flex items-center space-x-1 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Câu trước</span>
              </button>

              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Tự động lưu {lastSavedTime && `lúc ${lastSavedTime}`}
              </span>

              <button
                type="button"
                disabled={currentIndex === examQuestions.length - 1}
                onClick={() => setCurrentIndex(prev => Math.min(examQuestions.length - 1, prev + 1))}
                className="flex items-center space-x-1 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <span>Câu tiếp theo</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: QUESTION MATRIX (1 Column) */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Danh sách câu hỏi
              </h3>
              <span className="text-[11px] text-orange-600 dark:text-orange-400 font-bold">
                {examQuestions.length - unansweredCount}/{examQuestions.length} đã làm
              </span>
            </div>

            {/* Matrix Grid */}
            <div className="grid grid-cols-5 gap-2">
              {examQuestions.map((q, idx) => {
                const isEssay = isEssayQuestion(q);
                const hasAnswer = isEssay
                  ? !!(solutions[q.id]?.trim() || essayImages[q.id]?.length)
                  : !!answers[q.id]?.trim();
                const isCurrent = idx === currentIndex;
                const isFlagged = flaggedQuestions[q.id];

                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={!contest.allowGoBack && idx < currentIndex}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-xl font-bold text-xs flex items-center justify-center relative transition-all cursor-pointer ${
                      isCurrent
                        ? 'ring-2 ring-orange-500 bg-orange-600 text-white font-black shadow-xs'
                        : hasAnswer
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{idx + 1}</span>
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Matrix Legend */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[10px] text-slate-500">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-md bg-emerald-500" />
                <span>Đã trả lời</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-md bg-slate-200 dark:bg-slate-700" />
                <span>Chưa làm</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-md bg-amber-500" />
                <span>Đánh dấu xem lại</span>
              </div>
            </div>

            {/* Action Submit */}
            <button
              onClick={() => setShowSubmitConfirm(true)}
              className="w-full py-3 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>NỘP BÀI THI</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL XÁC NHẬN NỘP BÀI */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-950/70 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto">
              <Send className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Xác nhận nộp bài thi?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Sau khi nộp, em sẽ không thể chỉnh sửa bài làm của mình nữa.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1.5 text-left">
              <div className="flex justify-between">
                <span className="text-slate-500">Tổng số câu hỏi:</span>
                <strong className="text-slate-800 dark:text-slate-200">{examQuestions.length} câu</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Số câu đã hoàn thành:</span>
                <strong className="text-emerald-600">{examQuestions.length - unansweredCount} câu</strong>
              </div>
              {unansweredCount > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>Số câu CHƯA làm:</span>
                  <span>{unansweredCount} câu</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors"
              >
                Tiếp tục làm bài
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleManualSubmit}
                className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Đang nộp...' : 'Đồng ý nộp bài'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CẢNH BÁO VI PHẠM GIAN LẬN */}
      {showViolationWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full border-2 border-rose-500 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h3 className="text-base font-black text-rose-600">CẢNH BÁO VI PHẠM!</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Em vừa rời khỏi màn hình làm bài thi. Số lần vi phạm hiện tại:{' '}
                <strong className="text-rose-600 font-bold">{tabSwitchCount} lần</strong>.
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                Hành vi này được ghi nhận trực tiếp vào bài thi để Thầy/Cô giám sát.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowViolationWarning(false)}
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md"
            >
              Tôi đã hiểu và quay lại làm bài
            </button>
          </div>
        </div>
      )}

      {/* CALCULATOR MODAL */}
      <ScientificCalculatorModal
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        isExamMode={true}
      />

      {/* SCRATCHPAD MODAL */}
      <DigitalScratchpadModal
        isOpen={showScratchpad}
        onClose={() => setShowScratchpad(false)}
        title={`Bảng nháp thi • ${contest.title}`}
      />
    </div>
  );
};
