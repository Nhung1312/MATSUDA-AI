import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Bot,
  Lightbulb,
  Search,
  BookOpen,
  Send,
  Loader2,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  PenTool,
  Info,
  CheckCircle2,
  Image as ImageIcon,
  Zap,
  Target,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  SocraticContext,
  SocraticHintLevel,
  SocraticMessage,
  VerifyCorrectionResponse,
  RemedialExercise
} from '../types';
import { socraticService } from '../services/socraticService';
import { stepGradingService } from '../services/stepGradingService';
import { useLearningProgressStore } from '../store/useLearningProgressStore';
import { useMistakeVaultStore } from '../store/useMistakeVaultStore';
import { MathDisplay } from './MathDisplay';

interface SocraticTutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: SocraticContext | null;
  savedMessages?: SocraticMessage[];
  savedActiveHintLevel?: SocraticHintLevel | null;
  savedScratchpadText?: string;
  onUpdateQuestionSocraticState?: (state: {
    messages: SocraticMessage[];
    activeHintLevel: SocraticHintLevel | null;
    scratchpadText: string;
  }) => void;
  onHintRequested?: (level: SocraticHintLevel) => void;
  onChatUsed?: () => void;
  onApplyScratchpadToWork?: (text: string) => void;
}

export const SocraticTutorModal: React.FC<SocraticTutorModalProps> = ({
  isOpen,
  onClose,
  context,
  savedMessages,
  savedActiveHintLevel,
  savedScratchpadText,
  onUpdateQuestionSocraticState,
  onHintRequested,
  onChatUsed,
  onApplyScratchpadToWork,
}) => {
  const [messages, setMessages] = useState<SocraticMessage[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Gia sư Socratic đang chuẩn bị gợi mở tư duy...');
  const [activeHintLevel, setActiveHintLevel] = useState<SocraticHintLevel | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Scratchpad (Thử sửa bước này)
  const [scratchpadText, setScratchpadText] = useState('');
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(true);
  const [scratchpadImageBase64, setScratchpadImageBase64] = useState<string | null>(null);
  const [scratchpadImageName, setScratchpadImageName] = useState<string | null>(null);
  const [isVerifyingScratchpad, setIsVerifyingScratchpad] = useState(false);
  const [scratchpadEvalResult, setScratchpadEvalResult] = useState<VerifyCorrectionResponse | null>(null);

  // Remedial (Bài tập củng cố tương tự)
  const [remedialExercise, setRemedialExercise] = useState<RemedialExercise | null>(null);
  const [isGeneratingRemedial, setIsGeneratingRemedial] = useState(false);
  const [showRemedialHint, setShowRemedialHint] = useState(false);
  const [showRemedialSolution, setShowRemedialSolution] = useState(false);
  const [studentRemedialInput, setStudentRemedialInput] = useState('');
  const [remedialFeedback, setRemedialFeedback] = useState<string | null>(null);

  const scratchpadFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom of chat when new messages appear
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Sync state back to parent store
  useEffect(() => {
    if (context?.questionId && onUpdateQuestionSocraticState) {
      onUpdateQuestionSocraticState({
        messages,
        activeHintLevel,
        scratchpadText,
      });
    }
  }, [messages, activeHintLevel, scratchpadText, context?.questionId]);

  // Reset or initialize context when opened or questionId changes
  useEffect(() => {
    if (isOpen && context) {
      setErrorMessage(null);
      setScratchpadEvalResult(null);
      setRemedialExercise(null);
      setRemedialFeedback(null);
      setShowRemedialHint(false);
      setShowRemedialSolution(false);

      if (savedMessages && savedMessages.length > 0) {
        setMessages(savedMessages);
      } else {
        const welcomeText = context.firstErrorStep
          ? `Bắt đầu từ **Bước ${context.firstErrorStep}** — đây là chỗ em cần sửa${context.errorType ? ` (*${context.errorType}*)` : ''}.\n\nHãy chọn **Gợi ý 1** hoặc thử viết lại bước đúng ở khung **Thử sửa bước này**.`
          : `Mình sẽ gợi mở từng bước, không giải hộ.\n\nHãy chọn **Gợi ý 1** hoặc hỏi trực tiếp điều em chưa hiểu.`;

        const welcomeMessage: SocraticMessage = {
          id: 'welcome_' + Date.now(),
          role: 'model',
          text: welcomeText,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages([welcomeMessage]);
      }

      if (savedActiveHintLevel !== undefined) {
        setActiveHintLevel(savedActiveHintLevel);
      } else {
        setActiveHintLevel(null);
      }

      if (savedScratchpadText !== undefined) {
        setScratchpadText(savedScratchpadText);
      } else if (context.studentWork) {
        setScratchpadText('');
      } else {
        setScratchpadText('');
      }
    }
  }, [isOpen, context?.questionId]);

  if (!isOpen || !context) return null;

  // Quick Math Insert Helper
  const handleInsertMathSymbol = (latex: string) => {
    setScratchpadText((prev) => prev + latex);
  };

  // Image Upload for Scratchpad
  const handleScratchpadImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScratchpadImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setScratchpadImageBase64(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Socratic 3-Level Hints
  const handleRequestHint = async (level: SocraticHintLevel) => {
    if (isLoading) return;
    setErrorMessage(null);
    setActiveHintLevel(level);

    const levelTitles: Record<SocraticHintLevel, string> = {
      hint1: '💡 Gợi ý 1 (Nhẹ): Khái niệm & Công thức nền tảng',
      hint2: '🔍 Gợi ý 2 (Vừa): Nút thắt tư duy & Bước biến đổi đầu',
      hint3: '📘 Gợi ý 3 (Sâu): Dẫn dắt từng bước suy luận',
      chat: 'Trao đổi thảo luận',
    };

    const userMessage: SocraticMessage = {
      id: 'user_' + Date.now(),
      role: 'user',
      text: `Em xin Thầy/Cô ${levelTitles[level]}`,
      level,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    if (level === 'hint1') {
      setLoadingText('Đang truy xuất công thức & quy tắc nền tảng...');
    } else if (level === 'hint2') {
      setLoadingText('Đang phân tích nút thắt và hướng biến đổi đầu tiên...');
    } else {
      setLoadingText('Đang soạn gợi ý dẫn dắt chi tiết theo sư phạm...');
    }

    const historyPayload = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    try {
      const response = await socraticService.requestHint({
        level,
        context: {
          ...context,
          studentWork: scratchpadText || context.studentWork,
        },
        chatHistory: historyPayload,
      });

      const modelMessage: SocraticMessage = {
        id: 'model_' + Date.now(),
        role: 'model',
        text: response.reply,
        level,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        isFallback: response.isFallback,
      };

      setMessages((prev) => [...prev, modelMessage]);
      onHintRequested?.(level);
      if (!context.readOnly) {
        try {
          useLearningProgressStore.getState().recordSocraticHintUsed(context.questionId || 'q_socratic', level);
        } catch {}
      }
    } catch (err: any) {
      setErrorMessage('Không thể nhận phản hồi từ Gia sư lúc này. Em hãy bấm thử lại nhé!');
    } finally {
      setIsLoading(false);
    }
  };

  // Custom Socratic Chat Message
  const handleSendCustomMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputMsg.trim();
    if (!query || isLoading) return;

    setInputMsg('');
    setErrorMessage(null);

    const userMessage: SocraticMessage = {
      id: 'user_' + Date.now(),
      role: 'user',
      text: query,
      level: 'chat',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setLoadingText('Gia sư Socratic đang lắng nghe và suy ngẫm...');

    const historyPayload = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    try {
      const response = await socraticService.requestHint({
        level: 'chat',
        context: {
          ...context,
          studentWork: scratchpadText || context.studentWork,
        },
        studentMessage: query,
        chatHistory: historyPayload,
      });

      const modelMessage: SocraticMessage = {
        id: 'model_' + Date.now(),
        role: 'model',
        text: response.reply,
        level: 'chat',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        isFallback: response.isFallback,
      };

      setMessages((prev) => [...prev, modelMessage]);
      onChatUsed?.();
      if (!context.readOnly) {
        try {
          useLearningProgressStore.getState().recordSocraticChatUsed(context.questionId || 'q_socratic');
        } catch {}
      }
    } catch (err: any) {
      setErrorMessage('Có sự cố kết nối khi gửi tin nhắn. Em hãy thử lại nhé!');
    } finally {
      setIsLoading(false);
    }
  };

  // 🎯 Verify Scratchpad / Bước sửa của học sinh
  const handleVerifyScratchpad = async () => {
    const textVal = scratchpadText.trim();
    if (!textVal && !scratchpadImageBase64) {
      setErrorMessage('Vui lòng gõ bước biến đổi làm lại hoặc tải ảnh giấy nháp của em nhé!');
      return;
    }

    setIsVerifyingScratchpad(true);
    setScratchpadEvalResult(null);

    if (!context.readOnly) {
      try {
        useLearningProgressStore.getState().recordStudentSubmittedCorrection(context.questionId || 'q_socratic', context.firstErrorStep || 1);
      } catch {}
    }

    try {
      const result = await stepGradingService.verifyCorrection({
        questionText: context.questionText,
        grade: context.grade || 'THCS',
        topic: context.topic || 'Toán',
        firstErrorStep: context.firstErrorStep || 1,
        firstErrorLatex: context.firstErrorLatex,
        errorType: context.errorType,
        studentCorrection: textVal,
        correctionImage: scratchpadImageBase64 || undefined,
        originalWork: context.studentWork,
      });

      setScratchpadEvalResult(result);

      // Append result to chat dialogue for comprehensive record
      const chatLogText = `**[KẾT QUẢ THỬ SỨC LÀM LẠI]**\n${result.evaluationTitle}\n\n${result.feedback}${
        result.nextAdvice ? `\n\n👉 *Lời khuyên:* ${result.nextAdvice}` : ''
      }`;

      const evalMsg: SocraticMessage = {
        id: 'eval_' + Date.now(),
        role: 'model',
        text: chatLogText,
        level: result.isCorrect ? 'hint1' : 'hint2',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, evalMsg]);

      // Ghi nhận tiến bộ chỉ khi không ở chế độ xem/demo.
      if (!context.readOnly) {
        try {
          useLearningProgressStore.getState().recordCorrectionVerified(context.questionId || 'q_socratic', result.isCorrect, result.isProgress);
        } catch {}
      }

      // Nếu mở từ một MistakeRecord, ghi nhận practice attempt vào Sổ tay câu sai!
      if (!context.readOnly && context.mistakeRecordId) {
        try {
          useMistakeVaultStore.getState().recordPracticeAttempt(context.mistakeRecordId, result.isCorrect, {
            type: 'socratic_correction',
            studentAnswer: textVal || 'Sửa bước qua nháp',
            feedback: `${result.evaluationTitle}: ${result.feedback}`,
            usedTutor: true,
          });
        } catch (e) {
          console.warn('[SocraticTutorModal] recordPracticeAttempt error:', e);
        }
      }

      // If correct and callback provided
      if (result.isCorrect && onApplyScratchpadToWork && textVal) {
        onApplyScratchpadToWork(textVal);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Chưa thể chấm bước sửa lúc này. Em hãy đối chiếu với gợi ý của Gia sư nhé!');
    } finally {
      setIsVerifyingScratchpad(false);
    }
  };

  // Generate Remedial Exercise (Isomorphic Practice)
  const handleGenerateRemedial = async () => {
    if (isGeneratingRemedial) return;
    setIsGeneratingRemedial(true);
    setRemedialFeedback(null);
    setShowRemedialHint(false);
    setShowRemedialSolution(false);

    try {
      const res = await stepGradingService.generateRemedial({
        sourceQuestionId: context.questionId || 'q_socratic',
        sourceQuestionText: context.questionText,
        grade: context.grade || 'THCS',
        topic: context.topic || 'Toán',
        sourceErrorType: context.errorType || 'other',
        sourceFirstErrorStep: context.firstErrorStep || 1,
        skillTarget: context.errorType ? `Khắc phục lỗi ${context.errorType}` : 'Kỹ năng biến đổi chuẩn xác',
        difficulty: 'standard',
        studentMistakeSummary: context.detectedError,
      });

      if (res.success && res.exercise) {
        setRemedialExercise(res.exercise);
        try {
          useLearningProgressStore.getState().recordRemedialExerciseGenerated(
            context.questionId || 'q_socratic',
            res.exercise.id,
            res.exercise.metadata?.skillTarget
          );
          if (context.mistakeRecordId) {
            useMistakeVaultStore.getState().saveRemedialExercise(context.mistakeRecordId, res.exercise);
          }
        } catch {}
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsGeneratingRemedial(false);
    }
  };

  // Check Remedial Answer
  const handleCheckRemedial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!remedialExercise || !studentRemedialInput.trim()) return;

    const normStudent = studentRemedialInput.trim().replace(/\s+/g, '').toLowerCase();
    const normCorrect = remedialExercise.finalAnswer.trim().replace(/\$+/g, '').replace(/\s+/g, '').toLowerCase();
    const isCorrect = normStudent.includes(normCorrect) || normCorrect.includes(normStudent);

    if (isCorrect) {
      setRemedialFeedback('Đúng rồi! Em đã làm được bài tương tự.');
    } else {
      setRemedialFeedback('Chưa khớp. Hãy mở Gợi ý hoặc Lời giải để đối chiếu.');
    }

    try {
      useLearningProgressStore.getState().recordRemedialExerciseCompleted(remedialExercise.id, isCorrect);
      if (context.mistakeRecordId) {
        useMistakeVaultStore.getState().recordPracticeAttempt(context.mistakeRecordId, isCorrect, {
          type: 'remedial_isomorphic',
          studentAnswer: studentRemedialInput.trim(),
          feedback: isCorrect ? 'Làm chủ bài tập tương tự qua Gia sư Socratic' : 'Chưa khớp đáp số bài tập tương tự',
          usedTutor: true
        });
      }
    } catch {}
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs transition-opacity">
      <div className="relative w-full max-w-5xl h-[94vh] sm:h-[90vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col border border-indigo-100 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-slate-100">
        
        {/* ========================================================= */}
        {/* HEADER BAR                                                */}
        {/* ========================================================= */}
        <div className="px-4 py-3 sm:px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-sm sm:text-base tracking-tight">
                  Gia sư AI
                </h3>
              </div>
              <p className="text-[11px] sm:text-xs text-indigo-100/90 font-medium">
                Gợi mở từng bước • Không giải hộ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ========================================================= */}
        {/* BODY CONTAINER: SPLIT VIEW                                */}
        {/* ========================================================= */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* LEFT PANEL: QUESTION CONTEXT, FIRST ERROR & SCRATCHPAD   */}
          <div className="w-full lg:w-[38%] border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 sm:p-4 overflow-y-auto space-y-3 shrink-0">
            
            {/* Question Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400 pb-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Đề bài</span>
                </span>
                {context.grade && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-[10px] font-black text-indigo-700 dark:text-indigo-300">
                    Lớp {context.grade} • {context.topic || 'Toán học'}
                  </span>
                )}
              </div>

              <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                <MathDisplay content={context.questionText} />
              </div>

              {/* Multiple Choice Options if available */}
              {context.answerOptions && context.answerOptions.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Phương án</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                    {context.answerOptions.map((opt) => (
                      <div
                        key={opt.id}
                        className={`p-1.5 rounded-lg border flex items-start gap-1.5 text-xs ${
                          context.studentCurrentAnswer === opt.id
                            ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 font-bold text-indigo-700 dark:text-indigo-300'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                          {opt.id}.
                        </span>
                        <span className="min-w-0 flex-1">
                          <MathDisplay content={opt.text} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Callout: Điểm xuất phát hỗ trợ (Bước sai đầu tiên) */}
              {context.firstErrorStep ? (
                <div className="p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs space-y-1.5">
                  <div className="font-extrabold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Bước cần sửa: {context.firstErrorStep}</span>
                    {context.errorType && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200 font-bold">
                        {context.errorType}
                      </span>
                    )}
                  </div>
                  {context.firstErrorLatex && (
                    <div className="font-mono text-xs p-2 rounded-lg bg-white/70 dark:bg-slate-900/70 border border-rose-200 dark:border-rose-900">
                      <MathDisplay content={context.firstErrorLatex} />
                    </div>
                  )}
                  {context.detectedError && (
                    <div className="text-[11px] text-rose-800 dark:text-rose-300 leading-tight">
                      {context.detectedError}
                    </div>
                  )}
                </div>
              ) : context.detectedError ? (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-bold">Nhận xét:</span> {context.detectedError}
                  </div>
                </div>
              ) : null}
            </div>

            {/* INTERACTIVE SCRATCHPAD: THỬ SỬA BƯỚC NÀY (MATSUDA VERIFIER) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border-2 border-indigo-200 dark:border-indigo-800/80 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsScratchpadOpen(!isScratchpadOpen)}
                  className="flex items-center gap-1.5 text-xs font-black text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 cursor-pointer"
                >
                  <PenTool className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Thử sửa bước này</span>
                </button>
                <span className="text-[11px] text-slate-400 font-medium">
                  {isScratchpadOpen ? '▾ Thu gọn' : '▸ Mở rộng'}
                </span>
              </div>

              {isScratchpadOpen && (
                <div className="space-y-2.5">


                  <details className="text-[11px]">
                    <summary className="cursor-pointer font-bold text-slate-500 hover:text-indigo-600">Ký hiệu Toán</summary>
                    <div className="mt-1.5 flex flex-wrap gap-1 p-1.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                      {[
                        { label: '+', val: ' + ' },
                        { label: '-', val: ' - ' },
                        { label: '·', val: ' \\cdot ' },
                        { label: 'a/b', val: ' \\frac{a}{b} ' },
                        { label: '√x', val: ' \\sqrt{x} ' },
                        { label: 'x²', val: '^2 ' },
                        { label: '≤', val: ' \\le ' },
                        { label: '≥', val: ' \\ge ' },
                        { label: '±', val: ' \\pm ' },
                        { label: 'Δ', val: ' \\Delta ' },
                        { label: '⇔', val: ' \\iff ' },
                        { label: '⇒', val: ' \\implies ' },
                        { label: '(', val: '(' },
                        { label: ')', val: ')' },
                      ].map((sym, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleInsertMathSymbol(sym.val)}
                          className="px-2 py-1 bg-white dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-slate-700 dark:text-slate-200 text-xs font-mono font-bold rounded-md border border-slate-200 dark:border-slate-600 transition-colors shadow-2xs cursor-pointer"
                        >
                          {sym.label}
                        </button>
                      ))}
                    </div>
                  </details>

                  <textarea
                    rows={3}
                    value={scratchpadText}
                    onChange={(e) => setScratchpadText(e.target.value)}
                    placeholder="Viết bước sửa của em..."
                    className="w-full text-xs font-mono p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 resize-none"
                  />

                  {/* Upload photo of scratchpad */}
                  <div className="flex items-center justify-between text-xs">
                    <input
                      ref={scratchpadFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleScratchpadImageChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => scratchpadFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-indigo-600 cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{scratchpadImageName ? `✓ ${scratchpadImageName}` : 'Tải ảnh nháp'}</span>
                    </button>

                    {scratchpadImageBase64 && (
                      <button
                        type="button"
                        onClick={() => {
                          setScratchpadImageBase64(null);
                          setScratchpadImageName(null);
                        }}
                        className="text-[11px] text-rose-500 hover:underline cursor-pointer"
                      >
                        Xóa ảnh
                      </button>
                    )}
                  </div>

                  {/* Verify Action Button */}
                  <button
                    type="button"
                    disabled={isVerifyingScratchpad || (!scratchpadText.trim() && !scratchpadImageBase64)}
                    onClick={handleVerifyScratchpad}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isVerifyingScratchpad ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Đang kiểm tra...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Kiểm tra bước sửa</span>
                      </>
                    )}
                  </button>

                  {/* Verification Result Card */}
                  {scratchpadEvalResult && (
                    <div className={`p-3 rounded-xl border text-xs space-y-1.5 animate-in fade-in duration-200 ${
                      scratchpadEvalResult.isCorrect
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                        : scratchpadEvalResult.isProgress
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                    }`}>
                      <div className="font-extrabold flex items-center gap-1.5">
                        {scratchpadEvalResult.isCorrect ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : scratchpadEvalResult.isProgress ? (
                          <Lightbulb className="w-4 h-4 text-blue-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                        )}
                        <span>{scratchpadEvalResult.evaluationTitle}</span>
                      </div>
                      <div className="leading-relaxed font-medium">
                        <MathDisplay content={scratchpadEvalResult.feedback} />
                      </div>
                      {scratchpadEvalResult.nextAdvice && (
                        <div className="font-bold pt-1 border-t border-black/5 dark:border-white/5">
                          👉 <MathDisplay content={scratchpadEvalResult.nextAdvice} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* REMEDIAL PRACTICE (BÀI TẬP CỦNG CỐ CÙNG DẠNG) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-indigo-600" />
                  <span>Bài tương tự</span>
                </span>
                {!remedialExercise && (
                  <button
                    type="button"
                    disabled={isGeneratingRemedial}
                    onClick={handleGenerateRemedial}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 font-extrabold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {isGeneratingRemedial ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>Tạo bài</span>
                  </button>
                )}
              </div>

              {remedialExercise && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                  <div className="font-extrabold text-indigo-700 dark:text-indigo-300">
                    {remedialExercise.title}
                  </div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    <MathDisplay content={remedialExercise.problemLatex} />
                  </div>

                  <form onSubmit={handleCheckRemedial} className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      value={studentRemedialInput}
                      onChange={(e) => setStudentRemedialInput(e.target.value)}
                      placeholder="Nhập đáp số..."
                      className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs cursor-pointer"
                    >
                      Kiểm tra
                    </button>
                  </form>

                  {remedialFeedback && (
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 text-[11px] font-semibold">
                      {remedialFeedback}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setShowRemedialHint(!showRemedialHint)}
                      className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                    >
                      {showRemedialHint ? 'Ẩn gợi ý' : 'Gợi ý'}
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setShowRemedialSolution(!showRemedialSolution)}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {showRemedialSolution ? 'Ẩn lời giải' : 'Lời giải'}
                    </button>
                  </div>

                  {showRemedialHint && (
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-[11px]">
                      <MathDisplay content={remedialExercise.hint} />
                    </div>
                  )}

                  {showRemedialSolution && (
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/60 text-slate-800 dark:text-slate-200 text-[11px] space-y-1">
                      <div className="font-bold text-indigo-600">Lời giải mẫu:</div>
                      <MathDisplay content={remedialExercise.solutionLatex} />
                      <div className="font-bold text-emerald-600">
                        Đáp số: <MathDisplay content={remedialExercise.finalAnswer} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: SOCRATIC DIALOGUE & 3 HINT BUTTONS        */}
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
            
            {/* 3 Quick Action Hint Buttons Bar (Tư duy Matsuda Scaffolding) */}
            <div className="p-2.5 sm:p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleRequestHint('hint1')}
                className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeHintLevel === 'hint1'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
                } disabled:opacity-50`}
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">Gợi ý 1</span>
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleRequestHint('hint2')}
                className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeHintLevel === 'hint2'
                    ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                    : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/80 text-blue-800 dark:text-blue-300 hover:bg-blue-100'
                } disabled:opacity-50`}
              >
                <Search className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="truncate">Gợi ý 2</span>
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleRequestHint('hint3')}
                className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeHintLevel === 'hint3'
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                    : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/80 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100'
                } disabled:opacity-50`}
              >
                <BookOpen className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">Gợi ý 3</span>
              </button>
            </div>

            {/* Chat Message Scrollable Container */}
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3.5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'model' && (
                    <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-3 sm:p-3.5 text-xs sm:text-sm space-y-2 relative group leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-xs font-medium shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 rounded-tl-xs border border-slate-200/80 dark:border-slate-700/80 shadow-xs'
                    }`}
                  >
                    {/* Badge for Hint Level */}
                    {msg.level && msg.level !== 'chat' && msg.role === 'model' && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                        {msg.level === 'hint1' && 'Gợi ý 1'}
                        {msg.level === 'hint2' && 'Gợi ý 2'}
                        {msg.level === 'hint3' && 'Gợi ý 3'}
                      </div>
                    )}

                    {/* Offline / Rule-based Fallback Badge */}
                    {msg.isFallback && msg.role === 'model' && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>AI tạm gián đoạn • dùng gợi ý dự phòng</span>
                      </div>
                    )}

                    {/* Message Body with KaTeX rendering */}
                    <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm">
                      <MathDisplay content={msg.text} />
                    </div>

                    {/* Copy Button & Timestamp */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/40 dark:border-slate-700/40 text-[10px] text-slate-400">
                      <span>{msg.timestamp}</span>
                      {msg.role === 'model' && (
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.id, msg.text)}
                          className="opacity-70 group-hover:opacity-100 inline-flex items-center gap-1 hover:text-indigo-500 transition-opacity cursor-pointer font-sans"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-600 font-bold">Đã chép</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Chép</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex items-start gap-2.5 justify-start">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 animate-spin" />
                  </div>
                  <div className="p-3 rounded-2xl rounded-tl-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span className="italic">{loadingText}</span>
                  </div>
                </div>
              )}

              {/* Error Alert Box */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRequestHint(activeHintLevel || 'hint1')}
                    className="px-2 py-1 bg-rose-600 text-white rounded-md text-[11px] font-bold hover:bg-rose-700 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Thử lại</span>
                  </button>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Bar */}
            <div className="p-2.5 sm:p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <form onSubmit={handleSendCustomMessage} className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  disabled={isLoading}
                  placeholder="Hỏi về bước em chưa hiểu..."
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputMsg.trim() || isLoading}
                  className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Gửi</span>
                </button>
              </form>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
