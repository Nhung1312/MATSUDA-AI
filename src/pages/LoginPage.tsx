import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  BookOpen, 
  Sparkles, 
  ShieldCheck, 
  Cloud, 
  FileText, 
  ArrowLeft,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  ShieldAlert
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const destination = (location.state as any)?.from || '/teacher';

  // If already logged in, redirect
  React.useEffect(() => {
    if (user) {
      navigate(destination, { replace: true });
    }
  }, [user, navigate, destination]);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setIsUnauthorizedDomain(false);
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate(destination, { replace: true });
    } catch (err: any) {
      console.error('Login error:', err);
      const isDomainErr = err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain');
      
      if (isDomainErr) {
        setIsUnauthorizedDomain(true);
        setErrorMsg('Tên miền ứng dụng chưa được thêm vào Danh sách miền được phép (Authorized Domains) của Firebase Console.');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Cửa sổ đăng nhập đã được đóng lại trước khi hoàn tất.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setErrorMsg('Yêu cầu đăng nhập đã bị hủy.');
      } else {
        setErrorMsg(err?.message || 'Không thể đăng nhập bằng Google. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDomain = () => {
    const currentHost = window.location.hostname;
    navigator.clipboard.writeText(currentHost);
    setCopiedDomain(true);
    setTimeout(() => setCopiedDomain(false), 2500);
  };

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8 sm:py-12 bg-slate-50 dark:bg-slate-950 transition-colors">
      <div className="max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
        {/* Back Link */}
        <Link
          to="/"
          className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Quay lại Trang chủ</span>
        </Link>

        {/* Main Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/90 dark:border-slate-800 relative overflow-hidden">
          {/* Subtle top glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 rounded-full" />
          
          {/* Header */}
          <div className="text-center mb-6 pt-2">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center mb-3 shadow-md border border-indigo-100 dark:border-indigo-900/50">
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
                <BookOpen className="w-8 h-8" />
              </div>
            </div>

            <div className="inline-flex items-center space-x-1.5 bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 text-[11px] font-bold px-3 py-1 rounded-full mb-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Dành cho Giáo viên & Quản trị</span>
            </div>

            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Đăng nhập TOÁN THCS
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Quản lý lớp học, tạo đề thi trên Đám mây Cloud Firestore và theo dõi kết quả học sinh.
            </p>
          </div>

          {/* Unauthorized Domain Alert Helper */}
          {isUnauthorizedDomain && (
            <div className="mb-5 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-3 animate-in fade-in duration-200">
              <div className="flex items-start space-x-2">
                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-extrabold text-amber-950 dark:text-amber-100">
                    Tên miền chưa được thêm vào Firebase Authorized Domains
                  </div>
                  <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                    Tên miền <code className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/80 rounded font-mono text-[11px] font-bold">{currentHost}</code> chưa được thêm vào mục <strong>Authentication &gt; Settings &gt; Authorized domains</strong> trong Firebase Console của dự án.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 border-t border-amber-200/80 dark:border-amber-800/60 flex justify-end">
                <button
                  type="button"
                  onClick={handleCopyDomain}
                  className="py-2 px-3 bg-white dark:bg-slate-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-slate-700 font-bold rounded-xl text-xs border border-amber-300 dark:border-amber-700 flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                >
                  {copiedDomain ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedDomain ? 'Đã chép domain' : 'Chép domain'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Standard Error Message */}
          {errorMsg && !isUnauthorizedDomain && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start space-x-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* GOOGLE SIGN-IN */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-white font-bold text-sm rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm hover:shadow-md transition-all flex items-center justify-center space-x-3 cursor-pointer active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                  <span>Đang kết nối tài khoản Google...</span>
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

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400">
              <p>
                Đăng nhập qua Google đồng bộ hóa trực tiếp đề thi và kết quả với dự án Firebase <code className="font-mono text-slate-700 dark:text-slate-300">toan-thcs-2026</code>.
              </p>
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="mt-6 space-y-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center space-x-2">
              <Cloud className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Đồng bộ đề thi tự động trên <strong>Cloud Firestore</strong></span>
            </div>
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Tạo mã làm bài &amp; Xuất đề thi PDF / QR Code</span>
            </div>
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Trợ lý AI Gemini hỗ trợ tự động chấm bài tự luận</span>
            </div>
          </div>

          {/* Note */}
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Học sinh tham gia làm bài trực tiếp qua Mã đề thi mà không cần đăng nhập tài khoản.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

