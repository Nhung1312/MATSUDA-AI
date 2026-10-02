import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Assignment, Submission, ViolationEvent, Question } from '../../types';
import { MathDisplay } from '../../components/MathDisplay';
import { GradingService } from '../../services/gradingService';
import { StorageService } from '../../services/storageService';
import { FirestoreService } from '../../services/firestoreService';
import { aiService, HybridAIService } from '../../services/aiService';
import { useTheme } from '../../context/ThemeContext';
import { shuffleAssignmentQuestionsAndOptions, formatViolationTime } from '../../utils/antiCheatUtils';
import { isEssayQuestion, getQuestionTypeLabel } from '../../utils/questionUtils';
import { ImageLightboxModal } from '../../components/ImageLightboxModal';
import { soundEffects } from '../../utils/soundEffects';
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Flag, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle,
  X,
  Maximize2,
  Minimize2,
  Check,
  RotateCcw,
  Sparkles,
  Bookmark,
  Sun,
  Moon,
  ShieldCheck,
  ShieldAlert,
  Shuffle,
  Lock,
  EyeOff,
  Info,
  LayoutGrid,
  ListOrdered,
  Camera,
  Upload,
  Image as ImageIcon,
  Trash2,
  Eye,
  ExternalLink,
  SplitSquareVertical,
  FileText,
  Loader2,
  Volume2,
  VolumeX,
  Zap,
  CheckCircle2,
  Calculator as CalculatorIcon,
  Edit3,
  ZoomIn
} from 'lucide-react';
import { ScientificCalculatorModal } from '../../components/ScientificCalculatorModal';
import { DigitalScratchpadModal } from '../../components/DigitalScratchpadModal';
import { useMistakeVaultStore } from '../../store/useMistakeVaultStore';
import { ExamReviewSheetModal } from '../../components/ExamReviewSheetModal';

interface StudentExamPageProps {
  assignment: Assignment;
  studentName: string;
  classId: string;
  className: string;
  onFinishExam: (submission: Submission) => void;
}

interface ExamDraft {
  answers: Record<string, string>;
  studentSolutions?: Record<string, string>;
  essayImagesByQuestion?: Record<string, string[]>;
  generalPdfImages?: string[];
  flaggedQuestionIds: string[];
  timeLeft: number;
  currentIndex: number;
  startedAt: string;
  lastSavedAt: string;
  shuffledAssignment?: Assignment;
  tabSwitchCount?: number;
  violationEvents?: ViolationEvent[];
}

/**
 * Nén ảnh trước khi lưu vào localStorage hoặc truyền lên hệ thống
 * Giới hạn tối đa 1200px chiều dài/rộng và chất lượng JPEG 0.75 để tiết kiệm bộ nhớ
 */
const compressImageFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1200;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          resolve(dataUrl);
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const StudentExamPage: React.FC<StudentExamPageProps> = ({
  assignment,
  studentName,
  classId,
  className,
  onFinishExam
}) => {
  const { isDark, toggleTheme } = useTheme();
  const draftStorageKey = `toan_thcs_draft_${assignment.id}_${encodeURIComponent(studentName)}`;

  // Nhận diện chế độ PDF
  const isPdfMode = (assignment as any).type === 'pdf';
  const [pdfViewMode, setPdfViewMode] = useState<'split' | 'pdf' | 'sheet'>('split');

  // 1. Restore draft if available from LocalStorage
  const [initialLoadedDraft] = useState<ExamDraft | null>(() => {
    try {
      const saved = localStorage.getItem(draftStorageKey);
      if (saved) {
        return JSON.parse(saved) as ExamDraft;
      }
    } catch (e) {
      console.warn('Failed to load draft:', e);
    }
    return null;
  });

  // 2. SHUFFLE SYSTEM: Đề PDF giữ nguyên thứ tự 1..N; Đề Text xáo trộn ngẫu nhiên
  const [currentAssignment, setCurrentAssignment] = useState<Assignment>(() => {
    if (initialLoadedDraft?.shuffledAssignment && initialLoadedDraft.shuffledAssignment.questions?.length > 0) {
      return initialLoadedDraft.shuffledAssignment;
    }
    if ((assignment as any).type === 'pdf') {
      return assignment;
    }
    return shuffleAssignmentQuestionsAndOptions(assignment);
  });

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    return initialLoadedDraft?.currentIndex ?? 0;
  });

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    return initialLoadedDraft?.answers ?? {};
  });

  const [studentSolutions, setStudentSolutions] = useState<Record<string, string>>(() => {
    return initialLoadedDraft?.studentSolutions ?? {};
  });

  const [essayImagesByQuestion, setEssayImagesByQuestion] = useState<Record<string, string[]>>(() => {
    return initialLoadedDraft?.essayImagesByQuestion ?? {};
  });

  const [generalPdfImages, setGeneralPdfImages] = useState<string[]>(() => {
    return initialLoadedDraft?.generalPdfImages ?? [];
  });

  const [flaggedQuestions, setFlaggedQuestions] = useState<string[]>(() => {
    return initialLoadedDraft?.flaggedQuestionIds ?? [];
  });

  const [startedAt] = useState<string>(() => {
    return initialLoadedDraft?.startedAt ?? new Date().toISOString();
  });

  // Anti-cheat violation tracking state
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(() => {
    return initialLoadedDraft?.tabSwitchCount ?? 0;
  });

  const [violationEvents, setViolationEvents] = useState<ViolationEvent[]>(() => {
    return initialLoadedDraft?.violationEvents ?? [];
  });

  const [showViolationModal, setShowViolationModal] = useState<boolean>(false);
  const [latestViolation, setLatestViolation] = useState<{ reason: string; count: number; time: string } | null>(null);
  const [antiCheatToast, setAntiCheatToast] = useState<{ message: string; id: number } | null>(null);
  const [showAntiCheatPolicyModal, setShowAntiCheatPolicyModal] = useState<boolean>(false);

  // MỚI: Trạng thái Máy tính khoa học mini & Bảng nháp trực tiếp
  const [showCalculator, setShowCalculator] = useState<boolean>(false);
  const [showScratchpad, setShowScratchpad] = useState<boolean>(false);

  // Total timer in seconds
  const totalSeconds = (assignment.durationMinutes || 45) * 60;
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    if (initialLoadedDraft && typeof initialLoadedDraft.timeLeft === 'number') {
      return initialLoadedDraft.timeLeft;
    }
    return totalSeconds;
  });

  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [showDraftToast, setShowDraftToast] = useState<boolean>(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  const [fontSizeScale, setFontSizeScale] = useState<'normal' | 'large' | 'xlarge'>('normal');
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const [isSubmittingWithAI, setIsSubmittingWithAI] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEffects.isMuted());
  const [matrixFilter, setMatrixFilter] = useState<'all' | 'unanswered' | 'flagged'>('all');

  const handleToggleSound = () => {
    const nextMuted = soundEffects.toggleMute();
    setIsMuted(nextMuted);
    triggerAntiCheatToast(nextMuted ? '🔇 Đã tắt âm thanh' : '🔊 Đã bật âm thanh tương tác sinh động');
  };

  // Lightbox Preview Modal State
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfUploadInputRef = useRef<HTMLInputElement>(null);
  const leaveTimeRef = useRef<number | null>(null);
  const isFilePickerActiveRef = useRef<boolean>(false);

  const questions = currentAssignment.questions;
  const currentQ: Question | undefined = questions[currentIndex];

  // Helper show anti-cheat toast
  const triggerAntiCheatToast = useCallback((msg: string) => {
    setAntiCheatToast({ message: msg, id: Date.now() });
    setTimeout(() => {
      setAntiCheatToast(null);
    }, 4500);
  }, []);

  // Record a violation event securely
  const recordViolation = useCallback((type: ViolationEvent['type'], description: string) => {
    const timestamp = new Date().toISOString();
    const newEvent: ViolationEvent = { timestamp, type, description };

    setTabSwitchCount((prev) => {
      const nextCount = prev + 1;
      setLatestViolation({
        reason: description,
        count: nextCount,
        time: formatViolationTime(timestamp)
      });
      setShowViolationModal(true);
      return nextCount;
    });

    setViolationEvents((prev) => [...prev, newEvent]);
    triggerAntiCheatToast(`⚠️ Vi phạm giám sát: ${description}`);
  }, [triggerAntiCheatToast]);

  // Anti-cheat Listeners: Visibility, Blur/Focus, ContextMenu, Copy, Keydown
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (!isFilePickerActiveRef.current && !leaveTimeRef.current) {
          leaveTimeRef.current = Date.now();
        }
      } else {
        if (isFilePickerActiveRef.current) {
          setTimeout(() => {
            isFilePickerActiveRef.current = false;
          }, 1000);
          leaveTimeRef.current = null;
          return;
        }
        if (leaveTimeRef.current) {
          const elapsedSeconds = Math.max(1, Math.round((Date.now() - leaveTimeRef.current) / 1000));
          leaveTimeRef.current = null;
          recordViolation(
            'tab_switch',
            `Rời khỏi tab bài thi (Chuyển tab hoặc thu nhỏ trình duyệt) trong ~${elapsedSeconds}s`
          );
        }
      }
    };

    const handleWindowBlur = () => {
      if (!isFilePickerActiveRef.current && !leaveTimeRef.current) {
        leaveTimeRef.current = Date.now();
      }
    };

    const handleWindowFocus = () => {
      if (isFilePickerActiveRef.current) {
        setTimeout(() => {
          isFilePickerActiveRef.current = false;
        }, 1200);
        leaveTimeRef.current = null;
        return;
      }
      if (leaveTimeRef.current) {
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - leaveTimeRef.current) / 1000));
        leaveTimeRef.current = null;
        recordViolation(
          'tab_switch',
          `Rời khỏi tab bài thi (Chuyển tab hoặc thu nhỏ trình duyệt) trong ~${elapsedSeconds}s`
        );
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      triggerAntiCheatToast('🔒 Khóa chuột phải để bảo vệ đề thi.');
      return false;
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      triggerAntiCheatToast('🔒 Khóa thao tác sao chép nội dung bài thi.');
      recordViolation('copy_attempt', 'Cố gắng sao chép nội dung câu hỏi bài thi');
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Chặn PrintScreen, F12, Ctrl+U, Ctrl+Shift+I, Ctrl+C, Ctrl+V, Ctrl+P, Ctrl+S
      if (
        e.key === 'F12' ||
        e.key === 'PrintScreen' ||
        (e.ctrlKey && (
          e.key === 'u' || e.key === 'U' || 
          e.key === 'c' || e.key === 'C' || 
          e.key === 'v' || e.key === 'V' || 
          e.key === 'p' || e.key === 'P' ||
          e.key === 's' || e.key === 'S'
        )) ||
        (e.ctrlKey && e.shiftKey && (
          e.key === 'I' || e.key === 'i' || 
          e.key === 'J' || e.key === 'j' || 
          e.key === 'C' || e.key === 'c'
        ))
      ) {
        e.preventDefault();
        triggerAntiCheatToast('🔒 Phím tắt này đã bị vô hiệu hóa trong phòng thi.');
        return false;
      }
    };

    // Ignore file picker clicks when uploading essay solution images
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'file' || target.closest('input[type="file"], label'))) {
        isFilePickerActiveRef.current = true;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleDocumentClick, true);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [recordViolation, triggerAntiCheatToast]);

  // Auto-Save Draft to LocalStorage every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const draft: ExamDraft = {
        answers,
        studentSolutions,
        essayImagesByQuestion,
        generalPdfImages,
        flaggedQuestionIds: flaggedQuestions,
        timeLeft,
        currentIndex,
        startedAt,
        lastSavedAt: new Date().toISOString(),
        shuffledAssignment: currentAssignment,
        tabSwitchCount,
        violationEvents
      };
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      } catch (e) {
        // quota handled
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [answers, studentSolutions, essayImagesByQuestion, generalPdfImages, flaggedQuestions, timeLeft, currentIndex, startedAt, currentAssignment, tabSwitchCount, violationEvents, draftStorageKey]);

  // Timer countdown with audio alerts
  useEffect(() => {
    if (totalSeconds <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleForceAutoSubmit();
          return 0;
        }
        // Nhịp tick âm thanh cảnh báo khi còn 5 phút, 2 phút, 1 phút hoặc 5 giây cuối
        if (prev === 300 || prev === 120 || prev === 60 || (prev <= 5 && prev > 1)) {
          soundEffects.playTick();
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [totalSeconds]);

  // Option selection handler with pop sound
  const handleSelectOption = (questionId: string, optionId: string) => {
    soundEffects.playSelect();
    setAnswers((prev) => {
      // Toggle if already selected
      if (prev[questionId] === optionId) {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      }
      return { ...prev, [questionId]: optionId };
    });
  };

  // Text solution input handler
  const handleSolutionTextChange = (questionId: string, text: string) => {
    setStudentSolutions((prev) => ({
      ...prev,
      [questionId]: text
    }));
    // Đánh dấu câu đã có lời giải
    if (text.trim() && !answers[questionId]) {
      setAnswers((prev) => ({ ...prev, [questionId]: 'TỰ_LUẬN' }));
    }
  };

  // Upload student essay image
  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>, questionId?: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    try {
      const compressedList: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const base64 = await compressImageFile(file);
          compressedList.push(base64);
        }
      }

      if (questionId) {
        setEssayImagesByQuestion((prev) => {
          const existing = prev[questionId] || [];
          return {
            ...prev,
            [questionId]: [...existing, ...compressedList]
          };
        });
        // Đánh dấu câu này đã làm
        setAnswers((prev) => ({ ...prev, [questionId]: prev[questionId] || 'TỰ_LUẬN_ẢNH' }));
      } else {
        setGeneralPdfImages((prev) => [...prev, ...compressedList]);
      }
      triggerAntiCheatToast(`📸 Đã tải lên ${compressedList.length} ảnh bài làm thành công!`);
    } catch (err) {
      console.error(err);
      alert('Không thể đọc file ảnh. Vui lòng thử lại.');
    } finally {
      setUploadingImage(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDeleteImage = (questionId: string, imgIdx: number) => {
    setEssayImagesByQuestion((prev) => {
      const list = [...(prev[questionId] || [])];
      list.splice(imgIdx, 1);
      return { ...prev, [questionId]: list };
    });
  };

  const handleDeleteGeneralPdfImage = (imgIdx: number) => {
    setGeneralPdfImages((prev) => {
      const list = [...prev];
      list.splice(imgIdx, 1);
      return list;
    });
  };

  const toggleFlagCurrentQuestion = () => {
    if (!currentQ) return;
    soundEffects.playFlag();
    setFlaggedQuestions((prev) => {
      if (prev.includes(currentQ.id)) {
        return prev.filter((id) => id !== currentQ.id);
      } else {
        return [...prev, currentQ.id];
      }
    });
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      soundEffects.playNavigate();
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      soundEffects.playNavigate();
      setCurrentIndex((prev) => prev - 1);
    }
  };

  // Keyboard navigation shortcuts: Arrow Left/Right, F to flag, A/B/C/D or 1/2/3/4 to choose
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
        return;
      }
      if (showSubmitModal || showResetConfirmModal || showAntiCheatPolicyModal || lightboxImageUrl) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFlagCurrentQuestion();
      } else if (currentQ && !isEssayQuestion(currentQ)) {
        const keyLower = e.key.toLowerCase();
        if (['a', 'b', 'c', 'd'].includes(keyLower)) {
          e.preventDefault();
          const targetOpt = currentQ.options.find(
            (o) => o.id.toLowerCase() === keyLower || o.id.toUpperCase() === e.key.toUpperCase()
          );
          if (targetOpt) {
            handleSelectOption(currentQ.id, targetOpt.id);
          }
        } else if (['1', '2', '3', '4'].includes(e.key)) {
          e.preventDefault();
          const idx = parseInt(e.key, 10) - 1;
          if (currentQ.options[idx]) {
            handleSelectOption(currentQ.id, currentQ.options[idx].id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, currentQ, questions.length, showSubmitModal, showResetConfirmModal, showAntiCheatPolicyModal, lightboxImageUrl]);

  const handleToggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        setIsFocusMode(true);
      } else {
        document.exitFullscreen().catch(() => {});
        setIsFocusMode(false);
      }
    } catch (e) {
      setIsFocusMode((prev) => !prev);
    }
  };

  const handleResetExamProgress = () => {
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {}

    const freshShuffled = isPdfMode ? assignment : shuffleAssignmentQuestionsAndOptions(assignment);
    setCurrentAssignment(freshShuffled);
    setAnswers({});
    setStudentSolutions({});
    setEssayImagesByQuestion({});
    setGeneralPdfImages([]);
    setFlaggedQuestions([]);
    setCurrentIndex(0);
    setTimeLeft(totalSeconds);
    setTabSwitchCount(0);
    setViolationEvents([]);
    setShowResetConfirmModal(false);
    triggerAntiCheatToast('🔀 Đã làm mới đề thi và đặt lại toàn bộ câu trả lời.');
  };

  const handleForceAutoSubmit = () => {
    submitExam();
  };

  const submitExam = async () => {
    soundEffects.playSuccess();
    setIsSubmittingWithAI(true);

    try {
      localStorage.removeItem(draftStorageKey);
    } catch {}

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    const submittedAt = new Date().toISOString();
    const aiFeedbacks: Record<string, { score?: number; feedback?: string; graded?: boolean }> = {};

    // 1. Tự động chấm điểm AI cho các câu tự luận nếu có
    const essayQuestions = currentAssignment.questions.filter((q) => isEssayQuestion(q));
    if (essayQuestions.length > 0) {
      for (const eq of essayQuestions) {
        const solutionText = studentSolutions[eq.id] || '';
        const images = essayImagesByQuestion[eq.id] || [];

        if (solutionText || images.length > 0) {
          if (aiService.hasApiKey()) {
            try {
              const evalResult = await aiService.gradeEssay({
                questionText: eq.question,
                studentAnswerText: solutionText,
                essayImages: images,
                maxPoints: eq.points,
                correctAnswerCriteria: eq.correctAnswer,
                rubric: eq.rubric,
                grade: currentAssignment.grade,
                topicHint: eq.topicHint
              });

              aiFeedbacks[eq.id] = {
                score: evalResult.score,
                feedback: evalResult.feedback,
                graded: true
              };
            } catch (e) {
              console.warn('AI evaluation error on submit:', e);
            }
          } else {
            aiFeedbacks[eq.id] = {
              graded: false,
              feedback: 'Bài tự luận đã được ghi nhận đầy đủ và đang chờ chấm điểm.'
            };
          }
        }
      }
    }

    // 2. Chấm điểm tổng hợp qua GradingService
    const submission = GradingService.gradeSubmission({
      assignment: currentAssignment,
      studentAnswers: answers,
      studentSolutions,
      essayImagesByQuestion,
      generalEssayImages: generalPdfImages,
      studentName,
      classId,
      className,
      startedAt,
      submittedAt,
      tabSwitchCount,
      violationEvents,
      isShuffled: !isPdfMode,
      aiFeedbacks
    });

    try {
      await FirestoreService.saveResult(submission);
    } catch (err) {
      console.warn('Lỗi lưu kết quả lên Firestore:', err);
    }

    // MỚI: Tự động gom các câu làm sai vào Sổ tay câu sai (Mistake Vault)
    try {
      useMistakeVaultStore.getState().addMistakesFromSubmission(submission, currentAssignment);
    } catch (e) {
      console.warn('Lỗi tự động lưu vào Sổ tay câu sai:', e);
    }

    StorageService.saveSubmission(submission);
    setIsSubmittingWithAI(false);
    onFinishExam(submission);
  };

  // Metrics
  const answeredCount = questions.filter((q) => {
    return !!answers[q.id] || !!studentSolutions[q.id] || (essayImagesByQuestion[q.id] && essayImagesByQuestion[q.id].length > 0);
  }).length;
  const unansweredCount = questions.length - answeredCount;
  const flaggedCount = flaggedQuestions.length;
  const progressPercent = Math.round((answeredCount / questions.length) * 100) || 0;

  // Timer format
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isTimeCritical = totalSeconds > 0 && timeLeft <= 120;
  const isTimeWarning = totalSeconds > 0 && timeLeft <= 300 && timeLeft > 120;

  const getFontSizeClass = () => {
    if (fontSizeScale === 'large') return 'text-lg sm:text-2xl leading-relaxed';
    if (fontSizeScale === 'xlarge') return 'text-xl sm:text-3xl leading-loose';
    return 'text-base sm:text-xl leading-relaxed';
  };

  const isCurrentFlagged = currentQ ? flaggedQuestions.includes(currentQ.id) : false;
  const currentQImages = currentQ ? (essayImagesByQuestion[currentQ.id] || []) : [];
  const currentQSolution = currentQ ? (studentSolutions[currentQ.id] || '') : '';

  const rootContainerClasses = isPdfMode
    ? `h-screen overflow-hidden flex flex-col select-none transition-all ${
        isFocusMode
          ? 'fixed inset-0 z-50 bg-slate-950 text-slate-100'
          : 'bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100'
      }`
    : `min-h-screen flex flex-col justify-between select-none transition-all ${
        isFocusMode
          ? 'fixed inset-0 z-50 bg-slate-950 text-slate-100 overflow-y-auto'
          : 'bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-10'
      }`;

  return (
    <div className={rootContainerClasses} style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
      
      {/* FLOATING ANTI-CHEAT WARNING TOAST */}
      {antiCheatToast && (
        <div className="fixed top-16 sm:top-5 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4 animate-in slide-in-from-top-4 duration-200">
          <div className="bg-slate-900/95 text-white py-2.5 px-4 rounded-2xl shadow-2xl border border-rose-500/50 backdrop-blur-md flex items-center space-x-3 text-xs sm:text-sm font-bold">
            <div className="w-8 h-8 rounded-xl bg-rose-600/30 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/40">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 leading-tight text-rose-200">
              {antiCheatToast.message}
            </div>
            <button
              onClick={() => setAntiCheatToast(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* AI EVALUATION OVERLAY DURING SUBMIT */}
      {isSubmittingWithAI && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm text-white p-6">
          <div className="bg-slate-900 p-8 rounded-3xl border border-indigo-500/50 shadow-2xl max-w-md w-full text-center space-y-4 animate-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/40 animate-pulse">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black">AI Đang Tổng Hợp &amp; Chấm Bài...</h3>
            <p className="text-xs text-slate-300">
              Hệ thống đang phân tích đáp án, nhận diện hình ảnh bài làm tự luận và lưu trữ kết quả an toàn.
            </p>
            <div className="flex items-center justify-center space-x-2 text-indigo-400 text-xs font-bold pt-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Vui lòng chờ trong giây lát...</span>
            </div>
          </div>
        </div>
      )}

      {/* TOP HEADER BAR */}
      <header
        className={`w-full border-b sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3 transition-colors ${
          isFocusMode
            ? 'bg-slate-950/95 border-slate-800 backdrop-blur-md'
            : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 backdrop-blur-md shadow-xs'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Info */}
          <div className="flex items-center space-x-2 sm:space-x-3 overflow-hidden">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
              ∑
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                {assignment.title}
              </h1>
              <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">Lớp {className}</span>
                
                {/* Anti-cheat audit badge */}
                <button
                  type="button"
                  onClick={() => setShowAntiCheatPolicyModal(true)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] transition-colors cursor-pointer ${
                    tabSwitchCount === 0
                      ? 'bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-rose-100/90 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-400 animate-pulse'
                  }`}
                >
                  {tabSwitchCount === 0 ? (
                    <>
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      <span>Giám sát thi: 0 vi phạm</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-3 h-3 text-rose-600" />
                      <span>⚠️ {tabSwitchCount} vi phạm</span>
                    </>
                  )}
                </button>

                <span className="hidden sm:inline text-slate-400">•</span>
                <span className="hidden sm:inline truncate text-slate-500 dark:text-slate-400">
                  Thí sinh: <strong>{studentName}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Right: Controls & Timer & Submit */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {/* View Mode Switcher for PDF exams */}
            {isPdfMode && (
              <div className="flex items-center rounded-xl p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold">
                <button
                  onClick={() => setPdfViewMode('split')}
                  title="Chia đôi màn hình"
                  className={`hidden sm:inline-flex px-2 py-1 rounded-lg ${pdfViewMode === 'split' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-600 dark:text-slate-300'}`}
                >
                  Chia 2 cột
                </button>
                <button
                  onClick={() => setPdfViewMode('pdf')}
                  title="Chỉ xem đề PDF"
                  className={`px-2 py-1 rounded-lg ${pdfViewMode === 'pdf' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-600 dark:text-slate-300'}`}
                >
                  Đề PDF
                </button>
                <button
                  onClick={() => setPdfViewMode('sheet')}
                  title="Chỉ xem Phiếu đáp án"
                  className={`px-2 py-1 rounded-lg ${pdfViewMode === 'sheet' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-600 dark:text-slate-300'}`}
                >
                  Phiếu làm bài
                </button>
              </div>
            )}

            {/* Sound Effects Toggle */}
            <button
              type="button"
              onClick={handleToggleSound}
              title={isMuted ? 'Bật âm thanh tương tác' : 'Tắt âm thanh'}
              className={`p-2 rounded-xl text-xs border transition-all cursor-pointer ${
                isMuted
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600'
                  : 'bg-indigo-50 dark:bg-indigo-950/80 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 shadow-2xs hover:bg-indigo-100 dark:hover:bg-indigo-900'
              }`}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            {/* Máy Tính Khoa Học Mini (Pop-up Calculator) Toggle */}
            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                setShowCalculator((prev) => !prev);
              }}
              title={showCalculator ? 'Ẩn máy tính bỏ túi' : 'Mở máy tính khoa học mini (Căn bậc hai, Phân số, Luỹ thừa, Lượng giác)'}
              className={`inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                showCalculator
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs ring-2 ring-indigo-400/40'
                  : 'bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
              }`}
            >
              <CalculatorIcon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Máy tính</span>
            </button>

            {/* Bảng Vẽ Nháp Trực Tiếp (Digital Scratchpad) Toggle */}
            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                setShowScratchpad((prev) => !prev);
              }}
              title={showScratchpad ? 'Ẩn bảng nháp' : 'Mở bảng vẽ nháp trực tiếp (Hình học, Phép tính)'}
              className={`inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                showScratchpad
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs ring-2 ring-emerald-400/40'
                  : 'bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Bảng nháp</span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? 'Chuyển sang chế độ Sáng' : 'Bật chế độ Tối'}
              className={`p-2 rounded-xl text-xs border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
            </button>

            {/* Focus Mode Toggle */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              title={isFocusMode ? 'Thoát chế độ tập trung' : 'Bật chế độ tập trung toàn màn hình'}
              className={`inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                isFocusMode
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              {isFocusMode ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Thoát</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="hidden sm:inline">Tập trung</span>
                </>
              )}
            </button>

            {/* Timer Counter */}
            {totalSeconds > 0 ? (
              <div
                className={`flex items-center space-x-1 px-2.5 sm:px-3.5 py-1.5 rounded-xl font-mono text-xs sm:text-base font-black border transition-colors shadow-xs ${
                  isTimeCritical
                    ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                    : isTimeWarning
                    ? 'bg-amber-500 border-amber-400 text-white'
                    : isFocusMode
                    ? 'bg-slate-900 border-slate-700 text-emerald-400'
                    : 'bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                }`}
              >
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>
                  {minutes < 10 ? '0' : ''}{minutes}:{seconds < 10 ? '0' : ''}{seconds}
                </span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center text-xs text-slate-400 font-medium px-2 py-1 rounded-lg border border-slate-700">
                Tự do
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={() => setShowSubmitModal(true)}
              className="inline-flex items-center space-x-1 sm:space-x-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Nộp bài</span>
            </button>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full bg-slate-200/60 dark:bg-slate-800 h-1.5 mt-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA */}
      {/* ========================================================================= */}
      {isPdfMode ? (
        
        // --- 1. GIAO DIỆN ĐỀ PDF (CHIA 2 CỘT HOẶC TAB VIEW) ---
        <main className="w-full flex-1 flex flex-col lg:flex-row overflow-hidden max-w-7xl mx-auto border-x border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm min-h-0">
          
          {/* CỘT TRÁI: Trình xem đề thi PDF */}
          {(pdfViewMode === 'split' || pdfViewMode === 'pdf') && (
            <div className={`relative border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-slate-200 dark:bg-slate-950 flex flex-col ${
              pdfViewMode === 'pdf' ? 'w-full h-full' : 'w-full lg:w-[60%] h-1/2 lg:h-full'
            }`}>
              {/* PDF Toolbar with Open in New Tab option */}
              <div className="p-2 bg-slate-800 text-slate-200 text-xs flex items-center justify-between shrink-0">
                <span className="font-bold truncate max-w-[200px] sm:max-w-none flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Đề bài PDF chính thức</span>
                </span>
                {assignment.pdfUrl && (
                  <a
                    href={assignment.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold text-[11px] transition-colors"
                  >
                    <span>Mở PDF tab mới</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="flex-1 w-full h-full relative">
                <iframe 
                  src={`${assignment.pdfUrl}#toolbar=0`} 
                  className="w-full h-full border-none"
                  title="Đề thi PDF"
                />
              </div>
            </div>
          )}

          {/* CỘT PHẢI: Phiếu điền đáp án Digital & Upload ảnh bài làm */}
          {(pdfViewMode === 'split' || pdfViewMode === 'sheet') && (
            <div className={`flex flex-col bg-white dark:bg-slate-900 ${
              pdfViewMode === 'sheet' ? 'w-full h-full' : 'w-full lg:w-[40%] h-1/2 lg:h-full'
            }`}>
              <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-100">
                    Phiếu Trả Lời Trực Tuyến
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Chọn phương án tương ứng với từng câu trong đề PDF
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{answeredCount}/{questions.length}</span>
                </div>
              </div>
              
              {/* VÙNG CUỘN ĐỘC LẬP BÊN PHẢI */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-0 space-y-4">
                {/* Answer Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {questions.map((q, index) => {
                    const qNum = index + 1;
                    const isCurrent = currentIndex === index;
                    const isEssay = isEssayQuestion(q);
                    const hasEssayAnswer = !!studentSolutions[q.id] || (essayImagesByQuestion[q.id] && essayImagesByQuestion[q.id].length > 0);
                    
                    return (
                      <div 
                        key={q.id} 
                        onClick={() => setCurrentIndex(index)}
                        className={`flex flex-col gap-1.5 p-2.5 rounded-2xl border transition-all cursor-pointer ${
                          isCurrent 
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-xs ring-1 ring-indigo-500' 
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-black text-slate-600 dark:text-slate-300">
                            Câu {qNum} <span className="text-[10px] text-slate-400 font-semibold">• {isEssay ? 'Tự luận' : 'Trắc nghiệm'}</span>
                          </span>
                        </div>

                        {isEssay ? (
                          <div className="pt-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentIndex(index);
                              }}
                              className={`w-full py-1.5 px-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                                hasEssayAnswer
                                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                  : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-100'
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>{hasEssayAnswer ? 'Đã làm tự luận ✓' : 'Làm bài tự luận'}</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5 justify-between">
                            {['A', 'B', 'C', 'D'].map((letter, optIdx) => {
                              const optId = (q.options && q.options[optIdx]) ? q.options[optIdx].id : letter;
                              const isSelected = answers[q.id] === optId;

                              const pdfLetterStyles: Record<string, { selected: string; unselected: string }> = {
                                A: {
                                  selected: 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300 dark:ring-indigo-700',
                                  unselected: 'hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300'
                                },
                                B: {
                                  selected: 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300 dark:ring-blue-700',
                                  unselected: 'hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-300'
                                },
                                C: {
                                  selected: 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-300 dark:ring-emerald-700',
                                  unselected: 'hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300'
                                },
                                D: {
                                  selected: 'bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-300 dark:ring-amber-700',
                                  unselected: 'hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-950/40 text-slate-700 dark:text-slate-300'
                                }
                              };

                              const style = pdfLetterStyles[letter] || pdfLetterStyles.A;
                              
                              return (
                                <button
                                  key={letter}
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    handleSelectOption(q.id, optId);
                                    setCurrentIndex(index);
                                  }}
                                  className={`flex-1 py-1.5 rounded-xl text-xs font-black border transition-all active:scale-90 cursor-pointer ${
                                    isSelected 
                                      ? style.selected
                                      : `bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 ${style.unselected}`
                                  }`}
                                >
                                  {letter}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* PDF Photo Scratch/Essay Upload Box */}
                <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-purple-900 dark:text-purple-200 font-bold text-xs">
                      <Camera className="w-4 h-4 text-purple-600" />
                      <span>Đính kèm ảnh bài làm tự luận / nháp ({generalPdfImages.length})</span>
                    </div>
                    
                    <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingImage ? 'Đang nén...' : 'Tải ảnh'}</span>
                      <input
                        ref={pdfUploadInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => handleUploadImages(e)}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {generalPdfImages.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {generalPdfImages.map((img, idx) => (
                        <div key={idx} className="relative group rounded-xl overflow-hidden border border-purple-300 bg-white shadow-xs aspect-square">
                          <img
                            src={img}
                            alt={`Ảnh ${idx + 1}`}
                            onClick={() => setLightboxImageUrl(img)}
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteGeneralPdfImage(idx)}
                            className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-full opacity-80 hover:opacity-100 transition-opacity shadow-xs"
                            title="Xóa ảnh"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Anti-cheat status banner */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3 text-indigo-500" /> Giám sát phòng thi đang kích hoạt
                </span>
              </div>
            </div>
          )}
        </main>

      ) : (

        // --- 2. GIAO DIỆN ĐỀ TEXT (HỖ TRỢ CẢ TRẮC NGHIỆM VÀ TỰ LUẬN + UPLOAD ẢNH) ---
        <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* LEFT COLUMN: MAIN QUESTION CARD (lg:col-span-8 xl:col-span-9) */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-4">
              {currentQ && (
                <div
                  className={`rounded-3xl p-5 sm:p-8 shadow-xl border transition-all ${
                    isFocusMode
                      ? 'bg-slate-950 border-slate-800 text-slate-100 shadow-indigo-950/20'
                      : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-slate-200/60 dark:shadow-none text-slate-900 dark:text-white'
                  }`}
                >
                  {/* Question Card Header */}
                  <div
                    className={`flex items-center justify-between pb-4 border-b mb-6 ${
                      isFocusMode ? 'border-slate-800' : 'border-slate-100 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="flex items-center justify-center w-9 h-9 rounded-2xl bg-indigo-600 text-white font-black text-sm shadow-md">
                        {currentIndex + 1}
                      </span>
                      <div>
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                          Câu {currentIndex + 1} / {questions.length} • {getQuestionTypeLabel(currentQ)}
                        </span>
                        <span className="text-xs text-indigo-500 font-semibold block">
                          {currentQ.points} điểm {currentQ.topicHint ? `• ${currentQ.topicHint}` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Flag / Bookmark button */}
                    <button
                      type="button"
                      onClick={toggleFlagCurrentQuestion}
                      className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                        isCurrentFlagged
                          ? 'bg-amber-500 text-white border-amber-400 shadow-xs'
                          : isFocusMode
                          ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${isCurrentFlagged ? 'fill-white' : ''}`} />
                      <span>{isCurrentFlagged ? 'Đã gắn cờ' : 'Gắn cờ câu này'}</span>
                    </button>
                  </div>

                  {/* Question Body Text */}
                  <div 
                    className={`font-semibold mb-4 select-none ${getFontSizeClass()}`}
                    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                  >
                    <MathDisplay text={currentQ.question} />
                  </div>

                  {/* Question Illustration Image (if available) */}
                  {currentQ.imageUrl && (
                    <div className="mb-6 p-2 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col items-center">
                      <div 
                        className="relative group cursor-pointer overflow-hidden rounded-xl"
                        onClick={() => setLightboxImageUrl(currentQ.imageUrl!)}
                        title="Bấm để xem hình phóng to"
                      >
                        <img 
                          src={currentQ.imageUrl} 
                          alt={`Hình vẽ câu ${currentIndex + 1}`}
                          className="max-h-72 max-w-full object-contain rounded-xl shadow-xs transition-transform duration-200 group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl pointer-events-none">
                          <span className="px-3 py-1 bg-black/80 text-white text-xs font-semibold rounded-full flex items-center gap-1.5 backdrop-blur-xs">
                            <ZoomIn className="w-3.5 h-3.5" />
                            <span>Bấm để phóng to hình vẽ</span>
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                        (Nhấp vào hình vẽ để xem phóng to chi tiết)
                      </span>
                    </div>
                  )}

                  {/* A. CÂU HỎI TỰ LUẬN HOẶC CÓ KHUNG BÀI GIẢI CHI TIẾT */}
                  {isEssayQuestion(currentQ) ? (
                    <div className="space-y-4 mb-6">
                      <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-3">
                        <label className="block text-xs font-extrabold text-indigo-900 dark:text-indigo-200 flex items-center justify-between">
                          <span>✍️ Lời giải chi tiết / Các bước lập luận:</span>
                          <span className="text-[11px] font-normal text-slate-500">
                            (Có thể gõ văn bản hoặc chụp ảnh bài làm bên dưới)
                          </span>
                        </label>
                        <textarea
                          rows={4}
                          value={currentQSolution}
                          onChange={(e) => handleSolutionTextChange(currentQ.id, e.target.value)}
                          placeholder="Nhập các bước giải toán, biến đổi đại số hoặc kết luận tại đây..."
                          className="w-full p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Photo upload zone for essay question */}
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                              <Camera className="w-4 h-4 text-indigo-600" />
                              <span>Ảnh chụp bài làm tự luận ({currentQImages.length} ảnh)</span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Chụp trang vở làm bài hoặc bản vẽ hình học để AI và Giáo viên chấm điểm
                            </p>
                          </div>

                          <label className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-all active:scale-95">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{uploadingImage ? 'Đang nén ảnh...' : 'Chụp / Tải ảnh'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(e) => handleUploadImages(e, currentQ.id)}
                              className="hidden"
                            />
                          </label>
                        </div>

                        {/* Image Preview Gallery */}
                        {currentQImages.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                            {currentQImages.map((img, idx) => (
                              <div key={idx} className="relative group rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-white shadow-xs aspect-4/3">
                                <img
                                  src={img}
                                  alt={`Bài làm ${idx + 1}`}
                                  onClick={() => setLightboxImageUrl(img)}
                                  className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2 pointer-events-none">
                                  <span className="text-white text-xs font-bold flex items-center gap-1">
                                    <Eye className="w-3.5 h-3.5" /> Xem lớn
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteImage(currentQ.id, idx)}
                                  className="absolute top-1.5 right-1.5 p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full shadow-md transition-colors cursor-pointer"
                                  title="Xóa ảnh"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    
                    // B. CÂU HỎI TRẮC NGHIỆM
                    <div className="space-y-4 mb-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                        {currentQ.options.map((opt) => {
                          const isSelected = answers[currentQ.id] === opt.id;
                          const letter = opt.id.toUpperCase();

                          // Thematic styling for options A, B, C, D
                          const themes: Record<string, {
                            badgeBgSelected: string;
                            badgeBgUnselected: string;
                            cardSelected: string;
                            cardUnselected: string;
                          }> = {
                            A: {
                              badgeBgSelected: 'bg-indigo-600 text-white shadow-md',
                              badgeBgUnselected: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
                              cardSelected: isFocusMode
                                ? 'border-indigo-500 bg-indigo-950/70 shadow-lg ring-2 ring-indigo-500 text-white'
                                : 'border-indigo-600 bg-indigo-50/90 dark:bg-indigo-950/70 shadow-md ring-2 ring-indigo-500/25 text-indigo-950 dark:text-indigo-100',
                              cardUnselected: isFocusMode
                                ? 'border-slate-800 bg-slate-900/80 hover:border-indigo-500/50 hover:bg-slate-900 text-slate-200'
                                : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 text-slate-800 dark:text-slate-200'
                            },
                            B: {
                              badgeBgSelected: 'bg-blue-600 text-white shadow-md',
                              badgeBgUnselected: 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
                              cardSelected: isFocusMode
                                ? 'border-blue-500 bg-blue-950/70 shadow-lg ring-2 ring-blue-500 text-white'
                                : 'border-blue-600 bg-blue-50/90 dark:bg-blue-950/70 shadow-md ring-2 ring-blue-500/25 text-blue-950 dark:text-blue-100',
                              cardUnselected: isFocusMode
                                ? 'border-slate-800 bg-slate-900/80 hover:border-blue-500/50 hover:bg-slate-900 text-slate-200'
                                : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 text-slate-800 dark:text-slate-200'
                            },
                            C: {
                              badgeBgSelected: 'bg-emerald-600 text-white shadow-md',
                              badgeBgUnselected: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
                              cardSelected: isFocusMode
                                ? 'border-emerald-500 bg-emerald-950/70 shadow-lg ring-2 ring-emerald-500 text-white'
                                : 'border-emerald-600 bg-emerald-50/90 dark:bg-emerald-950/70 shadow-md ring-2 ring-emerald-500/25 text-emerald-950 dark:text-emerald-100',
                              cardUnselected: isFocusMode
                                ? 'border-slate-800 bg-slate-900/80 hover:border-emerald-500/50 hover:bg-slate-900 text-slate-200'
                                : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 text-slate-800 dark:text-slate-200'
                            },
                            D: {
                              badgeBgSelected: 'bg-amber-600 text-white shadow-md',
                              badgeBgUnselected: 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
                              cardSelected: isFocusMode
                                ? 'border-amber-500 bg-amber-950/70 shadow-lg ring-2 ring-amber-500 text-white'
                                : 'border-amber-600 bg-amber-50/90 dark:bg-amber-950/70 shadow-md ring-2 ring-amber-500/25 text-amber-950 dark:text-amber-100',
                              cardUnselected: isFocusMode
                                ? 'border-slate-800 bg-slate-900/80 hover:border-amber-500/50 hover:bg-slate-900 text-slate-200'
                                : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:border-amber-400 hover:bg-amber-50/30 dark:hover:bg-amber-950/20 text-slate-800 dark:text-slate-200'
                            }
                          };

                          const theme = themes[letter] || themes.A;
                          const cardStyle = isSelected ? theme.cardSelected : theme.cardUnselected;
                          const badgeStyle = isSelected ? theme.badgeBgSelected : theme.badgeBgUnselected;

                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleSelectOption(currentQ.id, opt.id)}
                              className={`flex items-center p-3.5 sm:p-5 rounded-2xl border-2 text-left transition-all relative cursor-pointer active:scale-[0.98] select-none group ${cardStyle}`}
                              style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                            >
                              <div
                                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-black text-sm mr-3.5 shrink-0 transition-transform group-hover:scale-105 ${badgeStyle}`}
                              >
                                {opt.id}
                              </div>

                              <div className="flex-1 font-medium text-sm sm:text-base select-none leading-relaxed">
                                <MathDisplay text={opt.text} />
                              </div>

                              {/* Shortcut key indicator on desktop */}
                              <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                                [{opt.id}]
                              </span>

                              {isSelected && (
                                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center ml-2 shrink-0 shadow-sm animate-in zoom-in-50 duration-150">
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Optional Scratch / Photo Work for multiple choice */}
                      <div className="pt-2">
                        <details className="text-xs text-slate-500 group">
                          <summary className="font-semibold cursor-pointer text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5">
                            <Camera className="w-3.5 h-3.5" />
                            <span>Đính kèm ảnh nháp / lời giải chi tiết cho câu này (Tùy chọn)</span>
                          </summary>
                          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                            <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold cursor-pointer">
                              <Upload className="w-3 h-3" />
                              <span>Chọn ảnh nháp...</span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => handleUploadImages(e, currentQ.id)}
                                className="hidden"
                              />
                            </label>
                            {currentQImages.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {currentQImages.map((img, idx) => (
                                  <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-300">
                                    <img
                                      src={img}
                                      alt="Nháp"
                                      onClick={() => setLightboxImageUrl(img)}
                                      className="w-full h-full object-cover cursor-pointer"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteImage(currentQ.id, idx)}
                                      className="absolute top-0.5 right-0.5 p-0.5 bg-rose-600 text-white rounded-full"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    </div>
                  )}

                  {/* Mobile Quick-Jump Question Strip */}
                  <div className="lg:hidden pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                      <span>Bảng chuyển câu nhanh:</span>
                      <span className="font-bold text-indigo-500">{answeredCount}/{questions.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                      {questions.map((q, idx) => {
                        const isAns = !!answers[q.id] || !!studentSolutions[q.id] || (essayImagesByQuestion[q.id] && essayImagesByQuestion[q.id].length > 0);
                        const isFlag = flaggedQuestions.includes(q.id);
                        const isCur = idx === currentIndex;

                        let mClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
                        if (isAns) mClass = 'bg-indigo-600 text-white font-black';
                        else if (isFlag) mClass = 'bg-amber-500 text-white font-black';
                        if (isCur) mClass += ' ring-2 ring-indigo-500 font-black scale-110';

                        return (
                          <button
                            key={q.id}
                            onClick={() => {
                              soundEffects.playNavigate();
                              setCurrentIndex(idx);
                            }}
                            className={`min-w-8 h-8 rounded-lg text-xs font-bold shrink-0 flex items-center justify-center border transition-all cursor-pointer ${mClass}`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottom Card Navigation */}
                  <div
                    className={`flex items-center justify-between mt-6 pt-4 border-t ${
                      isFocusMode ? 'border-slate-800' : 'border-slate-100 dark:border-slate-800'
                    }`}
                  >
                    <button
                      onClick={handlePrev}
                      disabled={currentIndex === 0}
                      className={`flex items-center space-x-1.5 px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                        currentIndex === 0
                          ? 'opacity-30 cursor-not-allowed bg-slate-800 text-slate-500'
                          : isFocusMode
                          ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 active:scale-95'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 active:scale-95'
                      }`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>CÂU TRƯỚC</span>
                    </button>

                    <div className="text-xs font-bold text-slate-400 hidden sm:block">
                      Tiến độ: <strong className="text-indigo-500 font-extrabold">{answeredCount}</strong>/{questions.length} câu ({progressPercent}%)
                      <span className="ml-2 text-[11px] text-slate-400 font-normal">
                        (Phím tắt: <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">←</kbd> <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">→</kbd> <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">F</kbd>)
                      </span>
                    </div>

                    {currentIndex < questions.length - 1 ? (
                      <button
                        onClick={handleNext}
                        className="flex items-center space-x-1.5 px-5 sm:px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all active:scale-95 cursor-pointer"
                      >
                        <span>CÂU TIẾP THEO</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowSubmitModal(true)}
                        className="flex items-center space-x-1.5 px-5 sm:px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-lg transition-all active:scale-95 cursor-pointer"
                      >
                        <Flag className="w-4 h-4" />
                        <span>NỘP BÀI THI</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Anti-cheat and Reset shortcuts banner */}
              <div className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs transition-colors ${
                isFocusMode
                  ? 'bg-slate-950 border-slate-800 text-slate-400'
                  : 'bg-white/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400'
              }`}>
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Phòng thi bảo mật: Đã khóa copy &amp; chuột phải. Lịch sử rời màn hình được ghi nhận.</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowResetConfirmModal(true)}
                  className="text-rose-500 hover:text-rose-600 hover:underline font-bold shrink-0 cursor-pointer"
                >
                  Làm lại từ đầu
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: STICKY QUESTION NAVIGATION GRID */}
            <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 sticky top-20">
              <div
                className={`rounded-3xl p-4 sm:p-5 shadow-lg border transition-all ${
                  isFocusMode
                    ? 'bg-slate-950 border-slate-800 text-slate-100'
                    : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-slate-200/50 dark:shadow-none text-slate-900 dark:text-white'
                }`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                      <LayoutGrid className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                        Bảng câu hỏi
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        Nhấp để chuyển câu nhanh
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-xs border border-indigo-100 dark:border-indigo-900">
                    {answeredCount}/{questions.length}
                  </span>
                </div>

                {/* Matrix Filter Tabs */}
                <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 mb-3 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setMatrixFilter('all')}
                    className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                      matrixFilter === 'all'
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    Tất cả ({questions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixFilter('unanswered')}
                    className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                      matrixFilter === 'unanswered'
                        ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    Chưa làm ({unansweredCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixFilter('flagged')}
                    className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                      matrixFilter === 'flagged'
                        ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    Gắn cờ ({flaggedQuestions.length})
                  </button>
                </div>

                {/* Status Color Legend */}
                <div className="grid grid-cols-2 gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-3.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600"></span> Đã làm
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span> Gắn cờ
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600"></span> Chưa làm
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm border-2 border-indigo-500 ring-1 ring-indigo-400"></span> Đang xem
                  </span>
                </div>

                {/* Question Number Grid */}
                <div className="grid grid-cols-5 gap-1.5 max-h-[calc(100vh-360px)] overflow-y-auto pr-0.5 custom-scrollbar">
                  {questions.map((q, idx) => {
                    const isAnswered = !!answers[q.id] || !!studentSolutions[q.id] || (essayImagesByQuestion[q.id] && essayImagesByQuestion[q.id].length > 0);
                    const isFlagged = flaggedQuestions.includes(q.id);
                    const isCurrent = idx === currentIndex;

                    // Filter logic
                    if (matrixFilter === 'unanswered' && isAnswered) return null;
                    if (matrixFilter === 'flagged' && !isFlagged) return null;

                    let btnClass = isFocusMode
                      ? 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700';

                    if (isAnswered) {
                      btnClass = 'bg-indigo-600 text-white font-black shadow-xs hover:bg-indigo-700';
                    }

                    if (isFlagged && !isAnswered) {
                      btnClass = 'bg-amber-500 text-white font-black shadow-xs ring-1 ring-amber-300 hover:bg-amber-600';
                    }

                    if (isCurrent) {
                      btnClass += ' ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 font-black scale-105 border-2 border-indigo-600';
                    }

                    const chosenOpt = answers[q.id];

                    return (
                      <button
                        key={q.id}
                        onClick={() => {
                          soundEffects.playNavigate();
                          setCurrentIndex(idx);
                        }}
                        title={`Câu ${idx + 1}: ${isAnswered ? 'Đã làm' : 'Chưa làm'}${isFlagged ? ' (Đã gắn cờ)' : ''}`}
                        className={`h-9 rounded-xl text-xs font-bold flex items-center justify-center transition-all cursor-pointer relative active:scale-95 ${btnClass}`}
                      >
                        <span>{idx + 1}</span>
                        {/* Selected option badge */}
                        {isAnswered && chosenOpt && chosenOpt !== 'TỰ_LUẬN' && (
                          <span className="absolute -bottom-1 -right-1 text-[9px] font-mono px-1 py-0 bg-slate-900 text-white rounded-full font-black border border-white/40 leading-none">
                            {chosenOpt}
                          </span>
                        )}
                        {isFlagged && (
                          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>
          </div>
        </main>
      )}

      {/* EXAM REVIEW SHEET MODAL (PHIẾU DUYỆT BÀI LÀM TRƯỚC KHI NỘP) */}
      <ExamReviewSheetModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onSubmit={submitExam}
        questions={questions}
        answers={answers}
        studentSolutions={studentSolutions}
        essayImagesByQuestion={essayImagesByQuestion}
        flaggedQuestions={flaggedQuestions}
        onSelectOption={handleSelectOption}
        onJumpToQuestion={(idx) => setCurrentIndex(idx)}
        timeLeft={timeLeft}
        studentName={studentName}
        className={className}
        assignmentTitle={assignment.title}
        tabSwitchCount={tabSwitchCount}
      />

      {/* CONFIRM RESET MODAL */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 dark:border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">Làm lại bài từ đầu?</h3>
              <p className="text-xs text-slate-500 mt-1">Toàn bộ câu đã chọn và ảnh bài làm sẽ bị xóa để làm mới.</p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setShowResetConfirmModal(false)}
                className="flex-1 py-2.5 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-100"
              >
                Hủy
              </button>
              <button
                onClick={handleResetExamProgress}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANTI-CHEAT VIOLATION MODAL (CẢNH BÁO GIÁM SÁT THI CỬ) */}
      {showViolationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl border border-rose-300 dark:border-rose-900/70 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Red Top Header Banner */}
            <div className="bg-rose-600 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h3 className="font-black text-sm uppercase tracking-wider">
                  CẢNH BÁO GIÁM SÁT THI CỬ
                </h3>
              </div>
              <span className="text-xs bg-white/25 px-2.5 py-1 rounded-full font-bold">
                Lần {latestViolation?.count ?? tabSwitchCount}
              </span>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-4">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto border border-amber-200 dark:border-amber-800 shadow-inner">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white">
                  Phát hiện rời màn hình làm bài!
                </h4>
                <div className="inline-block px-3 py-1 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded-full font-extrabold text-xs border border-rose-200 dark:border-rose-800">
                  Số lần vi phạm đã ghi nhận: Lần {latestViolation?.count ?? tabSwitchCount}
                </div>
              </div>

              {/* Details Box */}
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                <div className="flex items-start justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-bold">Chi tiết:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold text-right max-w-[240px]">
                    {latestViolation?.reason || 'Học sinh chuyển sang tab khác hoặc thu nhỏ trình duyệt'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400 font-bold">Thời gian ghi nhận:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {latestViolation?.time || new Date().toLocaleTimeString('vi-VN')}
                  </span>
                </div>
              </div>

              {/* Regulation Warning Box */}
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800/60 flex items-start space-x-2.5 text-xs text-amber-900 dark:text-amber-200">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px]">
                  <strong>Quy định phòng thi trực tuyến:</strong> Hệ thống tự động ghi nhật ký mọi thao tác chuyển tab, mở ứng dụng khác hoặc copy text. Toàn bộ lịch sử vi phạm sẽ được gửi trực tiếp đến giáo viên trong bảng kết quả chấm thi.
                </div>
              </div>

              {/* Action Commit Button */}
              <button
                type="button"
                onClick={() => setShowViolationModal(false)}
                className="w-full py-3.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center space-x-2 active:scale-[0.99] cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Tôi cam kết tiếp tục làm bài nghiêm túc</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANTI-CHEAT POLICY MODAL */}
      {showAntiCheatPolicyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-black text-sm uppercase tracking-wider">
                  QUY CHẾ PHÒNG THI TRỰC TUYẾN
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAntiCheatPolicyModal(false)}
                className="text-white/80 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-3">
                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50">
                  <EyeOff className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-black text-slate-900 dark:text-white">Giám sát rời màn hình làm bài</h5>
                    <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                      Không chuyển sang thẻ trình duyệt khác hoặc mở ứng dụng tìm kiếm. Hệ thống ghi lại từng giây rời tab.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-black text-slate-900 dark:text-white">Vô hiệu hóa phím tắt &amp; Chuột phải</h5>
                    <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                      Khóa chuột phải, cấm sao chép câu hỏi (Ctrl+C), dán (Ctrl+V), PrintScreen và công cụ nhà phát triển (F12).
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <Shuffle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-black text-slate-900 dark:text-white">Đảo thứ tự câu hỏi &amp; đáp án</h5>
                    <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                      Mỗi học sinh nhận đề thi với thứ tự câu hỏi và phương án A, B, C, D được xáo trộn độc lập.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-center text-[11px] text-slate-600 dark:text-slate-300">
                Trạng thái hiện tại: Đã ghi nhận <strong>{tabSwitchCount}</strong> lần vi phạm.
              </div>

              <button
                type="button"
                onClick={() => setShowAntiCheatPolicyModal(false)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors cursor-pointer"
              >
                Đã hiểu quy chế, tiếp tục làm bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL */}
      <ImageLightboxModal
        isOpen={Boolean(lightboxImageUrl)}
        imageUrl={lightboxImageUrl}
        onClose={() => setLightboxImageUrl(null)}
        title="Ảnh bài làm tự luận của thí sinh"
      />

      {/* MÁY TÍNH KHOA HỌC MINI (POP-UP CALCULATOR) */}
      <ScientificCalculatorModal
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        isExamMode={true}
      />

      {/* BẢNG VẼ NHÁP TRỰC TIẾP (DIGITAL SCRATCHPAD) */}
      <DigitalScratchpadModal
        isOpen={showScratchpad}
        onClose={() => setShowScratchpad(false)}
        title={`Bảng nháp • ${assignment.title}`}
      />

      {/* THANH CÔNG CỤ NHANH GÓC MÀN HÌNH (FLOATING ACTION DOCK) */}
      <div className="fixed bottom-4 right-4 z-40 flex items-center space-x-2 select-none">
        {!showCalculator && (
          <button
            onClick={() => {
              soundEffects.playClick();
              setShowCalculator(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-xl border border-white/20 text-xs font-bold transition-transform hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
            title="Bật máy tính khoa học mini"
          >
            <CalculatorIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Máy tính</span>
          </button>
        )}

        {!showScratchpad && (
          <button
            onClick={() => {
              soundEffects.playClick();
              setShowScratchpad(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-xl border border-white/20 text-xs font-bold transition-transform hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
            title="Bật bảng vẽ nháp & hình học"
          >
            <Edit3 className="w-4 h-4" />
            <span className="hidden sm:inline">Bảng nháp</span>
          </button>
        )}
      </div>
    </div>
  );
};
