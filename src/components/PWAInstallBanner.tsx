import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, Sparkles, Check, Share, ArrowDown, WifiOff, Wifi } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check if already installed as standalone
    const isApp = window.matchMedia('(display-mode: standalone)').matches || 
                  (window.navigator as any).standalone === true;
    setIsStandalone(isApp);

    // Check if previously dismissed
    const dismissed = localStorage.getItem('toan_thcs_pwa_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed, 10) < 1000 * 60 * 60 * 24 * 3) {
      // Dismissed within last 3 days
      setIsDismissed(true);
    }

    // Check iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice && !isApp);

    // Listen for install prompt on Android / Chromium
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Online / Offline listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('toan_thcs_pwa_dismissed', Date.now().toString());
  };

  if (isStandalone || isDismissed) {
    // Show offline badge if lost connection
    if (!isOnline) {
      return (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white text-xs py-1 px-4 text-center font-bold flex items-center justify-center space-x-1.5 shadow-md">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Bạn đang ở chế độ Ngoại tuyến (Offline). Vẫn có thể làm bài tập đã lưu!</span>
        </div>
      );
    }
    return null;
  }

  // If nothing to prompt for and not iOS, don't show
  if (!deferredPrompt && !isIOS) return null;

  return (
    <>
      {/* Offline Alert if offline */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white text-xs py-1 px-4 text-center font-bold flex items-center justify-center space-x-1.5 shadow-md">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Đang mất kết nối mạng. Ứng dụng PWA đang chạy từ bộ nhớ Cache!</span>
        </div>
      )}

      {/* Modern Floating PWA Install Prompt Banner */}
      <div className="fixed bottom-20 md:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-40 animate-in slide-in-from-bottom-5 duration-300">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-3xl shadow-2xl border border-indigo-500/40 backdrop-blur-xl flex flex-col space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                  <span>Cài đặt Toán THCS App</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md">
                    PWA
                  </span>
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-tight">
                  Thêm vào màn hình chính để mở nhanh 1 chạm & làm bài mượt mà như app gốc!
                </p>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              title="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <button
              onClick={handleInstallClick}
              className="flex-1 py-2 px-3 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isIOS ? 'Hướng dẫn cài đặt' : 'Cài đặt ngay'}</span>
            </button>
            <button
              onClick={handleDismiss}
              className="py-2 px-3 bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              Để sau
            </button>
          </div>
        </div>
      </div>

      {/* iOS Install Instruction Modal */}
      {showIOSGuide && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 text-slate-900 dark:text-white text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <Share className="w-6 h-6" />
            </div>

            <h3 className="font-extrabold text-base">
              Cài đặt trên iPhone / iPad
            </h3>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-3 text-left bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">1</span>
                <p>Nhấn vào biểu tượng <strong>Chia sẻ (Share)</strong> ở thanh dưới cùng Safari.</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">2</span>
                <p>Cuộn xuống và chọn <strong>"Thêm vào Màn hình chính" (Add to Home Screen)</strong>.</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">3</span>
                <p>Nhấn <strong>"Thêm" (Add)</strong> ở góc trên bên phải để hoàn tất.</p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </>
  );
};
