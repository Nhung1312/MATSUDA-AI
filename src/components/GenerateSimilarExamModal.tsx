import React, { useState } from 'react';
import { Assignment, ClassRoom } from '../types';
import { ExamGeneratorService, GenerateVariantOptions } from '../services/examGeneratorService';
import { StorageService } from '../services/storageService';
import { FirestoreService } from '../services/firestoreService';
import { aiService } from '../services/aiService';
import { 
  X, 
  Sparkles, 
  Shuffle, 
  Layers, 
  Check, 
  BookOpen, 
  Clock, 
  Key, 
  AlertCircle,
  HelpCircle,
  ArrowRight
} from 'lucide-react';

interface GenerateSimilarExamModalProps {
  assignment: Assignment | null;
  classes: ClassRoom[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newAssignment: Assignment) => void;
  onNavigateToEdit?: (assignment: Assignment) => void;
}

export const GenerateSimilarExamModal: React.FC<GenerateSimilarExamModalProps> = ({
  assignment,
  classes,
  isOpen,
  onClose,
  onSuccess,
  onNavigateToEdit
}) => {
  if (!isOpen || !assignment) return null;

  const [title, setTitle] = useState(
    `${assignment.title} (Mã đề B)`
  );
  const [variantCode, setVariantCode] = useState('B');
  const [selectedClassId, setSelectedClassId] = useState(assignment.classId || classes[0]?.id || 'all');
  const [mode, setMode] = useState<'permutation' | 'math_variation' | 'ai'>('permutation');
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [createdAssignment, setCreatedAssignment] = useState<Assignment | null>(null);

  const hasApiKey = aiService.hasApiKey();

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress({ current: 0, total: assignment.questions.length });
    try {
      const targetClass = classes.find(c => c.id === selectedClassId);
      const options: GenerateVariantOptions = {
        variantCode,
        targetClassId: selectedClassId,
        targetClassName: targetClass?.name || assignment.className,
        mode,
        shuffleQuestions,
        shuffleOptions,
        newTitle: title,
        onProgress: (current, total) => {
          setProgress({ current, total });
        }
      };

      const newAsg = await ExamGeneratorService.generateVariantAssignment(assignment, options);
      
      // Lưu vào Local Storage an toàn
      StorageService.saveAssignment(newAsg);
      
      // Lưu vào Firestore nếu có kết nối
      try {
        await FirestoreService.saveExam(newAsg);
      } catch {
        // Fallback local persistence is already handled
      }

      setCreatedAssignment(newAsg);
      onSuccess(newAsg);
    } catch (error) {
      console.error('Lỗi tạo đề tương tự:', error);
      alert('Có lỗi xảy ra khi tạo đề. Vui lòng thử lại.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setCreatedAssignment(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={handleReset}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {!createdAssignment ? (
          <div>
            {/* Header */}
            <div className="flex items-center space-x-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
                <Shuffle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Tạo Đề Tương Tự / Biến Thể Mã Đề
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tạo mã đề mới chống nhìn bài hoặc đề tương tự cùng cấu trúc
                </p>
              </div>
            </div>

            {/* Source Info Card */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 mb-5 text-xs">
              <div className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-1">
                Đề gốc: <span className="text-indigo-600 dark:text-indigo-400">{assignment.title}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-slate-500 dark:text-slate-400">
                <span>Khối: <strong>Lớp {assignment.grade}</strong></span>
                <span>Số câu: <strong>{assignment.questions.length} câu</strong></span>
                <span>Thời gian: <strong>{assignment.durationMinutes > 0 ? `${assignment.durationMinutes} phút` : 'Tự do'}</strong></span>
                <span>Mã gốc: <strong className="font-mono text-indigo-600">{assignment.assignmentCode}</strong></span>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 text-xs">
              {/* Tiêu đề đề mới */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên đề thi mới
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Nhập tiêu đề đề mới..."
                />
              </div>

              {/* Mã đề và Lớp áp dụng */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Ký hiệu mã đề
                  </label>
                  <input
                    type="text"
                    value={variantCode}
                    onChange={(e) => setVariantCode(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="VD: 102, B, Chẵn..."
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Lớp áp dụng
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Tất cả học sinh</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        Lớp {c.name} (Khối {c.grade})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Phương thức tạo đề */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Phương thức sinh đề
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Mode 1: Permutation */}
                  <div
                    onClick={() => setMode('permutation')}
                    className={`p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                      mode === 'permutation'
                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <Shuffle className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-sm">Hoán vị & Đổi mã</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Đảo ngẫu nhiên thứ tự câu và phương án A, B, C, D. Khớp đáp án 100%. 
                      <strong className="text-emerald-600 block mt-0.5">✓ Tức thì, không cần API Key</strong>
                    </p>
                  </div>

                  {/* Mode 2: AI Generation */}
                  <div
                    onClick={() => setMode('ai')}
                    className={`p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                      mode === 'ai'
                        ? 'border-violet-600 bg-violet-50/60 dark:bg-violet-950/40 text-violet-900 dark:text-violet-200'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <Sparkles className="w-4 h-4 text-violet-600" />
                      <span className="font-bold text-sm">AI sinh đề tương tự 1:1</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      AI giữ nguyên dạng toán & cấu trúc từng câu của đề gốc, chỉ đổi số liệu toán học và lập đáp án chuẩn mới.
                      {hasApiKey ? (
                        <strong className="text-violet-600 block mt-0.5">✓ Đã kết nối Gemini AI (Chuẩn ma trận 1:1)</strong>
                      ) : (
                        <span className="text-amber-600 block mt-0.5">⚡ Tự động dùng bộ tạo thông minh</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tùy chọn hoán vị */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-wrap gap-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Xáo trộn thứ tự các câu hỏi
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shuffleOptions}
                    onChange={(e) => setShuffleOptions(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Xáo trộn các phương án A, B, C, D
                  </span>
                </label>
              </div>

              {/* AI Generation Progress Bar */}
              {isGenerating && mode === 'ai' && progress.total > 0 && (
                <div className="p-3.5 bg-violet-50 dark:bg-violet-950/40 rounded-2xl border border-violet-100 dark:border-violet-800 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-violet-900 dark:text-violet-200 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-violet-600 animate-pulse" />
                      <span>AI đang biên soạn câu tương đương 1:1 theo đề gốc...</span>
                    </span>
                    <span>{progress.current}/{progress.total} câu</span>
                  </div>
                  <div className="w-full bg-violet-200 dark:bg-violet-900 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-violet-600 to-indigo-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2.5 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={handleReset}
                disabled={isGenerating}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Hủy bỏ
              </button>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !title.trim()}
                className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>
                      {mode === 'ai' && progress.total > 0
                        ? `AI đang tạo (${progress.current}/${progress.total} câu)...`
                        : 'Đang khởi tạo đề...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Khởi tạo đề ngay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Success Screen */
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Check className="w-7 h-7 stroke-[2.5]" />
            </div>

            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              Đã tạo mã đề mới thành công!
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Đề thi biến thể đã được thêm vào danh sách bài tập và sẵn sàng cho học sinh làm bài hoặc in ấn.
            </p>

            <div className="my-5 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 text-left text-xs max-w-md mx-auto space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Tên đề:</span>
                <strong className="text-slate-800 dark:text-slate-100 text-right">{createdAssignment.title}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Mã bài tập:</span>
                <strong className="font-mono text-indigo-600 text-sm">{createdAssignment.assignmentCode}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Số câu:</span>
                <strong>{createdAssignment.questions.length} câu</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Lớp:</span>
                <strong>{createdAssignment.className || 'Tất cả học sinh'}</strong>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleReset}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Đóng
              </button>

              {onNavigateToEdit && (
                <button
                  onClick={() => {
                    handleReset();
                    onNavigateToEdit(createdAssignment);
                  }}
                  className="inline-flex items-center space-x-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <span>Xem & Chỉnh sửa đề</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
