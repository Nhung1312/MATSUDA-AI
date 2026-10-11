import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, 
  FileSpreadsheet, 
  FileType, 
  UploadCloud, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  FileCheck, 
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Camera,
  ExternalLink
} from 'lucide-react';
import { FileParserService, ParsedItem, ParseResult } from '../services/fileParserService';
import { aiService } from '../services/aiService';
import { Question } from '../types';
import { MathDisplay } from './MathDisplay';
import { auditNewMediaQuestions } from '../utils/mediaImportGuard';
import type { MediaImportIssue } from '../utils/mediaImportGuard';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportQuestions: (questions: Question[]) => void;
  initialTab?: 'pdf' | 'image' | 'file';
  defaultGrade?: string;
}

interface StoredImage {
  id: string;
  base64: string;
  mimeType: string;
  name: string;
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({
  isOpen,
  onClose,
  onImportQuestions,
  initialTab = 'pdf',
  defaultGrade = '8'
}) => {
  const [activeTab, setActiveTab] = useState<'pdf' | 'image' | 'file'>(initialTab);
  const [selectedGrade, setSelectedGrade] = useState<string>(defaultGrade);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [aiProgressStatus, setAiProgressStatus] = useState<string>('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  // Audit NEW Gemini PDF imports only; does not touch stored assignments.
  const [aiPdfIssues, setAiPdfIssues] = useState<MediaImportIssue[]>([]);
  const [filterCategory, setFilterCategory] = useState<'all' | 'trac_nghiem' | 'tu_luan'>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTakingLong, setIsTakingLong] = useState(false);

  // Gemini API Key State
  const [hasApiKey, setHasApiKey] = useState<boolean>(aiService.hasApiKey());
  const [apiKeyInput, setApiKeyInput] = useState<string>(aiService.getApiKey() || '');
  const [showKeyInput, setShowKeyInput] = useState<boolean>(!aiService.hasApiKey());
  const [keySavedMessage, setKeySavedMessage] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(aiService.getModel() || 'gemini-3.1-flash-lite');
  const [pdfParseMode, setPdfParseMode] = useState<'ai' | 'standard'>(aiService.hasApiKey() ? 'ai' : 'standard');

  // Image Paste & Upload State
  const [pastedImages, setPastedImages] = useState<StoredImage[]>([]);
  const [previewingImage, setPreviewingImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const toFriendlyAiError = (err: any, fallback: string) => {
    const raw = String(err?.message || err || '').toLowerCase();
    if (raw.includes('429') || raw.includes('resource_exhausted') || raw.includes('quota')) {
      return 'AI đang hết lượt hoặc quá tải. Hãy chờ một lúc rồi thử lại.';
    }
    if (raw.includes('503') || raw.includes('unavailable') || raw.includes('overloaded')) {
      return 'AI đang tạm bận. Hãy thử lại sau ít phút.';
    }
    if (raw.includes('network') || raw.includes('failed to fetch') || raw.includes('fetch')) {
      return 'Không kết nối được tới AI. Kiểm tra mạng rồi thử lại.';
    }
    return fallback;
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      const keyExists = aiService.hasApiKey();
      setHasApiKey(keyExists);
      setPdfParseMode(keyExists ? 'ai' : 'standard');
      setApiKeyInput(aiService.getApiKey() || '');
      setSelectedModel(aiService.getModel() || 'gemini-3.1-flash-lite');
      setShowKeyInput(!keyExists);
      setErrorMsg(null);
      setAiPdfIssues([]);
      setKeySavedMessage(null);
    } else {
      setParseResult(null);
      setAiPdfIssues([]);
      setPastedImages([]);
      setIsLoading(false);
      setPreviewingImage(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isLoading) {
      setIsTakingLong(false);
      return;
    }
    const timer = window.setTimeout(() => setIsTakingLong(true), 15000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  // Global Paste Listener for Clipboard Images (Ctrl + V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            setActiveTab('image');
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              if (base64) {
                setPastedImages(prev => [
                  ...prev,
                  {
                    id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    base64,
                    mimeType: file.type || 'image/png',
                    name: `Ảnh dán ${prev.length + 1} (${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`
                  }
                ]);
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Saving Gemini API Key
  const handleSaveApiKey = () => {
    if (!apiKeyInput.trim()) {
      aiService.clearApiKey();
      setHasApiKey(false);
      setKeySavedMessage('Đã xóa API Key.');
      return;
    }
    aiService.setApiKey(apiKeyInput.trim());
    setHasApiKey(true);
    setShowKeyInput(false);
    setKeySavedMessage('Đã lưu API Key thành công!');
    setTimeout(() => setKeySavedMessage(null), 3000);
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // 1. PROCESS PDF FILE WITH GEMINI AI
  const handleProcessPdfWithAI = async (file: File) => {
    const currentKey = apiKeyInput.trim() || aiService.getApiKey();
    if (!currentKey) {
      setShowKeyInput(true);
      setErrorMsg('Vui lòng nhập Gemini API Key để AI bóc tách đề thi PDF và nhận diện công thức toán.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setAiProgressStatus('Đang nạp file PDF...');

    try {
      const base64Data = await fileToBase64(file);
      setAiProgressStatus('Đang gửi file sang Gemini 3.8 Flash để nhận diện câu hỏi & công thức...');

      const result = await aiService.extractQuestionsFromMedia({
        media: [
          {
            base64Data,
            mimeType: 'application/pdf',
            fileName: file.name
          }
        ],
        fileName: file.name,
        grade: selectedGrade,
        apiKey: currentKey,
        onProgress: (status) => setAiProgressStatus(status)
      });

      const parsedItems: ParsedItem[] = result.questions.map((q, idx) => ({
        id: q.id || `q_pdf_${Date.now()}_${idx + 1}`,
        order: q.order || (idx + 1),
        question: q.question,
        type: q.type,
        options: q.options || [],
        correctAnswer: q.correctAnswer || (q.type === 'essay' ? '' : 'A'),
        points: q.points || (q.type === 'essay' ? 1.0 : 0.5),
        explanation: q.explanation || '',
        rubric: q.rubric || '',
        category: q.type === 'essay' ? 'tu_luan' : 'trac_nghiem',
        selected: true
      }));

      // Check BEFORE and AFTER normalization: it may drop items with empty question text.
      const issues = auditNewMediaQuestions(result.questions, {
        expectedQuestionCount: result.expectedQuestionCount,
        declaredTotalPoints: result.declaredTotalPoints
      });
      const normalized = FileParserService.normalizeParseResult({
        fileName: file.name,
        fileType: 'pdf',
        totalFound: parsedItems.length,
        multipleChoiceCount: parsedItems.filter(i => i.category === 'trac_nghiem').length,
        essayCount: parsedItems.filter(i => i.category === 'tu_luan').length,
        items: parsedItems
      });
      if (normalized.totalFound < result.questions.length) {
        issues.push({
          order: 0,
          level: 'error',
          message: 'AI tạo ' + result.questions.length + ' mục nhưng chỉ ' + normalized.totalFound +
            ' mục có đủ nội dung để nhập. Có câu đã bị loại vì rỗng; phải kiểm tra PDF gốc.'
        });
      }
      setAiPdfIssues(issues);
      setParseResult(normalized);
    } catch (err: any) {
      console.error('PDF AI Extraction Error:', err);
      setErrorMsg(toFriendlyAiError(err, 'Không thể tách đề PDF bằng AI lúc này. Hãy thử lại.'));
    } finally {
      setIsLoading(false);
      setAiProgressStatus('');
    }
  };

  // 1B. PROCESS PDF FILE STANDARD (OFFLINE / 100% FREE NO API KEY)
  const handleProcessPdfStandard = async (file: File) => {
    setAiPdfIssues([]);
    setIsLoading(true);
    setErrorMsg(null);
    setAiProgressStatus('Đang đọc tệp PDF bằng bộ xử lý thông thường...');

    try {
      const result = await FileParserService.parsePdfFile(file);
      if (result.totalFound === 0) {
        setErrorMsg('Không tìm thấy câu hỏi dạng văn bản trong file PDF (có thể đây là file PDF scan từ ảnh chụp). Nếu bạn có API Key, hãy chuyển sang chế độ "⚡ Bóc tách bằng AI Gemini" để AI nhận diện.');
      } else {
        setParseResult(FileParserService.normalizeParseResult(result));
      }
    } catch (err: any) {
      console.error('PDF Standard Parse Error:', err);
      setErrorMsg('Đã có lỗi khi đọc file PDF: ' + (err.message || 'Tệp không đúng định dạng.'));
    } finally {
      setIsLoading(false);
      setAiProgressStatus('');
    }
  };

  // UNIFIED HANDLER FOR PDF
  const handleProcessPdf = async (file: File) => {
    const currentKey = apiKeyInput.trim() || aiService.getApiKey();
    if (pdfParseMode === 'ai') {
      if (currentKey) {
        await handleProcessPdfWithAI(file);
      } else {
        // Tự động chuyển sang chế độ thông thường nếu chưa có key kèm thông báo thân thiện
        setShowKeyInput(true);
        await handleProcessPdfStandard(file);
      }
    } else {
      await handleProcessPdfStandard(file);
    }
  };

  // 2. PROCESS PASTED / UPLOADED IMAGES WITH GEMINI VISION
  const handleProcessImagesWithAI = async () => {
    setAiPdfIssues([]);
    if (pastedImages.length === 0) {
      setErrorMsg('Vui lòng dán (Ctrl+V) hoặc tải lên ít nhất 1 ảnh đề thi.');
      return;
    }

    const currentKey = apiKeyInput.trim() || aiService.getApiKey();
    if (!currentKey) {
      setShowKeyInput(true);
      setErrorMsg('Vui lòng nhập Gemini API Key để AI nhận diện chữ và công thức toán từ ảnh chụp.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setAiProgressStatus(`Đang chuẩn bị ${pastedImages.length} ảnh đề thi...`);

    try {
      const result = await aiService.extractQuestionsFromMedia({
        media: pastedImages.map(img => ({
          base64Data: img.base64,
          mimeType: img.mimeType,
          fileName: img.name
        })),
        fileName: `Đề thi từ ${pastedImages.length} ảnh`,
        grade: selectedGrade,
        apiKey: currentKey,
        onProgress: (status) => setAiProgressStatus(status)
      });

      const parsedItems: ParsedItem[] = result.questions.map((q, idx) => ({
        id: q.id || `q_img_${Date.now()}_${idx + 1}`,
        order: q.order || (idx + 1),
        question: q.question,
        type: q.type,
        options: q.options || [],
        correctAnswer: q.correctAnswer || (q.type === 'essay' ? '' : 'A'),
        points: q.points || (q.type === 'essay' ? 1.0 : 0.5),
        explanation: q.explanation || '',
        rubric: q.rubric || '',
        category: q.type === 'essay' ? 'tu_luan' : 'trac_nghiem',
        selected: true
      }));

      setParseResult(FileParserService.normalizeParseResult({
        fileName: `${pastedImages.length} trang ảnh đề thi`,
        fileType: 'text',
        totalFound: parsedItems.length,
        multipleChoiceCount: parsedItems.filter(i => i.category === 'trac_nghiem').length,
        essayCount: parsedItems.filter(i => i.category === 'tu_luan').length,
        items: parsedItems
      }));
    } catch (err: any) {
      console.error('Image AI Extraction Error:', err);
      setErrorMsg(toFriendlyAiError(err, 'Không thể tách câu hỏi từ ảnh lúc này. Hãy thử lại.'));
    } finally {
      setIsLoading(false);
      setAiProgressStatus('');
    }
  };

  // 3. PROCESS OFFICE FILES (WORD / EXCEL / JSON)
  const handleProcessOfficeFile = async (file: File) => {
    setAiPdfIssues([]);
    const supportedExtensions = ['.xlsx', '.xls', '.csv', '.json', '.docx', '.pdf', '.txt', '.md', '.tex'];
    const lowerName = file.name.toLowerCase();
    if (!supportedExtensions.some(ext => lowerName.endsWith(ext))) {
      setErrorMsg('Định dạng chưa được hỗ trợ. Hãy dùng PDF, ảnh, Word .docx, LaTeX .tex, Excel/CSV, JSON, TXT hoặc Markdown.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const result = FileParserService.normalizeParseResult(await FileParserService.parseFile(file));
      if (result.totalFound === 0) {
        setErrorMsg('Không tìm thấy câu hỏi nào hợp lệ trong tệp. Vui lòng kiểm tra cấu trúc hoặc thử chế độ AI nếu đây là PDF scan/ảnh.');
      } else {
        setParseResult(result);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Đã có lỗi khi đọc tệp: ' + (err.message || 'Tệp không đúng định dạng.'));
    } finally {
      setIsLoading(false);
    }
  };

  // Image Upload Handlers
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newImages: StoredImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const base64 = await fileToBase64(file);
        newImages.push({
          id: `img_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          base64,
          mimeType: file.type,
          name: file.name
        });
      }
    }

    if (newImages.length > 0) {
      setPastedImages(prev => [...prev, ...newImages]);
      setErrorMsg(null);
    }
  };

  const removeImage = (id: string) => {
    setPastedImages(prev => prev.filter(img => img.id !== id));
  };

  const moveImage = (id: string, direction: -1 | 1) => {
    setPastedImages(prev => {
      const currentIndex = prev.findIndex(img => img.id === id);
      if (currentIndex < 0) return prev;
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
      return next;
    });
  };

  const toggleSelectAll = (select: boolean) => {
    if (!parseResult) return;
    const updated = parseResult.items.map(item => ({
      ...item,
      selected: select
    }));
    setParseResult({ ...parseResult, items: updated });
  };

  const toggleSelectItem = (id: string) => {
    if (!parseResult) return;
    const updated = parseResult.items.map(item =>
      item.id === id ? { ...item, selected: !item.selected } : item
    );
    setParseResult({ ...parseResult, items: updated });
  };

  const handleToggleOnlyCategory = (cat: 'trac_nghiem' | 'tu_luan') => {
    if (!parseResult) return;
    const updated = parseResult.items.map(item => ({
      ...item,
      selected: item.category === cat
    }));
    setParseResult({ ...parseResult, items: updated });
  };

  const handleConfirmImport = () => {
    if (!parseResult) return;
    const selectedItems = parseResult.items.filter(i => i.selected);
    if (selectedItems.length === 0) {
      setErrorMsg('Hãy chọn ít nhất 1 câu hỏi trước khi thêm vào đề.');
      return;
    }

    const selectedOrders = new Set(selectedItems.map(item => item.order));
    const relevantIssues = aiPdfIssues.filter(issue => issue.order === 0 || selectedOrders.has(issue.order));
    const blocking = relevantIssues.filter(issue => issue.level === 'error');
    if (blocking.length > 0) {
      const message = 'PDF AI còn thiếu nội dung biểu thức hoặc sai cấu trúc. ' +
        blocking.map(issue => 'Câu ' + (issue.order || '(tổng đề)') + ': ' + issue.message).join(' | ') +
        '. Hãy kiểm tra lại PDF hoặc bỏ chọn câu thiếu dữ liệu trước khi nhập.';
      setErrorMsg(message);
      window.alert(message);
      return;
    }
    const warnings = relevantIssues.filter(issue => issue.level === 'warning');
    if (warnings.length > 0 && !window.confirm('Có ' + warnings.length +
        ' vấn đề liên quan đáp án/barem/điểm của PDF AI. Nếu vẫn nhập, cần bổ sung và kiểm tra kỹ trước khi giao bài. Tiếp tục?')) {
      return;
    }

    const itemsNeedReview = selectedItems.filter(item => {
      if (item.category !== 'trac_nghiem') return false;
      const optionIds = (item.options || []).map(opt => String(opt.id || '').toUpperCase());
      const correct = String(item.correctAnswer || '').toUpperCase();
      const hasBlankOption = (item.options || []).some(opt => !String(opt.text || '').trim());
      return (item.options || []).length < 2 || !optionIds.includes(correct) || hasBlankOption;
    });

    if (itemsNeedReview.length > 0) {
      const shouldContinue = window.confirm(
        `Có ${itemsNeedReview.length} câu trắc nghiệm cần Giáo viên kiểm tra lại đáp án/phương án trước khi giao.\n\nVẫn thêm các câu đã chọn vào đề để chỉnh sửa tiếp?`
      );
      if (!shouldContinue) return;
    }

    const converted = FileParserService.convertToQuestions(selectedItems);
    onImportQuestions(converted);
    onClose();
  };

  const filteredItems = parseResult
    ? parseResult.items.filter(item => {
        if (filterCategory === 'all') return true;
        return item.category === filterCategory;
      })
    : [];

  const selectedCount = parseResult?.items.filter(i => i.selected).length || 0;
  const reviewCount = parseResult
    ? parseResult.items.filter(item => {
        if (item.category !== 'trac_nghiem') return false;
        const optionIds = (item.options || []).map(opt => String(opt.id || '').toUpperCase());
        const correct = String(item.correctAnswer || '').toUpperCase();
        const hasBlankOption = (item.options || []).some(opt => !String(opt.text || '').trim());
        return (item.options || []).length < 2 || !optionIds.includes(correct) || hasBlankOption;
      }).length
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        
        {/* HEADER */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-start sm:items-center justify-between gap-3 bg-slate-50/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                Tách đề nguồn
              </h2>
              <p className="text-xs text-slate-500">
                PDF • Ảnh • Word • LaTeX → câu hỏi để giáo viên duyệt
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI STATUS - compact by default */}
        <div className="px-4 sm:px-6 py-2 border-b border-slate-100 bg-white flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${hasApiKey ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="font-bold text-slate-700">
              {hasApiKey ? 'AI đã sẵn sàng' : 'Cần API Key để dùng AI'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowKeyInput(!showKeyInput)}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold cursor-pointer"
          >
            {showKeyInput ? 'Ẩn cài đặt' : 'Cài đặt AI'}
          </button>
        </div>

        {showKeyInput && (
          <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs space-y-3 animate-in slide-in-from-top-1">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Gemini API Key"
                className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer"
              >
                Lưu Key
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <label className="font-bold text-slate-600">Mô hình</label>
              <select
                value={selectedModel}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedModel(val);
                  aiService.setModel(val);
                }}
                className="flex-1 sm:max-w-sm px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700"
              >
                <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option>
                <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
              </select>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-bold"
              >
                Lấy API Key
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {keySavedMessage && (
              <div className="text-emerald-700 font-bold text-[11px]">{keySavedMessage}</div>
            )}
          </div>
        )}

        {/* MODAL TABS */}
        {!parseResult && (
          <div className="px-4 sm:px-6 pt-3 border-b border-slate-200 flex space-x-2 bg-white overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('pdf')}
              className={`shrink-0 pb-3 px-3 font-extrabold text-xs flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'pdf'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4 text-rose-500" />
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('image')}
              className={`shrink-0 pb-3 px-3 font-extrabold text-xs flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'image'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Camera className="w-4 h-4 text-purple-600" />
              <span>Ảnh</span>
              {pastedImages.length > 0 && (
                <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full font-black">
                  {pastedImages.length} ảnh
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('file')}
              className={`shrink-0 pb-3 px-3 font-extrabold text-xs flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'file'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Word / LaTeX</span>
            </button>
          </div>
        )}

        {/* CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">

          {/* ERROR ALERT */}
          {errorMsg && (
            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div className="flex-1">
                <strong>Chưa xử lý được.</strong> {errorMsg}
              </div>
            </div>
          )}

          {/* LOADING SPINNER */}
          {isLoading && (
            <div className="p-8 bg-indigo-50/80 rounded-3xl border border-indigo-100 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="font-extrabold text-sm text-indigo-950">
                {aiProgressStatus || 'Đang tách câu hỏi...'}
              </div>
              {isTakingLong && (
                <div className="text-[11px] text-indigo-700">
                  Đang xử lý lâu hơn bình thường • cứ giữ cửa sổ này mở
                </div>
              )}
            </div>
          )}

          {!isLoading && !parseResult && (
            <>
              {/* TAB 1: PDF AI EXTRACTION */}
              {activeTab === 'pdf' && (
                <div className="space-y-4">
                  {/* Grade Selector & Parse Mode Selector */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-700">Khối lớp:</span>
                      <div className="flex gap-1">
                        {['6', '7', '8', '9'].map(gr => (
                          <button
                            key={gr}
                            type="button"
                            onClick={() => setSelectedGrade(gr)}
                            className={`px-2.5 py-1 rounded-xl font-bold cursor-pointer transition-all ${
                              selectedGrade === gr
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Lớp {gr}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Mode Switcher: AI vs Standard */}
                    <div className="flex bg-slate-200/80 p-1 rounded-xl gap-1">
                      <button
                        type="button"
                        onClick={() => setPdfParseMode('ai')}
                        className={`py-1 px-2.5 rounded-lg font-black text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                          pdfParseMode === 'ai'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Dùng AI để đọc PDF scan, nhiều cột và công thức"
                      >
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        <span>AI</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPdfParseMode('standard')}
                        className={`py-1 px-2.5 rounded-lg font-black text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                          pdfParseMode === 'standard'
                            ? 'bg-white text-emerald-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Đọc lớp văn bản có sẵn trong PDF, không cần API Key"
                      >
                        <FileText className="w-3 h-3 text-emerald-600" />
                        <span>Văn bản</span>
                      </button>
                    </div>
                  </div>

                  {/* PDF Dropzone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type === 'application/pdf') {
                        handleProcessPdf(file);
                      } else {
                        setErrorMsg('Vui lòng chỉ kéo thả tệp định dạng .PDF');
                      }
                    }}
                    onClick={() => pdfInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                        : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/70'
                    }`}
                  >
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProcessPdf(file);
                      }}
                      className="hidden"
                    />

                    <div className="w-16 h-16 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <FileText className="w-8 h-8" />
                    </div>

                    <div className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase mb-2 tracking-wider ${
                      pdfParseMode === 'ai' ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'
                    }">
                      {pdfParseMode === 'ai' ? 'AI' : 'PDF văn bản'}
                    </div>

                    <h3 className="text-base sm:text-lg font-black text-slate-800 mb-1">
                      Kéo thả PDF hoặc bấm để chọn
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                      {pdfParseMode === 'ai'
                        ? 'Phù hợp PDF scan, nhiều cột và công thức.'
                        : 'Đọc lớp văn bản có sẵn, không cần API Key.'}
                    </p>

                    <div className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95">
                      <UploadCloud className="w-4 h-4" />
                      <span>Chọn PDF</span>
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 2: IMAGE PASTE & VISION EXTRACTION */}
              {activeTab === 'image' && (
                <div className="space-y-4">
                  {/* Grade Selector */}
                  <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
                    <span className="font-bold text-slate-700">Khối lớp đề thi:</span>
                    <div className="flex gap-1.5">
                      {['6', '7', '8', '9'].map(gr => (
                        <button
                          key={gr}
                          type="button"
                          onClick={() => setSelectedGrade(gr)}
                          className={`px-3 py-1 rounded-xl font-bold cursor-pointer transition-all ${
                            selectedGrade === gr
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Lớp {gr}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Paste / Dropzone Area */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={async (e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const files = e.dataTransfer.files;
                      if (!files) return;
                      const newImages: StoredImage[] = [];
                      for (let i = 0; i < files.length; i++) {
                        if (files[i].type.startsWith('image/')) {
                          const base64 = await fileToBase64(files[i]);
                          newImages.push({
                            id: `img_${Date.now()}_${i}`,
                            base64,
                            mimeType: files[i].type,
                            name: files[i].name
                          });
                        }
                      }
                      if (newImages.length > 0) {
                        setPastedImages(prev => [...prev, ...newImages]);
                        setErrorMsg(null);
                      }
                    }}
                    className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center transition-all bg-gradient-to-b from-purple-50/40 to-indigo-50/20 ${
                      isDragging
                        ? 'border-purple-500 bg-purple-50/80 scale-[0.99]'
                        : 'border-purple-300 hover:border-purple-400'
                    }`}
                  >
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageFileChange}
                      className="hidden"
                    />

                    <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
                      <Camera className="w-7 h-7" />
                    </div>

                    <h3 className="text-sm sm:text-base font-black text-slate-800 mb-1">
                      📸 Dán ảnh chụp đề thi (Nhấn phím <kbd className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-mono text-xs">Ctrl + V</kbd>)
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                      Bạn có thể chụp màn hình câu hỏi hoặc trang sách/đề kiểm tra, sau đó nhấn <strong>Ctrl + V</strong> để dán trực tiếp vào đây (hỗ trợ nhiều trang).
                    </p>

                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="inline-flex items-center space-x-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>Tải ảnh từ máy tính</span>
                      </button>
                    </div>
                  </div>

                  {/* Gallery of Pasted / Uploaded Images */}
                  {pastedImages.length > 0 && (
                    <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Đã nạp {pastedImages.length} trang ảnh đề thi — hãy kiểm tra đúng thứ tự trước khi bóc tách:</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPastedImages([])}
                          className="text-[11px] text-rose-600 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" /> Xóa tất cả ảnh
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {pastedImages.map((img, idx) => (
                          <div
                            key={img.id}
                            className="relative group rounded-xl overflow-hidden border-2 border-purple-200 bg-white shadow-xs aspect-4/3"
                          >
                            <img
                              src={img.base64}
                              alt={img.name}
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => setPreviewingImage(img.base64)}
                            />
                            <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-black">
                              Trang {idx + 1}
                            </div>
                            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 opacity-90 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => moveImage(img.id, -1)}
                                disabled={idx === 0}
                                className="p-1 bg-white/95 text-slate-700 rounded-lg shadow disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
                                title="Đưa trang này lên trước"
                              >
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveImage(img.id, 1)}
                                disabled={idx === pastedImages.length - 1}
                                className="p-1 bg-white/95 text-slate-700 rounded-lg shadow disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer"
                                title="Đưa trang này xuống sau"
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeImage(img.id)}
                              className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-lg opacity-80 group-hover:opacity-100 hover:bg-rose-700 transition-opacity cursor-pointer shadow-xs"
                              title="Xóa ảnh này"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Run AI OCR Button */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleProcessImagesWithAI}
                          className="w-full py-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white font-black text-xs sm:text-sm rounded-2xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <span>TÁCH {pastedImages.length} TRANG ẢNH</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: OFFICE & SOURCE FILES (WORD / LATEX / EXCEL / JSON) */}
              {activeTab === 'file' && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleProcessOfficeFile(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                        : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/70'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv,.json,.docx,.pdf,.txt,.md,.tex"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProcessOfficeFile(file);
                      }}
                      className="hidden"
                    />

                    <div className="flex justify-center space-x-2 mb-3">
                      <span className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-xs" title="PDF">
                        <FileText className="w-5 h-5" />
                      </span>
                      <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs" title="Word">
                        <FileType className="w-5 h-5" />
                      </span>
                      <span className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shadow-xs" title="LaTeX .tex">
                        <FileText className="w-5 h-5" />
                      </span>
                      <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs" title="Excel">
                        <FileSpreadsheet className="w-5 h-5" />
                      </span>
                      <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs" title="JSON">
                        <FileCheck className="w-5 h-5" />
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-black text-slate-800 mb-1">
                      Kéo thả tệp vào đây
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Word • LaTeX • Excel • JSON • TXT • PDF
                    </p>

                    <div className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95">
                      <UploadCloud className="w-4 h-4" />
                      <span>Chọn file từ máy tính</span>
                    </div>
                  </div>

                  <details className="text-xs">
                    <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-bold">
                      File mẫu Excel / JSON
                    </summary>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          FileParserService.downloadSampleExcelTemplate();
                        }}
                        className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-xl"
                      >
                        Excel mẫu
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          FileParserService.downloadSampleJsonTemplate();
                        }}
                        className="px-3 py-1.5 bg-indigo-600 text-white font-bold rounded-xl"
                      >
                        JSON mẫu
                      </button>
                    </div>
                  </details>
                </div>
              )}
            </>
          )}

          {/* 4. PARSED RESULT DASHBOARD (LIVE PREVIEW OF EXTRACTED QUESTIONS) */}
          {parseResult && (
            <div className="space-y-4">
              {/* Summary Stats bar */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center font-black text-xs">
                    {parseResult.fileType.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-black text-sm text-slate-900 line-clamp-1">
                      {parseResult.fileName}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                      <span>Tổng cộng: <strong className="text-indigo-700">{parseResult.totalFound}</strong> câu</span>
                      <span>•</span>
                      <span className="text-emerald-700 font-bold">
                        Trắc nghiệm: {parseResult.multipleChoiceCount}
                      </span>
                      <span>•</span>
                      <span className="text-purple-700 font-bold">
                        Tự luận: {parseResult.essayCount}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setParseResult(null)}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  Tệp khác
                </button>
              </div>

              <div className={`rounded-2xl px-4 py-3 border text-xs flex items-start gap-2 ${reviewCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                {reviewCount > 0 ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                )}
                <div>
                  <div className="font-black">
                    {reviewCount > 0
                      ? `Có ${reviewCount} câu cần kiểm tra lại trước khi giao bài`
                      : 'Cấu trúc câu hỏi ổn'}
                  </div>
                  <div className="mt-0.5 opacity-80">Giáo viên duyệt trước khi giao.</div>
                </div>
              </div>

              {aiPdfIssues.length > 0 && (
                <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 space-y-1">
                  <div className="font-black">Cần đối chiếu PDF gốc: {aiPdfIssues.length} cảnh báo</div>
                  <p>Không giao đề khi còn thiếu biểu thức, đáp án hoặc điểm. Những câu thiếu nội dung sẽ bị chặn nhập.</p>
                  {aiPdfIssues.map((issue, index) => (
                    <p key={index} className={issue.level === 'error' ? 'font-bold text-rose-800' : 'text-amber-900'}>
                      {issue.order > 0 ? 'Câu ' + issue.order + ': ' : 'Toàn đề: '}{issue.message}
                    </p>
                  ))}
                </div>
              )}

              {/* Filter Tabs & Selection Control */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                {/* Tabs */}
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFilterCategory('all')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      filterCategory === 'all'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tất cả ({parseResult.totalFound})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterCategory('trac_nghiem')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      filterCategory === 'trac_nghiem'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Trắc nghiệm ({parseResult.multipleChoiceCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterCategory('tu_luan')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      filterCategory === 'tu_luan'
                        ? 'bg-white text-purple-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tự luận ({parseResult.essayCount})
                  </button>
                </div>

                {/* Batch selection shortcuts */}
                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(true)}
                    className="text-indigo-600 hover:underline font-bold cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => handleToggleOnlyCategory('trac_nghiem')}
                    className="text-emerald-600 hover:underline font-bold cursor-pointer"
                  >
                    Chọn TN
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(false)}
                    className="text-slate-500 hover:underline font-bold cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              {/* Questions Preview List with KaTeX math rendering */}
              <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
                {filteredItems.map((item, idx) => {
                  const isMC = item.category === 'trac_nghiem';
                  const questionIssues = aiPdfIssues.filter(issue => issue.order === item.order);

                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleSelectItem(item.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        item.selected
                          ? 'bg-white border-indigo-300 shadow-xs ring-1 ring-indigo-200'
                          : 'bg-slate-50/70 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={!!item.selected}
                            onChange={() => {}} // Handled by parent div
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span className="font-black text-xs text-slate-800">
                            Câu {item.order || (idx + 1)}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                              isMC
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {isMC ? 'Trắc nghiệm' : 'Tự luận'}
                          </span>
                        </div>

                        <span className="text-xs font-bold text-slate-500">
                          {item.points} điểm
                        </span>
                      </div>

                      {/* Question text with KaTeX rendered math */}
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 mb-2 pl-6 leading-relaxed break-words">
                        <MathDisplay text={item.question} />
                      </div>

                      {/* Options preview with KaTeX rendered math */}
                      {isMC && item.options && item.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6 text-xs text-slate-700">
                          {item.options.map((opt) => (
                            <div
                              key={opt.id}
                              className={`p-2 rounded-xl border text-xs break-words ${
                                opt.id === item.correctAnswer
                                  ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900 ring-1 ring-emerald-200'
                                  : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <strong className="mr-1 text-slate-900">{opt.id}.</strong>
                              <MathDisplay text={opt.text || '(Trống)'} inline={true} />
                            </div>
                          ))}
                        </div>
                      )}

                      {!isMC && !!item.correctAnswer?.trim() && (
                        <div className="mt-2 pl-6 text-[11px] text-indigo-900 bg-indigo-50/60 p-2 rounded-xl border border-indigo-200">
                          <strong>Đáp án gốc:</strong> <MathDisplay text={item.correctAnswer} />
                        </div>
                      )}
                      {questionIssues.length > 0 && (
                        <div className="mt-2 pl-6 text-[11px] space-y-1">
                          {questionIssues.map((issue, index) => (
                            <p key={index} className={issue.level === 'error' ? 'text-rose-700 font-bold' : 'text-amber-800'}>
                              {issue.level === 'error' ? 'Thiếu dữ liệu: ' : 'Cần đối chiếu: '}{issue.message}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Explanation if any */}
                      {item.explanation && (
                        <div className="mt-2 pl-6 text-[11px] text-slate-600 italic bg-amber-50/60 p-2 rounded-xl border border-amber-200">
                          💡 <strong>Lời giải:</strong> <MathDisplay text={item.explanation} inline={true} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-slate-50/80 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>

          {parseResult && (
            <div className="flex items-center space-x-3">
              <span className="text-xs text-slate-600 font-bold hidden sm:inline">
                Đã chọn: <strong className="text-indigo-600">{selectedCount}</strong> / {parseResult.totalFound} câu
              </span>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={selectedCount === 0}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 sm:px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <span>THÊM {selectedCount} CÂU VÀO ĐỀ</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      </div>

      {/* LIGHTBOX FOR PREVIEWING PASTED IMAGES */}
      {previewingImage && (
        <div 
          onClick={() => setPreviewingImage(null)}
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <img 
              src={previewingImage} 
              alt="Xem ảnh đề bài" 
              className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl" 
            />
            <button
              onClick={() => setPreviewingImage(null)}
              className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
