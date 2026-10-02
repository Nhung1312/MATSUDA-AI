import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLearningProgressStore } from '../store/useLearningProgressStore';
import { Assignment, GradeLevel } from '../types';
import { ALL_GRADE_METAS } from '../data';
import { 
  Trophy, 
  Flame, 
  CheckCircle2, 
  BarChart3, 
  Sparkles, 
  Award, 
  ChevronRight, 
  X, 
  Calendar, 
  Clock, 
  BookOpen, 
  RotateCcw,
  User,
  GraduationCap,
  Percent,
  Check
} from 'lucide-react';

interface StudentProgressBarProps {
  assignments: Assignment[];
}

export const StudentProgressBar: React.FC<StudentProgressBarProps> = ({ assignments }) => {
  const navigate = useNavigate();
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  const {
    studentName,
    records,
    streakDays,
    isProgressModalOpen,
    setProgressModalOpen,
    setStudentName,
    resetProgress,
    getTotalPointsEarned,
    getTotalMaxPoints,
    getAveragePercentage,
    getTotalCompletedCount,
    getGradeStats
  } = useLearningProgressStore();

  const totalPoints = getTotalPointsEarned();
  const totalMax = getTotalMaxPoints();
  const completedCount = getTotalCompletedCount();
  const totalAssignmentsCount = assignments.length || 8;
  const overallPercentage = totalAssignmentsCount > 0 
    ? Math.min(100, Math.round((completedCount / totalAssignmentsCount) * 100))
    : 0;

  const avgScorePct = getAveragePercentage();

  // Badges calculations
  const badges = [
    {
      id: 'first_exam',
      title: 'Tân binh Toán học',
      desc: 'Hoàn thành bài kiểm tra đầu tiên',
      icon: '🌱',
      unlocked: completedCount >= 1,
      color: 'from-emerald-500 to-teal-600'
    },
    {
      id: 'streak_3',
      title: 'Chăm chỉ kiên trì',
      desc: 'Duy trì chuỗi học tập đều đặn',
      icon: '🔥',
      unlocked: streakDays >= 2 || completedCount >= 3,
      color: 'from-amber-500 to-orange-600'
    },
    {
      id: 'score_10',
      title: 'Điểm 10 Tuyệt Đối',
      desc: 'Đạt điểm tối đa trong 1 bài thi',
      icon: '⭐',
      unlocked: records.some(r => r.totalScore >= r.maxScore && r.maxScore > 0),
      color: 'from-yellow-400 to-amber-500'
    },
    {
      id: 'all_grades',
      title: 'Nhà Thông Thái 4 Khối',
      desc: 'Làm bài ở ít nhất 3 lớp khác nhau',
      icon: '👑',
      unlocked: new Set(records.map(r => r.grade)).size >= 3,
      color: 'from-purple-500 to-indigo-600'
    }
  ];

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      setStudentName(tempName.trim());
    }
    setIsEditingName(false);
  };

  const handleConfirmReset = () => {
    if (window.confirm('Bạn có chắc muốn đặt lại toàn bộ tiến trình học tập cá nhân và điểm số?')) {
      resetProgress();
    }
  };

  return (
    <>
      {/* Top Floating / Sticky Status Bar - Compact & Modern */}
      <section 
        aria-label="Thanh trạng thái tiến độ học tập"
        className="w-full bg-slate-950/95 dark:bg-slate-950/95 text-white border-b border-indigo-950/80 px-3 sm:px-6 py-1.5 transition-all text-xs shadow-xs backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2.5">
          {/* Left: Student Identity & Streak */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className="flex items-center space-x-1.5 bg-white/10 hover:bg-white/15 px-2 py-0.5 rounded-lg border border-white/10 transition-colors">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
              {isEditingName ? (
                <form onSubmit={handleSaveName} className="flex items-center space-x-1">
                  <input
                    type="text"
                    autoFocus
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    placeholder="Nhập tên..."
                    className="w-20 px-1 py-0.5 bg-slate-800 text-white text-[11px] rounded border border-indigo-400 focus:outline-none"
                  />
                  <button type="submit" className="text-emerald-400 hover:text-emerald-300">
                    <Check className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => setIsEditingName(false)} className="text-slate-400 hover:text-slate-200">
                    <X className="w-3 h-3" />
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setTempName(studentName || '');
                    setIsEditingName(true);
                  }}
                  className="font-bold text-[11px] sm:text-xs text-white hover:text-indigo-200 cursor-pointer flex items-center space-x-1"
                  title="Nhấp để đổi tên học sinh"
                >
                  <span className="truncate max-w-[90px] sm:max-w-[120px]">{studentName || 'Học sinh'}</span>
                  <span className="text-[10px] text-indigo-300 font-normal">✏️</span>
                </button>
              )}
            </div>

            {/* Streak Days */}
            <div 
              className="flex items-center space-x-1 bg-amber-500/15 text-amber-300 border border-amber-500/25 px-1.5 py-0.5 rounded-md font-bold text-[11px]"
              title="Chuỗi ngày luyện tập chăm chỉ"
            >
              <Flame className="w-3 h-3 text-amber-400" />
              <span>{streakDays}d</span>
            </div>
          </div>

          {/* Center: Overall Score & Compact Progress Bar */}
          <div className="flex-1 max-w-sm hidden md:flex items-center space-x-2.5">
            <div className="flex items-center space-x-1 text-slate-300 text-[11px] shrink-0">
              <Trophy className="w-3 h-3 text-yellow-400" />
              <span className="text-slate-400">Điểm:</span>
              <strong className="text-yellow-300 font-mono font-bold">
                {totalPoints} {totalMax > 0 && <span className="text-slate-500 text-[10px]">/{totalMax}</span>}
              </strong>
            </div>

            {/* Progress bar */}
            <div className="flex-1 flex items-center space-x-2">
              <div className="w-full bg-slate-800/90 rounded-full h-1.5 overflow-hidden border border-white/5">
                <div 
                  className="bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, overallPercentage)}%` }}
                />
              </div>
              <span className="text-[10px] text-emerald-400 font-bold font-mono shrink-0">
                {completedCount}/{totalAssignmentsCount}
              </span>
            </div>
          </div>

          {/* Right: Quick Stats & Detail Modal Button */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Mobile score badge */}
            <div className="md:hidden flex items-center space-x-1 bg-yellow-400/15 text-yellow-300 border border-yellow-400/20 px-1.5 py-0.5 rounded-md font-bold text-[11px]">
              <Trophy className="w-3 h-3 text-yellow-400" />
              <span>{totalPoints}đ</span>
            </div>

            <button
              onClick={() => setProgressModalOpen(true)}
              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all cursor-pointer active:scale-95 text-[11px] shadow-2xs"
            >
              <BarChart3 className="w-3 h-3" />
              <span className="hidden sm:inline">Tiến độ</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </section>

      {/* DETAILED LEARNING PROGRESS MODAL */}
      {isProgressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between z-10">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Bảng Tiến Độ Học Tập & Điểm Số
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Lưu trữ tự động trong LocalStorage qua Zustand
                  </p>
                </div>
              </div>

              <button
                onClick={() => setProgressModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 flex-1">
              {/* Top Overview 4 Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-amber-50 dark:bg-amber-950/40 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50">
                  <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 mb-1">
                    <span className="text-xs font-bold">Tổng điểm</span>
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-amber-800 dark:text-amber-200 font-mono">
                    {totalPoints} <span className="text-xs font-normal text-amber-600 dark:text-amber-400">/ {totalMax}đ</span>
                  </div>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/50">
                  <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 mb-1">
                    <span className="text-xs font-bold">Đã hoàn thành</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-emerald-800 dark:text-emerald-200 font-mono">
                    {completedCount} <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">/ {totalAssignmentsCount} bài</span>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-200 dark:border-blue-900/50">
                  <div className="flex items-center justify-between text-blue-700 dark:text-blue-300 mb-1">
                    <span className="text-xs font-bold">Độ chính xác TB</span>
                    <Percent className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-blue-800 dark:text-blue-200 font-mono">
                    {avgScorePct}%
                  </div>
                </div>

                <div className="bg-orange-50 dark:bg-orange-950/40 p-4 rounded-2xl border border-orange-200 dark:border-orange-900/50">
                  <div className="flex items-center justify-between text-orange-700 dark:text-orange-300 mb-1">
                    <span className="text-xs font-bold">Chuỗi học tập</span>
                    <Flame className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-orange-800 dark:text-orange-200 font-mono">
                    {streakDays} <span className="text-xs font-normal text-orange-600 dark:text-orange-400">ngày</span>
                  </div>
                </div>
              </div>

              {/* Progress Breakdown by 4 Grades */}
              <div>
                <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                  <span>📚 Tiến độ theo từng Lớp học</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['6', '7', '8', '9'] as GradeLevel[]).map((g) => {
                    const gradeMeta = ALL_GRADE_METAS[g];
                    const gradeTotal = assignments.filter(a => a.grade === g).length || 2;
                    const stats = getGradeStats(g);
                    const gradePct = gradeTotal > 0 ? Math.min(100, Math.round((stats.completedCount / gradeTotal) * 100)) : 0;

                    return (
                      <div 
                        key={g} 
                        className={`p-4 rounded-2xl border ${gradeMeta.colorScheme.border} ${gradeMeta.colorScheme.lightBg} flex flex-col justify-between`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${gradeMeta.colorScheme.badgeBg} ${gradeMeta.colorScheme.badgeText}`}>
                              {gradeMeta.title}
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              {stats.completedCount}/{gradeTotal} bài
                            </span>
                          </div>
                          <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100">
                            {stats.totalScore} đ
                          </span>
                        </div>

                        {/* Grade Progress bar */}
                        <div className="space-y-1">
                          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                g === '6' ? 'bg-blue-600' : g === '7' ? 'bg-emerald-600' : g === '8' ? 'bg-purple-600' : 'bg-rose-600'
                              }`}
                              style={{ width: `${Math.max(stats.completedCount > 0 ? 10 : 0, gradePct)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <span>Điểm TB: {stats.avgScore > 0 ? `${stats.avgScore}/10` : 'Chưa có'}</span>
                            <button
                              onClick={() => {
                                setProgressModalOpen(false);
                                navigate(`/grade/${g}`);
                              }}
                              className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                              Luyện ngay →
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Achievements / Badges Section */}
              <div>
                <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                  <span>🎖️ Huy hiệu Thành tích</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {badges.map((b) => (
                    <div
                      key={b.id}
                      className={`p-3.5 rounded-2xl border text-center transition-all ${
                        b.unlocked
                          ? 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-800 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 opacity-50 grayscale'
                      }`}
                    >
                      <div className="text-2xl mb-1">{b.icon}</div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{b.title}</div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{b.desc}</p>
                      <span className={`inline-block text-[9px] font-bold mt-2 px-2 py-0.5 rounded-full ${
                        b.unlocked 
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}>
                        {b.unlocked ? '✓ Đã đạt' : '🔒 Khóa'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Completed Exam History */}
              <div>
                <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-500" />
                    <span>Lịch sử các bài kiểm tra đã làm ({records.length})</span>
                  </span>
                  {records.length > 0 && (
                    <button
                      onClick={handleConfirmReset}
                      className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline flex items-center space-x-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Xóa lịch sử</span>
                    </button>
                  )}
                </h4>

                {records.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Bạn chưa hoàn thành bài kiểm tra nào. Hãy chọn một lớp và bắt đầu làm bài nhé!
                    </p>
                    <button
                      onClick={() => {
                        setProgressModalOpen(false);
                        navigate('/grade/6');
                      }}
                      className="mt-3 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
                    >
                      Bắt đầu làm bài Toán Lớp 6
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {records.map((r, idx) => (
                      <div
                        key={idx}
                        className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-3 shadow-2xs hover:border-indigo-300 transition-colors"
                      >
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
                              Lớp {r.grade}
                            </span>
                            <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                              {r.assignmentCode}
                            </span>
                            <span className="text-[10px] text-slate-400 flex items-center space-x-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{Math.round((r.timeSpentSeconds || 0) / 60)} phút</span>
                            </span>
                          </div>
                          <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {r.assignmentTitle}
                          </div>
                        </div>

                        <div className="flex items-center space-x-3 shrink-0">
                          <div className="text-right">
                            <div className="font-mono font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                              {r.totalScore} / {r.maxScore}đ
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {r.correctCount}/{r.totalQuestions} câu ({r.percentage}%)
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setProgressModalOpen(false);
                              navigate(`/join?code=${r.assignmentCode}`);
                            }}
                            className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-bold rounded-lg text-xs cursor-pointer transition-colors"
                          >
                            Làm lại
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span className="italic">💡 Dữ liệu được lưu trữ tự động trong trình duyệt của bạn (LocalStorage).</span>
              <button
                onClick={() => setProgressModalOpen(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
