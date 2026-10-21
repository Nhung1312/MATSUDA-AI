import React, { useState, useEffect } from 'react';
import { Assignment } from '../../types';
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
  Trash2,
  X,
  Plus
} from 'lucide-react';

interface TeacherSettingsProps {
  onResetData: () => void;
  onClearDemoData?: () => void;
}

interface ImportAnalysisData {
  fileName: string;
  fileSize: number;
  rawJson: any;
  hasBackupStructure: boolean;
  totalFound: number;
  totalQuestions: number;
  duplicateCount: number;
  duplicateExams: any[];
  newExamsToAdd: any[];
  newExamsCount: number;
  newQuestionsCount: number;
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
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; modelUsed?: string; errorType?: string } | null>(null);

  // App Logo state
  const [appLogo, setLocalAppLogo] = useState<string>(getAppLogo());
  const [logoUploadMsg, setLogoUploadMsg] = useState<string>('');

  // Import JSON Modal & Analysis state
  const [importAnalysis, setImportAnalysis] = useState<ImportAnalysisData | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);

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
      const res = await hybridAi.testConnection(apiKeyInput, selectedModel);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Lỗi không xác định: ' + (err?.message || String(err)),
        errorType: 'general'
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const fileSize = file.size;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const json = JSON.parse(text);

        // Phát hiện danh sách đề thi (assignments)
        let rawCandidates: any[] = [];
        if (Array.isArray(json)) {
          rawCandidates = json;
        } else if (json && typeof json === 'object') {
          if (Array.isArray(json.assignments)) {
            rawCandidates = json.assignments;
          } else if (Array.isArray(json.exams)) {
            rawCandidates = json.exams;
          } else if (Array.isArray(json.data)) {
            rawCandidates = json.data;
          } else if (json.title && Array.isArray(json.questions)) {
            rawCandidates = [json];
          }
        }

        const validCandidates = rawCandidates.filter((item: any) =>
          item && typeof item === 'object' && (item.title || (Array.isArray(item.questions) && item.questions.length > 0))
        );

        const hasBackupStructure = Boolean(
          json && typeof json === 'object' && (json.classes || json.submissions || (json.assignments && json.classes))
        );

        if (validCandidates.length === 0 && !hasBackupStructure) {
          alert('Tệp JSON này không chứa danh sách đề thi (assignments) hoặc cấu trúc sao lưu hợp lệ của TOÁN THCS.');
          return;
        }

        // Logic chống trùng lặp với kho đề hiện có
        const existingAssignments = StorageService.getAssignments();
        const existingIds = new Set<string>();
        const existingCodes = new Set<string>();
        const existingSignatures = new Set<string>();

        existingAssignments.forEach(a => {
          if (a.id) existingIds.add(String(a.id).trim());
          if (a.assignmentCode) existingCodes.add(String(a.assignmentCode).trim().toUpperCase());
          const titleNorm = (a.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const gradeNorm = String(a.grade || '').trim();
          const qCount = Array.isArray(a.questions) ? a.questions.length : 0;
          if (titleNorm) {
            existingSignatures.add(`${titleNorm}__${gradeNorm}__${qCount}`);
          }
        });

        // Chống trùng nội bộ trong chính tệp tải lên
        const batchIds = new Set<string>();
        const batchCodes = new Set<string>();
        const batchSignatures = new Set<string>();

        const duplicateExams: any[] = [];
        const newExamsToAdd: any[] = [];

        validCandidates.forEach(cand => {
          const candId = String(cand.id || '').trim();
          const candCode = String(cand.assignmentCode || '').trim().toUpperCase();
          const candTitleNorm = String(cand.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const candGradeNorm = String(cand.grade || '6').trim();
          const candQCount = Array.isArray(cand.questions) ? cand.questions.length : 0;
          const candSig = `${candTitleNorm}__${candGradeNorm}__${candQCount}`;

          let isDup = false;

          // 1. Kiểm tra ID
          if (candId && (existingIds.has(candId) || batchIds.has(candId))) {
            isDup = true;
          }
          // 2. Kiểm tra Mã đề (assignmentCode)
          else if (candCode && (existingCodes.has(candCode) || batchCodes.has(candCode))) {
            isDup = true;
          }
          // 3. Kết hợp Title + Grade + Số câu hỏi
          else if (candTitleNorm && (existingSignatures.has(candSig) || batchSignatures.has(candSig))) {
            isDup = true;
          }

          if (isDup) {
            duplicateExams.push(cand);
          } else {
            newExamsToAdd.push(cand);
            if (candId) batchIds.add(candId);
            if (candCode) batchCodes.add(candCode);
            if (candTitleNorm) batchSignatures.add(candSig);
          }
        });

        const totalFound = validCandidates.length;
        const totalQuestions = validCandidates.reduce(
          (sum, a) => sum + (Array.isArray(a.questions) ? a.questions.length : 0),
          0
        );
        const duplicateCount = duplicateExams.length;
        const newExamsCount = newExamsToAdd.length;
        const newQuestionsCount = newExamsToAdd.reduce(
          (sum, a) => sum + (Array.isArray(a.questions) ? a.questions.length : 0),
          0
        );

        setImportAnalysis({
          fileName,
          fileSize,
          rawJson: json,
          hasBackupStructure,
          totalFound,
          totalQuestions,
          duplicateCount,
          duplicateExams,
          newExamsToAdd,
          newExamsCount,
          newQuestionsCount
        });
      } catch (err: any) {
        console.error('Lỗi parse JSON:', err);
        alert('Tệp dữ liệu không đúng định dạng JSON hoặc bị lỗi cú pháp: ' + (err?.message || 'Lỗi cú pháp'));
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleImportAppend = async () => {
    if (!importAnalysis || isImporting) return;
    if (importAnalysis.newExamsCount === 0) {
      alert('Không có đề thi mới nào để thêm vì tất cả đề trong tệp đều đã có trong hệ thống (bị trùng).');
      return;
    }

    setIsImporting(true);
    try {
      const currentAssignments = StorageService.getAssignments();

      // Chuẩn hóa và gắn verificationStatus: "unverified"
      // Giữ nguyên 100% nội dung câu hỏi, options, correctAnswer, explanation, LaTeX và metadata gốc
      const preparedNewExams: Assignment[] = importAnalysis.newExamsToAdd.map((cand, idx) => {
        const generatedId = cand.id || `asg_imported_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
        const generatedCode = cand.assignmentCode || `TOAN${cand.grade || '6'}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        // Gỡ bỏ cờ đánh dấu đã xóa trong blacklist nếu có
        StorageService.unmarkAssignmentAsDeleted(generatedId, generatedCode);

        const newAsg: Assignment = {
          ...cand,
          id: generatedId,
          title: cand.title || `Đề nhập thêm ${idx + 1}`,
          grade: (cand.grade === '6' || cand.grade === '7' || cand.grade === '8' || cand.grade === '9') ? cand.grade : '6',
          topic: cand.topic || 'Toán học',
          classId: cand.classId || 'all',
          className: cand.className || 'Tất cả học sinh',
          questions: Array.isArray(cand.questions) ? cand.questions : [],
          durationMinutes: typeof cand.durationMinutes === 'number' ? cand.durationMinutes : 45,
          deadline: cand.deadline || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          allowViewResult: cand.allowViewResult !== false,
          assignmentCode: generatedCode,
          createdAt: cand.createdAt || new Date().toISOString(),
          isPublished: cand.isPublished !== false,
          // ĐÁNH DẤU CHƯA THẨM ĐỊNH THEO YÊU CẦU
          verificationStatus: 'unverified'
        };

        return newAsg;
      });

      // Gộp vào danh sách hiện có (KHÔNG xóa, KHÔNG ghi đè)
      const mergedAssignments = [...currentAssignments, ...preparedNewExams];
      StorageService.setAssignments(mergedAssignments);

      // Nếu giáo viên đã đăng nhập, đồng bộ đề mới lên Firestore
      if (auth.currentUser) {
        for (const exam of preparedNewExams) {
          try {
            await FirestoreService.saveExam(exam, {
              uid: auth.currentUser.uid,
              email: auth.currentUser.email || '',
              displayName: auth.currentUser.displayName || 'Giáo viên'
            });
          } catch (cloudErr) {
            console.warn('Lưu Cloud đề nhập thêm (offline fallback):', cloudErr);
          }
        }
      }

      alert(
        `🎉 Đã nhập thêm thành công ${preparedNewExams.length} đề thi mới (${importAnalysis.newQuestionsCount} câu hỏi) vào kho đề!\n\n` +
        `• Đề trùng đã bỏ qua: ${importAnalysis.duplicateCount}\n` +
        `• Trạng thái: "unverified" (Chưa thẩm định - chưa tự động đưa vào luyện tập học sinh cho đến khi được xác minh).`
      );

      setImportAnalysis(null);
      window.location.reload();
    } catch (err: any) {
      console.error('Lỗi khi nhập thêm kho đề:', err);
      alert('Có lỗi xảy ra khi nhập thêm kho đề: ' + (err?.message || err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleExecuteFullRestore = () => {
    if (!importAnalysis || isImporting) return;

    const confirmed = window.confirm(
      '⚠️ CẢNH BÁO QUAN TRỌNG:\n\n' +
      'Chế độ "Khôi phục toàn bộ" sẽ THAY THẾ toàn bộ danh sách lớp học, bài tập và kết quả nộp bài hiện tại bằng dữ liệu trong file sao lưu.\n\n' +
      'Bạn có chắc chắn muốn khôi phục và ghi đè dữ liệu hiện tại không?'
    );
    if (!confirmed) return;

    setIsImporting(true);
    try {
      const json = importAnalysis.rawJson;
      if (json.classes) {
        localStorage.setItem('toan_thcs_classes_v4', JSON.stringify(json.classes));
      }
      if (json.assignments) {
        localStorage.setItem('toan_thcs_assignments_v4', JSON.stringify(json.assignments));
      }
      if (json.submissions) {
        localStorage.setItem('toan_thcs_submissions_v4', JSON.stringify(json.submissions));
      }

      StorageService.setClearedDemoData(false);

      alert('Đã khôi phục toàn bộ dữ liệu sao lưu thành công!');
      setImportAnalysis(null);
      window.location.reload();
    } catch (err: any) {
      console.error('Lỗi khôi phục toàn bộ:', err);
      alert('Có lỗi xảy ra khi khôi phục dữ liệu: ' + (err?.message || err));
    } finally {
      setIsImporting(false);
    }
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
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    setTestResult(null);
                  }}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="gemini-3.8-flash">Gemini 3.8 Flash (Mới nhất - Chuẩn Toán THCS & Siêu nhanh)</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Chuyên sâu hình học & suy luận Toán THCS nâng cao)</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Tiết kiệm hạn mức API)</option>
                </select>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-all shrink-0 cursor-pointer disabled:opacity-50"
                  title="Kiểm tra API key và khả năng hoạt động của model đang chọn"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin text-indigo-600' : ''}`} />
                  <span>{testingConnection ? 'Đang kiểm tra...' : 'Kiểm tra API & Model'}</span>
                </button>
              </div>
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
                  : testResult.errorType === 'quota'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-start space-x-2">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${testResult.errorType === 'quota' ? 'text-amber-600' : 'text-rose-600'}`} />
                )}
                <div>
                  <div className="font-bold">
                    {testResult.success ? (
                      testResult.message
                    ) : testResult.errorType === 'quota' ? (
                      'Model hiện đã vượt hạn mức API.'
                    ) : (
                      'Kiểm tra kết nối thất bại'
                    )}
                  </div>
                  {(!testResult.success && testResult.errorType !== 'quota') && (
                    <p className="mt-0.5 opacity-90">{testResult.message}</p>
                  )}
                  {testResult.modelUsed && (
                    <div className="mt-1 font-mono text-[11px] opacity-75">
                      Model ID: {testResult.modelUsed}
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
                Hỗ trợ 2 chế độ: <strong>Nhập thêm kho đề mới</strong> (an toàn, không ghi đè) hoặc <strong>Khôi phục toàn bộ</strong> bản sao lưu.
              </p>
            </div>
            <label className="mt-4 inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Chọn file JSON...</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
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

      {/* MODAL TÙY CHỌN NHẬP DỮ LIỆU JSON (IMPORT OPTIONS MODAL) */}
      {importAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">
                    Tùy chọn nhập dữ liệu JSON
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tệp đã chọn: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{importAnalysis.fileName}</span> ({Math.round(importAnalysis.fileSize / 1024)} KB)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportAnalysis(null)}
                disabled={isImporting}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Statistics Preview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-center space-y-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Số đề tìm thấy</div>
                <div className="text-xl font-black text-slate-800 dark:text-slate-100">{importAnalysis.totalFound}</div>
                <div className="text-[10px] text-slate-400">trong tệp JSON</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 text-center space-y-1">
                <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Tổng số câu hỏi</div>
                <div className="text-xl font-black text-indigo-700 dark:text-indigo-300">{importAnalysis.totalQuestions}</div>
                <div className="text-[10px] text-indigo-500">câu hỏi có sẵn</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80 text-center space-y-1">
                <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Số đề bị trùng</div>
                <div className="text-xl font-black text-amber-700 dark:text-amber-300">{importAnalysis.duplicateCount}</div>
                <div className="text-[10px] text-amber-600">bỏ qua nếu nhập thêm</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/80 text-center space-y-1">
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Số đề mới thêm</div>
                <div className="text-xl font-black text-emerald-700 dark:text-emerald-300">+{importAnalysis.newExamsCount}</div>
                <div className="text-[10px] text-emerald-600">({importAnalysis.newQuestionsCount} câu mới)</div>
              </div>
            </div>

            {/* 2 Modes Selection Cards */}
            <div className="space-y-4">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Vui lòng chọn 1 trong 2 chế độ xử lý bên dưới:
              </div>

              {/* CHẾ ĐỘ 2: NHẬP THÊM KHO ĐỀ (Khuyên dùng) */}
              <div className="p-5 rounded-2xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3 relative hover:border-emerald-500 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xs">
                      1
                    </span>
                    <h4 className="font-extrabold text-sm sm:text-base text-emerald-950 dark:text-emerald-200">
                      NHẬP THÊM KHO ĐỀ (An toàn • Khuyên dùng)
                    </h4>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 w-fit">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Không mất dữ liệu cũ
                  </span>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pl-8">
                  <p>
                    • <strong>CHỈ đọc mảng bài tập (assignments)</strong> từ JSON; <strong>KHÔNG</strong> import lớp học hay bài nộp.
                  </p>
                  <p>
                    • <strong>KHÔNG xóa hoặc ghi đè</strong> assignments hiện tại, không ảnh hưởng dữ liệu đang có.
                  </p>
                  <p>
                    • Tự động <strong>chống trùng</strong> (đã lọc bỏ {importAnalysis.duplicateCount} đề trùng theo ID, Mã đề hoặc Tiêu đề + Khối + Số câu).
                  </p>
                  <p>
                    • Giữ nguyên 100% nội dung câu hỏi, options, correctAnswer, explanation, công thức LaTeX và metadata gốc.
                  </p>
                  <p className="text-amber-800 dark:text-amber-300 font-semibold">
                    • Các đề nhập thêm sẽ được gắn nhãn <span className="underline font-bold">"unverified"</span> (chưa thẩm định) và chưa được tự động đưa vào nguồn luyện tập cho học sinh cho đến khi được xác minh.
                  </p>
                </div>

                <div className="pt-2 pl-8">
                  <button
                    type="button"
                    onClick={handleImportAppend}
                    disabled={isImporting || importAnalysis.newExamsCount === 0}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {isImporting
                        ? 'Đang nhập đề...'
                        : importAnalysis.newExamsCount > 0
                        ? `Nhập thêm ${importAnalysis.newExamsCount} đề mới vào hệ thống`
                        : 'Không có đề mới để thêm (Đã bị trùng 100%)'}
                    </span>
                  </button>
                </div>
              </div>

              {/* CHẾ ĐỘ 1: KHÔI PHỤC TOÀN BỘ (Dữ liệu sao lưu) */}
              <div className="p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3 relative hover:border-rose-400 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-lg bg-slate-600 text-white flex items-center justify-center font-black text-xs">
                      2
                    </span>
                    <h4 className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-200">
                      KHÔI PHỤC TOÀN BỘ (Full Backup Restore)
                    </h4>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 w-fit">
                    <AlertTriangle className="w-3.5 h-3.5" /> Có thể ghi đè dữ liệu
                  </span>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 pl-8">
                  <p>
                    • Khôi phục toàn bộ danh sách lớp học (classes), bài tập (assignments), và kết quả nộp bài (submissions) theo file backup.
                  </p>
                  <p className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>CẢNH BÁO: Toàn bộ dữ liệu bài tập, lớp học và kết quả hiện tại có thể bị thay thế hoàn toàn bằng bản sao lưu này.</span>
                  </p>
                </div>

                <div className="pt-2 pl-8">
                  <button
                    type="button"
                    onClick={handleExecuteFullRestore}
                    disabled={isImporting || !importAnalysis.hasBackupStructure}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>
                      {importAnalysis.hasBackupStructure
                        ? 'Khôi phục toàn bộ (Ghi đè)'
                        : 'Tệp không chứa cấu trúc sao lưu toàn bộ (classes/submissions)'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setImportAnalysis(null)}
                disabled={isImporting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
