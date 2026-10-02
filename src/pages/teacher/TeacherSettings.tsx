import React, { useState, useEffect } from 'react';
import { StorageService } from '../../services/storageService';
import { FirestoreService } from '../../services/firestoreService';
import { auth } from '../../firebase';
import { aiService, HybridAIService } from '../../services/aiService';
import { getAppLogo, setAppLogo, resetAppLogo } from '../../utils/logoHelper';
import { 
  RotateCcw, 
  Download, 
  Upload, 
  Sparkles, 
  Check, 
  Database, 
  Key, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertTriangle, 
  Cpu, 
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  HelpCircle,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';

interface TeacherSettingsProps {
  onResetData: () => void;
  onClearDemoData?: () => void;
}

export const TeacherSettings: React.FC<TeacherSettingsProps> = ({ onResetData, onClearDemoData }) => {
  // Gemini API state
  const hybridAi = aiService as HybridAIService;
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [savedKeySuccess, setSavedKeySuccess] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [autoGradeEnabled, setAutoGradeEnabled] = useState<boolean>(true);
  
  // Test connection state
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; modelUsed?: string } | null>(null);

  // App Logo state
  const [appLogo, setLocalAppLogo] = useState<string>(getAppLogo());
  const [logoUploadMsg, setLogoUploadMsg] = useState<string>('');

  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp định dạng hình ảnh (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      alert('Kích thước ảnh nên nhỏ hơn 3MB để tải nhanh nhất.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setAppLogo(dataUrl);
        setLocalAppLogo(dataUrl);
        setLogoUploadMsg('Đã cập nhật Icon ứng dụng thành công!');
        setTimeout(() => setLogoUploadMsg(''), 3000);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = () => {
    if (window.confirm('Đặt lại Icon về bản mặc định hệ thống?')) {
      resetAppLogo();
      setLocalAppLogo('/icon-192.png');
      setLogoUploadMsg('Đã khôi phục Icon mặc định.');
      setTimeout(() => setLogoUploadMsg(''), 3000);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      let currentKey = hybridAi.getApiKey() || '';
      let currentModel = hybridAi.getModel() || 'gemini-3.8-flash';
      // Tự động nâng cấp model cũ nếu profile lưu model không còn hỗ trợ
      if (currentModel.includes('2.5') || currentModel.includes('1.5') || currentModel.includes('2.0')) {
        currentModel = 'gemini-3.8-flash';
        hybridAi.setModel(currentModel);
      }
      let autoGrade = hybridAi.isAutoGradeEnabled();

      // Nếu chưa có trên máy này, đọc từ tài khoản Firestore của giáo viên
      if (!currentKey && auth.currentUser) {
        try {
          const profile = await FirestoreService.getTeacherProfile(auth.currentUser.uid);
          if (profile?.geminiApiKey) {
            currentKey = profile.geminiApiKey;
            hybridAi.setApiKey(currentKey);
          }
          if (profile?.geminiModel) {
            currentModel = profile.geminiModel;
            hybridAi.setModel(currentModel);
          }
          if (typeof profile?.autoGradeEnabled === 'boolean') {
            autoGrade = profile.autoGradeEnabled;
            hybridAi.setAutoGradeEnabled(autoGrade);
          }
        } catch (e) {
          console.warn('Lỗi đọc cấu hình AI từ Firestore:', e);
        }
      }

      setApiKeyInput(currentKey);
      setSelectedModel(currentModel);
      setAutoGradeEnabled(autoGrade);
    };

    loadSettings();
  }, []);

  const handleSaveApiKey = async () => {
    hybridAi.setApiKey(apiKeyInput);
    hybridAi.setModel(selectedModel);
    hybridAi.setAutoGradeEnabled(autoGradeEnabled);

    // Đồng bộ lên Cloud Firestore nếu giáo viên đã đăng nhập
    if (auth.currentUser) {
      try {
        await FirestoreService.saveTeacherProfile(auth.currentUser.uid, {
          geminiApiKey: apiKeyInput,
          geminiModel: selectedModel,
          autoGradeEnabled
        });
      } catch (err) {
        console.warn('Lỗi đồng bộ API key lên Firestore:', err);
      }
    }

    setSavedKeySuccess(true);
    setTestResult(null);
    setTimeout(() => setSavedKeySuccess(false), 3000);
  };

  const handleClearApiKey = () => {
    if (window.confirm('Bạn có chắc chắn muốn gỡ bỏ Gemini API Key? Hệ thống sẽ tự động chuyển sang chế độ phân tích toán học thông minh ngoại tuyến.')) {
      hybridAi.clearApiKey();
      setApiKeyInput('');
      setTestResult(null);
      if (auth.currentUser) {
        FirestoreService.saveTeacherProfile(auth.currentUser.uid, {
          geminiApiKey: ''
        }).catch(() => {});
      }
      setSavedKeySuccess(true);
      setTimeout(() => setSavedKeySuccess(false), 3000);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await hybridAi.testConnection(apiKeyInput);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Lỗi không xác định: ' + (err.message || String(err))
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleExportBackup = () => {
    const data = {
      classes: StorageService.getClasses(),
      assignments: StorageService.getAssignments(),
      submissions: StorageService.getSubmissions(),
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ToanTHCS_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.classes && json.assignments) {
          localStorage.setItem('toan_thcs_classes_v4', JSON.stringify(json.classes));
          localStorage.setItem('toan_thcs_assignments_v4', JSON.stringify(json.assignments));
          if (json.submissions) {
            localStorage.setItem('toan_thcs_submissions_v4', JSON.stringify(json.submissions));
          }
          alert('Khôi phục dữ liệu sao lưu thành công!');
          window.location.reload();
        } else {
          alert('Tệp dữ liệu không đúng cấu trúc TOÁN THCS.');
        }
      } catch {
        alert('Lỗi đọc tệp sao lưu.');
      }
    };
    reader.readAsText(file);
  };

  const hasConfiguredKey = Boolean(apiKeyInput && apiKeyInput.trim().length > 5);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200 pb-16">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Cài đặt hệ thống & Cấu hình AI</h1>
        <p className="text-sm text-slate-500">
          Cấu hình trợ lý Gemini AI chấm bài tự luận, quản lý cơ sở dữ liệu và sao lưu dự phòng.
        </p>
      </div>

      {/* SECTION 1: GEMINI AI CONFIGURATION */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-100">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-base text-slate-900">Cấu hình Trợ lý Gemini AI</h2>
                {hasConfiguredKey ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Đã kết nối API
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">
                    Chế độ quy tắc ngoại tuyến
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Tự động nhận diện ảnh chụp bài làm tự luận của học sinh, chấm điểm chi tiết và gợi ý phương pháp giải.
              </p>
            </div>
          </div>
        </div>

        {/* API Key Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-indigo-600" />
                <span>Google Gemini API Key (Lưu cục bộ tại trình duyệt):</span>
              </span>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold inline-flex items-center gap-1"
              >
                <span>Lấy khóa miễn phí tại Google AI Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full pl-3.5 pr-20 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                title={showKey ? 'Ẩn khóa' : 'Hiện khóa'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Model Selection & Auto-Grade Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                <span>Mô hình AI sử dụng:</span>
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="gemini-3.8-flash">Gemini 3.8 Flash (Mới nhất - Chuẩn Toán THCS & Siêu nhanh)</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Chuyên sâu hình học & suy luận Toán THCS nâng cao)</option>
                <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Tiết kiệm hạn mức API)</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center space-x-2.5 p-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/80 transition-colors">
                <input
                  type="checkbox"
                  checked={autoGradeEnabled}
                  onChange={(e) => setAutoGradeEnabled(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500 border-slate-300"
                />
                <span className="text-xs font-semibold text-slate-700">
                  Tự động chấm bài tự luận khi học sinh nộp ảnh
                </span>
              </label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              onClick={handleSaveApiKey}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Lưu cấu hình</span>
            </button>

            <button
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin text-indigo-600' : ''}`} />
              <span>{testingConnection ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
            </button>

            {apiKeyInput && (
              <button
                onClick={handleClearApiKey}
                className="inline-flex items-center space-x-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <span>Xóa Key</span>
              </button>
            )}

            {savedKeySuccess && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" /> Đã lưu thành công!
              </span>
            )}
          </div>

          {/* Test Connection Alert Box */}
          {testResult && (
            <div
              className={`p-3.5 rounded-2xl border text-xs animate-in fade-in duration-200 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-start space-x-2">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">
                    {testResult.success ? 'Kết nối thành công!' : 'Kiểm tra kết nối thất bại'}
                  </div>
                  <p className="mt-0.5 opacity-90">{testResult.message}</p>
                  {testResult.modelUsed && (
                    <div className="mt-1 font-mono text-[11px] opacity-75">
                      Model đang hoạt động: {testResult.modelUsed}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick Guide Card */}
          <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-4 text-xs text-purple-900 space-y-2">
            <div className="flex items-center space-x-1.5 font-bold text-purple-950">
              <HelpCircle className="w-4 h-4 text-purple-600" />
              <span>Hướng dẫn lấy Gemini API Key miễn phí:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-purple-800 text-[11px] leading-relaxed">
              <li>Truy cập <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline font-bold text-purple-900">Google AI Studio (aistudio.google.com/apikey)</a>.</li>
              <li>Đăng nhập bằng tài khoản Google của Thầy/Cô và nhấn <strong>Create API Key</strong>.</li>
              <li>Sao chép mã API Key vừa tạo, dán vào ô bên trên và bấm <strong>Lưu cấu hình</strong>.</li>
              <li>Nếu không nhập API Key, hệ thống vẫn hoạt động mượt mà bằng bộ phân tích toán học thông minh tích hợp sẵn.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* SECTION 2: APP ICON & LOGO MANAGEMENT */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900">Icon & Logo Ứng dụng</h2>
              <p className="text-xs text-slate-500">
                Xem và tùy chỉnh biểu tượng hiển thị trên thanh tiêu đề, tab trình duyệt (Favicon) và PWA.
              </p>
            </div>
          </div>

          {logoUploadMsg && (
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-full animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{logoUploadMsg}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Logo Preview Cards */}
          <div className="md:col-span-1 flex flex-col items-center justify-center p-5 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 text-center space-y-3">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Icon đang sử dụng
            </span>
            <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-md bg-white border border-slate-200/80 p-1 flex items-center justify-center">
              <img
                src={appLogo}
                alt="App Icon Preview"
                className="w-full h-full object-contain rounded-xl"
              />
            </div>
            <div className="text-[11px] text-slate-500">
              Định dạng PNG/SVG • Chuẩn Retina
            </div>
          </div>

          {/* Action & GitHub info */}
          <div className="md:col-span-2 space-y-4">
            <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 text-blue-900 text-xs leading-relaxed space-y-1.5">
              <div className="flex items-center space-x-1.5 font-bold text-blue-950">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Lưu ý về Icon khi tải lên GitHub:</span>
              </div>
              <p className="text-[11px] text-blue-800">
                Môi trường AI Studio chạy trong container độc lập và không tự động kéo commit từ GitHub về. Tệp icon hiện tại <strong>/icon-192.png</strong> đã được tối ưu và tích hợp sẵn vào thanh tiêu đề, favicon trình duyệt và màn hình đăng nhập.
              </p>
              <p className="text-[11px] text-blue-800">
                Nếu Thầy/Cô muốn đổi sang icon khác từ máy tính cá nhân, chỉ cần bấm nút <strong>Tải ảnh Icon mới</strong> bên dưới — hệ thống sẽ áp dụng ngay tức thì!
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="inline-flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors cursor-pointer active:scale-95">
                <Upload className="w-4 h-4" />
                <span>Tải ảnh Icon mới từ máy (PNG / JPG / SVG)</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/svg+xml, image/webp"
                  onChange={handleUploadLogo}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleResetLogo}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Đặt lại Icon mặc định</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: BACKUP & RESTORE */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-slate-900">Sao lưu & Khôi phục dữ liệu</h2>
            <p className="text-xs text-slate-500">
              Xuất tệp JSON lưu trên máy tính hoặc chuyển đổi sang thiết bị khác.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Tải tệp sao lưu (Export JSON)</h3>
              <p className="text-xs text-slate-500 mt-1">
                Lưu toàn bộ danh sách học sinh, bài tập đã tạo và lịch sử nộp bài về máy.
              </p>
            </div>
            <button
              onClick={handleExportBackup}
              className="mt-4 inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tải bản sao lưu JSON</span>
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Nhập dữ liệu từ tệp (Import JSON)</h3>
              <p className="text-xs text-slate-500 mt-1">
                Khôi phục lại danh sách đề thi và lớp học từ file đã sao lưu trước đó.
              </p>
            </div>
            <label className="mt-4 inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Chọn file JSON...</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* SECTION 3: DEMO SEED RESET & CLEAR */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-slate-900">Quản lý Dữ liệu Mẫu (Demo Data)</h2>
            <p className="text-xs text-slate-500">
              Khôi phục lại dữ liệu mẫu chuẩn hoặc dọn dẹp sạch toàn bộ các đề thi, lớp học và kết quả mẫu có sẵn.
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          Thầy/Cô có thể bấm <strong>"Xóa hết dữ liệu mẫu"</strong> để bắt đầu soạn đề và tạo lớp mới hoàn toàn, hoặc bấm <strong>"Đặt lại dữ liệu mẫu ban đầu"</strong> nếu muốn nạp lại ngân hàng câu hỏi gốc bất cứ lúc nào.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={onResetData}
            className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Đặt lại dữ liệu mẫu ban đầu</span>
          </button>

          {onClearDemoData && (
            <button
              onClick={onClearDemoData}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xóa hết dữ liệu mẫu</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
