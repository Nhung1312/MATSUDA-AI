import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, 
  BookOpen, 
  PenTool, 
  UserCheck, 
  Trophy, 
  Layers, 
  X, 
  Sparkles,
  ChevronUp
} from 'lucide-react';
import { GradeLevel } from '../types';
import { ALL_GRADE_METAS } from '../data';
import { useLearningProgressStore } from '../store/useLearningProgressStore';
import { useMistakeVaultStore } from '../store/useMistakeVaultStore';
import { MistakeVaultModal } from './MistakeVaultModal';

interface MobileBottomNavProps {
  onOpenProgress?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onOpenProgress }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showGradeSheet, setShowGradeSheet] = useState(false);
  const [showMistakeModal, setShowMistakeModal] = useState(false);

  const mistakes = useMistakeVaultStore((state) => state.mistakes);
  const unmasteredCount = mistakes.filter((m) => !m.mastered).length;

  const { getTotalPointsEarned, getTotalCompletedCount } = useLearningProgressStore();
  const totalPoints = getTotalPointsEarned();
  const completedCount = getTotalCompletedCount();

  const isHome = location.pathname === '/';
  const isGrades = location.pathname.startsWith('/grade');
  const isJoin = location.pathname === '/join' || location.pathname.startsWith('/exam');
  const isTeacher = location.pathname.startsWith('/teacher');

  return (
    <>
      {/* Grade Selector Bottom Sheet for Mobile */}
      {showGradeSheet && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-end md:hidden animate-in fade-in duration-200"
          onClick={() => setShowGradeSheet(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-t-3xl p-5 border-t border-slate-200 dark:border-slate-800 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  Chọn Lớp học THCS
                </h3>
              </div>
              <button 
                onClick={() => setShowGradeSheet(false)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {(['6', '7', '8', '9'] as GradeLevel[]).map((g) => {
                const meta = ALL_GRADE_METAS[g];
                const active = location.pathname === `/grade/${g}`;
                return (
                  <button
                    key={g}
                    onClick={() => {
                      setShowGradeSheet(false);
                      navigate(`/grade/${g}`);
                    }}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      active
                        ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/60 ring-2 ring-indigo-400'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${meta.colorScheme.badgeBg} ${meta.colorScheme.badgeText}`}>
                        {meta.title}
                      </span>
                      <span className="text-base">{meta.badge}</span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 line-clamp-1">
                      {meta.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Shortcut AI Ôn tập chuyên đề in Mobile Sheet */}
            <button
              onClick={() => {
                setShowGradeSheet(false);
                navigate('/practice');
              }}
              className="w-full p-3 rounded-2xl bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-purple-500/10 border border-violet-200 dark:border-violet-900/60 flex items-center justify-between cursor-pointer active:scale-98 transition-transform text-left"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900 dark:text-white flex items-center space-x-1.5">
                    <span>AI Ôn tập chuyên đề</span>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-violet-600 text-white">Hot</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Tự chọn chuyên đề, AI tạo đề ôn luyện có lời giải tức thì
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-violet-600 dark:text-violet-400 font-bold">Ôn ngay →</span>
            </button>

            {/* Shortcut Thi trực tuyến in Mobile Sheet */}
            <button
              onClick={() => {
                setShowGradeSheet(false);
                navigate('/contest/THI');
              }}
              className="w-full p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 border border-orange-200 dark:border-orange-900/60 flex items-center justify-between cursor-pointer active:scale-98 transition-transform text-left"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center font-bold shrink-0">
                  <Trophy className="w-4 h-4 text-amber-100" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900 dark:text-white flex items-center space-x-1.5">
                    <span>Đấu trường Thi trực tuyến</span>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-orange-600 text-white">Mới</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Tranh tài theo thời gian thực, bảng vàng xếp hạng
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold">Tham gia →</span>
            </button>

            {/* Sổ tay câu sai Shortcut in Mobile Sheet */}
            <button
              onClick={() => {
                setShowGradeSheet(false);
                setShowMistakeModal(true);
              }}
              className="w-full p-3 rounded-2xl bg-gradient-to-r from-rose-500/10 via-pink-500/10 to-indigo-500/10 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between cursor-pointer active:scale-98 transition-transform text-left"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900 dark:text-white">
                    Sổ tay câu sai (Mistake Vault)
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Luyện lại câu sai kèm gợi ý bước giải từ AI
                  </div>
                </div>
              </div>
              {unmasteredCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[10px] font-black">
                  {unmasteredCount} câu
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-bold">Mở sổ tay →</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar */}
      <nav 
        aria-label="Thanh điều hướng ứng dụng di động"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 md:hidden shadow-lg safe-area-bottom transition-colors"
      >
        <div className="grid grid-cols-5 items-center h-16 px-1">
          {/* 1. Trang chủ */}
          <Link
            to="/"
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
              isHome 
                ? 'text-indigo-600 dark:text-indigo-400 font-bold' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Home className={`w-5 h-5 transition-transform ${isHome ? 'scale-110' : ''}`} />
            <span className="text-[10px] mt-1 font-semibold">Trang chủ</span>
          </Link>

          {/* 2. Chọn Lớp học (Bottom Sheet popup) */}
          <button
            onClick={() => setShowGradeSheet(true)}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
              isGrades 
                ? 'text-indigo-600 dark:text-indigo-400 font-bold' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Layers className={`w-5 h-5 transition-transform ${isGrades ? 'scale-110' : ''}`} />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500" />
            </div>
            <span className="text-[10px] mt-1 font-semibold">Lớp 6-9</span>
          </button>

          {/* 3. Làm bài / Nhập mã (Nút trung tâm nổi bật) */}
          <Link
            to="/join"
            className="flex flex-col items-center justify-center -mt-4 cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 group-active:scale-95 transition-transform">
              <PenTool className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 mt-1">Làm bài</span>
          </Link>

          {/* 4. Tiến độ học tập */}
          <button
            onClick={onOpenProgress}
            className="flex flex-col items-center justify-center py-1 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all cursor-pointer"
          >
            <div className="relative">
              <Trophy className="w-5 h-5 text-amber-500" />
              {completedCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-emerald-500 text-white text-[9px] font-bold px-1 rounded-full">
                  {completedCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1 font-semibold">Tiến độ ({totalPoints}đ)</span>
          </button>

          {/* 5. Giáo viên */}
          <Link
            to="/teacher"
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
              isTeacher 
                ? 'text-indigo-600 dark:text-indigo-400 font-bold' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <UserCheck className={`w-5 h-5 transition-transform ${isTeacher ? 'scale-110' : ''}`} />
            <span className="text-[10px] mt-1 font-semibold">Giáo viên</span>
          </Link>
        </div>
      </nav>

      {/* SỔ TAY CÂU SAI MODAL */}
      <MistakeVaultModal
        isOpen={showMistakeModal}
        onClose={() => setShowMistakeModal(false)}
      />
    </>
  );
};
