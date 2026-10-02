import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, User as UserIcon, GraduationCap, RotateCcw, Sparkles, Moon, Sun, LogOut, LogIn, Trash2, BookmarkCheck, Trophy } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { GradeLevel } from '../types';
import { getAppLogo } from '../utils/logoHelper';
import { MistakeVaultModal } from './MistakeVaultModal';
import { useMistakeVaultStore } from '../store/useMistakeVaultStore';

interface NavbarProps {
  onResetData: () => void;
  onClearDemoData?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onResetData, onClearDemoData }) => {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [currentLogo, setCurrentLogo] = useState<string>(getAppLogo());
  const [showMistakeVault, setShowMistakeVault] = useState<boolean>(false);

  const mistakes = useMistakeVaultStore((state) => state.mistakes);
  const unmasteredCount = mistakes.filter((m) => !m.mastered).length;

  useEffect(() => {
    const handleLogoUpdate = (e: any) => {
      setCurrentLogo(e.detail || getAppLogo());
    };
    window.addEventListener('app_logo_updated', handleLogoUpdate);
    return () => window.removeEventListener('app_logo_updated', handleLogoUpdate);
  }, []);

  const isTeacher = location.pathname.startsWith('/teacher');
  const isStudent = location.pathname.startsWith('/join') || location.pathname.startsWith('/exam');

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md group-hover:scale-105 transition-transform bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center border border-slate-200/50 dark:border-slate-700/50 shrink-0">
              <img
                src={currentLogo}
                alt="Logo Toán THCS"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div style={{ display: 'none' }} className="w-full h-full items-center justify-center text-white">
                <BookOpen className="w-5 h-5" />
              </div>
            </div>
            <div>
              <span className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight">
                TOÁN THCS
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block font-medium">
                Giao bài • Luyện tập • Tự chấm
              </p>
            </div>
          </Link>

          {/* Grade Quick Navigation Buttons in Navbar */}
          <div className="hidden sm:flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
            {(['6', '7', '8', '9'] as GradeLevel[]).map((g) => {
              const active = location.pathname === `/grade/${g}`;
              return (
                <Link
                  key={g}
                  to={`/grade/${g}`}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    active
                      ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Lớp {g}
                </Link>
              );
            })}

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 my-auto mx-0.5" />

            <Link
              to="/contest/THI"
              className={`inline-flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-black transition-all ${
                location.pathname.startsWith('/contest')
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/60'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>Thi Online</span>
            </Link>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 my-auto mx-0.5" />

            <Link
              to="/practice"
              className={`inline-flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-black transition-all ${
                location.pathname === '/practice' || location.pathname === '/ai-practice'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xs'
                  : 'text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>AI Ôn Tập</span>
            </Link>
          </div>

          {/* Actions & Role switchers */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối (Dịu mắt khi học đêm)'}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer flex items-center justify-center active:scale-95"
              aria-label="Toggle Dark Mode"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
            </button>

            {/* Sổ tay câu sai (Mistake Vault) */}
            <button
              onClick={() => setShowMistakeVault(true)}
              title="Mở Sổ tay câu sai (Luyện lại các câu làm chưa đúng)"
              className={`inline-flex items-center space-x-1 sm:space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                unmasteredCount > 0
                  ? 'bg-rose-50 dark:bg-rose-950/80 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <BookmarkCheck className={`w-3.5 h-3.5 ${unmasteredCount > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
              <span className="hidden lg:inline">Sổ tay câu sai</span>
              {unmasteredCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-mono text-[10px] font-black">
                  {unmasteredCount}
                </span>
              )}
            </button>

            {/* Quick Demo Reset (Desktop only to save space on mobile) */}
            <button
              onClick={onResetData}
              title="Khôi phục dữ liệu mẫu chuẩn (Lớp 6, 7, 8, 9)"
              className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Dữ liệu mẫu</span>
            </button>

            {/* Quick Clear Demo Data */}
            {onClearDemoData && (
              <button
                onClick={onClearDemoData}
                title="Xóa toàn bộ các đề thi, lớp học và kết quả mẫu có sẵn"
                className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200/80 dark:border-rose-800/80 transition-colors cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                <span>Xóa dữ liệu mẫu</span>
              </button>
            )}

            {/* Desktop Role switchers */}
            <div className="hidden md:flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <Link
                to="/teacher"
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  isTeacher
                    ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <UserIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-200" />
                <span>Giáo viên</span>
              </Link>

              <Link
                to="/join"
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  isStudent && !location.pathname.startsWith('/contest')
                    ? 'bg-white dark:bg-emerald-600 text-emerald-700 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <GraduationCap className="w-4 h-4 text-emerald-600 dark:text-emerald-200" />
                <span>Học sinh</span>
              </Link>
            </div>

            {/* User Auth Section (Avatar / Logout / Login) */}
            {isAuthenticated && user ? (
              <div className="flex items-center space-x-2 pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-700">
                {/* User Avatar */}
                <div 
                  className="flex items-center space-x-2"
                  title={`${user.displayName || 'Giáo viên'} (${user.email || ''})`}
                >
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || 'Avatar'} 
                      className="w-8 h-8 rounded-full ring-2 ring-indigo-600/30 object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                      {(user.displayName || user.email || 'GV').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 hidden lg:inline max-w-[120px] truncate">
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                </div>

                {/* Logout Button */}
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Đăng xuất tài khoản"
                  className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold rounded-xl shadow-2xs transition-all active:scale-95"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Đăng nhập</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* SỔ TAY CÂU SAI MODAL */}
      <MistakeVaultModal
        isOpen={showMistakeVault}
        onClose={() => setShowMistakeVault(false)}
      />
    </header>
  );
};

