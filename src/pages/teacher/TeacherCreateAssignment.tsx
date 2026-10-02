import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Assignment, ClassRoom, GradeLevel, Question, QuestionOption } from '../../types';
import { StorageService } from '../../services/storageService';
import { FirestoreService } from '../../services/firestoreService';
import { useAuth } from '../../context/AuthContext';
import { aiService } from '../../services/aiService';
import { FileUploadModal } from '../../components/FileUploadModal';
import { MathDisplay } from '../../components/MathDisplay';
import { QuestionImageUpload } from '../../components/QuestionImageUpload';
import { processQuestionImage } from '../../utils/imageProcessUtils';
import { isEssayQuestion, normalizeQuestion, isQuestionMissingImage, isQuestionMentioningImage, getMissingImageReason } from '../../utils/questionUtils';
import { SubscriptionService, BILLING_ENABLED } from '../../services/subscriptionService';
import { AiSolveExamModal } from '../../components/AiSolveExamModal';
import { FileParserService } from '../../services/fileParserService';
import { 
  Plus, 
  Trash2, 
  Save, 
  Clock, 
  HelpCircle, 
  Sparkles, 
  Copy, 
  CheckCircle2, 
  FileText, 
  X, 
  AlertCircle, 
  UploadCloud, 
  FileSpreadsheet, 
  FileType, 
  Loader2, 
  FileBadge,
  AlertTriangle,
  Image as ImageIcon,
  Camera,
  Filter
} from 'lucide-react';

interface TeacherCreateAssignmentProps {
  classes: ClassRoom[];
  initialQuestions?: Question[];
  initialTitle?: string;
  initialGrade?: GradeLevel;
  initialMode?: 'text' | 'pdf'; // MỚI: Thêm prop nhận diện chế độ
  initialFilter?: 'all' | 'missing_image' | 'has_image' | 'mcq' | 'essay'; // MỚI: Lọc sẵn câu thiếu hình
  editingAssignment?: Assignment; // MỚI: Cho phép sửa bài tập và câu hỏi đã có
  onSaveSuccess: (savedAssignment: Assignment) => void;
  onCancel: () => void;
}

const DEFAULT_OPTIONS: QuestionOption[] = [
  { id: 'A', text: '' },
  { id: 'B', text: '' },
  { id: 'C', text: '' },
  { id: 'D', text: '' }
];

export const TeacherCreateAssignment: React.FC<TeacherCreateAssignmentProps> = ({
  classes,
  initialQuestions,
  initialTitle,
  initialGrade,
  initialMode, // MỚI: Nhận prop từ TeacherLayout
  initialFilter,
  editingAssignment,
  onSaveSuccess,
  onCancel
}) => {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [searchParams] = useSearchParams();
  const paramGrade = searchParams.get('grade');
  const validParamGrade = (paramGrade === '6' || paramGrade === '7' || paramGrade === '8' || paramGrade === '9') ? (paramGrade as GradeLevel) : undefined;

  const isEditing = !!editingAssignment;

  const [title, setTitle] = useState(editingAssignment?.title || initialTitle || '');
  const [grade, setGrade] = useState<GradeLevel>(editingAssignment?.grade || validParamGrade || initialGrade || '7');
  const [topic, setTopic] = useState(editingAssignment?.topic || 'Đại số & Hình học THCS');
  const [classId, setClassId] = useState<string>(editingAssignment?.classId || classes[0]?.id || 'all');
  const [durationMinutes, setDurationMinutes] = useState<number>(editingAssignment?.durationMinutes ?? 45);
  const [deadline, setDeadline] = useState<string>(() => {
    if (editingAssignment?.deadline) return editingAssignment.deadline;
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [allowViewResult, setAllowViewResult] = useState<boolean>(editingAssignment?.allowViewResult ?? true);

  // --- TAB MODE SWITCHER ---
  // Khởi tạo tab dựa trên tham số truyền vào
  const [examMode, setExamMode] = useState<'text' | 'pdf'>(
    editingAssignment?.type === 'pdf' ? 'pdf' : (initialMode || 'text')
  );

  // Lắng nghe nếu initialMode thay đổi thì ép chuyển tab ngay lập tức
  useEffect(() => {
    if (initialMode) {
      setExamMode(initialMode);
    }
  }, [initialMode]);

  // --- STATE DÀNH RIÊNG CHO CHẾ ĐỘ PDF ---
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>(editingAssignment?.pdfUrl || '');
  const [pdfNumQuestions, setPdfNumQuestions] = useState<number>(editingAssignment?.questions?.length || 40);
  const [pdfAnswers, setPdfAnswers] = useState<Record<number, string>>(() => {
    if (editingAssignment?.type === 'pdf' && editingAssignment.questions) {
      const map: Record<number, string> = {};
      editingAssignment.questions.forEach((q, i) => {
        map[q.order || (i + 1)] = q.correctAnswer;
      });
      return map;
    }
    return {};
  });

  // --- STATE CHẾ ĐỘ TEXT CŨ ---
  const [questions, setQuestions] = useState<Question[]>(() => {
    if (editingAssignment?.questions && editingAssignment.questions.length > 0) {
      return editingAssignment.questions;
    }
    if (initialQuestions && initialQuestions.length > 0) {
      return initialQuestions;
    }
    return [
      {
        id: `q_${Date.now()}_1`,
        order: 1,
        question: 'Tập hợp các số hữu tỉ được kí hiệu là gì?',
        type: 'multiple_choice',
        options: [
          { id: 'A', text: 'N' },
          { id: 'B', text: 'Z' },
          { id: 'C', text: 'R' },
          { id: 'D', text: 'Q' }
        ],
        correctAnswer: 'D',
        points: 0.5,
        explanation: 'Kí hiệu tập hợp số hữu tỉ là Q.',
        topicHint: 'Khái niệm số hữu tỉ'
      }
    ];
  });

  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [fileUploadInitialTab, setFileUploadInitialTab] = useState<'pdf' | 'image' | 'file'>('pdf');
  const [showAiGenModal, setShowAiGenModal] = useState(false);
  const [showRawImportModal, setShowRawImportModal] = useState(false);
  const [rawTextImport, setRawTextImport] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiGenCount, setAiGenCount] = useState(5);
  const [importSuccessAlert, setImportSuccessAlert] = useState<string | null>(null);

  // Lắng nghe phím Ctrl+V ảnh chụp đề thi trên trang để tự động mở bộ bóc tách ảnh AI
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          setFileUploadInitialTab('image');
          setShowFileUploadModal(true);
          break;
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  // MỚI: State AI Giải Đề & Nhập nhanh đáp án
  const [showAiSolveModal, setShowAiSolveModal] = useState(false);
  const [showTextQuickPaste, setShowTextQuickPaste] = useState(false);
  const [textQuickPasteInput, setTextQuickPasteInput] = useState('');
  const [isSolvingPdf, setIsSolvingPdf] = useState(false);
  const [pdfSolveProgress, setPdfSolveProgress] = useState('');
  const [showPdfQuickPaste, setShowPdfQuickPaste] = useState(false);
  const [pdfQuickPasteText, setPdfQuickPasteText] = useState('');

  // Xử lý dán nhanh đáp án cho Text Mode (vd: 1A 2B 3C... hoặc ABCD...)
  const handleApplyTextQuickPaste = () => {
    if (!textQuickPasteInput.trim()) return;
    const text = textQuickPasteInput.trim();
    const pairRegex = /(?:Câu\s*)?(\d+)[\s.:=_-]*([A-D])/gi;
    let match;
    let count = 0;
    const updated = [...questions];

    while ((match = pairRegex.exec(text)) !== null) {
      const qNum = parseInt(match[1], 10);
      const ansLetter = match[2].toUpperCase();
      const idx = updated.findIndex(q => q.order === qNum);
      if (idx !== -1) {
        updated[idx] = { ...updated[idx], correctAnswer: ansLetter };
        count++;
      } else if (updated[qNum - 1]) {
        updated[qNum - 1] = { ...updated[qNum - 1], correctAnswer: ansLetter };
        count++;
      }
    }

    if (count === 0) {
      const cleanLetters = text.replace(/[^A-Da-d]/g, '').toUpperCase();
      cleanLetters.split('').forEach((letter, i) => {
        if (updated[i]) {
          updated[i] = { ...updated[i], correctAnswer: letter };
          count++;
        }
      });
    }

    if (count > 0) {
      setQuestions(updated);
      setShowTextQuickPaste(false);
      setTextQuickPasteInput('');
      setImportSuccessAlert(`Đã gán thành công đáp án chuẩn cho ${count} câu hỏi!`);
      setTimeout(() => setImportSuccessAlert(null), 4000);
    } else {
      alert('Không nhận diện được định dạng đáp án. Thầy/Cô hãy nhập: 1A 2B 3C... hoặc chuỗi ABCD...');
    }
  };

  // Xử lý dán nhanh bảng đáp án cho PDF Mode
  const handleApplyPdfQuickPaste = () => {
    if (!pdfQuickPasteText.trim()) return;
    const text = pdfQuickPasteText.trim();
    const pairRegex = /(?:Câu\s*)?(\d+)[\s.:=_-]*([A-D])/gi;
    let match;
    let count = 0;
    const newMap: Record<number, string> = { ...pdfAnswers };

    while ((match = pairRegex.exec(text)) !== null) {
      const qNum = parseInt(match[1], 10);
      const ansLetter = match[2].toUpperCase();
      if (qNum <= pdfNumQuestions) {
        newMap[qNum] = ansLetter;
        count++;
      }
    }

    if (count === 0) {
      const cleanLetters = text.replace(/[^A-Da-d]/g, '').toUpperCase();
      cleanLetters.split('').forEach((letter, i) => {
        if (i + 1 <= pdfNumQuestions) {
          newMap[i + 1] = letter;
          count++;
        }
      });
    }

    if (count > 0) {
      setPdfAnswers(newMap);
      setShowPdfQuickPaste(false);
      setPdfQuickPasteText('');
      alert(`Đã điền thành công đáp án cho ${count} câu trong bảng đáp án PDF!`);
    } else {
      alert('Không nhận diện được định dạng đáp án (vd: 1A 2B 3C... hoặc ABCD...)');
    }
  };

  // AI Đọc và tự động giải đề từ file PDF
  const handleAiSolvePdf = async () => {
    if (!pdfFile && !pdfPreviewUrl) {
      alert('Vui lòng tải lên file PDF đề thi trước khi nhờ AI giải.');
      return;
    }
    setIsSolvingPdf(true);
    setPdfSolveProgress('Đang đọc các trang file PDF...');

    try {
      let extractedText = '';
      if (pdfFile) {
        const parsed = await FileParserService.parsePdfFile(pdfFile);
        extractedText = parsed.items.map(it => `Câu ${it.order}: ${it.question}\n${it.options.map(o => `${o.id}. ${o.text}`).join(' ')}`).join('\n\n');
      }

      setPdfSolveProgress(`AI đang giải toán cho ${pdfNumQuestions} câu hỏi...`);
      const solveMap = await aiService.solveQuestionsFromPdf({
        pdfText: extractedText || `Đề thi môn Toán lớp ${grade} (${topic}) gồm ${pdfNumQuestions} câu trắc nghiệm.`,
        expectedCount: pdfNumQuestions,
        grade,
        topic,
        onProgress: (cur, tot) => {
          setPdfSolveProgress(`AI đang giải câu ${cur}/${tot}...`);
        }
      });

      const newPdfAnswers = { ...pdfAnswers };
      let filled = 0;
      Object.keys(solveMap).forEach((numStr) => {
        const num = parseInt(numStr, 10);
        if (num <= pdfNumQuestions && solveMap[num]?.correctAnswer) {
          newPdfAnswers[num] = solveMap[num].correctAnswer;
          filled++;
        }
      });

      if (filled > 0) {
        setPdfAnswers(newPdfAnswers);
        alert(`🎉 AI đã đọc và tự động giải đúng chuẩn ${filled}/${pdfNumQuestions} câu hỏi vào bảng đáp án!`);
      } else {
        alert('AI không đọc được đầy đủ câu hỏi trong file PDF này. Thầy/Cô có thể bấm vào từng ô hoặc dùng tính năng "Dán nhanh đáp án" nhé.');
      }
    } catch (err) {
      console.error('Lỗi khi AI giải PDF:', err);
      alert('Có sự cố khi giải PDF. Thầy/Cô hãy kiểm tra lại file hoặc nhập nhanh đáp án.');
    } finally {
      setIsSolvingPdf(false);
      setPdfSolveProgress('');
    }
  };

  // MỚI: Bộ lọc câu hỏi thông minh & Cảnh báo câu cần chèn hình vẽ
  const [questionFilter, setQuestionFilter] = useState<'all' | 'missing_image' | 'has_image' | 'mcq' | 'essay'>(initialFilter || 'all');
  const [highlightedQuestionId, setHighlightedQuestionId] = useState<string | null>(null);

  const missingImageQuestions = questions.filter(q => isQuestionMissingImage(q));
  const hasImageQuestions = questions.filter(q => Boolean(q.imageUrl && q.imageUrl.trim().length > 0));
  const mcqQuestionsCount = questions.filter(q => !isEssayQuestion(q)).length;
  const essayQuestionsCount = questions.filter(q => isEssayQuestion(q)).length;

  const scrollToQuestion = (questionId: string) => {
    setQuestionFilter('all');
    setHighlightedQuestionId(questionId);
    setTimeout(() => {
      const el = document.getElementById(`question-card-${questionId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    setTimeout(() => {
      setHighlightedQuestionId(null);
    }, 3500);
  };

  // --- LOGIC XỬ LÝ TEXT MODE ---
  const handleAddQuestion = () => {
    const nextOrder = questions.length + 1;
    const newQ: Question = {
      id: `q_${Date.now()}_${nextOrder}`,
      order: nextOrder,
      question: '',
      type: 'multiple_choice',
      options: [
        { id: 'A', text: '' },
        { id: 'B', text: '' },
        { id: 'C', text: '' },
        { id: 'D', text: '' }
      ],
      correctAnswer: 'A',
      points: 0.5,
      explanation: '',
      topicHint: topic
    };
    setQuestions([...questions, newQ]);
  };

  const handleAddEssayQuestion = () => {
    const nextOrder = questions.length + 1;
    const newQ: Question = {
      id: `q_essay_${Date.now()}_${nextOrder}`,
      order: nextOrder,
      question: '',
      type: 'essay',
      options: [],
      correctAnswer: '',
      points: 1.0,
      explanation: '',
      topicHint: topic
    };
    setQuestions([...questions, newQ]);
  };

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) {
      alert('Bài tập cần ít nhất 1 câu hỏi.');
      return;
    }
    const updated = questions.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order: i + 1 }));
    setQuestions(updated);
  };

  const handleUpdateQuestion = (idx: number, updates: Partial<Question>) => {
    const updated = [...questions];
    const targetQ = { ...updated[idx], ...updates };
    
    // Nếu đổi sang tự luận, làm sạch options
    if (updates.type === 'essay') {
      targetQ.options = [];
      targetQ.correctAnswer = '';
    } else if (updates.type === 'multiple_choice' && (!targetQ.options || targetQ.options.length === 0)) {
      targetQ.options = [
        { id: 'A', text: '' },
        { id: 'B', text: '' },
        { id: 'C', text: '' },
        { id: 'D', text: '' }
      ];
      targetQ.correctAnswer = 'A';
    }

    updated[idx] = targetQ;
    setQuestions(updated);
  };

  const handleUpdateOption = (qIdx: number, optId: string, text: string) => {
    const q = questions[qIdx];
    const newOptions = (q.options || []).map(opt => (opt.id === optId ? { ...opt, text } : opt));
    handleUpdateQuestion(qIdx, { options: newOptions });
  };

  const handleImportQuestionsFromFile = (importedQuestions: Question[]) => {
    if (!importedQuestions || importedQuestions.length === 0) return;
    const normalized = importedQuestions.map(q => normalizeQuestion(q));
    const isSingleDefault =
      questions.length === 1 &&
      (questions[0].question.includes('Tập hợp các số hữu tỉ') ||
       questions[0].question.includes('Phân số nào sau đây lớn hơn 1') ||
       !questions[0].question.trim());

    let finalQuestions: Question[] = [];
    if (isSingleDefault) {
      finalQuestions = normalized.map((q, i) => ({ ...q, order: i + 1 }));
    } else {
      const startingOrder = questions.length + 1;
      const reIndexed = normalized.map((q, i) => ({
        ...q,
        order: startingOrder + i
      }));
      finalQuestions = [...questions, ...reIndexed];
    }
    setQuestions(finalQuestions);
    const missingCount = finalQuestions.filter(q => isQuestionMissingImage(q)).length;
    if (missingCount > 0) {
      setImportSuccessAlert(`Đã nhập thành công ${importedQuestions.length} câu hỏi! ⚠️ Phát hiện ${missingCount} câu nhắc đến hình vẽ cần dán ảnh minh họa.`);
    } else {
      setImportSuccessAlert(`Đã nhập thành công ${importedQuestions.length} câu hỏi từ tệp vào đề thi!`);
    }
    setTimeout(() => setImportSuccessAlert(null), 5000);
  };

  const handleAiGenerateQuestions = async () => {
    setIsAiGenerating(true);
    try {
      const generated = await aiService.generateQuestions({
        grade,
        topic,
        count: aiGenCount
      });
      const reIndexed = generated.map((g, i) => ({
        ...g,
        id: `q_ai_${Date.now()}_${i}`,
        order: questions.length + i + 1
      }));
      setQuestions([...questions, ...reIndexed]);
      setShowAiGenModal(false);
    } catch {
      alert('Lỗi tạo câu hỏi.');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // CẬP NHẬT: Thay thế AI parsing bằng hàm siêu việt FileParserService.parseRawText
  const handleImportFromText = () => {
    if (!rawTextImport.trim()) return;
    
    // Gọi trực tiếp hàm parseRawText vừa được nâng cấp (đồng bộ và cực nhanh)
    const parsedResult = FileParserService.parseRawText(rawTextImport, 'Dán trực tiếp', 'text');
    const parsedQuestions = FileParserService.convertToQuestions(parsedResult.items);

    if (parsedQuestions.length > 0) {
      const reIndexed = parsedQuestions.map((p, i) => ({
        ...p,
        order: questions.length + i + 1
      }));
      
      setQuestions([...questions, ...reIndexed]);
      setShowRawImportModal(false);
      setRawTextImport('');
      
      const missingCount = reIndexed.filter(q => isQuestionMissingImage(q)).length;
      if (missingCount > 0) {
        setImportSuccessAlert(`Đã nhập thành công ${reIndexed.length} câu hỏi! ⚠️ Phát hiện ${missingCount} câu nhắc đến hình vẽ cần dán ảnh.`);
        setTimeout(() => setImportSuccessAlert(null), 5000);
      }
    } else {
      alert('Không nhận diện được định dạng câu hỏi.');
    }
  };

  // --- LOGIC XỬ LÝ PDF MODE ---
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setPdfPreviewUrl(URL.createObjectURL(file));
    } else {
      alert('Vui lòng tải lên file định dạng PDF hợp lệ.');
    }
  };

  const handleSelectPdfAnswer = (qIndex: number, option: string) => {
    setPdfAnswers(prev => ({ ...prev, [qIndex]: option }));
  };

  // --- LƯU BÀI TẬP (GỘP CHUNG 2 CHẾ ĐỘ) ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Vui lòng nhập tên bài tập.');
      return;
    }

    // Kiểm tra thời hạn dùng thử 15 ngày của Giáo viên (chỉ chặn khi BILLING_ENABLED = true)
    if (BILLING_ENABLED && user) {
      try {
        const sub = await SubscriptionService.getSubscription(user);
        if (SubscriptionService.isExpired(sub)) {
          alert('⚠️ Thời gian dùng thử 15 ngày của Thầy/Cô đã kết thúc.\nVui lòng thanh toán hoặc nhập mã kích hoạt để tiếp tục tạo và xuất bản bài thi mới!');
          return;
        }
      } catch {}
    }

    let finalQuestions: Question[] = [];
    let finalType: 'text' | 'pdf' = 'text';
    let finalPdfUrl: string | undefined = undefined;

    // VALIDATE VÀ BUILD DỮ LIỆU CHẾ ĐỘ TEXT
    if (examMode === 'text') {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question.trim()) {
          alert(`Câu hỏi số ${i + 1} chưa nhập nội dung.`);
          return;
        }
        if (!isEssayQuestion(q) && q.type === 'multiple_choice') {
          const hasEmptyOpt = q.options.some(o => !o.text.trim());
          if (hasEmptyOpt) {
            alert(`Câu hỏi số ${i + 1} còn phương án lựa chọn bị trống.`);
            return;
          }
        }
      }
      finalQuestions = questions.map(q => normalizeQuestion(q));
      finalType = 'text';
    } 
    // VALIDATE VÀ BUILD DỮ LIỆU CHẾ ĐỘ PDF
    else {
      if (!pdfFile && !pdfPreviewUrl) {
        alert('Vui lòng tải lên file PDF đề thi.');
        return;
      }
      if (Object.keys(pdfAnswers).length === 0) {
        if (!window.confirm('Bạn chưa thiết lập bảng đáp án nào. Vẫn tiếp tục lưu?')) return;
      }
      
      finalType = 'pdf';
      
      // Chú ý: Ở hệ thống thực tế, bạn sẽ cần thay hàm tạo URL Local này 
      // bằng hàm upload file PDF lên Firebase Storage và lấy link tải về.
      finalPdfUrl = pdfPreviewUrl; 
      
      // Tự động sinh mảng questions "ảo" để hệ thống chấm điểm dựa vào bảng đáp án
      const pointPerQuestion = Number((10 / pdfNumQuestions).toFixed(2));
      finalQuestions = Array.from({ length: pdfNumQuestions }).map((_, i) => ({
        id: `q_pdf_${Date.now()}_${i + 1}`,
        order: i + 1,
        question: `Câu ${i + 1}`,
        type: 'multiple_choice',
        options: [
          { id: 'A', text: 'A' },
          { id: 'B', text: 'B' },
          { id: 'C', text: 'C' },
          { id: 'D', text: 'D' }
        ],
        correctAnswer: pdfAnswers[i + 1] || 'A', // Lấy đáp án giáo viên đã tick
        points: pointPerQuestion,
        explanation: '',
        topicHint: topic
      }));
    }

    setIsSaving(true);

    try {
      const targetClass = classes.find(c => c.id === classId);
      const className = targetClass ? targetClass.name : 'Toàn khối';

      let savedAssignment: Assignment;

      if (isEditing && editingAssignment) {
        // CẬP NHẬT BÀI TẬP VÀ CÂU HỎI HIỆN CÓ
        savedAssignment = {
          ...editingAssignment,
          title: title.trim(),
          grade,
          topic: topic.trim(),
          classId,
          className,
          questions: finalQuestions,
          durationMinutes: Number(durationMinutes) || 0,
          deadline,
          allowViewResult,
          type: finalType,
          pdfUrl: finalPdfUrl || editingAssignment.pdfUrl
        };
      } else {
        // TẠO BÀI TẬP MỚI
        const assignmentCode = StorageService.generateAssignmentCode(grade, className);
        savedAssignment = {
          id: `asg_${Date.now()}`,
          title: title.trim(),
          grade,
          topic: topic.trim(),
          classId,
          className,
          questions: finalQuestions,
          durationMinutes: Number(durationMinutes) || 0,
          deadline,
          allowViewResult,
          assignmentCode,
          createdAt: new Date().toISOString(),
          isPublished: true,
          type: finalType,
          pdfUrl: finalPdfUrl
        };
      }

      // 1. Save to Cloud Firestore
      try {
        await FirestoreService.saveExam(savedAssignment, user || undefined);
      } catch (firestoreErr) {
        console.warn('Lưu Firestore thất bại, lưu dự phòng LocalStorage:', firestoreErr);
      }

      // 2. Save to Local Cache
      StorageService.saveAssignment(savedAssignment);

      setIsSaving(false);
      alert(isEditing ? 'Đã lưu cập nhật bài tập và câu hỏi thành công!' : 'Tạo bài tập thành công!');
      onSaveSuccess(savedAssignment);
    } catch (err) {
      console.error('Lỗi khi lưu đề thi:', err);
      setIsSaving(false);
      alert('Có lỗi xảy ra khi lưu đề thi. Vui lòng thử lại.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-200 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {isEditing ? 'Chỉnh sửa bài tập & Câu hỏi' : 'Tạo bài tập & Đề kiểm tra mới'}
            </h1>
            {isEditing && editingAssignment && (
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                Mã: {editingAssignment.assignmentCode}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isEditing
              ? `Chỉnh sửa nội dung đề bài, đáp án đúng, thang điểm và các câu hỏi của bài tập.`
              : 'Soạn đề thi linh hoạt qua việc nhập từng câu hoặc tải file PDF.'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl disabled:opacity-50 cursor-pointer"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md text-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>ĐANG LƯU...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isEditing ? 'LƯU CẬP NHẬT CÂU HỎI' : 'LƯU BÀI TẬP'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Section 1: General Assignment Info */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black">
              1
            </span>
            Thông tin chung bài tập
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Title */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tên bài tập / Đề thi *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ví dụ: Ôn tập chương 1 – Phân số và số thập phân"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            {/* Grade */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Lớp *</label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value as GradeLevel)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold"
              >
                <option value="6">Toán Lớp 6</option>
                <option value="7">Toán Lớp 7</option>
                <option value="8">Toán Lớp 8</option>
                <option value="9">Toán Lớp 9</option>
              </select>
            </div>

            {/* Topic */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Chủ đề / Dạng bài</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ví dụ: Phân số, Hình học, Số nguyên..."
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            {/* Target Class */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Giao cho lớp</label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold"
              >
                <option value="all">Tất cả các lớp (Toàn khối)</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    Lớp {cls.name} ({cls.students?.length || 0} học sinh)
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Thời gian làm bài (Phút)
              </label>
              <input
                type="number"
                min={0}
                max={180}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                placeholder="0 = Không giới hạn"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Nhập 0 nếu không tính giờ</span>
            </div>

            {/* Deadline */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Hạn chót nộp bài</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            {/* Allow view result */}
            <div className="sm:col-span-2 flex items-center space-x-3 pt-2">
              <input
                type="checkbox"
                id="allowViewResult"
                checked={allowViewResult}
                onChange={(e) => setAllowViewResult(e.target.checked)}
                className="w-5 h-5 text-indigo-600 rounded-md focus:ring-indigo-500 border-slate-300"
              />
              <label htmlFor="allowViewResult" className="text-sm font-semibold text-slate-800 cursor-pointer">
                Cho phép học sinh xem điểm và lời giải chi tiết ngay sau khi nộp
              </label>
            </div>
          </div>
        </div>

        {/* --- CÔNG TẮC CHUYỂN CHẾ ĐỘ TEXT / PDF --- */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-fit border border-slate-200 shadow-inner">
          <button
            type="button"
            onClick={() => setExamMode('text')}
            className={`flex items-center justify-center space-x-2 flex-1 sm:flex-none sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              examMode === 'text' 
                ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Chế độ nhập câu hỏi</span>
          </button>
          <button
            type="button"
            onClick={() => setExamMode('pdf')}
            className={`flex items-center justify-center space-x-2 flex-1 sm:flex-none sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              examMode === 'pdf' 
                ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileBadge className="w-4 h-4" />
            <span>Chế độ Tải đề PDF</span>
          </button>
        </div>

        {/* ==========================================
            HIỂN THỊ DỰA TRÊN CHẾ ĐỘ ĐƯỢC CHỌN 
            ========================================== */}
        
        {examMode === 'text' ? (
          /* SECTION 2: CHẾ ĐỘ TEXT TRUYỀN THỐNG */
          <div className="space-y-4">
            {importSuccessAlert && (
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-900 text-sm font-semibold flex items-center space-x-2 animate-in fade-in duration-150">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{importSuccessAlert}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black">
                  2
                </span>
                Ngân hàng câu hỏi ({questions.length} câu)
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAiSolveModal(true)}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-700 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  title="AI Tự động giải toán & Lập bảng đáp án chuẩn A-B-C-D cho toàn bộ câu hỏi (Bảo toàn 100% câu hỏi)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>AI Giải & Lập bảng đáp án</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTextQuickPaste(!showTextQuickPaste)}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  title="Dán nhanh chuỗi đáp án (vd: 1A 2B 3C... hoặc ABCD...)"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Dán đáp án nhanh</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFileUploadInitialTab('pdf');
                    setShowFileUploadModal(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
                  title="Tách toàn bộ câu hỏi và công thức toán từ file PDF bằng AI Gemini"
                >
                  <FileText className="w-4 h-4 text-rose-300" />
                  <span>Tách đề PDF (AI)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFileUploadInitialTab('image');
                    setShowFileUploadModal(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
                  title="Dán trực tiếp ảnh chụp đề bài từ clipboard (Ctrl+V) hoặc tải ảnh chụp"
                >
                  <Camera className="w-4 h-4 text-purple-200" />
                  <span>Dán ảnh đề (Ctrl+V)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFileUploadInitialTab('file');
                    setShowFileUploadModal(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  title="Nhập từ file Word (.docx), Excel (.xlsx) hoặc JSON"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
                  <span>Word / Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAiGenModal(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 bg-gradient-to-r from-purple-50 to-indigo-50 hover:from-purple-100 hover:to-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>Sinh câu hỏi gợi ý</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRawImportModal(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Dán đề text</span>
                </button>
              </div>
            </div>

            {/* Quick Paste Answer Input for Text Mode */}
            {showTextQuickPaste && (
              <div className="p-4 bg-indigo-50/80 rounded-2xl border border-indigo-200 animate-in slide-in-from-top-2">
                <label className="block text-xs font-bold text-indigo-900 mb-1">
                  Dán nhanh chuỗi đáp án (Hỗ trợ định dạng: "1A 2B 3C 4D..." hoặc chuỗi "ABCDABCD...")
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textQuickPasteInput}
                    onChange={(e) => setTextQuickPasteInput(e.target.value)}
                    placeholder="Ví dụ: 1A 2C 3B 4D 5A 6B..."
                    className="flex-1 px-3 py-2 text-xs bg-white border border-indigo-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleApplyTextQuickPaste}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Gán đáp án
                  </button>
                </div>
              </div>
            )}

            {/* CẢNH BÁO THÔNG MINH: CÁC CÂU CÓ THỂ THIẾU HÌNH VẼ */}
            {missingImageQuestions.length > 0 && (
              <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-start space-x-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-xs">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-black text-sm text-amber-950">
                        Phát hiện {missingImageQuestions.length} câu hỏi có thể cần hình vẽ minh họa!
                      </h4>
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900">
                        Đề bài nhắc đến hình vẽ
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed max-w-2xl">
                      Đề bài các câu này có chứa từ khóa <em>"hình bên", "hình vẽ", "đồ thị", "như hình"...</em> nhưng chưa có ảnh đính kèm. Thầy/Cô hãy kiểm tra đề gốc, chụp màn hình và dán (Ctrl+V) vào ô câu hỏi tương ứng:
                    </p>
                    {/* Danh sách nút nhảy nhanh đến từng câu */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      <span className="text-[11px] font-bold text-amber-900">Nhảy nhanh đến:</span>
                      {missingImageQuestions.map(mq => (
                        <button
                          key={mq.id}
                          type="button"
                          onClick={() => scrollToQuestion(mq.id)}
                          className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 font-extrabold text-xs rounded-xl border border-amber-300 shadow-2xs transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1"
                          title={`Bấm để cuộn đến Câu ${mq.order}`}
                        >
                          <span>Câu {mq.order}</span>
                          <ImageIcon className="w-3 h-3 text-amber-600" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 w-full md:w-auto">
                  <button
                    type="button"
                    onClick={() => setQuestionFilter(questionFilter === 'missing_image' ? 'all' : 'missing_image')}
                    className={`w-full md:w-auto px-4 py-2.5 rounded-2xl text-xs font-black shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      questionFilter === 'missing_image'
                        ? 'bg-slate-900 text-white'
                        : 'bg-amber-600 hover:bg-amber-700 text-white'
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>{questionFilter === 'missing_image' ? 'Xem lại tất cả câu' : `Lọc riêng ${missingImageQuestions.length} câu thiếu hình`}</span>
                  </button>
                </div>
              </div>
            )}

            {/* BỘ LỌC CÂU HỎI THÔNG MINH */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-100/90 rounded-2xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setQuestionFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    questionFilter === 'all'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  Tất cả ({questions.length})
                </button>

                <button
                  type="button"
                  onClick={() => setQuestionFilter('missing_image')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    questionFilter === 'missing_image'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : missingImageQuestions.length > 0
                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Cần chèn hình ({missingImageQuestions.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuestionFilter('has_image')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    questionFilter === 'has_image'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Đã có hình ({hasImageQuestions.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuestionFilter('mcq')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    questionFilter === 'mcq'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  Trắc nghiệm ({mcqQuestionsCount})
                </button>

                <button
                  type="button"
                  onClick={() => setQuestionFilter('essay')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    questionFilter === 'essay'
                      ? 'bg-white text-purple-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  Tự luận ({essayQuestionsCount})
                </button>
              </div>

              {questionFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setQuestionFilter('all')}
                  className="text-xs font-bold text-indigo-600 hover:underline px-2 py-1 cursor-pointer"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {questions.filter((q) => {
                if (questionFilter === 'missing_image') return isQuestionMissingImage(q);
                if (questionFilter === 'has_image') return Boolean(q.imageUrl && q.imageUrl.trim().length > 0);
                if (questionFilter === 'mcq') return !isEssayQuestion(q);
                if (questionFilter === 'essay') return isEssayQuestion(q);
                return true;
              }).length === 0 ? (
                <div className="bg-white rounded-3xl p-8 text-center border border-dashed border-slate-200 space-y-2">
                  <p className="text-sm font-bold text-slate-700">Không có câu hỏi nào phù hợp với bộ lọc hiện tại.</p>
                  <button
                    type="button"
                    onClick={() => setQuestionFilter('all')}
                    className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    Xem lại toàn bộ {questions.length} câu hỏi
                  </button>
                </div>
              ) : (
                questions
                  .filter((q) => {
                    if (questionFilter === 'missing_image') return isQuestionMissingImage(q);
                    if (questionFilter === 'has_image') return Boolean(q.imageUrl && q.imageUrl.trim().length > 0);
                    if (questionFilter === 'mcq') return !isEssayQuestion(q);
                    if (questionFilter === 'essay') return isEssayQuestion(q);
                    return true;
                  })
                  .map((q) => {
                    const qIdx = questions.findIndex(item => item.id === q.id);
                    const isMissingImg = isQuestionMissingImage(q);
                    const isHighlighted = highlightedQuestionId === q.id;

                    return (
                      <div
                        key={q.id}
                        id={`question-card-${q.id}`}
                        className={`bg-white rounded-3xl p-6 shadow-sm border transition-all duration-300 space-y-4 ${
                          isHighlighted
                            ? 'ring-4 ring-amber-400 border-amber-400 bg-amber-50/20'
                            : isMissingImg
                            ? 'border-amber-300 shadow-amber-50/50'
                            : 'border-slate-200'
                        }`}
                      >
                        {/* Question Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center">
                              {q.order || (qIdx + 1)}
                            </span>
                            <span className="font-bold text-sm text-slate-800">Câu hỏi số {q.order || (qIdx + 1)}</span>
                            
                            {/* Image Status Badges */}
                            {isMissingImg && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-black flex items-center gap-1 shadow-2xs">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                                  <span>Cần chèn hình vẽ</span>
                                </span>
                                {getMissingImageReason(q) && (
                                  <span className="hidden sm:inline-block text-[11px] text-amber-800 font-semibold bg-amber-50/90 px-2 py-0.5 rounded-md border border-amber-200">
                                    💡 {getMissingImageReason(q)}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuestion(qIdx, { dismissMissingImageWarning: true })}
                                  className="text-[10px] text-slate-500 hover:text-slate-800 underline px-1 py-0.5 cursor-pointer"
                                  title="Đánh dấu câu này không cần ảnh minh họa"
                                >
                                  (Bỏ qua cảnh báo)
                                </button>
                              </div>
                            )}
                            {q.imageUrl && (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Đã có hình vẽ</span>
                              </span>
                            )}

                            {/* Type selector */}
                            <select
                              value={isEssayQuestion(q) ? 'essay' : 'multiple_choice'}
                              onChange={(e) => handleUpdateQuestion(qIdx, { type: e.target.value as 'multiple_choice' | 'essay' })}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                isEssayQuestion(q)
                                  ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                              }`}
                            >
                              <option value="multiple_choice">🎯 Trắc nghiệm (A, B, C, D)</option>
                              <option value="essay">✍️ Tự luận (Học sinh giải/chụp ảnh)</option>
                            </select>

                            {/* AI Solve Single Question Button */}
                            {!isEssayQuestion(q) && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const res = await aiService.solveSingleQuestion({ question: q, grade, topic });
                                    handleUpdateQuestion(qIdx, {
                                      correctAnswer: res.correctAnswer,
                                      explanation: res.explanation
                                    });
                                    alert(`Đã giải xong câu ${q.order || (qIdx + 1)}! Đáp án đúng là: ${res.correctAnswer}`);
                                  } catch {
                                    alert('Không thể giải câu này lúc này.');
                                  }
                                }}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors flex items-center gap-1 cursor-pointer"
                                title="AI giải nhanh câu này và tự động chọn đáp án đúng"
                              >
                                <Sparkles className="w-3 h-3 text-violet-600" />
                                <span>AI giải câu này</span>
                              </button>
                            )}
                          </div>

                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1">
                        <span className="text-xs text-slate-500 font-medium">Điểm:</span>
                        <input
                          type="number"
                          step="0.25"
                          min="0.25"
                          max="10"
                          value={q.points}
                          onChange={(e) => handleUpdateQuestion(qIdx, { points: Number(e.target.value) })}
                          className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(qIdx)}
                        className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Xóa câu hỏi"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Question Text */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        Nội dung câu hỏi *
                      </label>
                      <span className="text-[11px] text-indigo-600 font-semibold">
                        {'Hỗ trợ LaTeX: $...$ (inline) hoặc $$...$$ (block)'}
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      value={q.question}
                      onChange={(e) => handleUpdateQuestion(qIdx, { question: e.target.value })}
                      onPaste={async (e) => {
                        const items = e.clipboardData?.items;
                        if (items) {
                          for (let i = 0; i < items.length; i++) {
                            if (items[i].type.indexOf('image') !== -1) {
                              e.preventDefault();
                              const file = items[i].getAsFile();
                              if (file) {
                                try {
                                  const compressed = await processQuestionImage(file);
                                  handleUpdateQuestion(qIdx, { imageUrl: compressed });
                                } catch (err) {
                                  console.error('Lỗi dán ảnh:', err);
                                }
                              }
                              break;
                            }
                          }
                        }
                      }}
                      placeholder={isEssayQuestion(q) ? "Nhập đề bài tự luận Toán (ví dụ: a) Rút gọn biểu thức A; b) Tìm x để A > 0...)" : "Nhập đề bài Toán..."}
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500"
                      required
                    />

                    {/* Vùng tải & dán ảnh minh họa câu hỏi */}
                    <QuestionImageUpload
                      imageUrl={q.imageUrl}
                      questionOrder={q.order || (qIdx + 1)}
                      onImageChange={(newUrl) => handleUpdateQuestion(qIdx, { imageUrl: newUrl })}
                    />

                    {(q.question.trim() || q.imageUrl) && (
                      <div className="mt-2 p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 text-sm">
                        <div className="text-[10px] uppercase font-black tracking-wider text-indigo-700 mb-1">
                          Xem trước hiển thị:
                        </div>
                        {q.question.trim() && <MathDisplay text={q.question} />}
                        {q.imageUrl && (
                          <div className="mt-2 pt-2 border-t border-indigo-100/60 flex flex-col items-center">
                            <img
                              src={q.imageUrl}
                              alt="Xem trước hình minh họa"
                              className="max-h-48 max-w-full object-contain rounded-lg border border-indigo-200/80 shadow-2xs"
                            />
                            <span className="text-[10px] text-slate-500 mt-1 italic">
                              (Hình vẽ minh họa câu hỏi)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Options for Multiple Choice */}
                  {!isEssayQuestion(q) && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2">
                        Các lựa chọn & Đáp án đúng <span className="text-indigo-600">(Chọn nút tròn để làm đáp án)</span>
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(q.options && q.options.length > 0 ? q.options : [
                          { id: 'A', text: '' }, { id: 'B', text: '' }, { id: 'C', text: '' }, { id: 'D', text: '' }
                        ]).map((opt) => {
                          const isCorrect = q.correctAnswer === opt.id;
                          return (
                            <div
                              key={opt.id}
                              className={`flex items-center p-2 rounded-2xl border-2 transition-all ${
                                isCorrect ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/70'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleUpdateQuestion(qIdx, { correctAnswer: opt.id })}
                                className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center mr-2 shrink-0 transition-colors ${
                                  isCorrect ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                                }`}
                              >
                                {opt.id}
                              </button>
                              <input
                                type="text"
                                value={opt.text}
                                onChange={(e) => handleUpdateOption(qIdx, opt.id, e.target.value)}
                                placeholder={`Phương án ${opt.id}...`}
                                className="flex-1 bg-white px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                                required
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Rubric / Criteria for Essay */}
                  {isEssayQuestion(q) && (
                    <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-2xl space-y-2">
                      <label className="block text-xs font-bold text-purple-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        <span>Tiêu chí chấm điểm / Thang điểm chi tiết (Rubric để AI chấm):</span>
                      </label>
                      <textarea
                        rows={2}
                        value={q.rubric || ''}
                        onChange={(e) => handleUpdateQuestion(qIdx, { rubric: e.target.value })}
                        placeholder="Ví dụ: - Rút gọn đúng mẫu số: +0.5đ; - Biến đổi đúng tử: +0.5đ; - Kết luận: +0.5đ"
                        className="w-full p-2.5 bg-white border border-purple-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  )}

                  {/* Explanation */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Lời giải chi tiết / Hướng dẫn giải</label>
                      <input
                        type="text"
                        value={q.explanation || ''}
                        onChange={(e) => handleUpdateQuestion(qIdx, { explanation: e.target.value })}
                        placeholder="Hướng dẫn giải từng bước..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Dạng bài / Kỹ năng</label>
                      <input
                        type="text"
                        value={q.topicHint || ''}
                        onChange={(e) => handleUpdateQuestion(qIdx, { topicHint: e.target.value })}
                        placeholder="Ví dụ: Hình học không gian, Rút gọn biểu thức..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      />
                    </div>
                  </div>
                </div>
              );
            }))}
          </div>

            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleAddQuestion}
                className="inline-flex items-center space-x-2 px-5 py-3 bg-white hover:bg-slate-50 text-indigo-600 font-bold rounded-2xl border-2 border-dashed border-indigo-300 hover:border-indigo-500 shadow-xs transition-all active:scale-98 cursor-pointer text-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ THÊM CÂU TRẮC NGHIỆM</span>
              </button>

              <button
                type="button"
                onClick={handleAddEssayQuestion}
                className="inline-flex items-center space-x-2 px-5 py-3 bg-white hover:bg-purple-50 text-purple-700 font-bold rounded-2xl border-2 border-dashed border-purple-300 hover:border-purple-500 shadow-xs transition-all active:scale-98 cursor-pointer text-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ THÊM CÂU TỰ LUẬN</span>
              </button>
            </div>
          </div>
        ) : (
          /* SECTION 2: CHẾ ĐỘ PDF */
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2 mb-6">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black">
                2
              </span>
              Tải Đề PDF & Bảng đáp án kỹ thuật số
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
              {/* Khu vực Upload PDF */}
              <div className="flex flex-col h-[550px]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-800 text-sm">1. Tải lên file PDF gốc</h3>
                </div>
                
                {pdfPreviewUrl ? (
                  <div className="flex-1 border-2 border-slate-200 rounded-2xl overflow-hidden bg-slate-100 relative group">
                    <iframe src={`${pdfPreviewUrl}#toolbar=0`} className="w-full h-full border-none" title="PDF Preview" />
                    <button 
                      type="button"
                      onClick={() => { setPdfFile(null); setPdfPreviewUrl(''); }}
                      className="absolute top-3 right-3 bg-white/90 p-2 rounded-lg text-rose-600 shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-50"
                      title="Xóa và chọn file khác"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 transition-colors cursor-pointer p-6 text-center">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4 text-indigo-500">
                      <FileBadge className="w-8 h-8" />
                    </div>
                    <span className="text-sm font-bold text-slate-700 mb-1">Click để tải lên file Đề thi</span>
                    <span className="text-xs text-slate-500">Chỉ hỗ trợ định dạng .PDF</span>
                    <input 
                      type="file" 
                      accept=".pdf" 
                      onChange={handlePdfUpload}
                      className="hidden" 
                    />
                  </label>
                )}
              </div>

              {/* Khu vực Grid Đáp án */}
              <div className="flex flex-col h-[550px]">
                <div className="flex flex-col gap-2 mb-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm">2. Thiết lập bảng đáp án</h3>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-500">Số câu:</label>
                      <input 
                        type="number" 
                        value={pdfNumQuestions} 
                        onChange={(e) => setPdfNumQuestions(Number(e.target.value))}
                        className="w-16 border-2 border-slate-200 rounded-lg p-1.5 text-center text-sm font-bold focus:border-indigo-500 focus:outline-none" 
                        min={1} max={100}
                      />
                    </div>
                  </div>

                  {/* Actions for PDF answers */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleAiSolvePdf}
                      disabled={isSolvingPdf}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-700 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer disabled:opacity-50"
                      title="AI Tự động đọc câu hỏi trong file PDF và giải đáp án chuẩn"
                    >
                      {isSolvingPdf ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{pdfSolveProgress || 'Đang giải...'}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>AI Đọc & Giải đề PDF</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPdfQuickPaste(!showPdfQuickPaste)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 cursor-pointer"
                      title="Dán nhanh chuỗi đáp án (vd: 1A 2B 3C...)"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Dán nhanh đáp án</span>
                    </button>
                  </div>

                  {/* Quick paste input for PDF */}
                  {showPdfQuickPaste && (
                    <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-200 space-y-2 animate-in slide-in-from-top-1">
                      <input
                        type="text"
                        value={pdfQuickPasteText}
                        onChange={(e) => setPdfQuickPasteText(e.target.value)}
                        placeholder="Dán chuỗi: 1A 2B 3C... hoặc ABCDABCD..."
                        className="w-full px-3 py-1.5 text-xs bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowPdfQuickPaste(false)}
                          className="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyPdfQuickPaste}
                          className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer"
                        >
                          Áp dụng vào bảng
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 border-2 border-slate-200 rounded-2xl bg-slate-50 custom-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Array.from({ length: pdfNumQuestions }).map((_, i) => {
                      const qNum = i + 1;
                      return (
                        <div key={qNum} className="flex flex-col bg-white p-2.5 border border-slate-200 rounded-xl shadow-sm hover:border-indigo-300 transition-colors">
                          <span className="text-[11px] font-black text-slate-400 mb-1.5">Câu {qNum}</span>
                          <div className="flex justify-between gap-1">
                            {['A', 'B', 'C', 'D'].map(opt => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleSelectPdfAnswer(qNum, opt)}
                                className={`flex-1 aspect-square max-h-8 rounded-lg text-xs font-black transition-all ${
                                  pdfAnswers[qNum] === opt 
                                    ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-200' 
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-500 text-right mt-3">
                  Đã cấu hình: <strong className="text-indigo-600">{Object.keys(pdfAnswers).length}</strong> / {pdfNumQuestions} câu
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Save Bar */}
        <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl flex items-center justify-between">
          <div className="text-xs font-medium text-slate-600">
            {examMode === 'text' ? (
              <>
                Tổng cộng: <strong className="text-indigo-600">{questions.length}</strong> câu hỏi • Tổng điểm:{' '}
                <strong className="text-slate-900">
                  {questions.reduce((sum, q) => sum + (q.points || 0), 0)}
                </strong>
              </>
            ) : (
              <>
                Đề PDF: <strong className="text-indigo-600">{pdfNumQuestions}</strong> câu • Điểm chia đều:{' '}
                <strong className="text-slate-900">10 điểm</strong>
              </>
            )}
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center space-x-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>ĐANG LƯU BÀI TẬP...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>LƯU & TẠO MÃ BÀI TẬP</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* --- CÁC MODAL HỖ TRỢ CHẾ ĐỘ TEXT --- */}
      {showAiGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-lg text-slate-900">Tạo câu hỏi gợi ý tự động</h3>
              </div>
              <button onClick={() => setShowAiGenModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <p className="text-xs text-slate-600">
                Hệ thống sẽ sinh bộ câu hỏi trắc nghiệm Toán THCS theo đúng Khối <strong>{grade}</strong> và chủ đề <strong>{topic}</strong>.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số lượng câu cần sinh</label>
                <select
                  value={aiGenCount}
                  onChange={(e) => setAiGenCount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                >
                  <option value={3}>3 câu hỏi</option>
                  <option value={5}>5 câu hỏi</option>
                  <option value={10}>10 câu hỏi</option>
                </select>
              </div>

              <div className="p-3 bg-purple-50 text-purple-900 text-xs rounded-xl flex items-start space-x-2">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-purple-600" />
                <span>
                  Module này được thiết kế theo cấu trúc mở sẵn sàng tích hợp trực tiếp Gemini API khi Thầy/Cô cần mở rộng về sau.
                </span>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => setShowAiGenModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleAiGenerateQuestions}
                disabled={isAiGenerating}
                className="px-5 py-2 text-sm font-bold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl shadow-sm"
              >
                {isAiGenerating ? 'Đang tạo câu...' : 'Thêm vào đề thi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRawImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Dán câu hỏi từ Word / File Text / LaTeX (Tex)</h3>
                  <p className="text-xs text-slate-500">Hỗ trợ định dạng thường và cú pháp TeX (\begin&#123;ex&#125;, \choice, \includegraphics, TikZ...)</p>
                </div>
              </div>
              <button onClick={() => setShowRawImportModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200/80 text-xs text-amber-900 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Hệ thống tự động phát hiện câu có hình vẽ:</span>
                  <p className="mt-0.5 text-amber-800">
                    Khi dán đề chứa <em>"hình bên", "hình vẽ", \includegraphics, TikZ...</em>, hệ thống sẽ tự động ghim cảnh báo và đánh dấu để Thầy/Cô dễ dàng lọc và chèn ảnh sau khi nhập.
                  </p>
                </div>
              </div>

              <textarea
                value={rawTextImport}
                onChange={(e) => setRawTextImport(e.target.value)}
                placeholder={`--- Ví dụ 1 (Văn bản thường): ---\nCâu 1: Cho hình vẽ bên, tam giác ABC cân tại A...\nA. 5cm\nB. 6cm\nC. 7cm\nD. 8cm\n\n--- Ví dụ 2 (Định dạng TeX / LaTeX): ---\n\\begin{ex}\nCho hình chữ nhật ABCD như hình bên có AB = 4cm, BC = 3cm...\n\\choice\n{A. 5cm}\n{\\True B. 10cm}\n{C. 12cm}\n{D. 7cm}\n\\loigiai{Áp dụng định lý Pythagore...}\n\\end{ex}`}
                rows={11}
                className="w-full p-3.5 font-mono text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4 shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                {rawTextImport.trim() ? `Độ dài: ${rawTextImport.trim().length} ký tự` : 'Chưa nhập nội dung'}
              </span>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRawImportModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleImportFromText}
                  disabled={!rawTextImport.trim()}
                  className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl shadow-sm cursor-pointer flex items-center space-x-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Tách và nhập câu hỏi</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: File Upload (Excel, Word, PDF bóc tách AI & Dán ảnh) */}
      <FileUploadModal
        isOpen={showFileUploadModal}
        onClose={() => setShowFileUploadModal(false)}
        onImportQuestions={handleImportQuestionsFromFile}
        initialTab={fileUploadInitialTab}
        defaultGrade={grade}
      />

      {/* Modal: AI Giải Đề & Tạo Bảng Đáp Án Chuẩn */}
      {showAiSolveModal && (
        <AiSolveExamModal
          isOpen={showAiSolveModal}
          onClose={() => setShowAiSolveModal(false)}
          examTitle={title || 'Đề kiểm tra Toán'}
          grade={grade}
          topic={topic}
          questions={questions}
          onApplyAnswers={(updatedQuestions) => {
            setQuestions(updatedQuestions);
            setImportSuccessAlert(`🎉 Đã cập nhật thành công bảng đáp án chuẩn cho toàn bộ ${updatedQuestions.length} câu hỏi!`);
            setTimeout(() => setImportSuccessAlert(null), 4000);
          }}
        />
      )}
    </div>
  );
};
