import React, { useState, useEffect } from 'react';
import { 
  Contest, 
  ContestSubmission, 
  StudentAnswer, 
  Question 
} from '../../../types';
import { FirestoreService } from '../../../services/firestoreService';
import { StorageService } from '../../../services/storageService';
import { aiService } from '../../../services/aiService';
import { rankContestSubmissions, formatContestDateTime } from '../../../utils/contestUtils';
import { MathDisplay } from '../../../components/MathDisplay';
import { isEssayQuestion } from '../../../utils/questionUtils';
import { ImageLightboxModal } from '../../../components/ImageLightboxModal';
import * as XLSX from 'xlsx';
import { 
  Trophy, 
  ArrowLeft, 
  Download, 
  Search, 
  Filter, 
  Medal, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Sparkles, 
  Edit3, 
  Eye, 
  Save, 
  X, 
  BarChart3, 
  CheckSquare, 
  Users, 
  ChevronRight,
  TrendingUp
} from 'lucide-react';

interface TeacherContestResultsProps {
  contestId: string;
  onNavigate: (tab: string, params?: any) => void;
}

export const TeacherContestResults: React.FC<TeacherContestResultsProps> = ({
  contestId,
  onNavigate
}) => {
  const [contest, setContest] = useState<Contest | null>(null);
  const [submissions, setSubmissions] = useState<ContestSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ranking' | 'analytics'>('ranking');
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  // Grading Modal state
  const [gradingSubmission, setGradingSubmission] = useState<ContestSubmission | null>(null);
  const [activeEssayIndex, setActiveEssayIndex] = useState<number>(0);
  const [teacherScoreInput, setTeacherScoreInput] = useState<number>(0);
  const [teacherFeedbackInput, setTeacherFeedbackInput] = useState<string>('');
  const [isAiGrading, setIsAiGrading] = useState<boolean>(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isSavingGrade, setIsSavingGrade] = useState<boolean>(false);
  const [aiBreakdown, setAiBreakdown] = useState<any>(null);

  // Batch AI Grading state
  const [isBatchGrading, setIsBatchGrading] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; studentName: string } | null>(null);
  const [batchResultMsg, setBatchResultMsg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [contestId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Lấy thông tin cuộc thi
      let c = StorageService.getContestById(contestId);
      if (!c) {
        c = await FirestoreService.getContestById(contestId);
      }
      setContest(c);

      // 2. Lấy danh sách bài nộp (Local + Firestore)
      const localSubs = StorageService.getContestSubmissions(contestId);
      const cloudSubs = await FirestoreService.getContestSubmissions(contestId);

      const map = new Map<string, ContestSubmission>();
      localSubs.forEach(s => map.set(s.id, s));
      cloudSubs.forEach(s => map.set(s.id, s));

      const merged = Array.from(map.values());
      const ranked = rankContestSubmissions(merged);
      setSubmissions(ranked);
    } catch (e) {
      console.warn('Lỗi tải kết quả cuộc thi:', e);
    } finally {
      setLoading(false);
    }
  };

  // Danh sách lớp tham gia
  const classList = Array.from(new Set(submissions.map(s => s.studentClass).filter(Boolean)));

  // Lọc bài nộp
  const filteredSubmissions = submissions.filter(s => {
    if (classFilter !== 'all' && s.studentClass !== classFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return s.studentName.toLowerCase().includes(q) || (s.studentClass || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Top 3
  const top1 = submissions[0];
  const top2 = submissions[1];
  const top3 = submissions[2];

  // Thống kê điểm số
  const totalSubmissions = submissions.length;
  const avgScore = totalSubmissions > 0
    ? (submissions.reduce((sum, s) => sum + s.totalScore, 0) / totalSubmissions).toFixed(1)
    : '0.0';
  const highestScore = totalSubmissions > 0
    ? Math.max(...submissions.map(s => s.totalScore)).toFixed(1)
    : '0.0';
  const lowestScore = totalSubmissions > 0
    ? Math.min(...submissions.map(s => s.totalScore)).toFixed(1)
    : '0.0';

  // Xuất file Excel bảng điểm
  const handleExportExcel = () => {
    if (submissions.length === 0) {
      alert('Chưa có bài thi nào để xuất!');
      return;
    }

    const excelData = submissions.map((s, idx) => ({
      'Hạng': idx + 1,
      'Họ và tên': s.studentName,
      'Lớp': s.studentClass || 'Tự do',
      'Tổng điểm': s.totalScore,
      'Điểm trắc nghiệm': s.mcqScore,
      'Điểm tự luận': s.hasEssay ? (s.isEssayGraded ? s.essayScore : 'Chờ chấm') : 'Không có',
      'Số câu đúng': `${s.correctCount}/${s.totalQuestions}`,
      'Thời gian làm bài (giây)': s.timeSpentSeconds,
      'Số lần rời tab': s.tabSwitchCount || 0,
      'Thời điểm nộp': formatContestDateTime(s.submittedAt)
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bang_Xep_Hang');
    XLSX.writeFile(workbook, `Bang_Xep_Hang_${contest?.code || 'CuocThi'}.xlsx`);
  };

  // Mở modal chấm bài tự luận của học sinh
  const handleOpenGradingModal = (sub: ContestSubmission) => {
    setGradingSubmission(sub);
    setActiveEssayIndex(0);
    setAiBreakdown(null);
    
    // Nạp câu tự luận đầu tiên
    const essayAnswers = sub.answers.filter(a => {
      const q = contest?.questions.find(item => item.id === a.questionId);
      return q && isEssayQuestion(q);
    });

    if (essayAnswers.length > 0) {
      const first = essayAnswers[0];
      setTeacherScoreInput(first.teacherScore ?? first.aiScore ?? first.pointsEarned ?? 0);
      setTeacherFeedbackInput(first.teacherFeedback ?? first.aiFeedback ?? '');
    }
  };

  // AI đề xuất chấm điểm câu tự luận đang xem
  const handleAiGradeCurrentQuestion = async (
    q: Question,
    ans: StudentAnswer
  ) => {
    if (!aiService.hasApiKey()) {
      const confirmSettings = window.confirm(
        'Bạn chưa cài đặt Google Gemini API Key. Bạn có muốn chuyển đến Cài đặt để nhập API Key miễn phí không?'
      );
      if (confirmSettings) {
        onNavigate('settings');
      }
      return;
    }

    setIsAiGrading(true);
    setAiBreakdown(null);
    try {
      const result = await aiService.gradeEssay({
        questionText: q.question,
        studentAnswerText: ans.studentSolutionText || ans.selectedAnswer || '',
        essayImages: ans.essayImages || [],
        maxPoints: q.points || 2.0,
        correctAnswerCriteria: q.correctAnswer,
        rubric: q.rubric,
        grade: contest?.grade
      });

      setTeacherScoreInput(result.score);
      setTeacherFeedbackInput(result.feedback);
      setAiBreakdown(result);
    } catch (e: any) {
      alert('AI chấm điểm gặp sự cố: ' + (e?.message || String(e)));
    } finally {
      setIsAiGrading(false);
    }
  };

  // Chấm hàng loạt bài tự luận bằng Gemini AI
  const handleBatchAiGrade = async () => {
    if (!contest) return;
    if (!aiService.hasApiKey()) {
      const confirmNav = window.confirm(
        'Bạn chưa cài đặt Google Gemini API Key. Bạn có muốn chuyển đến Cài đặt để nhập API Key miễn phí không?'
      );
      if (confirmNav) {
        onNavigate('settings');
      }
      return;
    }

    const essayQuestions = contest.questions.filter(q => isEssayQuestion(q));
    if (essayQuestions.length === 0) {
      alert('Cuộc thi này không có câu hỏi tự luận.');
      return;
    }

    const targetSubmissions = submissions.filter(s => s.hasEssay);
    if (targetSubmissions.length === 0) {
      alert('Chưa có học sinh nào nộp bài tự luận.');
      return;
    }

    const unGradedSubs = targetSubmissions.filter(s => !s.isEssayGraded);
    const subsToGrade = unGradedSubs.length > 0 ? unGradedSubs : targetSubmissions;

    const confirmAction = window.confirm(
      `Hệ thống sẽ dùng Gemini AI để tự động đọc ảnh bài làm và chấm điểm cho ${subsToGrade.length} bài thi tự luận.\n\nThầy/Cô có muốn bắt đầu không?`
    );
    if (!confirmAction) return;

    setIsBatchGrading(true);
    setBatchResultMsg(null);
    let successCount = 0;
    let updatedSubmissionsList = [...submissions];

    try {
      for (let i = 0; i < subsToGrade.length; i++) {
        const sub = subsToGrade[i];
        setBatchProgress({
          current: i + 1,
          total: subsToGrade.length,
          studentName: sub.studentName
        });

        const updatedAnswers = [...sub.answers];
        let newEssayScore = 0;
        let newMcqScore = 0;
        let newEarnedPointsTotal = 0;
        let maxPointsTotal = 0;

        for (let qIdx = 0; qIdx < contest.questions.length; qIdx++) {
          const q = contest.questions[qIdx];
          const isEssay = isEssayQuestion(q);
          const ansIndex = updatedAnswers.findIndex(a => a.questionId === q.id);
          const ans = ansIndex >= 0 ? updatedAnswers[ansIndex] : null;

          if (isEssay && ans) {
            try {
              const res = await aiService.gradeEssay({
                questionText: q.question,
                studentAnswerText: ans.studentSolutionText || ans.selectedAnswer || '',
                essayImages: ans.essayImages || [],
                maxPoints: q.points || 2.0,
                correctAnswerCriteria: q.correctAnswer,
                rubric: q.rubric,
                grade: contest.grade
              });

              const teacherScore = res.score;
              const teacherFeedback = `[Gemini AI]: ${res.feedback}`;
              const pointsEarned = res.score;
              const isCorrect = res.score >= (q.points * 0.5);

              updatedAnswers[ansIndex] = {
                ...ans,
                teacherScore,
                teacherFeedback,
                pointsEarned,
                isCorrect,
                aiScore: res.score,
                aiFeedback: res.feedback,
                aiGraded: true
              };

              newEssayScore += pointsEarned;
              newEarnedPointsTotal += pointsEarned;
            } catch (err) {
              console.warn(`Lỗi chấm AI câu ${q.id} cho ${sub.studentName}:`, err);
              const pts = ans.teacherScore ?? ans.pointsEarned ?? 0;
              newEssayScore += pts;
              newEarnedPointsTotal += pts;
            }
          } else if (ans) {
            const pts = ans.pointsEarned || 0;
            newMcqScore += pts;
            newEarnedPointsTotal += pts;
          }
          maxPointsTotal += (q.points || 1);
        }

        const newTotalScore = maxPointsTotal > 0
          ? Math.round((newEarnedPointsTotal / maxPointsTotal) * 100) / 10
          : 0;

        const updatedSub: ContestSubmission = {
          ...sub,
          answers: updatedAnswers,
          essayScore: newEssayScore,
          mcqScore: newMcqScore,
          totalScore: newTotalScore,
          isEssayGraded: true
        };

        StorageService.saveContestSubmission(updatedSub);
        await FirestoreService.updateContestSubmission(updatedSub.id, {
          answers: updatedAnswers,
          essayScore: newEssayScore,
          mcqScore: newMcqScore,
          totalScore: newTotalScore,
          isEssayGraded: true
        });

        updatedSubmissionsList = updatedSubmissionsList.map(s => s.id === updatedSub.id ? updatedSub : s);
        successCount++;
      }

      const ranked = rankContestSubmissions(updatedSubmissionsList);
      setSubmissions(ranked);
      setBatchResultMsg(`✅ Hoàn thành xuất sắc! Đã dùng Gemini AI chấm điểm và cập nhật bảng xếp hạng cho ${successCount} bài thi.`);
    } catch (batchErr: any) {
      alert('Quá trình chấm hàng loạt gặp sự cố: ' + (batchErr?.message || String(batchErr)));
    } finally {
      setIsBatchGrading(false);
      setBatchProgress(null);
    }
  };

  // Lưu điểm câu tự luận
  const handleSaveEssayGrade = async () => {
    if (!gradingSubmission || !contest) return;

    const essayAnswers = gradingSubmission.answers.filter(a => {
      const q = contest.questions.find(item => item.id === a.questionId);
      return q && isEssayQuestion(q);
    });

    const targetAnswer = essayAnswers[activeEssayIndex];
    if (!targetAnswer) return;

    setIsSavingGrade(true);
    try {
      // 1. Cập nhật câu trả lời này
      const updatedAnswers = gradingSubmission.answers.map(a => {
        if (a.questionId === targetAnswer.questionId) {
          return {
            ...a,
            teacherScore: teacherScoreInput,
            teacherFeedback: teacherFeedbackInput,
            pointsEarned: teacherScoreInput,
            isCorrect: teacherScoreInput >= (a.maxPoints * 0.5)
          };
        }
        return a;
      });

      // 2. Tính lại điểm tự luận và tổng điểm
      let newEssayScore = 0;
      let newMcqScore = 0;
      let newEarnedPointsTotal = 0;
      let maxPointsTotal = 0;

      contest.questions.forEach(q => {
        const isEssay = isEssayQuestion(q);
        const ans = updatedAnswers.find(item => item.questionId === q.id);
        const pts = ans ? ans.pointsEarned : 0;
        
        if (isEssay) {
          newEssayScore += pts;
        } else {
          newMcqScore += pts;
        }
        newEarnedPointsTotal += pts;
        maxPointsTotal += (q.points || 1);
      });

      // Điểm thang 10
      const newTotalScore = maxPointsTotal > 0
        ? Math.round((newEarnedPointsTotal / maxPointsTotal) * 100) / 10
        : 0;

      // Kiểm tra xem tất cả câu tự luận đã có điểm chưa
      const allEssayDone = contest.questions
        .filter(q => isEssayQuestion(q))
        .every(q => {
          const ans = updatedAnswers.find(item => item.questionId === q.id);
          return ans && (ans.teacherScore !== undefined || ans.aiScore !== undefined);
        });

      const updatedSub: ContestSubmission = {
        ...gradingSubmission,
        answers: updatedAnswers,
        essayScore: newEssayScore,
        mcqScore: newMcqScore,
        totalScore: newTotalScore,
        isEssayGraded: allEssayDone
      };

      // 3. Cập nhật Local & Firestore
      StorageService.saveContestSubmission(updatedSub);
      await FirestoreService.updateContestSubmission(updatedSub.id, {
        answers: updatedAnswers,
        essayScore: newEssayScore,
        mcqScore: newMcqScore,
        totalScore: newTotalScore,
        isEssayGraded: allEssayDone
      });

      setGradingSubmission(updatedSub);
      setSubmissions(prev => rankContestSubmissions(prev.map(s => s.id === updatedSub.id ? updatedSub : s)));
      alert('Đã cập nhật điểm tự luận thành công!');
    } catch (e) {
      alert('Lỗi lưu điểm tự luận: ' + String(e));
    } finally {
      setIsSavingGrade(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-500">Đang tải bảng xếp hạng cuộc thi...</p>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
        <p className="text-xs text-slate-500">Không tìm thấy thông tin cuộc thi này.</p>
        <button
          onClick={() => onNavigate('contests')}
          className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold"
        >
          Về danh sách cuộc thi
        </button>
      </div>
    );
  }

  // Danh sách câu tự luận của submission đang chấm
  const currentEssayQuestions = gradingSubmission
    ? contest.questions.filter(q => isEssayQuestion(q))
    : [];
  const currentActiveQ = currentEssayQuestions[activeEssayIndex];
  const currentActiveAns = gradingSubmission?.answers.find(a => a.questionId === currentActiveQ?.id);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={() => onNavigate('contests')}
          className="flex items-center space-x-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về danh sách cuộc thi</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => window.open(`/contest/${contest.code}/ranking`, '_blank')}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer"
          >
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>Xem Bảng Xếp Hạng Công Khai</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Xuất file Excel</span>
          </button>
        </div>
      </div>

      {/* Contest Title & Quick Stats Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-lg bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 font-extrabold text-xs">
                Khối {contest.grade}
              </span>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Mã: {contest.code}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {contest.title}
            </h1>
            <p className="text-xs text-slate-500">
              Thời lượng: {contest.durationMinutes} phút • {contest.questions.length} câu hỏi • Mở từ {formatContestDateTime(contest.startTime)} đến {formatContestDateTime(contest.endTime)}
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center shrink-0">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold block">Thí sinh</span>
              <span className="text-base font-black text-indigo-600 dark:text-indigo-400">{totalSubmissions}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold block">Điểm TB</span>
              <span className="text-base font-black text-slate-800 dark:text-slate-200">{avgScore}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold block">Cao nhất</span>
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{highestScore}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold block">Thấp nhất</span>
              <span className="text-base font-black text-rose-500">{lowestScore}</span>
            </div>
          </div>
        </div>

        {/* TOP 3 PODIUM */}
        {totalSubmissions > 0 && (
          <div className="pt-6">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-4 flex items-center space-x-1.5">
              <Trophy className="w-4 h-4" />
              <span>Vinh Danh Top 3 Dẫn Đầu</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* TOP 1 - GOLD */}
              {top1 && (
                <div className="relative p-4 rounded-2xl bg-gradient-to-b from-amber-50 to-amber-100/60 dark:from-amber-950/40 dark:to-amber-900/20 border-2 border-amber-400/80 shadow-xs flex items-center space-x-3.5 overflow-hidden">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center font-black text-lg shadow-md shrink-0">
                    🥇
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                      Hạng Nhất (Vàng)
                    </span>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                      {top1.studentName}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Lớp: <strong>{top1.studentClass || 'Tự do'}</strong> • {top1.timeSpentSeconds}s
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                      {top1.totalScore}đ
                    </div>
                  </div>
                </div>
              )}

              {/* TOP 2 - SILVER */}
              {top2 && (
                <div className="relative p-4 rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/70 dark:from-slate-800/60 dark:to-slate-800/30 border-2 border-slate-300 dark:border-slate-700 shadow-xs flex items-center space-x-3.5 overflow-hidden">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-300 to-slate-500 text-white flex items-center justify-center font-black text-lg shadow-md shrink-0">
                    🥈
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                      Hạng Nhì (Bạc)
                    </span>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                      {top2.studentName}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Lớp: <strong>{top2.studentClass || 'Tự do'}</strong> • {top2.timeSpentSeconds}s
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black text-slate-700 dark:text-slate-300">
                      {top2.totalScore}đ
                    </div>
                  </div>
                </div>
              )}

              {/* TOP 3 - BRONZE */}
              {top3 && (
                <div className="relative p-4 rounded-2xl bg-gradient-to-b from-orange-50 to-orange-100/60 dark:from-orange-950/40 dark:to-orange-900/20 border-2 border-orange-300 dark:border-orange-800 shadow-xs flex items-center space-x-3.5 overflow-hidden">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-700 text-white flex items-center justify-center font-black text-lg shadow-md shrink-0">
                    🥉
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-800 dark:text-orange-300 block">
                      Hạng Ba (Đồng)
                    </span>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                      {top3.studentName}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Lớp: <strong>{top3.studentClass || 'Tự do'}</strong> • {top3.timeSpentSeconds}s
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black text-orange-700 dark:text-orange-400">
                      {top3.totalScore}đ
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* BATCH AI GRADING BANNER */}
      {contest.questions.some(q => isEssayQuestion(q)) && (
        <div className="p-5 rounded-3xl bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 dark:from-purple-950/40 dark:via-indigo-950/40 dark:to-pink-950/40 border-2 border-purple-200/80 dark:border-purple-800/60 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-indigo-950 shrink-0">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h3 className="font-black text-slate-900 dark:text-white text-sm">
                  Trợ lý AI Gemini Chấm Điểm Tự Luận
                </h3>
                {submissions.filter(s => s.hasEssay && !s.isEssayGraded).length > 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[11px] font-black animate-pulse">
                    {submissions.filter(s => s.hasEssay && !s.isEssayGraded).length} bài thi chờ chấm
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px] font-black">
                    ✓ Đã chấm xong toàn bộ
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                AI tự động đọc ảnh chụp bài giải viết tay của học sinh, đối chiếu barem điểm và ghi lời nhận xét chi tiết.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleBatchAiGrade}
              disabled={isBatchGrading || submissions.length === 0}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs shadow-md shadow-purple-500/20 flex items-center space-x-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isBatchGrading
                  ? 'Đang xử lý...'
                  : submissions.filter(s => s.hasEssay && !s.isEssayGraded).length > 0
                  ? `AI Chấm ${submissions.filter(s => s.hasEssay && !s.isEssayGraded).length} bài chờ chấm`
                  : 'AI Chấm lại toàn bộ bài thi'}
              </span>
            </button>

            <button
              onClick={() => onNavigate('settings')}
              className="p-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-colors cursor-pointer"
              title="Cài đặt API Key & Model Gemini"
            >
              ⚙️
            </button>
          </div>
        </div>
      )}

      {/* Thông báo kết quả chấm hàng loạt */}
      {batchResultMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center justify-between">
          <span>{batchResultMsg}</span>
          <button
            onClick={() => setBatchResultMsg(null)}
            className="text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer ml-3"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main Tabs: Bảng xếp hạng & Phổ điểm */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        {/* Tab Buttons & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 self-start">
            <button
              onClick={() => setActiveTab('ranking')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'ranking'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              🏆 Bảng xếp hạng ({submissions.length})
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              📊 Phổ điểm & Thống kê
            </button>
          </div>

          {activeTab === 'ranking' && (
            <div className="flex items-center space-x-2">
              {/* Filter by class */}
              {classList.length > 0 && (
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  <option value="all">Tất cả các lớp</option>
                  {classList.map(cls => (
                    <option key={cls} value={cls}>Lớp {cls}</option>
                  ))}
                </select>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo tên học sinh..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* TAB 1: BẢNG XẾP HẠNG CHI TIẾT */}
        {activeTab === 'ranking' && (
          <div className="overflow-x-auto">
            {filteredSubmissions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Chưa có bài thi nào được nộp.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase text-[10px]">
                    <th className="py-3 px-3">Hạng</th>
                    <th className="py-3 px-3">Học sinh</th>
                    <th className="py-3 px-3">Lớp</th>
                    <th className="py-3 px-3">Tổng điểm</th>
                    <th className="py-3 px-3">Trắc nghiệm</th>
                    <th className="py-3 px-3">Tự luận</th>
                    <th className="py-3 px-3">Thời gian</th>
                    <th className="py-3 px-3">Gian lận (tab)</th>
                    <th className="py-3 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredSubmissions.map((s, idx) => {
                    const isTop1 = idx === 0;
                    const isTop2 = idx === 1;
                    const isTop3 = idx === 2;

                    return (
                      <tr
                        key={s.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Hạng */}
                        <td className="py-3 px-3 font-black">
                          {isTop1 ? (
                            <span className="w-6 h-6 rounded-full bg-amber-400 text-white flex items-center justify-center text-xs shadow-xs">
                              1
                            </span>
                          ) : isTop2 ? (
                            <span className="w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-600 text-white flex items-center justify-center text-xs shadow-xs">
                              2
                            </span>
                          ) : isTop3 ? (
                            <span className="w-6 h-6 rounded-full bg-orange-400 text-white flex items-center justify-center text-xs shadow-xs">
                              3
                            </span>
                          ) : (
                            <span className="text-slate-400 pl-2">#{idx + 1}</span>
                          )}
                        </td>

                        {/* Tên */}
                        <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                          {s.studentName}
                        </td>

                        {/* Lớp */}
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                            {s.studentClass || 'Tự do'}
                          </span>
                        </td>

                        {/* Tổng điểm */}
                        <td className="py-3 px-3">
                          <span className="text-sm font-black text-orange-600 dark:text-orange-400">
                            {s.totalScore}
                          </span>
                          <span className="text-[10px] text-slate-400">/10</span>
                        </td>

                        {/* MCQ */}
                        <td className="py-3 px-3 font-semibold text-slate-600 dark:text-slate-300">
                          {s.mcqScore}đ ({s.correctCount}/{s.totalQuestions})
                        </td>

                        {/* Tự luận */}
                        <td className="py-3 px-3">
                          {s.hasEssay ? (
                            s.isEssayGraded ? (
                              <span className="text-purple-600 dark:text-purple-400 font-bold">
                                {s.essayScore}đ (Đã chấm)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 text-[10px] font-bold animate-pulse">
                                Chờ chấm
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 text-[11px]">Không có</span>
                          )}
                        </td>

                        {/* Thời gian */}
                        <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                          {Math.floor(s.timeSpentSeconds / 60)}p {s.timeSpentSeconds % 60}s
                        </td>

                        {/* Gian lận */}
                        <td className="py-3 px-3">
                          {s.tabSwitchCount && s.tabSwitchCount > 0 ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[11px] font-bold">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{s.tabSwitchCount} lần</span>
                            </span>
                          ) : (
                            <span className="text-emerald-600 text-[11px] font-bold">✓ 0 lần</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleOpenGradingModal(s)}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{s.hasEssay ? 'Chấm tự luận' : 'Xem bài làm'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: PHỔ ĐIỂM & PHÂN TÍCH */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 pt-2">
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center space-x-1.5">
                <BarChart3 className="w-4 h-4 text-orange-500" />
                <span>Phổ điểm của cuộc thi (Thang điểm 0 - 10)</span>
              </h4>

              {/* Histogram bar chart */}
              <div className="grid grid-cols-10 gap-1.5 h-44 items-end bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                {Array.from({ length: 10 }).map((_, binIdx) => {
                  const rangeStart = binIdx;
                  const rangeEnd = binIdx + 1;
                  const count = submissions.filter(s => {
                    if (binIdx === 9) {
                      return s.totalScore >= 9 && s.totalScore <= 10;
                    }
                    return s.totalScore >= rangeStart && s.totalScore < rangeEnd;
                  }).length;
                  const percentage = totalSubmissions > 0 ? (count / totalSubmissions) * 100 : 0;

                  return (
                    <div key={binIdx} className="flex flex-col items-center h-full justify-end group">
                      <span className="text-[10px] font-bold text-slate-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {count} hs
                      </span>
                      <div
                        className="w-full rounded-t-lg bg-orange-500 hover:bg-orange-600 transition-all min-h-[4px]"
                        style={{ height: `${Math.max(4, percentage)}%` }}
                      />
                      <span className="text-[10px] text-slate-400 mt-2 font-mono">
                        {binIdx}-{binIdx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Phân tích câu hỏi */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Thống kê độ chính xác từng câu hỏi:
              </h4>

              <div className="space-y-2">
                {contest.questions.map((q, idx) => {
                  const correctStudents = submissions.filter(s => {
                    const ans = s.answers.find(a => a.questionId === q.id);
                    return ans && ans.isCorrect;
                  }).length;
                  const rate = totalSubmissions > 0 ? Math.round((correctStudents / totalSubmissions) * 100) : 0;

                  return (
                    <div
                      key={q.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 font-extrabold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="truncate flex-1">
                          <MathDisplay content={q.question} />
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 shrink-0">
                        <div className="w-28 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${rate >= 70 ? 'bg-emerald-500' : rate >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold w-12 text-right">
                          {rate}% đúng
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL CHẤM BÀI TỰ LUẬN */}
      {gradingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full my-8 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50 shrink-0">
              <div>
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  Chấm bài thi: {gradingSubmission.studentName} ({gradingSubmission.studentClass || 'Tự do'})
                </h3>
                <p className="text-xs text-slate-500">
                  Điểm hiện tại: <strong className="text-orange-600">{gradingSubmission.totalScore}/10đ</strong> • Vi phạm tab: {gradingSubmission.tabSwitchCount || 0} lần
                </p>
              </div>
              <button
                onClick={() => setGradingSubmission(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {currentEssayQuestions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Đề thi này không có câu hỏi tự luận. Mọi câu trắc nghiệm đã được hệ thống tự động chấm chính xác 100%.
                </div>
              ) : (
                <>
                  {/* Essay Tabs */}
                  <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                    {currentEssayQuestions.map((eq, qIdx) => {
                      const ans = gradingSubmission.answers.find(a => a.questionId === eq.id);
                      const hasGraded = ans && (ans.teacherScore !== undefined || ans.aiScore !== undefined);

                      return (
                        <button
                          key={eq.id}
                          onClick={() => {
                            setActiveEssayIndex(qIdx);
                            const cur = gradingSubmission.answers.find(a => a.questionId === eq.id);
                            setTeacherScoreInput(cur?.teacherScore ?? cur?.aiScore ?? cur?.pointsEarned ?? 0);
                            setTeacherFeedbackInput(cur?.teacherFeedback ?? cur?.aiFeedback ?? '');
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                            activeEssayIndex === qIdx
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span>Câu tự luận {qIdx + 1}</span>
                          {hasGraded && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Question Content */}
                  {currentActiveQ && currentActiveAns && (
                    <div className="space-y-4">
                      {/* Đề bài & Rubric */}
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-purple-700 dark:text-purple-300 uppercase">
                            Đề bài (Điểm tối đa: {currentActiveQ.points}đ)
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {currentActiveQ.topicHint || contest.topic}
                          </span>
                        </div>
                        <div className="text-xs text-slate-800 dark:text-slate-200 font-semibold">
                          <MathDisplay content={currentActiveQ.question} />
                        </div>
                        {currentActiveQ.rubric && (
                          <div className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-200 dark:border-slate-700">
                            Tiêu chí chấm: {currentActiveQ.rubric}
                          </div>
                        )}
                      </div>

                      {/* Lời giải của học sinh */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                          Bài làm của học sinh:
                        </span>

                        {/* Văn bản học sinh gõ */}
                        {currentActiveAns.studentSolutionText ? (
                          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                            {currentActiveAns.studentSolutionText}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Học sinh không nhập văn bản.</p>
                        )}

                        {/* Ảnh bài làm học sinh chụp */}
                        {currentActiveAns.essayImages && currentActiveAns.essayImages.length > 0 && (
                          <div className="space-y-1.5 pt-2">
                            <span className="text-[11px] font-semibold text-slate-500 block">
                              Ảnh chụp bài làm đính kèm:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {currentActiveAns.essayImages.map((imgUrl, imgIdx) => (
                                <img
                                  key={imgIdx}
                                  src={imgUrl}
                                  alt={`Bài làm ${imgIdx + 1}`}
                                  onClick={() => setLightboxImage(imgUrl)}
                                  className="w-28 h-28 object-cover rounded-xl border-2 border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-80 transition-opacity shadow-2xs"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* AI Assistant Grade */}
                      <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/40 dark:to-indigo-950/40 border border-violet-200 dark:border-violet-800/60 flex items-center justify-between gap-3">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-violet-900 dark:text-violet-200">
                              AI Gợi ý chấm điểm
                            </h4>
                            <p className="text-[11px] text-violet-700 dark:text-violet-300">
                              Nhận diện chữ viết tay/hình vẽ & đưa ra đề xuất điểm số chính xác
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAiGradeCurrentQuestion(currentActiveQ, currentActiveAns)}
                          disabled={isAiGrading}
                          className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-xs transition-colors shrink-0 disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{isAiGrading ? 'AI đang chấm...' : 'AI Chấm điểm'}</span>
                        </button>
                      </div>

                      {/* Chi tiết phân tích AI */}
                      {aiBreakdown && (
                        <div className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs space-y-2.5 animate-in fade-in">
                          <div className="flex items-center justify-between font-black text-indigo-900 dark:text-indigo-200">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-indigo-600" />
                              <span>Phân tích chi tiết từ Gemini AI:</span>
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-200 dark:bg-indigo-800 text-indigo-900 dark:text-indigo-100 font-black text-xs">
                              {aiBreakdown.score} / {currentActiveQ.points} điểm
                            </span>
                          </div>

                          {aiBreakdown.strengths && aiBreakdown.strengths.length > 0 && (
                            <div>
                              <span className="font-bold text-emerald-700 dark:text-emerald-400 block mb-0.5">✓ Điểm mạnh:</span>
                              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-0.5 pl-1">
                                {aiBreakdown.strengths.map((s: string, sIdx: number) => (
                                  <li key={sIdx}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {aiBreakdown.improvements && aiBreakdown.improvements.length > 0 && (
                            <div>
                              <span className="font-bold text-amber-700 dark:text-amber-400 block mb-0.5">⚠️ Điểm cần khắc phục / lưu ý:</span>
                              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-0.5 pl-1">
                                {aiBreakdown.improvements.map((im: string, imIdx: number) => (
                                  <li key={imIdx}>{im}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {aiBreakdown.stepByStepCorrection && (
                            <div className="pt-2 border-t border-indigo-200 dark:border-indigo-800">
                              <span className="font-bold text-indigo-800 dark:text-indigo-300 block mb-0.5">💡 Lời giải chuẩn mực đối chiếu:</span>
                              <div className="whitespace-pre-line text-slate-800 dark:text-slate-200 font-mono text-[11px] p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-900">
                                {aiBreakdown.stepByStepCorrection}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Nhập điểm & Nhận xét của Giáo viên */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Điểm giáo viên cho câu này (Tối đa: {currentActiveQ.points}đ):
                          </label>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            max={currentActiveQ.points}
                            value={teacherScoreInput}
                            onChange={(e) => setTeacherScoreInput(parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-sm font-black text-purple-600 rounded-xl border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-center"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Nhận xét / Lời phê cho học sinh:
                          </label>
                          <textarea
                            rows={3}
                            value={teacherFeedbackInput}
                            onChange={(e) => setTeacherFeedbackInput(e.target.value)}
                            placeholder="Nhập nhận xét hoặc để AI tự điền lời phê..."
                            className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                Lưu điểm sẽ cập nhật tức thời vào Bảng xếp hạng
              </span>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setGradingSubmission(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                >
                  Đóng
                </button>
                <button
                  onClick={handleSaveEssayGrade}
                  disabled={isSavingGrade || currentEssayQuestions.length === 0}
                  className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingGrade ? 'Đang lưu...' : 'Lưu điểm câu này'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TIẾN TRÌNH CHẤM BÀI HÀNG LOẠT BẰNG AI */}
      {isBatchGrading && batchProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 text-center">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 text-white flex items-center justify-center mx-auto shadow-xl shadow-indigo-300 dark:shadow-indigo-950 animate-bounce">
              <Sparkles className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Gemini AI Đang Chấm Bài Thi
              </h3>
              <p className="text-xs text-slate-500">
                Đang phân tích bài làm của học sinh: <strong className="text-indigo-600 dark:text-indigo-400">{batchProgress.studentName}</strong>
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Tiến trình hoàn thành:</span>
                <span>{batchProgress.current} / {batchProgress.total} bài</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
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

      {/* Lightbox Preview */}
      {lightboxImage && (
        <ImageLightboxModal
          imageUrl={lightboxImage}
          isOpen={!!lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
};
