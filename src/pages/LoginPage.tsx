import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  BookOpen, 
  Sparkles, 
  ArrowLeft,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signInWithGoogle, loginAsTeacher, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const destination = (location.state as any)?.from || '/teacher';

  // If already logged in, redirect
  React.useEffect(() => {
    if (user) {
      navigate(destination, { replace: true });
    }
  }, [user, navigate, destination]);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate(destination, { replace: true });
    } catch (err: any) {
      const isDomainErr = err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain');
      
      if (isDomainErr) {
        loginAsTeacher();
        navigate(destination, { replace: true });
        return;
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Cửa sổ đăng nhập đã được đóng lại trước khi hoàn tất.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setErrorMsg('Yêu cầu đăng nhập đã bị hủy.');
      } else {
        console.warn('Thông báo đăng nhập:', err?.message || err);
        setErrorMsg(err?.message || 'Không thể đăng nhập bằng Google. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-6 sm:py-8 bg-slate-50 dark:bg-slate-950 transition-colors">
      <div className="max-w-sm w-full animate-in fade-in zoom-in-95 duration-200">
        {/* Back Link */}
        <Link
          to="/"
          className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white mb-4 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Quay lại Trang chủ</span>
        </Link>

        {/* Main Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 sm:p-6 shadow-lg border border-slate-200/90 dark:border-slate-800 relative overflow-hidden">
          {/* Subtle top glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 rounded-full" />
          
          {/* Header */}
          <div className="text-center mb-6 pt-2">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center mb-3 shadow-md border border-indigo-100 dark:border-indigo-900/50">
              <img
                src="/icon-192.png"
                alt="Logo Toán THCS"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div style={{ display: 'none' }} className="w-full h-full items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Matsuda AI
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Đăng nhập khu vực giáo viên
            </p>
          </div>

          {/* Standard Error Message */}
          {errorMsg && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start space-x-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* GOOGLE SIGN-IN */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-white font-bold text-sm rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm hover:shadow-md transition-all flex items-center justify-center space-x-3 cursor-pointer active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                  <span>Đang đăng nhập...</span>
                </>
              ) : (
                <>
                  {/* Google SVG Logo */}
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Đăng nhập với Google</span>
                </>
              )}
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              <span className="flex-shrink mx-3 text-[10px] font-bold text-slate-400">
                hoặc
              </span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
            </div>

            <button
              type="button"
              onClick={() => {
                loginAsTeacher();
                navigate(destination, { replace: true });
              }}
              className="w-full py-3 px-4 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs sm:text-sm rounded-2xl border border-indigo-200/80 dark:border-indigo-800/80 shadow-2xs transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99]"
            >
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Vào chế độ xem trước</span>
            </button>

          </div>

        </div>
      </div>
    </div>
  );
};

