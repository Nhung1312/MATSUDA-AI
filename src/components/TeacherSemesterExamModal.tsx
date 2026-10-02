import React, { useState } from 'react';
import { Assignment, ClassRoom, GradeLevel } from '../types';
import { PracticeEngineService, PracticeScope } from '../services/practiceEngineService';
import { ExamGeneratorService } from '../services/examGeneratorService';
import { StorageService } from '../services/storageService';
import { FirestoreService } from '../services/firestoreService';
import { aiService } from '../services/aiService';
import { 
  Sparkles, 
  BookOpen, 
  Layers, 
  Printer, 
  Copy, 
  Check, 
  CheckCircle2, 
  X, 
  Clock, 
  Target, 
  Trophy, 
  Award, 
  Loader2, 
  ArrowRight, 
  Database, 
  Shuffle, 
  FileText,
  FileCheck2,
  GraduationCap
} from 'lucide-react';

interface TeacherSemesterExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassRoom[];
  onExamsCreated: (newAssignments: Assignment[]) => void;
  onOpenPrintModal?: (assignment: Assignment) => void;
}

export const TeacherSemesterExamModal: React.FC<TeacherSemesterExamModalProps> = ({
  isOpen,
  onClose,
  classes,
  onExamsCreated,
  onOpenPrintModal
}) => {
  if (!isOpen) return null;

  const [grade, setGrade] = useState<GradeLevel>('8');
  const [scope, setScope] = useState<PracticeScope>('gk1');
  const [questionCount, setQuestionCount] = useState<number>(20);
  const [generate4Variants, setGenerate4Variants] = useState<boolean>(true);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [currentStepText, setCurrentStepText] = useState<string>('');
  const [createdExams, setCreatedExams] = useState<Assignment[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const hasApiKey = aiService.hasApiKey();

  // Helper title based on scope
  const getScopeName = (sc: PracticeScope, gr: GradeLevel) => {
    switch (sc) {
      case 'gk1': return `Kiểm tra Giữa học kỳ 1 (Toán ${gr})`;
      case 'hk1': return `Kiểm tra Cuối học kỳ 1 (Toán ${gr})`;
      case 'gk2': return `Kiểm tra Giữa học kỳ 2 (Toán ${gr})`;
      case 'hk2': return `Kiểm tra Cuối học kỳ 2 (Toán ${gr})`;
      default: return `Kiểm tra định kỳ Toán ${gr}`;
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setCurrentStepText('Đang khởi động hệ thống 3 Tầng...');

    try {
      const scopeTitle = getScopeName(scope, grade);
      const targetClass = classes.find(c => c.id === selectedClassId);
      const className = targetClass ? `Lớp ${targetClass.name}` : 'Toàn khối';

      // 1. Lắp ráp đề gốc từ 3 Tầng (Kho Thầy/Cô + AI)
      setCurrentStepText('Đang quét ngân hàng đề thi của Thầy/Cô và lắp ráp ma trận chuẩn...');
      const assembledResult = await PracticeEngineService.assemble3LayerPracticeExam({
        grade,
        topic: scopeTitle,
        scope,
        targetCount: questionCount,
        difficulty: 'Hỗn hợp',
        onStepProgress: (txt) => setCurrentStepText(txt)
      });

      if (!assembledResult.questions || assembledResult.questions.length === 0) {
        throw new Error('Không thể lắp ráp câu hỏi cho đề thi');
      }

      const durationMinutes = questionCount === 20 ? 45 : questionCount === 30 ? 60 : 90;
      const baseExamTitle = `${scopeTitle} - SGK Kết nối tri thức`;

      const generatedAssignments: Assignment[] = [];

      if (generate4Variants) {
        setCurrentStepText('Đang hoán vị phương án và sinh Bộ 4 mã đề: 101, 102, 103, 104...');
        const variantCodes = ['101', '102', '103', '104'];

        variantCodes.forEach((vCode, idx) => {
          let questionsForVariant = [...assembledResult.questions];

          if (idx === 0) {
            // Mã đề 101: Giữ thứ tự gốc chuẩn
            questionsForVariant = questionsForVariant.map((q, qIdx) => ({
              ...q,
              id: `q_exam_${vCode}_${qIdx + 1}`,
              order: qIdx + 1
            }));
          } else {
            // Mã đề 102, 103, 104: Hoán vị A-B-C-D và xáo trộn câu hỏi
            questionsForVariant = questionsForVariant.map(q => ExamGeneratorService.shuffleQuestionOptions(q));
            // Xáo trộn thứ tự các câu hỏi
            questionsForVariant = [...questionsForVariant].sort(() => Math.random() - 0.5);
            questionsForVariant = questionsForVariant.map((q, qIdx) => ({
              ...q,
              id: `q_exam_${vCode}_${qIdx + 1}`,
              order: qIdx + 1
            }));
          }

          const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
          const asgCode = `TOAN${grade}-${vCode}-${randomSuffix}`;

          const newAsg: Assignment = {
            id: `asg_sem_${Date.now()}_${vCode}_${Math.random().toString(36).substring(2, 6)}`,
            title: `${baseExamTitle} (Mã đề ${vCode})`,
            assignmentCode: asgCode,
            grade,
            topic: scopeTitle,
            classId: selectedClassId,
            className,
            durationMinutes,
            deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            allowViewResult: true,
            questions: questionsForVariant,
            createdAt: new Date().toISOString(),
            isPublished: true
          };

          generatedAssignments.push(newAsg);
        });
      } else {
        // Tạo 1 đề thi duy nhất
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const asgCode = `TOAN${grade}-${randomSuffix}`;

        const newAsg: Assignment = {
          id: `asg_sem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title: baseExamTitle,
          assignmentCode: asgCode,
          grade,
          topic: scopeTitle,
          classId: selectedClassId,
          className,
          durationMinutes,
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          allowViewResult: true,
          questions: assembledResult.questions,
          createdAt: new Date().toISOString(),
          isPublished: true
        };

        generatedAssignments.push(newAsg);
      }

      // Lưu tất cả các đề vào Storage & Firestore
      setCurrentStepText('Đang lưu trữ đề thi vào Ngân hàng câu hỏi...');
      generatedAssignments.forEach(asg => {
        StorageService.saveAssignment(asg);
      });

      try {
        await Promise.all(generatedAssignments.map(asg => FirestoreService.saveExam(asg)));
      } catch (fErr) {
        console.warn('Lỗi đồng bộ Cloud, đã lưu offline thành công:', fErr);
      }

      setCreatedExams(generatedAssignments);
      onExamsCreated(generatedAssignments);

    } catch (err: any) {
      console.error('Lỗi khi tạo đề thi Giữa kỳ / Cuối kỳ:', err);
      alert('Có lỗi xảy ra khi tạo đề thi. Vui lòng thử lại!');
    } finally {
      setIsGenerating(false);
      setCurrentStepText('');
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleReset = () => {
    setCreatedExams([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 relative max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={handleReset}
          disabled={isGenerating}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {createdExams.length === 0 ? (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
                <Sparkles className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">
                    Tạo Đề Thi Giữa Kỳ &amp; Cuối Kỳ
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase border border-indigo-200 dark:border-indigo-800">
                    Hệ thống 3 Tầng
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tự động quét kho đề của Thầy/Cô, kết hợp AI xuất trọn gói <strong>Bộ 4 mã đề (101, 102, 103, 104)</strong> chuẩn SGK Kết nối tri thức.
                </p>
              </div>
            </div>

            {/* Form Step 1: Chọn Khối lớp */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-indigo-600" />
                <span>1. Chọn khối lớp:</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['6', '7', '8', '9'] as GradeLevel[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrade(g)}
                    className={`py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer ${
                      grade === g
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Toán Lớp {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Form Step 2: Chọn Kỳ thi */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-indigo-600" />
                <span>2. Chọn kỳ thi cần tạo:</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setScope('gk1')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                    scope === 'gk1'
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-500 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black">Giữa kỳ 1</span>
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <span className="text-[10px] opacity-75 font-normal">Nửa đầu học kỳ 1</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('hk1')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                    scope === 'hk1'
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-500 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black">Cuối kỳ 1</span>
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <span className="text-[10px] opacity-75 font-normal">Tổng hợp cả kỳ 1</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('gk2')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                    scope === 'gk2'
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-500 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black">Giữa kỳ 2</span>
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <span className="text-[10px] opacity-75 font-normal">Nửa đầu học kỳ 2</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScope('hk2')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                    scope === 'hk2'
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-500 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black">Cuối kỳ 2</span>
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <span className="text-[10px] opacity-75 font-normal">Tổng kết cả năm học</span>
                </button>
              </div>
            </div>

            {/* Form Step 3: Quy mô số câu & Lớp áp dụng */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span>3. Quy mô đề &amp; Thời lượng:</span>
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setQuestionCount(20)}
                    className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer text-center ${
                      questionCount === 20
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'
                    }`}
                  >
                    <div>20 câu</div>
                    <div className="text-[10px] opacity-75 font-normal">45 phút</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionCount(30)}
                    className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer text-center ${
                      questionCount === 30
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'
                    }`}
                  >
                    <div>30 câu</div>
                    <div className="text-[10px] opacity-75 font-normal">60 phút</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionCount(40)}
                    className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer text-center ${
                      questionCount === 40
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'
                    }`}
                  >
                    <div>40 câu</div>
                    <div className="text-[10px] opacity-75 font-normal">90 phút</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-indigo-600" />
                  <span>Lớp áp dụng:</span>
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">Toàn khối {grade} (Tất cả học sinh)</option>
                  {classes.filter(c => String(c.grade) === String(grade)).map(c => (
                    <option key={c.id} value={c.id}>
                      Lớp {c.name} (Khối {c.grade})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Option: Bộ 4 mã đề */}
            <div className="p-3.5 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/40 dark:to-indigo-950/40 rounded-2xl border border-indigo-200/80 dark:border-indigo-800">
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generate4Variants}
                  onChange={(e) => setGenerate4Variants(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="font-extrabold text-xs sm:text-sm text-indigo-900 dark:text-indigo-200 block">
                    Xuất trọn gói Bộ 4 mã đề chống nhìn bài (101, 102, 103, 104)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    Tự động hoán vị phương án A-B-C-D và đảo thứ tự câu hỏi để phát cho 4 dãy bàn trong phòng thi.
                  </span>
                </div>
              </label>
            </div>

            {/* Loading progress bar */}
            {isGenerating && (
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl border border-indigo-200 dark:border-indigo-800 flex items-center space-x-3 animate-in fade-in">
                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                    {currentStepText || 'Đang tạo bộ đề thi 3 Tầng...'}
                  </p>
                  <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                    Hệ thống đang trích xuất câu hỏi từ kho đề Thầy/Cô và đồng bộ đáp án chuẩn...
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleReset}
                disabled={isGenerating}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang xử lý đề thi...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>{generate4Variants ? 'Tạo Trọn Gói 4 Mã Đề Ngay' : 'Tạo Đề Thi Ngay'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* SUCCESS SCREEN */
          <div className="py-2 space-y-5 animate-in fade-in">
            <div className="text-center">
              <div className="w-13 h-13 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center mx-auto mb-3 shadow-xs">
                <Check className="w-7 h-7 stroke-[3]" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                Đã tạo thành công {createdExams.length} mã đề thi!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                Tất cả mã đề đã được lưu vào Ngân hàng bài tập và Cloud Firestore, sẵn sàng để giao cho học sinh hoặc in ra giấy A4.
              </p>
            </div>

            {/* List of created exams */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {createdExams.map((exam, idx) => (
                <div
                  key={exam.id}
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono font-black text-xs">
                        Mã {101 + idx}
                      </span>
                      <strong className="text-slate-900 dark:text-white truncate block">
                        {exam.title}
                      </strong>
                    </div>
                    <div className="flex items-center space-x-3 text-slate-500 mt-1">
                      <span>Mã bài: <strong className="font-mono text-indigo-600">{exam.assignmentCode}</strong></span>
                      <span>• {exam.questions.length} câu</span>
                      <span>• {exam.durationMinutes} phút</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(exam.assignmentCode)}
                      className="p-2 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
                      title="Sao chép mã bài tập"
                    >
                      {copiedCode === exam.assignmentCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {onOpenPrintModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenPrintModal(exam);
                        }}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all cursor-pointer shadow-xs"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>In đề A4</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500">
                ✓ Đáp án chuẩn A-B-C-D đã được tính toán 100%
              </span>
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-extrabold text-xs sm:text-sm rounded-xl transition-all cursor-pointer shadow-md hover:opacity-90"
              >
                Hoàn tất &amp; Xem danh sách
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
