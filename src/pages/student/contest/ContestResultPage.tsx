import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Contest, ContestSubmission } from '../../../types';
import { FirestoreService } from '../../../services/firestoreService';
import { StorageService } from '../../../services/storageService';
import { MathDisplay } from '../../../components/MathDisplay';
import { isEssayQuestion, getQuestionTypeLabel } from '../../../utils/questionUtils';
import { 
  Trophy, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  ArrowRight, 
  Home, 
  Eye, 
  Sparkles,
  BookOpen
} from 'lucide-react';

export const ContestResultPage: React.FC = () => {
  const { code, submissionId } = useParams<{ code: string; submissionId: string }>();
  const navigate = useNavigate();

  const [contest, setContest] = useState<Contest | null>(null);
  const [submission, setSubmission] = useState<ContestSubmission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadResult();
  }, [code, submissionId]);

  const loadResult = async () => {
    setLoading(true);
    try {
      if (!code) return;
      const c = await FirestoreService.getContestByCode(code);
      setContest(c);

      // Tìm submission
      let sub: ContestSubmission | null = null;
      if (submissionId) {
        const localList = StorageService.getContestSubmissions(c?.id);
        sub = localList.find(s => s.id === submissionId) || null;

        if (!sub) {
          const cloudList = await FirestoreService.getContestSubmissions(c?.id || '');
          sub = cloudList.find(s => s.id === submissionId) || null;
        }
      }
      setSubmission(sub);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!contest || !submission) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full text-center space-y-4 border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Không tìm thấy kết quả bài thi</h2>
          <p className="text-xs text-slate-500">Vui lòng thử lại hoặc quay về trang chủ.</p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs"
          >
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 flex flex-col items-center">
      <div className="max-w-2xl w-full space-y-6">
        {/* Banner Success Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 font-extrabold text-[11px] uppercase tracking-wider">
              Hoàn thành bài thi
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-2">
              {contest.title}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Thí sinh: <strong className="text-slate-800 dark:text-slate-200">{submission.studentName}</strong> • Lớp {submission.studentClass}
            </p>
          </div>

          {/* Score Box */}
          {contest.allowViewScore && (
            <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-lg space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-100">
                {submission.hasEssay && !submission.isEssayGraded ? 'Điểm trắc nghiệm tạm tính' : 'Tổng điểm đạt được'}
              </span>
              <div className="text-5xl sm:text-6xl font-black tracking-tight">
                {submission.totalScore}
                <span className="text-xl font-medium opacity-80">/10</span>
              </div>
              {submission.hasEssay && !submission.isEssayGraded && (
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-black/20 backdrop-blur-xs text-xs font-bold text-amber-200">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Bài tự luận đang chờ Thầy/Cô chấm</span>
                </div>
              )}
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold block">Số câu đúng</span>
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                {submission.correctCount}/{submission.totalQuestions}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold block">Thời gian làm</span>
              <span className="text-sm font-black text-slate-800 dark:text-slate-200 font-mono">
                {Math.floor(submission.timeSpentSeconds / 60)}p {submission.timeSpentSeconds % 60}s
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold block">Rời tab</span>
              <span className={`text-sm font-black ${submission.tabSwitchCount && submission.tabSwitchCount > 0 ? 'text-rose-500' : 'text-slate-800 dark:text-slate-200'}`}>
                {submission.tabSwitchCount || 0} lần
              </span>
            </div>
          </div>

          {/* Navigation Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate(`/contest/${contest.code}/ranking`)}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-amber-300" />
              <span>Xem Bảng Xếp Hạng Cuộc Thi</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => navigate('/')}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Về trang chủ</span>
            </button>
          </div>
        </div>

        {/* REVIEW ANSWERS SECTION (CHỈ HIỆN KHI allowViewAnswer = true) */}
        {contest.allowViewAnswer && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <BookOpen className="w-5 h-5 text-orange-500" />
              <h3 className="font-black text-sm text-slate-900 dark:text-white">
                Chi tiết bài làm và đáp án ({contest.questions.length} câu)
              </h3>
            </div>

            <div className="space-y-4">
              {contest.questions.map((q, idx) => {
                const ans = submission.answers.find(a => a.questionId === q.id);
                const isEssay = isEssayQuestion(q);
                const isCorrect = ans?.isCorrect;

                return (
                  <div
                    key={q.id}
                    className={`p-4 rounded-2xl border text-xs space-y-2.5 ${
                      isEssay
                        ? 'bg-purple-50/40 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/50'
                        : isCorrect
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50'
                        : 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold flex items-center justify-center text-[11px]">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {getQuestionTypeLabel(q.type)}
                        </span>
                      </div>

                      <div>
                        {isEssay ? (
                          <span className="font-bold text-purple-600 dark:text-purple-400">
                            {ans?.teacherScore !== undefined ? `${ans.teacherScore}/${q.points}đ` : 'Chờ chấm'}
                          </span>
                        ) : isCorrect ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-600 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Đúng (+{q.points || 1}đ)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-rose-500 font-bold">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Sai (0đ)</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-slate-900 dark:text-white font-medium">
                      <MathDisplay content={q.question} />
                      {q.imageUrl && (
                        <div className="my-2 flex justify-center">
                          <img src={q.imageUrl} alt="Hình vẽ câu hỏi" className="max-h-56 max-w-full object-contain rounded-xl border border-slate-200 dark:border-slate-700" />
                        </div>
                      )}
                    </div>

                    {/* Câu trả lời của em */}
                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] space-y-1">
                      <div>
                        <span className="text-slate-500 font-semibold">Em đã chọn: </span>
                        <strong className="text-slate-900 dark:text-white">
                          {ans?.selectedAnswer || ans?.studentSolutionText || '(Chưa làm)'}
                        </strong>
                      </div>

                      {!isEssay && q.correctAnswer && (
                        <div>
                          <span className="text-slate-500 font-semibold">Đáp án đúng: </span>
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            {q.correctAnswer}
                          </strong>
                        </div>
                      )}

                      {/* Lời phê tự luận nếu có */}
                      {isEssay && ans?.teacherFeedback && (
                        <div className="p-2.5 rounded-xl bg-purple-100/60 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 mt-2">
                          <strong>Lời phê của Thầy/Cô: </strong>
                          <span>{ans.teacherFeedback}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
