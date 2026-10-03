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
  Info
} from 'lucide-react';
import { SocraticContext, SocraticHintLevel, SocraticMessage } from '../types';
import { socraticService } from '../services/socraticService';
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

  // Scratchpad state
  const [scratchpadText, setScratchpadText] = useState('');
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom when messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Sync state back to parent per-question store whenever it updates
  useEffect(() => {
    if (context?.questionId && onUpdateQuestionSocraticState) {
      onUpdateQuestionSocraticState({
        messages,
        activeHintLevel,
        scratchpadText,
      });
    }
  }, [messages, activeHintLevel, scratchpadText, context?.questionId]);

  // Reset or initialize context when opened or when questionId changes
  useEffect(() => {
    if (isOpen && context) {
      setErrorMessage(null);

      // 1. Restore messages for this specific question if available
      if (savedMessages && savedMessages.length > 0) {
        setMessages(savedMessages);
      } else {
        const welcomeText = context.firstErrorStep
          ? `Chào em! Thầy/Cô đã xem bài làm của em. Các bước trước đó em làm rất tốt, tuy nhiên ở **Bước ${context.firstErrorStep}** đang có một chút sơ suất${context.errorType ? ` (${context.errorType})` : ''}.\n\n🎯 **Thầy/Cô sẽ đồng hành cùng em tháo gỡ nút thắt từ đúng bước sai này, không giải lại từ đầu.**\n\n👉 Em hãy bấm **Gợi ý 1** để nhớ lại công thức/quy tắc liên quan nhé!`
          : `Chào em! Thầy/Cô là **Gia sư Socratic AI**. Thầy/Cô sẽ đồng hành cùng em tìm ra phương pháp giải câu hỏi này từng bước một, **không giải hộ để em tự mình rèn luyện tư duy**.\n\n👉 Em hãy bấm **Gợi ý 1** để nhớ lại công thức nền tảng, hoặc gõ thắc mắc cụ thể vào khung trò chuyện bên dưới nhé!`;

        const welcomeMessage: SocraticMessage = {
          id: 'welcome_' + Date.now(),
          role: 'model',
          text: welcomeText,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages([welcomeMessage]);
      }

      // 2. Restore active hint level if previously used for this question
      if (savedActiveHintLevel !== undefined) {
        setActiveHintLevel(savedActiveHintLevel);
      } else {
        setActiveHintLevel(null);
      }

      // 3. Restore scratchpad text
      if (savedScratchpadText !== undefined) {
        setScratchpadText(savedScratchpadText);
      } else if (context.studentWork) {
        setScratchpadText(context.studentWork);
      } else {
        setScratchpadText('');
      }
    }
  }, [isOpen, context?.questionId]);

  if (!isOpen || !context) return null;

  const handleRequestHint = async (level: SocraticHintLevel) => {
    if (isLoading) return;
    setErrorMessage(null);
    setActiveHintLevel(level);

    const levelTitles: Record<SocraticHintLevel, string> = {
      hint1: '💡 Gợi ý 1 (Nhẹ): Công thức & Định lý nền tảng',
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
      setLoadingText('Đang truy xuất kiến thức & công thức nền tảng...');
    } else if (level === 'hint2') {
      setLoadingText('Đang phân tích nút thắt và hướng biến đổi đầu tiên...');
    } else {
      setLoadingText('Đang soạn gợi ý dẫn dắt chi tiết theo sư phạm...');
    }

    // Convert history for API
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
    } catch (err: any) {
      setErrorMessage('Không thể nhận phản hồi từ Gia sư lúc này. Em hãy bấm thử lại nhé!');
    } finally {
      setIsLoading(false);
    }
  };

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
    } catch (err: any) {
      setErrorMessage('Có sự cố kết nối khi gửi tin nhắn. Em hãy thử lại nhé!');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSendScratchpadToTutor = () => {
    if (!scratchpadText.trim()) return;
    const reviewQuery = `Em vừa thử sức làm nháp như sau:\n"${scratchpadText.trim()}"\nThầy/Cô xem giúp em hướng làm này đã đúng chưa và em cần sửa ở đâu ạ?`;
    setInputMsg(reviewQuery);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs transition-opacity">
      <div className="relative w-full max-w-4xl h-[94vh] sm:h-[88vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col border border-indigo-100 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-slate-100">
        
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
                <h3 className="font-extrabold text-sm sm:text-base tracking-tight flex items-center gap-1.5">
                  Gia sư Socratic AI
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wider">
                    Gợi mở 1-chạm
                  </span>
                </h3>
              </div>
              <p className="text-[11px] sm:text-xs text-indigo-100/90 font-medium">
                Dẫn dắt tư duy từng bước • Không giải bài hộ • Tự tin làm chủ Toán học
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
        {/* BODY CONTAINER (SPLIT / STACK VIEW)                       */}
        {/* ========================================================= */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* LEFT PANEL: QUESTION CONTEXT & SCRATCHPAD                */}
          <div className="w-full lg:w-[38%] border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 sm:p-4 overflow-y-auto space-y-3 shrink-0">
            
            {/* Question Card */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 sm:p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400 pb-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Câu hỏi đang giải</span>
                </span>
                {context.grade && (
                  <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/80 text-[10px]">
                    Lớp {context.grade}
                  </span>
                )}
              </div>

              {/* Render Question Text with KaTeX */}
              <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                <MathDisplay content={context.questionText} />
              </div>

              {/* Multiple Choice Options if available */}
              {context.answerOptions && context.answerOptions.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Phương án:</div>
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

              {/* First error banner if available */}
              {context.firstErrorStep && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs space-y-1">
                  <div className="font-extrabold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Nút thắt cần gỡ: Bước {context.firstErrorStep}</span>
                  </div>
                  {context.firstErrorLatex && (
                    <div className="font-mono text-[11px] p-1.5 rounded bg-white/60 dark:bg-slate-900/60 border border-rose-200 dark:border-rose-900">
                      <MathDisplay content={context.firstErrorLatex} />
                    </div>
                  )}
                </div>
              )}

              {/* Existing Detected Error if available */}
              {context.detectedError && !context.firstErrorStep && (
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-bold">Lưu ý lỗi trước đó:</span> {context.detectedError}
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Scratchpad Toggle & Box */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsScratchpadOpen(!isScratchpadOpen)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                >
                  <PenTool className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Bảng nháp thử sức tại chỗ</span>
                </button>
                <span className="text-[11px] text-slate-400 font-medium">
                  {isScratchpadOpen ? 'Đang mở' : 'Nhấn để mở'}
                </span>
              </div>

              {isScratchpadOpen && (
                <div className="space-y-2 pt-1">
                  <textarea
                    rows={4}
                    value={scratchpadText}
                    onChange={(e) => setScratchpadText(e.target.value)}
                    placeholder="Gõ các bước biến đổi thử lại của em tại đây (VD: Bước 1: 2x - 4 = 0 => 2x = 4...)..."
                    className="w-full text-xs font-mono p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:text-slate-400 resize-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleSendScratchpadToTutor}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      <span>Nhờ Gia sư nhận xét nháp</span>
                    </button>
                    {onApplyScratchpadToWork && scratchpadText.trim() && (
                      <button
                        type="button"
                        onClick={() => onApplyScratchpadToWork(scratchpadText)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer"
                      >
                        Lưu vào bài làm
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Socratic Tip Banner */}
            <div className="p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-900 dark:text-blue-300 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Phương pháp tư duy Socratic:</span>
              </div>
              <p className="leading-relaxed text-blue-800/90 dark:text-blue-300/90">
                Hãy bắt đầu từ <strong>Gợi ý 1</strong> để nhớ lại công thức. Chỉ mở tiếp <strong>Gợi ý 2 &amp; 3</strong> khi thật sự cần thiết để não bộ tự rèn luyện phản xạ toán học!
              </p>
            </div>
          </div>

          {/* RIGHT PANEL: SOCRATIC DIALOGUE & 3 HINT BUTTONS        */}
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
            
            {/* 3 Quick Action Hint Buttons Bar */}
            <div className="p-2.5 sm:p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleRequestHint('hint1')}
                className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeHintLevel === 'hint1'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
                } disabled:opacity-50`}
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">Gợi ý 1 (Nhẹ)</span>
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleRequestHint('hint2')}
                className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeHintLevel === 'hint2'
                    ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                    : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/80 text-blue-800 dark:text-blue-300 hover:bg-blue-100'
                } disabled:opacity-50`}
              >
                <Search className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="truncate">Gợi ý 2 (Vừa)</span>
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleRequestHint('hint3')}
                className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeHintLevel === 'hint3'
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                    : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/80 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100'
                } disabled:opacity-50`}
              >
                <BookOpen className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">Gợi ý 3 (Sâu)</span>
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
                        {msg.level === 'hint1' && '💡 Gợi ý 1: Công thức & Định lý'}
                        {msg.level === 'hint2' && '🔍 Gợi ý 2: Nút thắt tư duy'}
                        {msg.level === 'hint3' && '📘 Gợi ý 3: Dẫn dắt chi tiết'}
                      </div>
                    )}

                    {/* Offline / Rule-based Fallback Badge (Tuân thủ Mục VII) */}
                    {msg.isFallback && msg.role === 'model' && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>Chế độ Sư phạm Ngoại tuyến (Server AI tạm gián đoạn)</span>
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
                              <span>Sao chép</span>
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
                  placeholder="Gõ câu hỏi hoặc trao đổi cùng Gia sư AI (VD: Bước tiếp theo làm thế nào ạ?)..."
                  className="flex-1 px-3.5 py-2 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputMsg.trim() || isLoading}
                  className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
