import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Assignment, GradeLevel } from '../types';
import { ALL_GRADE_METAS } from '../data';
import { 
  User, 
  GraduationCap, 
  Sparkles, 
  QrCode, 
  Zap, 
  BarChart3, 
  ArrowRight,
  Calculator,
  Shapes,
  Clock,
  BookOpen,
  Award,
  ChevronRight,
  Layers,
  FileCheck,
  Trophy
} from 'lucide-react';

interface HomePageProps {
  assignments: Assignment[];
}

export const HomePage: React.FC<HomePageProps> = ({ assignments }) => {
  const [assignmentCode, setAssignmentCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleStartWithCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentCode.trim()) {
      setError('Vui lòng nhập mã bài tập.');
      return;
    }
    navigate(`/join?code=${encodeURIComponent(assignmentCode.trim().toUpperCase())}`);
  };

  const sampleAssignment = assignments[0];
  const gradeList: GradeLevel[] = ['6', '7', '8', '9'];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-50 via-white to-indigo-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col justify-between transition-colors">
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
        {/* ========================================================================= */}
        {/* 1. HERO AREA: COMPACT TITLE, SEARCH BAR & 2 USER ROLE ACTION CARDS        */}
        {/* ========================================================================= */}
        <div className="max-w-2xl mx-auto text-center space-y-2">
          {/* Main Heading */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-teal-600 dark:from-blue-400 dark:via-indigo-400 dark:to-teal-300 tracking-tight leading-tight">
            Ôn tập &amp; Kiểm tra Toán THCS
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
            Làm bài trực tiếp, chấm điểm tức thì &amp; xem lời giải chi tiết.
          </p>

          {/* Search / Enter Assignment Code Box */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-2 sm:p-2.5 shadow-md border border-indigo-100 dark:border-slate-800 text-left mt-2">
            <form onSubmit={handleStartWithCode} className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={assignmentCode}
                  onChange={(e) => {
                    setAssignmentCode(e.target.value);
                    setError('');
                  }}
                  placeholder="Nhập mã bài tập (VD: TOAN6A1-8K4P)..."
                  className="w-full uppercase font-mono font-bold tracking-wider px-3.5 py-2 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white text-xs sm:text-sm placeholder:font-sans placeholder:font-normal placeholder:tracking-normal"
                />
              </div>
              <button
                type="submit"
                className="py-2 px-4 sm:px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-xs transition-all active:scale-95 text-xs sm:text-sm flex items-center justify-center space-x-1.5 shrink-0 cursor-pointer"
              >
                <span>VÀO THI</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            {error && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5 font-medium px-1">{error}</p>}

            {/* Quick Demo Assignment Pill */}
            {sampleAssignment && (
              <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="text-[11px]">Đề mẫu có sẵn:</span>
                <button
                  type="button"
                  onClick={() => navigate(`/join?code=${sampleAssignment.assignmentCode}`)}
                  className="inline-flex items-center space-x-1 font-mono font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200/60 dark:border-indigo-800/60 transition-colors cursor-pointer text-[11px]"
                >
                  <span>{sampleAssignment.assignmentCode}</span>
                  <span className="font-sans font-normal text-slate-500 dark:text-slate-400 truncate max-w-[150px]">({sampleAssignment.title})</span>
                </button>
              </div>
            )}
          </div>

          {/* 3 Big Action Portals (Teacher, Online Contest, Student Practice) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-1">
            {/* Teacher Card */}
            <Link
              to="/teacher"
              className="group p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 hover:bg-indigo-50/40 dark:hover:bg-slate-800/80 border border-indigo-200/90 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 shadow-xs hover:shadow-md transition-all flex items-center space-x-3 active:scale-[0.99]"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center justify-between">
                  <span>GIÁO VIÊN</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Tạo đề, xuất PDF, quản lý lớp &amp; điểm
                </p>
              </div>
            </Link>

            {/* Online Contest Card (MỚI & NỔI BẬT) */}
            <Link
              to="/contest/THI"
              className="group p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/80 dark:from-orange-950/30 dark:to-slate-900 border-2 border-orange-400/80 dark:border-orange-500/50 hover:border-orange-500 shadow-sm hover:shadow-md transition-all flex items-center space-x-3 active:scale-[0.99] relative overflow-hidden"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                <Trophy className="w-5 h-5 text-amber-100" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-black text-orange-700 dark:text-orange-400 group-hover:text-orange-600 transition-colors">
                    🏆 THI ONLINE
                  </span>
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-orange-600 text-white animate-pulse">
                    Mới
                  </span>
                </div>
                <p className="text-[11px] text-orange-800/80 dark:text-orange-200/80 truncate mt-0.5">
                  Đấu trường thi, bảng vàng xếp hạng
                </p>
              </div>
            </Link>

            {/* Student Practice Card */}
            <Link
              to="/join"
              className="group p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 hover:bg-emerald-50/40 dark:hover:bg-slate-800/80 border border-emerald-200/90 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 shadow-xs hover:shadow-md transition-all flex items-center space-x-3 active:scale-[0.99]"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors flex items-center justify-between">
                  <span>HỌC SINH</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Nhập mã bài tập &amp; kho tự luyện
                </p>
              </div>
            </Link>
          </div>

          {/* AI Practice Quick Launch Banner */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-xs sm:text-sm">Góc Tự Luyện &amp; Ôn Tập Chuyên Đề AI</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black uppercase">Mới</span>
                </div>
                <p className="text-xs text-indigo-100 mt-0.5">
                  Chọn lớp 6-9 và chuyên đề bất kỳ — AI tạo ngay đề trắc nghiệm kèm lời giải từng bước.
                </p>
              </div>
            </div>

            <Link
              to="/practice"
              className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-white text-indigo-900 hover:bg-indigo-50 font-black text-xs sm:text-sm rounded-xl shadow-xs transition-transform active:scale-95 shrink-0 cursor-pointer"
            >
              <span>Ôn tập ngay</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. GRADE CATALOG SECTION (2x2 GRID ON DESKTOP - MINIMALIST)               */}
        {/* ========================================================================= */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-left">
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>📚 Danh mục Lớp học</span>
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Toán 6, 7, 8, 9
            </span>
          </div>

          {/* 2x2 Grid Layout for Grade 6, 7, 8, 9 - Clean & Concise */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
            {gradeList.map((grade) => {
              const meta = ALL_GRADE_METAS[grade];
              const count = assignments.filter(a => a.grade === grade).length;
              return (
                <div
                  key={grade}
                  onClick={() => navigate(`/grade/${grade}`)}
                  className={`bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-3.5 border ${meta.colorScheme.border} ${meta.colorScheme.hoverBorder} shadow-2xs hover:shadow-md transition-all cursor-pointer text-left flex items-center justify-between group active:scale-[0.99]`}
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center space-x-2.5">
                      <span className={`text-[11px] font-black uppercase px-2.5 py-1 rounded-lg ${meta.colorScheme.badgeBg} ${meta.colorScheme.badgeText} shadow-2xs`}>
                        {meta.badge}
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <span>📚</span>
                        <span>{count} đề luyện tập</span>
                      </span>
                    </div>
                  </div>

                  {/* Clean Action Button */}
                  <div className={`px-3.5 py-1.5 rounded-xl ${meta.colorScheme.btnBg} font-bold text-xs flex items-center space-x-1 shadow-2xs shrink-0 group-hover:shadow-xs transition-all`}>
                    <span>Vào học</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Platform Feature Cards (3 Compact Highlights) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left pt-1">
          <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-start space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-slate-900 dark:text-white">Giao bài 1 chạm QR</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Tạo mã đề hoặc QR gửi nhóm Zalo, học sinh vào thi ngay.
              </p>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-start space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-slate-900 dark:text-white">Tự chấm &amp; Lời giải</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Chấm điểm tức thì sau khi nộp, giải thích chi tiết từng bước.
              </p>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-start space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-slate-900 dark:text-white">Phổ điểm &amp; Xếp hạng</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Vinh danh Top 3, thống kê câu hỏi học sinh hay nhầm lẫn.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 py-3 text-center text-[11px] text-slate-500 dark:text-slate-400">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-1.5">
          <p className="font-medium text-slate-700 dark:text-slate-300">
            TOÁN THCS – Nền tảng Ôn tập &amp; Kiểm tra Toán Lớp 6, 7, 8, 9
          </p>
          <div className="flex items-center space-x-2.5 text-slate-500">
            <Link to="/grade/6" className="hover:text-indigo-600">Lớp 6</Link>
            <span>•</span>
            <Link to="/grade/7" className="hover:text-indigo-600">Lớp 7</Link>
            <span>•</span>
            <Link to="/grade/8" className="hover:text-indigo-600">Lớp 8</Link>
            <span>•</span>
            <Link to="/grade/9" className="hover:text-indigo-600">Lớp 9</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
