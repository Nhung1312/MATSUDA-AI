import React, { useState, useEffect } from 'react';
import { Submission, Assignment, Question } from '../../types';
import { GradingService } from '../../services/gradingService';
import { aiService } from '../../services/aiService';
import { MathDisplay } from '../../components/MathDisplay';
import { ImageLightboxModal } from '../../components/ImageLightboxModal';
import { MistakeVaultModal } from '../../components/MistakeVaultModal';
import { useMistakeVaultStore } from '../../store/useMistakeVaultStore';
import { isEssayQuestion, getQuestionTypeLabel } from '../../utils/questionUtils';
import { 
  Trophy, 
  RotateCcw, 
  Home, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileCheck2, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Printer, 
  BookOpen, 
  Lightbulb, 
  GraduationCap,
  ShieldCheck,
  Camera,
  Image as ImageIcon,
  Eye,
  Award,
  Check,
  X,
  ZoomIn,
  FileSpreadsheet
} from 'lucide-react';
import { ExamResultSheetView } from '../../components/ExamResultSheetView';
import { SocraticTutorModal } from '../../components/SocraticTutorModal';
import { StepGradingBreakdown } from '../../components/StepGradingBreakdown';
import { stepGradingService } from '../../services/stepGradingService';
import { SocraticContext, StudentAnswer, StepGradingResponse, StepErrorType } from '../../types';
import { useLearningProgressStore } from '../../store/useLearningProgressStore';
import { StorageService } from '../../services/storageService';
import { FirestoreService } from '../../services/firestoreService';

interface StudentResultPageProps {
  submission: Submission;
  assignment: Assignment;
  onRetake: () => void;
  onGoHome: () => void;
  isDemoPreview?: boolean;
  isTeacherPreview?: boolean;
}

export const StudentResultPage: React.FC<StudentResultPageProps> = ({
  submission: initialSubmission,
  assignment,
  onRetake,
  onGoHome,
  isDemoPreview = false,
  isTeacherPreview = false
}) => {
  const [submission, setSubmission] = useState<Submission>(initialSubmission);
  const effectiveReviewMode: 'score_only' | 'wrong_only' | 'full' =
    isTeacherPreview || isDemoPreview
      ? 'full'
      : assignment.resultReviewMode || (assignment.allowViewResult ? 'full' : 'score_only');

  const [resultViewMode, setResultViewMode] = useState<'sheet' | 'detailed'>(
    isTeacherPreview ? 'detailed' : 'sheet'
  );
  const [filterType, setFilterType] = useState<'all' | 'wrong' | 'correct'>(
    effectiveReviewMode === 'wrong_only' ? 'wrong' : 'all'
  );
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  
  // AI Explanations & Grading
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState<Record<string, boolean>>({});
  const [aiGradingFeedback, setAiGradingFeedback] = useState<Record<string, { score: number; feedback: string }>>({});
  const [loadingAiGrading, setLoadingAiGrading] = useState<Record<string, boolean>>({});

  // Lightbox modal state
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // MỚI: Trạng thái hiển thị Sổ tay câu sai (Mistake Vault)
  const [showMistakeVault, setShowMistakeVault] = useState<boolean>(false);
  const mistakeRecords = useMistakeVaultStore((state) => state.mistakes);

  // MỚI: Trạng thái Gia sư Socratic AI trong trang kết quả (Đợt 3)
  const [socraticResultContext, setSocraticResultContext] = useState<SocraticContext | null>(null);

  // MỚI: Trạng thái Chấm & Phân tích từng bước (Đợt 4)
  const [stepGradingResults, setStepGradingResults] = useState<Record<string, StepGradingResponse>>({});
  const [loadingStepGrading, setLoadingStepGrading] = useState<Record<string, boolean>>({});

  // Tự động tải StepAnalysis đã lưu từ trước trong bài nộp (không gọi lại Gemini nếu đã có)
  useEffect(() => {
    if (submission && Array.isArray(submission.answers)) {
      const initialMap: Record<string, StepGradingResponse> = {};
      submission.answers.forEach(ans => {
        if (ans.stepGradingResponse) {
          initialMap[ans.questionId] = ans.stepGradingResponse;
        } else if (ans.stepAnalysis && ans.stepAnalysis.length > 0) {
          const q = assignment?.questions.find(item => item.id === ans.questionId);
          initialMap[ans.questionId] = {
            success: true,
            analysis: ans.stepAnalysis,
            firstErrorStep: ans.firstErrorStep ?? null,
            firstErrorType: (ans.firstErrorType as any) ?? null,
            firstErrorExplanation: ans.firstErrorExplanation ?? null,
            totalSteps: ans.stepAnalysis.length,
            correctStepsCount: ans.stepAnalysis.filter(s => s.status === 'correct').length,
            isAllCorrect: !ans.firstErrorStep && ans.stepAnalysis.every(s => s.status === 'correct'),
            score: ans.pointsEarned,
            maxScore: q?.points || ans.maxPoints || 10,
            feedback: ans.aiFeedback || 'Đã hoàn tất phân tích chi tiết từng bước.',
            analysisSource: 'ai',
            needsTeacherReview: ans.needsTeacherReview
          };
        }
      });
      if (Object.keys(initialMap).length > 0) {
        setStepGradingResults(prev => ({ ...initialMap, ...prev }));
      }
    }
  }, [submission.id]);

  const handleAnalyzeStepByStep = async (question: Question, studentSolutionText?: string, images?: string[]) => {
    setLoadingStepGrading(prev => ({ ...prev, [question.id]: true }));
    try {
      const res = await stepGradingService.analyzeStepByStep({
        questionId: question.id,
        questionText: question.question,
        grade: String(assignment.grade),
        topic: assignment.topic,
        maxPoints: question.points,
        correctAnswer: question.correctAnswer,
        rubric: question.rubric,
        studentSolutionText: studentSolutionText || '',
        essayImages: images || []
      });

      // 1. Cập nhật state hiển thị UI
      setStepGradingResults(prev => ({ ...prev, [question.id]: res }));
      if (!isDemoPreview && !isTeacherPreview) {
        useLearningProgressStore.getState().recordStepAnalysisCompleted(
          question.id,
          res.firstErrorStep,
          res.firstErrorType || undefined
        );
      }

      // 2. LƯU BỀN VỮNG VÀO SUBMISSION (Tái sử dụng vĩnh viễn, không mất khi reload)
      const updatedAnswers: StudentAnswer[] = submission.answers.map(a => {
        if (a.questionId === question.id) {
          const hasError = !!res.firstErrorStep || (res.analysis || []).some(s => s.status === 'first_error' || s.status === 'cascading_error' || s.status === 'independent_error');
          const resNeedsReview = !!res.needsTeacherReview || res.analysisSource === 'rule' || res.analysisSource === 'unavailable';
          const hasTeacherScore = a.teacherScore !== undefined;
          const answerNeedsReview = !hasTeacherScore && resNeedsReview;
          const computedIsCorrect = !answerNeedsReview && !hasError && (
            res.isAllCorrect === true ||
            ((res.analysis || []).length > 0 && (res.analysis || []).every(s => s.status === 'correct') && res.score >= question.points)
          );
          return {
            ...a,
            stepAnalysis: res.analysis,
            firstErrorStep: res.firstErrorStep,
            firstErrorType: res.firstErrorType,
            firstErrorExplanation: res.firstErrorExplanation,
            needsTeacherReview: answerNeedsReview,
            isProvisional: answerNeedsReview,
            aiGradingError: answerNeedsReview && (res.analysisSource === 'rule' || res.analysisSource === 'unavailable'),
            stepGradingResponse: res,
            pointsEarned: hasTeacherScore ? a.teacherScore! : res.score,
            aiScore: res.score,
            aiFeedback: res.feedback,
            aiGraded: true,
            isCorrect: hasTeacherScore ? a.isCorrect : computedIsCorrect
          };
        }
        return a;
      });

      // Tính toán lại tổng điểm bài làm nếu chưa có điểm chấm tay của giáo viên
      let totalEarned = 0;
      let totalMax = 0;
      let correctCnt = 0;
      let wrongCnt = 0;
      updatedAnswers.forEach(a => {
        const q = assignment.questions.find(item => item.id === a.questionId);
        const max = q ? q.points : (a.maxPoints || 1);
        totalMax += max;
        totalEarned += (a.teacherScore !== undefined ? a.teacherScore : a.pointsEarned);
        const isPendingReview = a.needsTeacherReview && a.teacherScore === undefined;
        if (isPendingReview) {
          // Giữ điểm hiển thị ở trạng thái tạm tính nhưng không biến câu chờ duyệt thành câu sai.
        } else if (a.isCorrect) {
          correctCnt++;
        } else {
          wrongCnt++;
        }
      });
      const rawScore = totalMax > 0 ? (totalEarned / totalMax) * 10 : 0;
      const totalScore = Math.round(rawScore * 10) / 10;

      const pendingReviewCount = updatedAnswers.filter(a => a.needsTeacherReview && a.teacherScore === undefined).length;
      const updatedSub: Submission = {
        ...submission,
        answers: updatedAnswers,
        totalScore,
        correctCount: correctCnt,
        wrongCount: wrongCnt,
        needsTeacherReview: pendingReviewCount > 0 || submission.needsTeacherReview,
        isProvisional: pendingReviewCount > 0 || submission.isProvisional,
        ungradedCount: Math.max(pendingReviewCount, submission.ungradedCount || 0),
        gradingStatus: pendingReviewCount > 0 ? 'needs_review' : submission.gradingStatus
      };

      setSubmission(updatedSub);
      if (!isDemoPreview && !isTeacherPreview) {
        StorageService.saveSubmission(updatedSub);
        FirestoreService.saveResult(updatedSub).catch(() => {});
        if (updatedSub.wrongCount > 0) {
          useMistakeVaultStore.getState().addMistakesFromSubmission(updatedSub, assignment);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Không thể thực hiện phân tích từng bước lúc này. Vui lòng thử lại sau.');
    } finally {
      setLoadingStepGrading(prev => ({ ...prev, [question.id]: false }));
    }
  };

  const handleOpenSocraticFromError = (errorCtx: {
    questionId: string;
    questionText: string;
    firstErrorStep: number;
    errorType: StepErrorType;
    studentLatex: string;
    referenceStepLatex?: string;
    comment: string;
    studentWork?: string;
  }) => {
    setSocraticResultContext({
      questionId: errorCtx.questionId,
      questionText: errorCtx.questionText,
      questionType: 'essay',
      grade: String(assignment.grade),
      topic: assignment.topic,
      studentCurrentAnswer: errorCtx.studentLatex,
      studentWork: errorCtx.studentWork,
      firstErrorStep: errorCtx.firstErrorStep,
      firstErrorLatex: errorCtx.studentLatex,
      errorType: errorCtx.errorType,
      referenceStepLatex: errorCtx.referenceStepLatex,
      detectedError: `Lỗi gốc tại Bước ${errorCtx.firstErrorStep}: ${errorCtx.comment}`,
      mistakeRecordId: isTeacherPreview ? undefined : `${assignment.id}_${errorCtx.questionId}`,
      readOnly: isTeacherPreview || isDemoPreview,
    });
  };

  const handleOpenSocraticForResultQuestion = (question: Question, ans: StudentAnswer) => {
    const stepRes = stepGradingResults[question.id];
    const stepAnalysis = ans.stepAnalysis || stepRes?.analysis;
    const firstErrorStep = ans.firstErrorStep !== undefined ? ans.firstErrorStep : stepRes?.firstErrorStep;
    const firstErrorType = ans.firstErrorType || stepRes?.firstErrorType;
    const firstErrorExplanation = ans.firstErrorExplanation || stepRes?.firstErrorExplanation;

    const firstErrStepObj = stepAnalysis && firstErrorStep ? stepAnalysis.find(s => s.stepIndex === firstErrorStep) : null;
    const firstErrorLatex = firstErrStepObj?.studentLatex;
    const referenceStepLatex = firstErrStepObj?.referenceStepLatex;

    let errorDesc = !ans.isCorrect
      ? `Học sinh đã chọn/điền: "${ans.selectedAnswer || 'chưa làm'}", trong khi đáp án đúng là "${question.correctAnswer}".`
      : undefined;

    if (firstErrorStep) {
      errorDesc = `Lỗi gốc tại Bước ${firstErrorStep}: ${firstErrorExplanation || firstErrStepObj?.comment || 'Cần kiểm tra lại phép biến đổi'}`;
    }

    setSocraticResultContext({
      questionId: question.id,
      mistakeRecordId: isTeacherPreview ? undefined : `${assignment.id}_${question.id}`,
      readOnly: isTeacherPreview || isDemoPreview,
      questionText: question.question,
      questionType: question.type,
      grade: String(assignment.grade),
      topic: assignment.topic,
      answerOptions: question.options ? question.options.map(o => ({ id: o.id, text: o.text })) : undefined,
      studentCurrentAnswer: ans.selectedAnswer || '',
      studentWork: ans.studentSolutionText || (stepAnalysis ? stepAnalysis.map(s => `Bước ${s.stepIndex}: ${s.studentLatex}`).join('\n') : ''),
      detectedError: errorDesc,
      errorType: firstErrorType || undefined,
      firstErrorStep: firstErrorStep || undefined,
      firstErrorLatex,
      referenceStepLatex,
      stepAnalysis,
      essayImages: ans.essayImages,
    });
  };

  // Tự động đồng bộ câu sai vào Mistake Vault khi vào trang kết quả
  useEffect(() => {
    if (isDemoPreview || isTeacherPreview) return;
    if (submission && submission.wrongCount > 0) {
      try {
        useMistakeVaultStore.getState().addMistakesFromSubmission(submission, assignment);
      } catch (e) {
        console.warn('Lỗi lưu câu sai vào Sổ tay câu sai:', e);
      }
    }
  }, [submission, assignment, isDemoPreview, isTeacherPreview]);

  const toggleExpand = (questionId: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [questionId]: !(prev[questionId] ?? false)
    }));
  };

  const handleRequestAiExplanation = async (question: Question, studentAnswer: string) => {
    setLoadingAi(prev => ({ ...prev, [question.id]: true }));
    try {
      const exp = await aiService.explainAnswer({
        questionText: question.question,
        options: question.options,
        studentAnswer,
        correctAnswer: question.correctAnswer,
        grade: assignment.grade
      });
      setAiExplanations(prev => ({ ...prev, [question.id]: exp }));
    } catch {
      alert('Không thể tải hướng dẫn của AI lúc này. Bạn hãy xem lời giải chuẩn bên dưới nhé!');
    } finally {
      setLoadingAi(prev => ({ ...prev, [question.id]: false }));
    }
  };

  const handleGradeWithAI = async (question: Question, studentSolutionText?: string, images?: string[]) => {
    setLoadingAiGrading(prev => ({ ...prev, [question.id]: true }));
    try {
      const res = await aiService.gradeEssay({
        questionText: question.question,
        studentAnswerText: studentSolutionText || '',
        essayImages: images || [],
        maxPoints: question.points,
        correctAnswerCriteria: question.correctAnswer,
        rubric: question.rubric,
        grade: assignment.grade,
        topicHint: question.topicHint
      });
      setAiGradingFeedback(prev => ({
        ...prev,
        [question.id]: { score: res.score, feedback: res.feedback }
      }));
    } catch {
      alert('Chấm bài bằng AI không thành công. Bạn hãy thử lại sau.');
    } finally {
      setLoadingAiGrading(prev => ({ ...prev, [question.id]: false }));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Filtered list of answers
  const filteredAnswers = submission.answers.filter(ans => {
    const isAwaitingAnsReview = ans.needsTeacherReview && ans.teacherScore === undefined;
    if (effectiveReviewMode === 'wrong_only') return !ans.isCorrect && !isAwaitingAnsReview;
    if (filterType === 'correct') return ans.isCorrect;
    if (filterType === 'wrong') return !ans.isCorrect && !isAwaitingAnsReview;
    return true;
  });

  // Calculate score rating banner
  const isAwaitingReview = submission.isProvisional || submission.needsTeacherReview || submission.gradingStatus === 'needs_review' || (submission.answers || []).some(a => a.needsTeacherReview && a.teacherScore === undefined);
  const hasPendingTeacherGrading = (submission.hasEssayQuestions && submission.gradingStatus === 'pending_teacher_grading') || isAwaitingReview;
  const score = submission.totalScore;
  let ratingColor = isAwaitingReview ? 'from-amber-500 to-indigo-600' : hasPendingTeacherGrading ? 'from-purple-600 to-indigo-600' : 'from-indigo-600 to-purple-600';
  let ratingTitle = 'Kết quả bài làm';
  let ratingMessage = 'Xem lại câu cần củng cố bên dưới.';

  if (isAwaitingReview) {
    ratingTitle = 'Đang chờ Thầy/Cô duyệt';
    ratingMessage = 'Điểm hiện tại là tạm tính.';
  } else if (score >= 9.0) {
    ratingColor = 'from-emerald-500 to-teal-600';
    ratingTitle = 'Hoàn thành rất tốt';
    ratingMessage = 'Tiếp tục phát huy.';
  } else if (score >= 7.0) {
    ratingColor = 'from-blue-600 to-indigo-600';
    ratingTitle = 'Hoàn thành tốt';
    ratingMessage = 'Xem lại vài điểm cần củng cố.';
  } else if (score < 5.0) {
    ratingColor = 'from-rose-500 to-amber-600';
    ratingTitle = 'Cần củng cố thêm';
    ratingMessage = 'Ưu tiên xem lỗi gốc và luyện lại.';
  }

  // Đợt 8A: Hiển thị rõ chu trình AI khép kín để học sinh và người xem hiểu ngay.
  const currentAssignmentMistakes = mistakeRecords.filter(m => m.assignmentId === assignment.id);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-6">
        
        {isTeacherPreview && !isDemoPreview && (
          <div className="print:hidden bg-sky-50 border border-sky-200 rounded-2xl px-4 py-2.5 text-left flex items-center gap-2">
            <Eye className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="text-xs font-bold text-sky-900">Chế độ xem giáo viên • không ghi thay đổi vào dữ liệu học sinh</span>
          </div>
        )}

        {isDemoPreview && (
          <div className="print:hidden bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 text-left flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-xs font-bold text-amber-900">Dữ liệu minh họa an toàn • không ghi vào dữ liệu thật</span>
          </div>
        )}

        {/* BANNER THÔNG BÁO CHỜ GIÁO VIÊN CHẤM TỰ LUẬN NẾU CÓ */}
        {hasPendingTeacherGrading && (
          <div className="print:hidden bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <Clock className="w-5 h-5 text-purple-600 shrink-0" />
            <div>
              <div className="font-black text-sm text-purple-900">Có câu đang chờ giáo viên duyệt</div>
              <div className="text-xs text-purple-700">Điểm hiển thị hiện là tạm tính.</div>
            </div>
          </div>
        )}

        {/* HERO SCORE SUMMARY CARD */}
        <div className={`${resultViewMode === 'sheet' ? 'print:hidden' : ''} bg-white rounded-3xl p-4 sm:p-6 shadow-lg border border-slate-200/80 text-center relative overflow-hidden`}>
          <div className={`absolute top-0 left-0 right-0 h-3 bg-gradient-to-r ${ratingColor}`} />

          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 font-black mb-4 shadow-inner border border-indigo-100">
            {hasPendingTeacherGrading ? <FileCheck2 className="w-7 h-7 text-purple-600" /> : <Trophy className="w-7 h-7" />}
          </div>

          <span className="inline-block bg-slate-100 text-slate-700 text-xs font-black px-3 py-1 rounded-full mb-2">
            Kết quả • Lớp {submission.className}
          </span>

          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
            {submission.studentName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
            <strong>{submission.assignmentTitle}</strong>
          </p>

          {/* Big Score Display */}
          <div className="my-4">
            {isAwaitingReview ? (
              <div className="inline-flex flex-col items-center space-y-2 bg-gradient-to-br from-amber-50 to-indigo-50 dark:from-amber-950/40 dark:to-indigo-950/40 px-4 sm:px-8 py-5 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-sm max-w-md mx-auto">
                <span className="px-3 py-1 rounded-full bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-black text-xs flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Đang chờ GV duyệt</span>
                </span>
                <div className="flex items-baseline space-x-1.5 pt-1">
                  <span className="text-xs font-bold text-slate-500">Tạm tính</span>
                  <span className="text-3xl sm:text-4xl font-black text-amber-700 dark:text-amber-300">
                    {submission.mcqScore !== undefined ? submission.mcqScore.toFixed(1) : score.toFixed(1)}
                  </span>
                  <span className="text-sm font-bold text-slate-400">/ 10</span>
                </div>

              </div>
            ) : hasPendingTeacherGrading ? (
              <div className="inline-flex flex-col items-center space-y-2 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40 px-4 sm:px-8 py-5 rounded-2xl border border-purple-200 dark:border-purple-800 shadow-sm max-w-md mx-auto">
                <span className="px-3 py-1 rounded-full bg-purple-200/80 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 font-black text-xs">
                  Chờ chấm tự luận
                </span>
                <div className="flex items-baseline space-x-1.5 pt-1">
                  <span className="text-xs font-bold text-slate-500">Tạm tính</span>
                  <span className="text-3xl sm:text-4xl font-black text-purple-700 dark:text-purple-300">
                    {submission.mcqScore !== undefined ? submission.mcqScore.toFixed(1) : score.toFixed(1)}
                  </span>
                  <span className="text-sm font-bold text-slate-400">/ 10</span>
                </div>

              </div>
            ) : (
              <>
                <div className="inline-flex items-baseline space-x-2 bg-gradient-to-br from-indigo-50 to-purple-50 px-4 sm:px-8 py-4 rounded-2xl border border-indigo-100 shadow-sm">
                  <span className="text-5xl sm:text-6xl font-black text-indigo-600 tracking-tight">
                    {score.toFixed(1)}
                  </span>
                  <span className="text-xl font-bold text-slate-400">/ 10</span>
                </div>
                <h3 className="font-extrabold text-base sm:text-lg text-slate-800 mt-3">{ratingTitle}</h3>
                <p className="text-xs text-slate-500 max-w-lg mx-auto mt-1">{ratingMessage}</p>
              </>
            )}
          </div>

          {/* 4 Stat Badges Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-2">
            <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-2xl p-3 shadow-xs">
              <div className="flex items-center space-x-1.5 text-emerald-700 text-xs font-black mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Đúng</span>
              </div>
              <div className="text-2xl font-black text-emerald-900">
                {submission.correctCount}{' '}
                <span className="text-xs font-normal text-emerald-700">/{submission.totalQuestions}</span>
              </div>
            </div>

            <div className="bg-rose-50/90 border border-rose-200/90 rounded-2xl p-3 shadow-xs">
              <div className="flex items-center space-x-1.5 text-rose-700 text-xs font-black mb-1">
                <XCircle className="w-4 h-4" />
                <span>Sai</span>
              </div>
              <div className="text-2xl font-black text-rose-900">
                {submission.wrongCount}{' '}
                <span className="text-xs font-normal text-rose-700">/{submission.totalQuestions}</span>
              </div>
            </div>

            <div className="bg-blue-50/90 border border-blue-200/90 rounded-2xl p-3 shadow-xs">
              <div className="flex items-center space-x-1.5 text-blue-700 text-xs font-black mb-1">
                <Clock className="w-4 h-4" />
                <span>Thời gian</span>
              </div>
              <div className="text-base font-black text-blue-900 leading-snug">
                {GradingService.formatDuration(submission.timeSpentSeconds)}
              </div>
            </div>

            <div className="bg-indigo-50/90 border border-indigo-200/90 rounded-2xl p-3 shadow-xs">
              <div className="flex items-center space-x-1.5 text-indigo-700 text-xs font-black mb-1">
                <FileCheck2 className="w-4 h-4" />
                <span>Chính xác</span>
              </div>
              <div className="text-2xl font-black text-indigo-900">
                {Math.round((submission.correctCount / submission.totalQuestions) * 100)}%
              </div>
            </div>
          </div>

          {/* Giám sát thi - thu gọn để ưu tiên nội dung học tập */}
          <details className="mt-4 max-w-2xl mx-auto text-left print:hidden">
            <summary className="cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>
                Giám sát thi: {(submission.tabSwitchCount ?? 0) === 0
                  ? 'không ghi nhận rời màn hình'
                  : `${submission.tabSwitchCount} sự kiện`}
              </span>
            </summary>
            <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
              {(submission.tabSwitchCount ?? 0) === 0
                ? 'Không ghi nhận chuyển tab/rời màn hình trong quá trình làm bài.'
                : `Đã ghi nhận ${submission.tabSwitchCount} lần rời màn hình.`}
              {submission.isShuffled ? ' • Đề đã trộn.' : ''}
            </div>
          </details>

          {/* SỔ TAY CÂU SAI BANNER (MISTAKE VAULT) */}
          {submission.wrongCount > 0 ? (
            <div className="mt-6 max-w-2xl mx-auto bg-gradient-to-r from-rose-500/10 via-pink-500/10 to-indigo-500/10 border-2 border-rose-200 dark:border-rose-900 rounded-3xl p-5 text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in fade-in duration-300">
              <div className="flex items-start space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-pink-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-black text-sm text-slate-900 dark:text-white">
                      {isDemoPreview
                        ? `${submission.wrongCount} câu cần khắc phục`
                        : `${submission.wrongCount} câu cần luyện lại`}
                    </h4>
                  </div>

                </div>
              </div>
              {!isDemoPreview && !isTeacherPreview && (
                <button
                  onClick={() => setShowMistakeVault(true)}
                  className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-black text-xs shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center space-x-1.5 shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-rose-200" />
                  <span>Luyện lại</span>
                </button>
              )}
            </div>
          ) : (
            <div className="mt-6 max-w-2xl mx-auto bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-left flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-sm text-emerald-900">
                  Không có câu cần luyện lại
                </h4>

              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-2 sm:gap-3 mt-6 sm:mt-8">
            {!isDemoPreview && !isTeacherPreview && effectiveReviewMode === 'wrong_only' && submission.wrongCount > 0 && (
              <button
                onClick={() => {
                  setFilterType('wrong');
                  setResultViewMode('detailed');
                  window.setTimeout(() => {
                    document.getElementById('answer-review-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 50);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-sm cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>Xem câu sai ({submission.wrongCount})</span>
              </button>
            )}
            {!isDemoPreview && !isTeacherPreview && (
              <button
                onClick={() => setShowMistakeVault(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>Câu cần luyện {submission.wrongCount > 0 ? `(${submission.wrongCount})` : ''}</span>
              </button>
            )}
            {!isDemoPreview && !isTeacherPreview && (
              <button
                onClick={onRetake}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-sm transition-colors border border-indigo-200 shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Làm lại</span>
              </button>
            )}
            <button
              onClick={handlePrint}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm transition-colors border border-slate-300 shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>In</span>
            </button>
            <button
              onClick={onGoHome}
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>{isDemoPreview || isTeacherPreview ? 'Quay lại demo' : 'Về trang chủ'}</span>
            </button>
          </div>
        </div>

        {/* Chu trình học từ lỗi sai - bản gọn */}
        <section className="print:hidden bg-white rounded-2xl border border-indigo-100 shadow-sm p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-black text-slate-900">Học từ lỗi sai</h2>
            </div>
            {!isDemoPreview && !isTeacherPreview && currentAssignmentMistakes.length > 0 && (
              <button
                onClick={() => setShowMistakeVault(true)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black"
              >
                Mở lộ trình
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              ['1', 'Chấm từng bước'],
              ['2', 'Tìm lỗi gốc'],
              ['3', 'Lưu câu cần luyện'],
              ['4', 'Luyện cá nhân'],
              ['5', 'Theo dõi tiến bộ']
            ].map(([n, label]) => (
              <div key={n} className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{n}</span>
                <span className="text-[11px] font-bold text-slate-700 leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* DETAILED ANSWER REVIEW & RESULT SHEET */}
        {effectiveReviewMode !== 'score_only' ? (
          <div className="space-y-6">
            {/* VIEW MODE TABS: PHIẾU KẾT QUẢ THI VS CHI TIẾT TỪNG CÂU */}
            <div className="flex bg-slate-200/80 p-1.5 rounded-2xl max-w-md mx-auto shadow-inner border border-slate-300 gap-1.5 print:hidden">
              <button
                onClick={() => setResultViewMode('sheet')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  resultViewMode === 'sheet'
                    ? 'bg-white text-indigo-700 shadow-md scale-[1.02]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                <span>Phiếu điểm</span>
              </button>
              <button
                onClick={() => setResultViewMode('detailed')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  resultViewMode === 'detailed'
                    ? 'bg-white text-indigo-700 shadow-md scale-[1.02]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>{effectiveReviewMode === 'wrong_only' ? 'Câu sai' : 'Chi tiết'}</span>
              </button>
            </div>

            {/* 1. OFFICIAL EXAM RESULT SHEET VIEW */}
            {resultViewMode === 'sheet' && (
              <ExamResultSheetView
                submission={submission}
                assignment={assignment}
                onBackToDetailedView={() => {
                  if (effectiveReviewMode === 'wrong_only') setFilterType('wrong');
                  setResultViewMode('detailed');
                }}
                onRetake={onRetake}
              />
            )}

            {/* 2. DETAILED ANSWER REVIEW */}
            {resultViewMode === 'detailed' && (
              <div id="answer-review-section" className="space-y-6 scroll-mt-24">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>{effectiveReviewMode === 'wrong_only' ? 'Các câu cần xem lại' : 'Chi tiết từng câu'}</span>
                  </h2>

                  {effectiveReviewMode === 'full' && (
                    {/* Filter Tabs */}
                    <div className="flex bg-slate-100 p-1.5 rounded-xl shrink-0 gap-1">
                      <button
                        onClick={() => setFilterType('all')}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          filterType === 'all'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Tất cả ({submission.answers.length})
                      </button>
                      <button
                        onClick={() => setFilterType('wrong')}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          filterType === 'wrong'
                            ? 'bg-white text-rose-700 shadow-xs'
                            : 'text-slate-600 hover:text-rose-700'
                        }`}
                      >
                        Sai ({submission.wrongCount})
                      </button>
                      <button
                        onClick={() => setFilterType('correct')}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          filterType === 'correct'
                            ? 'bg-white text-emerald-700 shadow-xs'
                            : 'text-slate-600 hover:text-emerald-700'
                        }`}
                      >
                        Đúng ({submission.correctCount})
                      </button>
                    </div>
  
                  )}
                </div>

                {/* List of Questions with Full Explanations */}
                <div className="space-y-4">
              {filteredAnswers.map((ans) => {
                const questionPool = (submission.shuffledQuestions && submission.shuffledQuestions.length > 0)
                  ? submission.shuffledQuestions
                  : assignment.questions;
                const question = questionPool.find(q => q.id === ans.questionId) || assignment.questions.find(q => q.id === ans.questionId);
                if (!question) return null;

                const isCorrect = ans.isCorrect;
                const hasAiExp = !!aiExplanations[question.id];
                const isLoadingAi = !!loadingAi[question.id];
                const isExpanded = expandedCards[question.id] ?? !isCorrect; // câu sai mở, câu đúng thu gọn

                const currentAiGrading = aiGradingFeedback[question.id] || (ans.aiGraded ? { score: ans.aiScore || 0, feedback: ans.aiFeedback || '' } : null);
                const isLoadingGrading = !!loadingAiGrading[question.id];
                const images = ans.essayImages || [];

                const isAwaitingAnsReview = ans.needsTeacherReview && ans.teacherScore === undefined;

                return (
                  <div
                    key={question.id}
                    className={`bg-white rounded-2xl p-4 sm:p-5 shadow-sm border transition-all ${
                      isCorrect
                        ? 'border-emerald-200 bg-white'
                        : isAwaitingAnsReview
                        ? 'border-amber-300 bg-amber-50/15'
                        : 'border-rose-300 bg-rose-50/15'
                    }`}
                  >
                    {/* Top Question Status Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center space-x-2.5">
                        <span
                          className={`flex items-center justify-center w-8 h-8 rounded-xl text-xs font-black shadow-xs ${
                            isCorrect
                              ? 'bg-emerald-600 text-white'
                              : isAwaitingAnsReview
                              ? 'bg-amber-500 text-white'
                              : 'bg-rose-600 text-white'
                          }`}
                        >
                          {question.order}
                        </span>
                        <div>
                          <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                            Câu {question.order} • {getQuestionTypeLabel(question)}
                          </span>
                          <span
                            className={`text-xs font-bold ml-2 ${
                              isCorrect
                                ? 'text-emerald-700'
                                : isAwaitingAnsReview
                                ? 'text-amber-700'
                                : 'text-rose-600'
                            }`}
                          >
                            {isCorrect
                              ? `Đúng • ${ans.pointsEarned}đ`
                              : isAwaitingAnsReview
                              ? `Chờ GV duyệt`
                              : `Cần xem lại • ${ans.pointsEarned}/${ans.maxPoints}đ`}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleExpand(question.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                        title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Question Prompt */}
                    <div className="text-sm sm:text-base font-bold text-slate-900 mb-3 leading-relaxed">
                      <MathDisplay text={question.question} />
                    </div>

                    {/* Question Illustration Image (if available) */}
                    {question.imageUrl && (
                      <div className="mb-5 p-2 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center">
                        <div 
                          className="relative group cursor-pointer overflow-hidden rounded-xl"
                          onClick={() => setLightboxImageUrl(question.imageUrl!)}
                          title="Bấm để xem hình phóng to"
                        >
                          <img 
                            src={question.imageUrl} 
                            alt={`Hình vẽ câu ${question.order}`}
                            className="max-h-64 max-w-full object-contain rounded-xl shadow-xs transition-transform duration-200 group-hover:scale-[1.02]"
                          />
                          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl pointer-events-none">
                            <span className="px-3 py-1 bg-black/80 text-white text-xs font-semibold rounded-full flex items-center gap-1.5 backdrop-blur-xs">
                              <ZoomIn className="w-3.5 h-3.5" />
                              <span>Bấm để phóng to hình vẽ</span>
                            </span>
                          </div>
                        </div>

                      </div>
                    )}

                    {/* 1. If multiple choice: display options */}
                    {!isEssayQuestion(question) && question.options && question.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                        {question.options.map((opt) => {
                          const isStudentChoice = ans.selectedAnswer === opt.id || 
                            (ans.originalSelectedLabel && ans.originalSelectedLabel === opt.id) ||
                            (ans.selectedOptionText && opt.text && ans.selectedOptionText.trim() === opt.text.trim());
                          const isCorrectChoice = question.correctAnswer === opt.id ||
                            (question.correctAnswer && opt.text && question.correctAnswer.trim() === opt.text.trim());

                          let optContainerClass = 'border-slate-200 bg-slate-50/70 text-slate-700';
                          let badgeClass = 'bg-slate-200 text-slate-700';

                          if (isCorrectChoice) {
                            optContainerClass = 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-400/40';
                            badgeClass = 'bg-emerald-600 text-white';
                          } else if (isStudentChoice && !isCorrect) {
                            optContainerClass = 'border-rose-500 bg-rose-50 text-rose-950 font-bold ring-2 ring-rose-400/30';
                            badgeClass = 'bg-rose-600 text-white';
                          }

                          return (
                            <div
                              key={opt.id}
                              className={`flex items-center p-2.5 rounded-xl border-2 text-xs sm:text-sm transition-all ${optContainerClass}`}
                            >
                              <span
                                className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs mr-3 shrink-0 ${badgeClass}`}
                              >
                                {opt.id}
                              </span>

                              <span className="flex-1">
                                <MathDisplay text={opt.text} />
                              </span>

                              {/* Student selected tag */}
                              {isStudentChoice && (
                                <span
                                  className={`ml-2 text-[10px] uppercase font-black px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1 ${
                                    isCorrect
                                      ? 'bg-emerald-700 text-white'
                                      : 'bg-rose-600 text-white'
                                  }`}
                                >
                                  {isCorrect ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} Bạn chọn
                                </span>
                              )}

                              {/* Correct tag */}
                              {isCorrectChoice && !isStudentChoice && (
                                <span className="ml-2 text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-emerald-600 text-white shrink-0 flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Đáp án đúng
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 2. If student typed solution: display it */}
                    {ans.studentSolutionText && (
                      <div className="mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1">
                        <div className="font-bold text-slate-700">Bài làm</div>
                        <div className="font-mono text-slate-800 whitespace-pre-line pl-1">{ans.studentSolutionText}</div>
                      </div>
                    )}

                    {/* 3. If student uploaded essay photos: display gallery */}
                    {images.length > 0 && (
                      <div className="mb-4 p-3.5 bg-purple-50/60 border border-purple-200 rounded-2xl space-y-2">
                        <div className="font-bold text-xs text-purple-900 flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-purple-600" />
                          <span>Ảnh bài làm ({images.length})</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {images.map((img, iIdx) => (
                            <div key={iIdx} className="relative group rounded-xl overflow-hidden border border-purple-300 bg-white aspect-4/3 shadow-xs">
                              <img
                                src={img}
                                alt={`Ảnh ${iIdx + 1}`}
                                onClick={() => setLightboxImageUrl(img)}
                                className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <span className="text-white text-[11px] font-bold flex items-center gap-1">
                                  <Eye className="w-3 h-3" /> Xem lớn
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. AI Essay Grading Feedback Card */}
                    {currentAiGrading && !stepGradingResults[question.id] && (
                      <div className="mb-4 p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 space-y-2">
                        <div className="flex items-center justify-between font-extrabold text-indigo-900 border-b border-indigo-200/60 pb-2">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-indigo-600" />
                            <span>AI nhận xét</span>
                          </span>
                          <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-xs">
                            Đạt {currentAiGrading.score}/{question.points} điểm
                          </span>
                        </div>
                        <p className="leading-relaxed whitespace-pre-line text-indigo-900">
                          {currentAiGrading.feedback}
                        </p>
                      </div>
                    )}

                    {/* Step-by-Step AI Grading & Diagnosis (Đợt 4) */}
                    {question.type === 'essay' && (ans.studentSolutionText || images.length > 0) && (
                      <div className="mb-4">
                        {!stepGradingResults[question.id] ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleAnalyzeStepByStep(question, ans.studentSolutionText, images)}
                              disabled={loadingStepGrading[question.id]}
                              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg cursor-pointer disabled:opacity-50 transition-all active:scale-95"
                            >
                              <Sparkles className={`w-4 h-4 text-amber-300 ${loadingStepGrading[question.id] ? 'animate-spin' : 'animate-pulse'}`} />
                              <span>{loadingStepGrading[question.id] ? 'Đang phân tích...' : 'Phân tích từng bước'}</span>
                            </button>
                            {!currentAiGrading && (
                              <button
                                onClick={() => handleGradeWithAI(question, ans.studentSolutionText, images)}
                                disabled={isLoadingGrading}
                                className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-300 cursor-pointer disabled:opacity-50"
                              >
                                <span>{isLoadingGrading ? 'Đang chấm...' : 'Chấm nhanh'}</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <StepGradingBreakdown
                            questionId={String(question.order)}
                            questionText={question.question}
                            grade={String(assignment.grade)}
                            topic={assignment.topic}
                            result={stepGradingResults[question.id]}
                            onOpenSocraticFromError={handleOpenSocraticFromError}
                          />
                        )}
                      </div>
                    )}

                    {/* Step-by-Step Mathematical Explanation */}
                    {isExpanded && (
                      <div className="space-y-3 pt-2">
                        {question.explanation && (
                          <div className="p-4 bg-indigo-50/80 border border-indigo-200/80 rounded-2xl text-xs sm:text-sm text-indigo-950 shadow-xs">
                            <div className="font-extrabold text-indigo-900 mb-1.5 flex items-center gap-1.5 text-xs sm:text-sm">
                              <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>Lời giải</span>
                            </div>
                            <div className="leading-relaxed whitespace-pre-line pl-1">
                              <MathDisplay text={question.explanation} />
                            </div>
                          </div>
                        )}

                        {/* AI Tutor Pedagogical Guidance */}
                        {!isCorrect && (
                          <div className="pt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenSocraticForResultQuestion(question, ans)}
                              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-xs shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-95"
                              title="Mở Gia sư Socratic AI để hiểu sâu và tự khắc phục lỗi sai"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                              <span>Gia sư AI</span>
                            </button>

                            {!hasAiExp ? (
                              <button
                                onClick={() => handleRequestAiExplanation(question, ans.selectedAnswer)}
                                disabled={isLoadingAi}
                                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs transition-colors border border-purple-200 cursor-pointer disabled:opacity-50"
                              >
                                <Sparkles className={`w-3.5 h-3.5 ${isLoadingAi ? 'animate-spin' : ''}`} />
                                <span>{isLoadingAi ? 'Đang phân tích...' : 'Phân tích thêm'}</span>
                              </button>
                            ) : (
                              <div className="w-full mt-2 p-4 rounded-2xl bg-purple-50/90 border border-purple-200 text-xs sm:text-sm text-purple-950 space-y-2 animate-in fade-in">
                                <div className="flex items-center space-x-2 text-purple-900 font-extrabold">
                                  <GraduationCap className="w-4 h-4 text-purple-600" />
                                  <span>Gợi ý thêm</span>
                                </div>
                                <div className="leading-relaxed whitespace-pre-line pl-1 text-purple-900">
                                  {aiExplanations[question.id]}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-xs text-slate-600">
            Giáo viên chọn chế độ <strong>Chỉ xem điểm</strong> cho bài này.
          </div>
        )}
      </div>

      {/* LIGHTBOX VIEWER */}
      <ImageLightboxModal
        isOpen={Boolean(lightboxImageUrl)}
        imageUrl={lightboxImageUrl}
        onClose={() => setLightboxImageUrl(null)}
        title="Xem ảnh bài làm tự luận"
      />

      {/* SỔ TAY CÂU SAI MODAL (MISTAKE VAULT) */}
      <MistakeVaultModal
        isOpen={showMistakeVault}
        onClose={() => setShowMistakeVault(false)}
      />

      {/* GIA SƯ SOCRATIC AI - HIỂU LỖI SAI CÙNG AI */}
      {socraticResultContext && (
        <SocraticTutorModal
          isOpen={Boolean(socraticResultContext)}
          onClose={() => setSocraticResultContext(null)}
          context={socraticResultContext}
        />
      )}
    </div>
  );
};
