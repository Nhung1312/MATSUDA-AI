import React, { useState, useMemo } from 'react';
import { Assignment, ClassRoom, Submission, QuestionAnalysis, StudentAnswer } from '../../types';
import { GradingService } from '../../services/gradingService';
import { aiService } from '../../services/aiService';
import { StorageService } from '../../services/storageService';
import { FirestoreService } from '../../services/firestoreService';
import { MathDisplay } from '../../components/MathDisplay';
import { PrintExamModal } from '../../components/PrintExamModal';
import { ImageLightboxModal } from '../../components/ImageLightboxModal';
import { ClassCompetencyMatrix } from '../../components/ClassCompetencyMatrix';
import { GenerateSimilarExamModal } from '../../components/GenerateSimilarExamModal';
import { isEssayQuestion, getQuestionTypeLabel } from '../../utils/questionUtils';
import { 
  BarChart3, 
  Users, 
  Clock, 
  Trophy, 
  ArrowUpDown, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  Download,
  BookOpen, 
  Filter, 
  Eye, 
  Printer, 
  Medal, 
  Award, 
  Flame, 
  Target, 
  Share2, 
  ShieldCheck, 
  ShieldAlert, 
  Shuffle,
  Camera,
  Edit3,
  Save,
  Check,
  Brain,
  ZoomIn
} from 'lucide-react';

interface TeacherResultsProps {
  assignments: Assignment[];
  classes: ClassRoom[];
  submissions: Submission[];
  initialAssignmentId?: string;
  onOpenShare: (assignment: Assignment) => void;
}

export const TeacherResults: React.FC<TeacherResultsProps> = ({
  assignments = [],
  classes = [],
  submissions = [],
  initialAssignmentId,
  onOpenShare
}) => {
  const safeAssignments = useMemo(() => Array.isArray(assignments) ? assignments.filter((a): a is Assignment => Boolean(a && typeof a === 'object')) : [], [assignments]);
  const safeClasses = useMemo(() => Array.isArray(classes) ? classes.filter((c): c is ClassRoom => Boolean(c && typeof c === 'object')) : [], [classes]);
  const safeSubmissions = useMemo(() => Array.isArray(submissions) ? submissions.filter((s): s is Submission => Boolean(s && typeof s === 'object')) : [], [submissions]);

  const [selectedAsgId, setSelectedAsgId] = useState<string>(
    initialAssignmentId || safeAssignments[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'competency' | 'analysis' | 'submissions' | 'unsubmitted'>('leaderboard');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'time' | 'submittedAt'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchStudent, setSearchStudent] = useState('');
  const [selectedSubmissionDetail, setSelectedSubmissionDetail] = useState<Submission | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showSimilarExamModal, setShowSimilarExamModal] = useState(false);

  // AI Weakness Analysis state
  const [aiReport, setAiReport] = useState<{
    summary: string;
    weakTopics: string[];
    recommendations: string[];
  } | null>(null);
  const [loadingAiReport, setLoadingAiReport] = useState(false);

  // Essay Grading & Review in Detail Modal
  const [gradingAiInProgress, setGradingAiInProgress] = useState<Record<string, boolean>>({});
  const [teacherScoreInput, setTeacherScoreInput] = useState<Record<string, number>>({});
  const [teacherFeedbackInput, setTeacherFeedbackInput] = useState<Record<string, string>>({});
  const [savedGradeSuccess, setSavedGradeSuccess] = useState<Record<string, boolean>>({});
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Batch AI Essay Grading
  const [isBatchGrading, setIsBatchGrading] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; studentName: string } | null>(null);
  const [batchResultMsg, setBatchResultMsg] = useState<string | null>(null);

  const currentAssignment = safeAssignments.find(a => a.id === selectedAsgId) || safeAssignments[0];
  const targetClass = currentAssignment ? safeClasses.find(c => c.id === currentAssignment.classId) : null;
  const classStudents = targetClass?.students || [];

  // Filter submissions for current assignment
  const currentSubmissions = useMemo(() => {
    return safeSubmissions.filter(s => s.assignmentId === currentAssignment?.id);
  }, [safeSubmissions, currentAssignment]);

  // Compute full stats
  const stats = useMemo(() => {
    if (!currentAssignment) return null;
    return GradingService.computeAssignmentStats(
      currentAssignment,
      classStudents.length || 10,
      currentSubmissions
    );
  }, [currentAssignment, classStudents, currentSubmissions]);

  // Find unsubmitted students
  const unsubmittedStudents = useMemo(() => {
    if (!targetClass || !Array.isArray(targetClass.students)) return [];
    const submittedStudentNames = new Set(currentSubmissions.map(s => s.studentName.toLowerCase().trim()));
    return targetClass.students.filter(
      st => !submittedStudentNames.has(st.name.toLowerCase().trim())
    );
  }, [targetClass, currentSubmissions]);

  // Leaderboard ranking list (sorted strictly by score desc, then timeSpentSeconds asc)
  const leaderboardList = useMemo(() => {
    const list = [...currentSubmissions];
    list.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return a.timeSpentSeconds - b.timeSpentSeconds;
    });
    return list;
  }, [currentSubmissions]);

  // Sort submissions for generic table view
  const sortedSubmissions = useMemo(() => {
    let list = [...currentSubmissions];
    if (searchStudent.trim()) {
      list = list.filter(s => s.studentName.toLowerCase().includes(searchStudent.toLowerCase()));
    }

    list.sort((a, b) => {
      let res = 0;
      if (sortBy === 'name') {
        res = a.studentName.localeCompare(b.studentName);
      } else if (sortBy === 'score') {
        res = a.totalScore - b.totalScore;
      } else if (sortBy === 'time') {
        res = a.timeSpentSeconds - b.timeSpentSeconds;
      } else if (sortBy === 'submittedAt') {
        res = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      }
      return sortOrder === 'desc' ? -res : res;
    });

    return list;
  }, [currentSubmissions, searchStudent, sortBy, sortOrder]);

  const handleSort = (field: 'name' | 'score' | 'time' | 'submittedAt') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Run simulated AI Class analysis
  const handleRunAiAnalysis = async () => {
    if (!stats || !currentAssignment) return;
    setLoadingAiReport(true);
    try {
      const report = await aiService.analyzeClassMistakes({
        assignmentTitle: currentAssignment.title,
        grade: currentAssignment.grade,
        totalStudents: currentSubmissions.length,
        questionAnalyses: stats.questionAnalyses,
        submissions: currentSubmissions
      });
      setAiReport(report);
    } catch {
      alert('Không thể thực hiện phân tích lúc này.');
    } finally {
      setLoadingAiReport(false);
    }
  };

  // On-demand AI Essay Grading for a single question
  const handleAiGradeSingleQuestion = async (ans: StudentAnswer, question: any) => {
    if (!selectedSubmissionDetail || !currentAssignment) return;
    if (!aiService.hasApiKey()) {
      alert('Bạn chưa cài đặt Google Gemini API Key. Vui lòng vào Cài đặt để nhập API Key từ Google AI Studio.');
      return;
    }
    setGradingAiInProgress(prev => ({ ...prev, [ans.questionId]: true }));
    try {
      const res = await aiService.gradeEssay({
        questionText: question.question,
        studentAnswerText: ans.studentSolutionText || '',
        essayImages: ans.essayImages || [],
        maxPoints: question.points,
        correctAnswerCriteria: question.correctAnswer,
        rubric: question.rubric,
        grade: currentAssignment.grade,
        topicHint: question.topicHint
      });

      const updatedAnswers = selectedSubmissionDetail.answers.map(a => {
        if (a.questionId === ans.questionId) {
          const isCorrect = res.score >= (question.points * 0.5);
          return {
            ...a,
            pointsEarned: res.score,
            teacherScore: res.score,
            teacherFeedback: `[Gemini AI]: ${res.feedback}`,
            isCorrect,
            aiScore: res.score,
            aiFeedback: res.feedback,
            aiGraded: true
          };
        }
        return a;
      });

      // Recalculate total score
      let totalEarned = 0;
      let totalMax = 0;
      let correctCnt = 0;
      let wrongCnt = 0;
      updatedAnswers.forEach(a => {
        const q = currentAssignment.questions.find(item => item.id === a.questionId);
        const max = q ? q.points : (a.maxPoints || 1);
        totalMax += max;
        totalEarned += (a.teacherScore !== undefined ? a.teacherScore : a.pointsEarned);
        if (a.isCorrect) correctCnt++; else wrongCnt++;
      });
      const rawScore = totalMax > 0 ? (totalEarned / totalMax) * 10 : 0;
      const totalScore = Math.round(rawScore * 10) / 10;

      const updatedSubmission: Submission = {
        ...selectedSubmissionDetail,
        answers: updatedAnswers,
        totalScore,
        correctCount: correctCnt,
        wrongCount: wrongCnt
      };

      setSelectedSubmissionDetail(updatedSubmission);
      StorageService.saveSubmission(updatedSubmission);
      FirestoreService.saveResult(updatedSubmission).catch(() => {});
      alert(`AI đã chấm xong: ${res.score}/${question.points} điểm.`);
    } catch (e: any) {
      alert('Lỗi chấm bài bằng AI: ' + (e?.message || String(e)));
    } finally {
      setGradingAiInProgress(prev => ({ ...prev, [ans.questionId]: false }));
    }
  };

  // Chấm hàng loạt bài tự luận của bài tập bằng Gemini AI
  const handleBatchAiGradeAssignment = async () => {
    if (!currentAssignment) return;
    if (!aiService.hasApiKey()) {
      alert('Bạn chưa cài đặt Google Gemini API Key. Vui lòng vào Cài đặt để nhập API Key từ Google AI Studio.');
      return;
    }

    const essayQuestions = currentAssignment.questions.filter(q => isEssayQuestion(q));
    if (essayQuestions.length === 0) {
      alert('Bài tập này không có câu hỏi tự luận.');
      return;
    }

    if (currentSubmissions.length === 0) {
      alert('Chưa có học sinh nào nộp bài tập này.');
      return;
    }

    const confirmAction = window.confirm(
      `Hệ thống sẽ dùng Gemini AI để tự động phân tích và chấm điểm toàn bộ bài tự luận cho ${currentSubmissions.length} bài nộp của lớp.\n\nThầy/Cô có muốn bắt đầu không?`
    );
    if (!confirmAction) return;

    setIsBatchGrading(true);
    setBatchResultMsg(null);
    let successCount = 0;

    try {
      for (let i = 0; i < currentSubmissions.length; i++) {
        const sub = currentSubmissions[i];
        setBatchProgress({
          current: i + 1,
          total: currentSubmissions.length,
          studentName: sub.studentName
        });

        const updatedAnswers = [...sub.answers];
        let totalEarned = 0;
        let totalMax = 0;
        let correctCnt = 0;
        let wrongCnt = 0;

        for (let qIdx = 0; qIdx < currentAssignment.questions.length; qIdx++) {
          const q = currentAssignment.questions[qIdx];
          const isEssay = isEssayQuestion(q);
          const ansIndex = updatedAnswers.findIndex(a => a.questionId === q.id);
          const ans = ansIndex >= 0 ? updatedAnswers[ansIndex] : null;

          if (isEssay && ans) {
            try {
              const res = await aiService.gradeEssay({
                questionText: q.question,
                studentAnswerText: ans.studentSolutionText || '',
                essayImages: ans.essayImages || [],
                maxPoints: q.points,
                correctAnswerCriteria: q.correctAnswer,
                rubric: q.rubric,
                grade: currentAssignment.grade,
                topicHint: q.topicHint
              });

              const isCorrect = res.score >= (q.points * 0.5);
              updatedAnswers[ansIndex] = {
                ...ans,
                pointsEarned: res.score,
                teacherScore: res.score,
                teacherFeedback: `[Gemini AI]: ${res.feedback}`,
                isCorrect,
                aiScore: res.score,
                aiFeedback: res.feedback,
                aiGraded: true
              };

              totalEarned += res.score;
              if (isCorrect) correctCnt++; else wrongCnt++;
            } catch (err) {
              console.warn(`Lỗi chấm AI câu ${q.id} cho ${sub.studentName}:`, err);
              const pts = ans.teacherScore ?? ans.pointsEarned ?? 0;
              totalEarned += pts;
              if (ans.isCorrect) correctCnt++; else wrongCnt++;
            }
          } else if (ans) {
            const pts = ans.teacherScore ?? ans.pointsEarned ?? 0;
            totalEarned += pts;
            if (ans.isCorrect) correctCnt++; else wrongCnt++;
          }
          totalMax += (q.points || 1);
        }

        const rawScore = totalMax > 0 ? (totalEarned / totalMax) * 10 : 0;
        const totalScore = Math.round(rawScore * 10) / 10;

        const updatedSub: Submission = {
          ...sub,
          answers: updatedAnswers,
          totalScore,
          correctCount: correctCnt,
          wrongCount: wrongCnt,
          gradingStatus: 'graded'
        };

        StorageService.saveSubmission(updatedSub);
        await FirestoreService.saveResult(updatedSub).catch(() => {});
        successCount++;
      }

      setBatchResultMsg(`✅ Hoàn thành! Đã dùng Gemini AI chấm điểm tự luận cho ${successCount} bài nộp của lớp.`);
    } catch (batchErr: any) {
      alert('Quá trình chấm hàng loạt gặp sự cố: ' + (batchErr?.message || String(batchErr)));
    } finally {
      setIsBatchGrading(false);
      setBatchProgress(null);
    }
  };

  // Teacher manual override score and comment
  const handleSaveTeacherManualGrade = (ans: StudentAnswer, question: any) => {
    if (!selectedSubmissionDetail || !currentAssignment) return;
    const scoreVal = teacherScoreInput[ans.questionId] !== undefined ? teacherScoreInput[ans.questionId] : (ans.teacherScore !== undefined ? ans.teacherScore : ans.pointsEarned);
    const fbVal = teacherFeedbackInput[ans.questionId] !== undefined ? teacherFeedbackInput[ans.questionId] : (ans.teacherFeedback || '');

    const updatedAnswers = selectedSubmissionDetail.answers.map(a => {
      if (a.questionId === ans.questionId) {
        const isCorrect = scoreVal >= (question.points * 0.5);
        return {
          ...a,
          pointsEarned: scoreVal,
          teacherScore: scoreVal,
          teacherFeedback: fbVal,
          isCorrect
        };
      }
      return a;
    });

    let totalEarned = 0;
    let totalMax = 0;
    let correctCnt = 0;
    let wrongCnt = 0;
    updatedAnswers.forEach(a => {
      const q = Array.isArray(currentAssignment?.questions) ? currentAssignment.questions.find(item => item && item.id === a.questionId) : undefined;
      const max = q ? q.points : (a.maxPoints || 1);
      totalMax += max;
      totalEarned += (a.teacherScore !== undefined ? a.teacherScore : a.pointsEarned);
      if (a.isCorrect) correctCnt++; else wrongCnt++;
    });
    const rawScore = totalMax > 0 ? (totalEarned / totalMax) * 10 : 0;
    const totalScore = Math.round(rawScore * 10) / 10;

    const updatedSubmission: Submission = {
      ...selectedSubmissionDetail,
      answers: updatedAnswers,
      totalScore,
      correctCount: correctCnt,
      wrongCount: wrongCnt
    };

    setSelectedSubmissionDetail(updatedSubmission);
    StorageService.saveSubmission(updatedSubmission);
    FirestoreService.saveResult(updatedSubmission).catch(() => {});

    setSavedGradeSuccess(prev => ({ ...prev, [ans.questionId]: true }));
    setTimeout(() => {
      setSavedGradeSuccess(prev => ({ ...prev, [ans.questionId]: false }));
    }, 2500);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (currentSubmissions.length === 0) return;
    const header = ['Hạng', 'Họ và tên', 'Lớp', 'Điểm', 'Số câu đúng', 'Số câu sai', 'Thời gian làm', 'Ngày nộp'];
    const rows = leaderboardList.map((s, idx) => [
      idx + 1,
      `"${s.studentName}"`,
      `"${s.className}"`,
      s.totalScore,
      s.correctCount,
      s.wrongCount,
      `"${GradingService.formatDuration(s.timeSpentSeconds)}"`,
      `"${new Date(s.submittedAt).toLocaleString('vi-VN')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BangXepHang_${currentAssignment?.assignmentCode || 'ToanTHCS'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!currentAssignment) {
    return (
      <div className="text-center py-12 text-slate-500">
        Chưa có bài tập nào để xem kết quả.
      </div>
    );
  }

  if (safeAssignments.length === 0 || !currentAssignment) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-slate-200 shadow-xs space-y-4">
        <BarChart3 className="w-12 h-12 text-slate-300 mx-auto" />
        <h3 className="font-bold text-slate-700 text-lg">Chưa có bài tập nào</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Thầy Cô hãy tạo bài tập mới hoặc giao đề mẫu cho học sinh để xem bảng xếp hạng và phân tích kết quả tại đây.
        </p>
      </div>
    );
  }

  const top1 = leaderboardList[0];
  const top2 = leaderboardList[1];
  const top3 = leaderboardList[2];

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-12">
      {/* Header & Assignment Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <span>Báo cáo, Bảng xếp hạng & Thống kê điểm yếu</span>
          </h1>
          <p className="text-sm text-slate-500">
            Theo dõi vinh danh học sinh, phổ điểm và phân tích câu hỏi sai nhiều nhất để kịp thời giảng lại.
          </p>
        </div>

        {/* Assignment Picker & Quick Action */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-2">
            <label className="text-xs font-bold text-slate-600 shrink-0">Chọn bài tập:</label>
            <select
              value={selectedAsgId}
              onChange={(e) => {
                setSelectedAsgId(e.target.value);
                setAiReport(null);
                setSelectedSubmissionDetail(null);
              }}
              className="px-4 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-sm text-slate-800 shadow-xs focus:ring-2 focus:ring-indigo-500"
            >
              {safeAssignments.map((asg) => (
                <option key={asg.id} value={asg.id}>
                  {asg.title} ({asg.className ? `Lớp ${asg.className}` : `Lớp ${asg.grade}`}) - Mã: {asg.assignmentCode}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95"
            title="In bản giấy hoặc lưu PDF chuẩn A4"
          >
            <Printer className="w-4 h-4" />
            <span>In đề thi / Xuất PDF</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase">Tổng học sinh</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">
            {stats?.totalAssigned || 0}
          </div>
          <span className="text-[11px] text-slate-500">Sĩ số lớp {currentAssignment.className}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-emerald-600 uppercase">Đã nộp bài</div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">
            {stats?.submittedCount || 0}
          </div>
          <span className="text-[11px] text-emerald-600">
            {stats?.totalAssigned ? Math.round((stats.submittedCount / stats.totalAssigned) * 100) : 0}% hoàn thành
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-rose-500 uppercase">Chưa nộp</div>
          <div className="text-2xl font-extrabold text-rose-600 mt-1">
            {unsubmittedStudents.length}
          </div>
          <span className="text-[11px] text-rose-500">Cần nhắc nhở</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-indigo-600 uppercase">Điểm trung bình</div>
          <div className="text-2xl font-extrabold text-indigo-700 mt-1">
            {stats?.averageScore || 0}
            <span className="text-xs font-normal text-slate-400">/10</span>
          </div>
          <span className="text-[11px] text-slate-500">Toàn lớp</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-amber-600 uppercase">Điểm cao nhất</div>
          <div className="text-2xl font-extrabold text-amber-700 mt-1">
            {stats?.highestScore || 0}
            <span className="text-xs font-normal text-slate-400">/10</span>
          </div>
          <span className="text-[11px] text-slate-500">Thủ khoa lớp</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase">Điểm thấp nhất</div>
          <div className="text-2xl font-extrabold text-slate-700 mt-1">
            {stats?.lowestScore || 0}
            <span className="text-xs font-normal text-slate-400">/10</span>
          </div>
          <span className="text-[11px] text-slate-500">Cần phụ đạo</span>
        </div>
      </div>

      {/* BATCH AI ESSAY GRADING BANNER */}
      {currentAssignment.questions.some(q => isEssayQuestion(q)) && (
        <div className="p-5 rounded-3xl bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 border-2 border-purple-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h3 className="font-black text-slate-900 text-sm">
                  Trợ lý Gemini AI Chấm Điểm Tự Luận Lớp Học
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[11px] font-black">
                  Đã nộp: {currentSubmissions.length} bài
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                AI tự động đọc ảnh chụp bài giải viết tay, phân tích các bước biến đổi toán học và tính điểm chuẩn barem.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleBatchAiGradeAssignment}
              disabled={isBatchGrading || currentSubmissions.length === 0}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs shadow-md shadow-purple-500/20 flex items-center space-x-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isBatchGrading
                  ? 'Đang chấm điểm...'
                  : `AI Chấm Toàn Bộ Tự Luận (${currentSubmissions.length} bài)`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Thông báo kết quả chấm hàng loạt */}
      {batchResultMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
          <span>{batchResultMsg}</span>
          <button
            onClick={() => setBatchResultMsg(null)}
            className="text-emerald-700 hover:underline cursor-pointer ml-3"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Tabs Navigation & Action Bar */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex bg-slate-100 p-1 rounded-xl flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'leaderboard'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Bảng xếp hạng (Leaderboard)</span>
          </button>

          <button
            onClick={() => setActiveTab('competency')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'competency'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Brain className="w-4 h-4" />
            <span>Ma trận Năng lực &amp; Tư duy</span>
          </button>

          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'analysis'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Thống kê điểm yếu & Câu sai ({stats?.mostMissedQuestions.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('submissions')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
              activeTab === 'submissions'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 Danh sách nộp ({stats?.submittedCount || 0})
          </button>

          <button
            onClick={() => setActiveTab('unsubmitted')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
              activeTab === 'unsubmitted'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⚠️ Chưa nộp ({unsubmittedStudents.length})
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSimilarExamModal(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition-colors cursor-pointer"
            title="Tạo đề tương tự / Biến thể mã đề chống quay cóp"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Tạo đề tương tự</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel/CSV</span>
          </button>

          <button
            onClick={() => onOpenShare(currentAssignment)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Mã: {currentAssignment.assignmentCode}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: LEADERBOARD (BẢNG XẾP HẠNG) */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-6">
          {leaderboardList.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
              <Trophy className="w-12 h-12 text-amber-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-700 text-lg">Chưa có bài thi nào trên Bảng xếp hạng</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Chia sẻ mã bài tập <strong>{currentAssignment.assignmentCode}</strong> để học sinh làm bài và ghi danh vào Bảng vàng vinh danh!
              </p>
            </div>
          ) : (
            <>
              {/* Podium for Top 3 Students */}
              <div className="bg-gradient-to-b from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-400/10 via-transparent to-transparent pointer-events-none" />

                <div className="text-center max-w-xl mx-auto mb-8 relative z-10">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-extrabold uppercase tracking-widest mb-2 border border-amber-400/30">
                    <Flame className="w-3.5 h-3.5" /> BẢNG VÀNG THÀNH TÍCH LỚP {currentAssignment.className}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    Vinh Danh Top Học Sinh Xuất Sắc Nhất
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Xếp hạng theo Điểm số cao nhất và Thời gian hoàn thành nhanh nhất
                  </p>
                </div>

                {/* Top 3 Podium Columns */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto items-end relative z-10 pt-4">
                  {/* Top 2 (Silver) */}
                  {top2 && (
                    <div className="order-2 sm:order-1 bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-slate-400/30 text-center flex flex-col items-center justify-between min-h-[220px] shadow-lg">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-slate-300 to-slate-100 text-slate-800 flex items-center justify-center font-black text-2xl shadow-md mb-2">
                        🥈
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-300 block">Á KHOA 1</span>
                        <div className="font-extrabold text-base text-white mt-0.5 line-clamp-1">{top2.studentName}</div>
                      </div>
                      <div className="mt-3 w-full bg-white/10 rounded-2xl py-2 px-3">
                        <div className="text-2xl font-black text-amber-300">{top2.totalScore.toFixed(1)} <span className="text-xs font-normal text-slate-300">/ 10</span></div>
                        <div className="text-[11px] text-slate-300 mt-0.5 flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" /> {GradingService.formatDuration(top2.timeSpentSeconds)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top 1 (Gold - Center) */}
                  {top1 && (
                    <div className="order-1 sm:order-2 bg-gradient-to-b from-amber-500/20 to-amber-500/10 backdrop-blur-md rounded-3xl p-6 border-2 border-amber-400 text-center flex flex-col items-center justify-between min-h-[260px] shadow-2xl scale-105">
                      <div className="relative">
                        <div className="w-18 h-18 rounded-3xl bg-gradient-to-tr from-amber-400 to-yellow-200 text-slate-900 flex items-center justify-center font-black text-4xl shadow-xl mb-2">
                          🥇
                        </div>
                        <span className="absolute -top-2 -right-2 bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                          TOP 1
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase font-black tracking-widest text-amber-300 block">THỦ KHOA LỚP</span>
                        <div className="font-black text-lg text-white mt-0.5 line-clamp-1">{top1.studentName}</div>
                      </div>
                      <div className="mt-3 w-full bg-amber-400/20 rounded-2xl py-2.5 px-3 border border-amber-400/30">
                        <div className="text-3xl font-black text-amber-300">{top1.totalScore.toFixed(1)} <span className="text-xs font-normal text-amber-100">/ 10</span></div>
                        <div className="text-xs text-amber-100 mt-0.5 flex items-center justify-center gap-1 font-semibold">
                          <Clock className="w-3.5 h-3.5" /> {GradingService.formatDuration(top1.timeSpentSeconds)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top 3 (Bronze) */}
                  {top3 && (
                    <div className="order-3 sm:order-3 bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-amber-700/30 text-center flex flex-col items-center justify-between min-h-[210px] shadow-lg">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-700 to-amber-600 text-white flex items-center justify-center font-black text-2xl shadow-md mb-2">
                        🥉
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-amber-300 block">Á KHOA 2</span>
                        <div className="font-extrabold text-base text-white mt-0.5 line-clamp-1">{top3.studentName}</div>
                      </div>
                      <div className="mt-3 w-full bg-white/10 rounded-2xl py-2 px-3">
                        <div className="text-2xl font-black text-amber-300">{top3.totalScore.toFixed(1)} <span className="text-xs font-normal text-slate-300">/ 10</span></div>
                        <div className="text-[11px] text-slate-300 mt-0.5 flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" /> {GradingService.formatDuration(top3.timeSpentSeconds)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Full Leaderboard Table */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <span>Bảng Thứ Hạng Toàn Lớp ({leaderboardList.length} học sinh)</span>
                  </h3>
                  <span className="text-xs text-slate-400">Tự động sắp xếp theo thứ hạng</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-y border-slate-200">
                        <th className="py-3 px-3 text-center w-16">Thứ hạng</th>
                        <th className="py-3 px-4">Họ và tên thí sinh</th>
                        <th className="py-3 px-3 text-center">Điểm số</th>
                        <th className="py-3 px-3 text-center">Đúng / Tổng</th>
                        <th className="py-3 px-3 text-center">Thời gian làm</th>
                        <th className="py-3 px-3 text-center">Giám sát thi</th>
                        <th className="py-3 px-3 text-center">Danh hiệu</th>
                        <th className="py-3 px-4 text-right">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaderboardList.map((sub, idx) => {
                        const rank = idx + 1;
                        let rankBadge = (
                          <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center mx-auto">
                            #{rank}
                          </span>
                        );

                        if (rank === 1) {
                          rankBadge = (
                            <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 font-black text-sm flex items-center justify-center mx-auto border border-amber-300 shadow-xs">
                              🥇
                            </span>
                          );
                        } else if (rank === 2) {
                          rankBadge = (
                            <span className="w-8 h-8 rounded-xl bg-slate-200 text-slate-800 font-black text-sm flex items-center justify-center mx-auto border border-slate-300 shadow-xs">
                              🥈
                            </span>
                          );
                        } else if (rank === 3) {
                          rankBadge = (
                            <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-900 font-black text-sm flex items-center justify-center mx-auto border border-amber-200 shadow-xs">
                              🥉
                            </span>
                          );
                        }

                        const scoreBadge =
                          sub.totalScore >= 8.5
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : sub.totalScore >= 6.5
                            ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                            : sub.totalScore >= 5.0
                            ? 'text-amber-700 bg-amber-50 border-amber-200'
                            : 'text-rose-700 bg-rose-50 border-rose-200';

                        let titleLabel = 'Cần cố gắng 📖';
                        let titleColor = 'text-slate-600 bg-slate-100';
                        if (sub.totalScore >= 9.0) {
                          titleLabel = 'Xuất sắc 🌟';
                          titleColor = 'text-amber-800 bg-amber-100 font-bold';
                        } else if (sub.totalScore >= 8.0) {
                          titleLabel = 'Giỏi 👍';
                          titleColor = 'text-emerald-800 bg-emerald-100 font-bold';
                        } else if (sub.totalScore >= 6.5) {
                          titleLabel = 'Khá 👏';
                          titleColor = 'text-indigo-800 bg-indigo-100 font-semibold';
                        } else if (sub.totalScore >= 5.0) {
                          titleLabel = 'Trung bình ✍️';
                          titleColor = 'text-amber-800 bg-amber-50 font-medium';
                        }

                        return (
                          <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-3 text-center">{rankBadge}</td>
                            <td className="py-3 px-4 font-bold text-slate-800">
                              <div>{sub.studentName}</div>
                              <div className="text-[11px] text-slate-400 font-normal">Lớp {sub.className}</div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className={`inline-block px-3 py-1 rounded-xl font-extrabold text-sm border ${scoreBadge}`}>
                                {sub.totalScore.toFixed(1)}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center text-xs font-semibold">
                              <span className="text-emerald-600 font-bold">{sub.correctCount}</span>
                              <span className="text-slate-400">/{sub.totalQuestions}</span>
                            </td>
                            <td className="py-3 px-3 text-center text-xs font-medium text-slate-600">
                              {GradingService.formatDuration(sub.timeSpentSeconds)}
                            </td>
                            <td className="py-3 px-3 text-center text-xs">
                              {(sub.tabSwitchCount ?? 0) === 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                  <span>0 vi phạm</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px]">
                                  <ShieldAlert className="w-3 h-3 text-rose-600" />
                                  <span>{sub.tabSwitchCount} lần rời tab</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center text-xs">
                              <span className={`px-2.5 py-1 rounded-lg ${titleColor}`}>
                                {titleLabel}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => setSelectedSubmissionDetail(sub)}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-bold"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Xem bài</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: MA TRẬN NĂNG LỰC & CẤP ĐỘ TƯ DUY (CHUẨN BỘ GD&ĐT) */}
      {activeTab === 'competency' && currentAssignment && (
        <ClassCompetencyMatrix
          assignment={currentAssignment}
          submissions={currentSubmissions}
          onOpenSimilarExamModal={() => setShowSimilarExamModal(true)}
        />
      )}

      {/* TAB 3: WEAKNESS & QUESTION MISTAKE ANALYTICS */}
      {activeTab === 'analysis' && stats && (
        <div className="space-y-6">
          {/* Section: CÂU HỌC SINH SAI NHIỀU NHẤT */}
          <div className="bg-gradient-to-br from-rose-50 via-amber-50 to-orange-50 rounded-3xl p-6 sm:p-7 border-2 border-rose-300 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-sm">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">
                    CÁC CÂU HỌC SINH SAI NHIỀU NHẤT (ĐIỂM YẾU CỦA LỚP)
                  </h3>
                  <p className="text-xs text-slate-600">
                    Phần kiến thức học sinh hay nhầm lẫn nhất — Giáo viên nên dành 10-15 phút đầu giờ để giảng lại dạng bài này.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              {stats.mostMissedQuestions.map((q, idx) => {
                const failRate = 100 - q.accuracyRate;
                const severity =
                  failRate >= 50
                    ? 'border-rose-400 bg-rose-100/50 text-rose-900'
                    : 'border-amber-300 bg-amber-100/50 text-amber-900';

                return (
                  <div
                    key={q.questionId}
                    className="bg-white rounded-2xl p-5 border-2 border-rose-200 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-md border ${severity}`}>
                          Top {idx + 1} Sai Nhiều ({failRate}% sai)
                        </span>
                        <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                          {q.wrongCount}/{q.totalResponses} em làm sai
                        </span>
                      </div>

                      <div className="font-bold text-sm text-slate-900 mb-2.5 leading-snug">
                        <MathDisplay text={`Câu ${q.order}: ${q.questionText}`} />
                      </div>

                      {q.topicHint && (
                        <div className="text-xs text-indigo-700 bg-indigo-50 p-2.5 rounded-xl font-medium mb-3">
                          Dạng bài: <strong>{q.topicHint}</strong>
                        </div>
                      )}

                      {/* Mini Option Distribution */}
                      <div className="space-y-1 bg-slate-50 p-2.5 rounded-xl text-xs mb-3">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">
                          Phân bổ học sinh chọn:
                        </span>
                        <div className="grid grid-cols-4 gap-1 text-center font-mono font-bold">
                          {['A', 'B', 'C', 'D'].map(opt => (
                            <span
                              key={opt}
                              className={`py-0.5 rounded ${
                                q.correctAnswer === opt
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white text-slate-700 border border-slate-200'
                              }`}
                            >
                              {opt}: {q.optionDistribution[opt] || 0}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-700 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <span>Đáp án đúng: <strong className="text-emerald-700 font-extrabold">{q.correctAnswer}</strong></span>
                      <span className="text-emerald-700 font-bold">{q.accuracyRate}% làm đúng</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* AI Pedagogical Recommendations */}
            <div className="mt-6 pt-4 border-t border-rose-200/80">
              {!aiReport ? (
                <button
                  onClick={handleRunAiAnalysis}
                  disabled={loadingAiReport}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>
                    {loadingAiReport ? 'Đang phân tích dữ liệu toàn lớp...' : '💡 AI Phân tích nguyên nhân & Đề xuất giáo án khắc phục'}
                  </span>
                </button>
              ) : (
                <div className="p-5 bg-white rounded-2xl border border-indigo-200 shadow-sm space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center space-x-2 text-indigo-900 font-bold text-sm">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>Báo cáo Sư phạm AI về kiến thức lớp {currentAssignment.className}:</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                    {aiReport.summary}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200">
                      <strong className="text-amber-900 block mb-1.5 font-black uppercase text-[11px] tracking-wider">
                        ⚠️ Chủ đề học sinh hổng nhiều nhất:
                      </strong>
                      <ul className="list-disc list-inside text-amber-800 space-y-1">
                        {aiReport.weakTopics.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200">
                      <strong className="text-emerald-900 block mb-1.5 font-black uppercase text-[11px] tracking-wider">
                        ✅ Kế hoạch giảng dạy khắc phục:
                      </strong>
                      <ul className="list-disc list-inside text-emerald-800 space-y-1">
                        {aiReport.recommendations.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Full Question By Question Analytics Table */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-slate-900">
              Bảng tỷ lệ trả lời đúng theo từng câu ({stats.questionAnalyses.length} câu)
            </h3>

            <div className="space-y-3">
              {stats.questionAnalyses.map((q) => {
                const acc = q.accuracyRate;
                const barColor =
                  acc >= 80 ? 'bg-emerald-500' : acc >= 60 ? 'bg-indigo-500' : acc >= 40 ? 'bg-amber-500' : 'bg-rose-500';

                return (
                  <div
                    key={q.questionId}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100/70 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-6 h-6 rounded-md bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {q.order}
                        </span>
                        <div className="font-semibold text-sm text-slate-900 line-clamp-1">
                          {q.questionText}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0 text-xs">
                        <span className="font-bold text-slate-700">Đúng: {q.correctCount}/{q.totalResponses}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-white ${barColor}`}>
                          {acc}% đúng
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full ${barColor} transition-all duration-500`}
                        style={{ width: `${acc}%` }}
                      />
                    </div>

                    {/* Options Distribution Badges */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-500">Phân bố lựa chọn:</span>
                      {['A', 'B', 'C', 'D'].map((opt) => {
                        const isCorrect = q.correctAnswer === opt;
                        const count = q.optionDistribution[opt] || 0;
                        return (
                          <span
                            key={opt}
                            className={`px-2 py-0.5 rounded-md font-mono ${
                              isCorrect
                                ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300'
                                : 'bg-white text-slate-600 border border-slate-200'
                            }`}
                          >
                            {opt}: <strong>{count}</strong> {isCorrect && '✓'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SUBMISSIONS TABLE */}
      {activeTab === 'submissions' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchStudent}
                onChange={(e) => setSearchStudent(e.target.value)}
                placeholder="Tìm học sinh theo tên..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <span className="text-xs text-slate-400">
              Nhấp vào tiêu đề cột để sắp xếp
            </span>
          </div>

          {sortedSubmissions.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">Chưa có học sinh nào nộp bài</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Chia sẻ mã bài tập <strong>{currentAssignment.assignmentCode}</strong> để học sinh làm bài.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-y border-slate-200">
                    <th className="py-3 px-3 text-center w-12">STT</th>
                    <th
                      onClick={() => handleSort('name')}
                      className="py-3 px-4 cursor-pointer hover:text-slate-800"
                    >
                      <div className="flex items-center gap-1">
                        <span>Họ và tên</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('score')}
                      className="py-3 px-3 text-center cursor-pointer hover:text-slate-800"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Điểm số</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-3 text-center">Đúng / Tổng</th>
                    <th
                      onClick={() => handleSort('time')}
                      className="py-3 px-3 text-center cursor-pointer hover:text-slate-800"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Thời gian</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-3 text-center">Giám sát thi</th>
                    <th
                      onClick={() => handleSort('submittedAt')}
                      className="py-3 px-3 cursor-pointer hover:text-slate-800"
                    >
                      <div className="flex items-center gap-1">
                        <span>Thời điểm nộp</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedSubmissions.map((sub, idx) => {
                    const scoreColor =
                      sub.totalScore >= 8.0
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : sub.totalScore >= 6.5
                        ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                        : sub.totalScore >= 5.0
                        ? 'text-amber-700 bg-amber-50 border-amber-200'
                        : 'text-rose-700 bg-rose-50 border-rose-200';

                    return (
                      <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 text-center text-xs font-semibold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {sub.studentName}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {sub.hasEssayQuestions && sub.gradingStatus === 'pending_teacher_grading' ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-purple-100 text-purple-800 border border-purple-200">
                                Chờ chấm tự luận
                              </span>
                              <span className="text-[11px] text-slate-500 font-semibold">
                                TN: {sub.mcqScore !== undefined ? sub.mcqScore.toFixed(1) : sub.totalScore.toFixed(1)}đ
                              </span>
                            </div>
                          ) : (
                            <span
                              className={`inline-block px-3 py-1 rounded-xl font-extrabold text-sm border ${scoreColor}`}
                            >
                              {sub.totalScore.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center text-xs font-semibold">
                          <span className="text-emerald-600 font-bold">{sub.correctCount}</span>
                          <span className="text-slate-400">/{sub.totalQuestions}</span>
                        </td>
                        <td className="py-3 px-3 text-center text-xs font-medium text-slate-600">
                          {GradingService.formatTimeShort(sub.timeSpentSeconds)}
                        </td>
                        <td className="py-3 px-3 text-center text-xs">
                          {(sub.tabSwitchCount ?? 0) === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>0 vi phạm</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px]">
                              <ShieldAlert className="w-3 h-3 text-rose-600" />
                              <span>{sub.tabSwitchCount} vi phạm</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500">
                          {new Date(sub.submittedAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}{' '}
                          •{' '}
                          {new Date(sub.submittedAt).toLocaleDateString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit'
                          })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedSubmissionDetail(sub)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-bold"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Xem bài</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: UNSUBMITTED STUDENTS */}
      {activeTab === 'unsubmitted' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="font-bold text-lg text-slate-900">
                Danh sách học sinh chưa nộp bài ({unsubmittedStudents.length})
              </h2>
              <p className="text-xs text-slate-500">
                Lớp {currentAssignment.className} • Hạn nộp: {new Date(currentAssignment.deadline).toLocaleDateString('vi-VN')}
              </p>
            </div>
          </div>

          {unsubmittedStudents.length === 0 ? (
            <div className="text-center py-12 bg-emerald-50 rounded-2xl border border-emerald-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
              <p className="text-base font-bold text-emerald-900">100% Học sinh đã nộp bài!</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Tất cả học sinh trong danh sách lớp đều đã hoàn thành bài tập này.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {unsubmittedStudents.map((st, idx) => (
                <div
                  key={st.id}
                  className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200/80 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2.5">
                    <span className="w-7 h-7 rounded-lg bg-rose-200 text-rose-800 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-bold text-sm text-slate-800">{st.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{st.code || 'HS'}</div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-md">
                    Chưa nộp
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: View Single Student's Submission Detail */}
      {selectedSubmissionDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  Lớp {selectedSubmissionDetail.className}
                </span>
                <h3 className="font-extrabold text-xl text-slate-900 mt-1">
                  Bài làm của {selectedSubmissionDetail.studentName}
                </h3>
                <p className="text-xs text-slate-500">
                  Thời gian làm: {GradingService.formatDuration(selectedSubmissionDetail.timeSpentSeconds)} • Điểm:{' '}
                  <strong className="text-indigo-600 text-sm">{selectedSubmissionDetail.totalScore}/10</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedSubmissionDetail(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Anti-Cheat Teacher Audit Box */}
            <div className="mb-4">
              {(selectedSubmissionDetail.tabSwitchCount ?? 0) === 0 ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-emerald-800 font-bold">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Giám sát phòng thi: Thí sinh làm bài trung thực (0 lần rời màn hình)</span>
                  </div>
                  {selectedSubmissionDetail.isShuffled && (
                    <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-semibold">
                      Đề trộn ngẫu nhiên
                    </span>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-900 space-y-2">
                  <div className="flex items-center justify-between font-extrabold">
                    <div className="flex items-center space-x-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span>Cảnh báo Giám sát: Phát hiện {selectedSubmissionDetail.tabSwitchCount} lần rời màn hình</span>
                    </div>
                    <span className="px-2 py-0.5 bg-rose-200 text-rose-800 rounded-md font-black text-[11px]">
                      {selectedSubmissionDetail.tabSwitchCount} vi phạm
                    </span>
                  </div>
                  {selectedSubmissionDetail.violationEvents && selectedSubmissionDetail.violationEvents.length > 0 && (
                    <div className="mt-2 space-y-1 bg-white/80 p-2.5 rounded-xl border border-rose-200 text-[11px]">
                      <div className="font-bold text-rose-950 mb-1">Chi tiết mốc thời gian vi phạm:</div>
                      {selectedSubmissionDetail.violationEvents.map((evt, eIdx) => (
                        <div key={eIdx} className="flex items-center justify-between text-slate-700">
                          <span>{eIdx + 1}. {evt.description}</span>
                          <span className="font-mono text-slate-500 text-[10px]">
                            {new Date(evt.timestamp).toLocaleTimeString('vi-VN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* General Exam Paper/Scratch Photos (if attached in PDF mode) */}
            {selectedSubmissionDetail.essayImages && selectedSubmissionDetail.essayImages.length > 0 && (
              <div className="mb-4 p-4 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-purple-900 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-purple-600" />
                    <span>Ảnh bài làm đính kèm chung ({selectedSubmissionDetail.essayImages.length} ảnh):</span>
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {selectedSubmissionDetail.essayImages.map((img, iIdx) => (
                    <div
                      key={iIdx}
                      onClick={() => setLightboxImageUrl(img)}
                      className="group relative rounded-xl overflow-hidden border border-purple-300 aspect-4/3 cursor-pointer bg-white"
                    >
                      <img src={img} alt={`Bài làm ${iIdx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {selectedSubmissionDetail.answers.map((ans) => {
                const question = currentAssignment.questions.find(q => q.id === ans.questionId);
                if (!question) return null;

                const isEssay = isEssayQuestion(question);
                const isCorrect = ans.isCorrect;
                const images = ans.essayImages || [];
                const isLoadingAI = !!gradingAiInProgress[ans.questionId];
                const isSaved = !!savedGradeSuccess[ans.questionId];

                const currentScore = teacherScoreInput[ans.questionId] !== undefined
                  ? teacherScoreInput[ans.questionId]
                  : (ans.teacherScore !== undefined ? ans.teacherScore : ans.pointsEarned);

                const currentFeedback = teacherFeedbackInput[ans.questionId] !== undefined
                  ? teacherFeedbackInput[ans.questionId]
                  : (ans.teacherFeedback || '');

                return (
                  <div
                    key={ans.questionId}
                    className={`p-4 rounded-2xl border ${
                      isCorrect ? 'border-emerald-200 bg-emerald-50/20' : 'border-rose-200 bg-rose-50/20'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-700">
                        Câu {question.order} • {getQuestionTypeLabel(question)} ({question.points} điểm)
                      </span>
                      <span className={isCorrect ? 'text-emerald-700 font-extrabold' : 'text-rose-700 font-extrabold'}>
                        {isCorrect ? `✓ Đúng (+${ans.pointsEarned}đ)` : `✗ Chưa đạt (+${ans.pointsEarned}/${question.points}đ)`}
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-slate-900 mb-2">
                      <MathDisplay text={question.question} />
                    </div>

                    {/* Question Illustration Image */}
                    {question.imageUrl && (
                      <div className="mb-3 p-2 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center">
                        <div 
                          className="relative group cursor-pointer overflow-hidden rounded-lg"
                          onClick={() => setLightboxImageUrl(question.imageUrl!)}
                          title="Bấm để xem hình vẽ phóng to"
                        >
                          <img 
                            src={question.imageUrl} 
                            alt={`Hình vẽ câu ${question.order}`}
                            className="max-h-56 max-w-full object-contain rounded-lg shadow-2xs transition-transform duration-200 group-hover:scale-[1.02]"
                          />
                          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg pointer-events-none">
                            <span className="px-2.5 py-1 bg-black/80 text-white text-[11px] font-semibold rounded-full flex items-center gap-1 backdrop-blur-xs">
                              <ZoomIn className="w-3 h-3" />
                              <span>Phóng to</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Multiple choice response */}
                    {!isEssay && (
                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-4 bg-white/70 p-2.5 rounded-xl border border-slate-100 mb-2">
                        <span>
                          Học sinh chọn: <strong className="text-indigo-700">{ans.selectedAnswer || '(Bỏ trống)'}</strong>
                          {ans.selectedOptionText && <span className="text-slate-500 ml-1">({ans.selectedOptionText})</span>}
                          {ans.originalSelectedLabel && ans.originalSelectedLabel !== ans.selectedAnswer && (
                            <span className="text-[11px] text-indigo-500 ml-1 font-normal">(Đề gốc: {ans.originalSelectedLabel})</span>
                          )}
                        </span>
                        <span>
                          Đáp án đúng: <strong className="text-emerald-700">{question.correctAnswer}</strong>
                        </span>
                      </div>
                    )}

                    {/* Essay: Typed text solution */}
                    {ans.studentSolutionText && (
                      <div className="mb-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-0.5">
                        <div className="font-bold text-slate-700">📝 Lời giải học sinh gõ:</div>
                        <div className="font-mono text-slate-800 whitespace-pre-line pl-1">{ans.studentSolutionText}</div>
                      </div>
                    )}

                    {/* Essay: Uploaded photos */}
                    {images.length > 0 && (
                      <div className="mb-2 p-2.5 bg-purple-50/60 border border-purple-200 rounded-xl space-y-1.5">
                        <div className="font-bold text-xs text-purple-900 flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-purple-600" />
                          <span>Ảnh bài làm tự luận ({images.length} ảnh):</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {images.map((img, iIdx) => (
                            <div
                              key={iIdx}
                              onClick={() => setLightboxImageUrl(img)}
                              className="group relative rounded-lg overflow-hidden border border-purple-300 aspect-4/3 cursor-pointer bg-white"
                            >
                              <img src={img} alt={`Ảnh ${iIdx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Eye className="w-4 h-4 text-white" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Grading result */}
                    {ans.aiGraded && (
                      <div className="mb-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-950 space-y-1">
                        <div className="flex items-center justify-between font-extrabold text-indigo-900">
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Gemini AI chấm: {ans.aiScore}/{question.points} điểm</span>
                          </span>
                        </div>
                        <p className="leading-relaxed whitespace-pre-line text-indigo-900/90 text-[11px]">
                          {ans.aiFeedback}
                        </p>
                      </div>
                    )}

                    {/* Teacher Manual Grading / Override Box */}
                    {isEssay && (
                      <div className="mt-3 pt-3 border-t border-slate-200/80 bg-white/80 p-3 rounded-xl space-y-2 text-xs">
                        <div className="flex items-center justify-between font-bold text-slate-800">
                          <span className="flex items-center gap-1">
                            <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Giáo viên chấm điểm & Nhận xét:</span>
                          </span>
                          <button
                            onClick={() => handleAiGradeSingleQuestion(ans, question)}
                            disabled={isLoadingAI}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold border border-indigo-200 cursor-pointer disabled:opacity-50"
                          >
                            <Sparkles className={`w-3 h-3 ${isLoadingAI ? 'animate-spin' : ''}`} />
                            <span>{isLoadingAI ? 'AI đang chấm...' : '✨ Chấm bằng AI'}</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                          <div className="flex items-center gap-2">
                            <label className="text-slate-600 font-semibold shrink-0">Điểm:</label>
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              max={question.points}
                              value={currentScore}
                              onChange={(e) => setTeacherScoreInput(prev => ({
                                ...prev,
                                [ans.questionId]: parseFloat(e.target.value) || 0
                              }))}
                              className="w-20 px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <span className="text-slate-400">/{question.points}đ</span>
                          </div>

                          <div className="sm:col-span-2 flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Lời phê của giáo viên..."
                              value={currentFeedback}
                              onChange={(e) => setTeacherFeedbackInput(prev => ({
                                ...prev,
                                [ans.questionId]: e.target.value
                              }))}
                              className="flex-1 px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                              onClick={() => handleSaveTeacherManualGrade(ans, question)}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shrink-0 ${
                                isSaved ? 'bg-emerald-600 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'
                              }`}
                            >
                              {isSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                              <span>{isSaved ? 'Đã lưu' : 'Lưu'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Nút Duyệt và công bố điểm cho học sinh */}
            {selectedSubmissionDetail.hasEssayQuestions && selectedSubmissionDetail.gradingStatus === 'pending_teacher_grading' && (
              <div className="p-4 bg-purple-50 rounded-2xl border border-purple-200 flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                <div className="text-xs text-purple-900">
                  <span className="font-bold block">Bài thi này đang ở trạng thái: "Chờ giáo viên chấm"</span>
                  <span className="text-purple-700 text-[11px]">Học sinh mới chỉ xem được điểm trắc nghiệm tạm tính.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const finalized: Submission = {
                      ...selectedSubmissionDetail,
                      gradingStatus: 'graded'
                    };
                    setSelectedSubmissionDetail(finalized);
                    StorageService.saveSubmission(finalized);
                    FirestoreService.saveResult(finalized).catch(() => {});
                    alert('Đã duyệt và chính thức công bố điểm cho học sinh!');
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Duyệt & Công bố điểm</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL TIẾN TRÌNH CHẤM BÀI HÀNG LOẠT BẰNG AI */}
      {isBatchGrading && batchProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-5 text-center">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 text-white flex items-center justify-center mx-auto shadow-xl shadow-indigo-300 animate-bounce">
              <Sparkles className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-900">
                Gemini AI Đang Chấm Bài Tự Luận
              </h3>
              <p className="text-xs text-slate-500">
                Đang phân tích bài làm của học sinh: <strong className="text-indigo-600">{batchProgress.studentName}</strong>
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>Tiến trình hoàn thành:</span>
                <span>{batchProgress.current} / {batchProgress.total} bài</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
                <div
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 h-full rounded-full transition-all duration-300 shadow-sm"
                  style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-400 text-center pt-1 font-medium">
                Vui lòng không đóng trình duyệt trong khi AI đang xử lý...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Full Size Image in Lightbox */}
      <ImageLightboxModal
        isOpen={Boolean(lightboxImageUrl)}
        imageUrl={lightboxImageUrl}
        onClose={() => setLightboxImageUrl(null)}
        title="Chi tiết ảnh bài làm"
      />

      {/* Modal: Print Exam Paper */}
      {showPrintModal && (
        <PrintExamModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          assignment={currentAssignment}
        />
      )}

      {/* Modal: Generate Similar Exam */}
      {showSimilarExamModal && currentAssignment && (
        <GenerateSimilarExamModal
          isOpen={showSimilarExamModal}
          onClose={() => setShowSimilarExamModal(false)}
          assignment={currentAssignment}
          classes={classes}
          onSuccess={(newAsg) => {
            setSelectedAsgId(newAsg.id);
          }}
        />
      )}
    </div>
  );
};
