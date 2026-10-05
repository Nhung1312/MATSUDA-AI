import React, { useState, useEffect } from 'react';
import { Assignment, ClassRoom, GradeLevel, SocraticContext } from '../types';
import { CURRICULUM_MATH_TOPICS, MathTopic } from '../data/mathTopics';
import { SocraticTutorModal } from './SocraticTutorModal';
import { aiService } from '../services/aiService';
import { StorageService } from '../services/storageService';
import { FirestoreService } from '../services/firestoreService';
import { PracticeEngineService, PracticeScope } from '../services/practiceEngineService';
import { 
  Sparkles, 
  BookOpen, 
  Clock, 
  HelpCircle, 
  ArrowRight, 
  Calculator, 
  Shapes, 
  PieChart, 
  Zap, 
  CheckCircle2, 
  Loader2,
  GraduationCap,
  Target,
  Trophy,
  Layers,
  Database,
  Shuffle,
  ShieldCheck,
  Award
} from 'lucide-react';

const POPULAR_STUDENT_REQUESTS: Record<GradeLevel, string[]> = {
  '6': [
    'Tập hợp số tự nhiên & Phép chia hết',
    'Số nguyên: Phép cộng, trừ, nhân, chia',
    'Phân số: Rút gọn, so sánh & Phép tính',
    'Số thập phân & Tỉ số phần trăm',
    'Hình vuông, tam giác đều, lục giác đều',
    'Chu vi & Diện tích các hình phẳng'
  ],
  '7': [
    'Số hữu tỉ & Các phép tính',
    'Số thực & Căn bậc hai số học',
    'Tỉ lệ thức & Dãy tỉ số bằng nhau',
    'Tam giác bằng nhau (c-c-c, c-g-c, g-c-g)',
    'Tam giác cân & Định lý Pythagore',
    'Đại lượng tỉ lệ thuận & Tỉ lệ nghịch'
  ],
  '8': [
    'Phân tích đa thức thành nhân tử',
    '7 Hằng đẳng thức đáng nhớ & Ứng dụng',
    'Rút gọn phân thức đại số',
    'Phương trình bậc nhất một ẩn',
    'Định lý Thalès trong tam giác',
    'Tam giác đồng dạng & Các trường hợp đồng dạng',
    'Hình thang cân, hình thoi, hình chữ nhật'
  ],
  '9': [
    'Rút gọn biểu thức chứa căn bậc hai',
    'Hệ hai phương trình bậc nhất hai ẩn',
    'Phương trình bậc hai & Định lý Vi-ét',
    'Hệ thức lượng trong tam giác vuông',
    'Góc nội tiếp & Tứ giác nội tiếp đường tròn',
    'Đường tròn & Tiếp tuyến của đường tròn',
    'Bất đẳng thức & Tìm GTLN, GTNN'
  ]
};

interface StudentAiPracticeViewProps {
  classes: ClassRoom[];
  studentName: string;
  setStudentName: (name: string) => void;
  selectedClassId: string;
  setSelectedClassId: (id: string) => void;
  customClassName: string;
  setCustomClassName: (name: string) => void;
  onStartExam: (assignment: Assignment, studentName: string, classId: string, className: string) => void;
}

export const StudentAiPracticeView: React.FC<StudentAiPracticeViewProps> = ({
  classes,
  studentName,
  setStudentName,
  selectedClassId,
  setSelectedClassId,
  customClassName,
  setCustomClassName,
  onStartExam
}) => {
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel>('8');
  const [practiceScope, setPracticeScope] = useState<PracticeScope>('topic');
  const [topicMode, setTopicMode] = useState<'preset' | 'custom'>('preset');
  const [selectedTopic, setSelectedTopic] = useState<string>('Phân tích đa thức thành nhân tử');
  const [customTopic, setCustomTopic] = useState<string>('');
  const [topicCategory, setTopicCategory] = useState<'all' | 'algebra' | 'geometry' | 'statistics'>('all');
  const [topicSearch, setTopicSearch] = useState<string>('');

  const [difficulty, setDifficulty] = useState<'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao' | 'Hỗn hợp'>('Hỗn hợp');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [availableBankExamCount, setAvailableBankExamCount] = useState<number>(0);
  const [socraticPracticeContext, setSocraticPracticeContext] = useState<SocraticContext | null>(null);

  const hasApiKey = aiService.hasApiKey();

  // Load count of teacher exams available in storage
  useEffect(() => {
    const checkBank = () => {
      const exams = (StorageService.getAssignments() || []).filter(e => e.verificationStatus !== 'unverified');
      const gradeExams = exams.filter(e => String(e.grade) === String(selectedGrade));
      setAvailableBankExamCount(gradeExams.length);
    };
    checkBank();
  }, [selectedGrade]);

  // Topics for selected grade
  const availableTopics = CURRICULUM_MATH_TOPICS[selectedGrade] || [];
  const filteredTopics = availableTopics.filter(t => {
    const matchesCat = topicCategory === 'all' || t.category === topicCategory;
    const matchesSearch = !topicSearch.trim() || t.name.toLowerCase().includes(topicSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const getEffectiveTopicName = (): string => {
    if (practiceScope === 'gk1') return `Đề thi thử Giữa học kỳ 1 (Toán ${selectedGrade})`;
    if (practiceScope === 'hk1') return `Đề thi thử Cuối học kỳ 1 (Toán ${selectedGrade})`;
    if (practiceScope === 'gk2') return `Đề thi thử Giữa học kỳ 2 (Toán ${selectedGrade})`;
    if (practiceScope === 'hk2') return `Đề thi thử Cuối học kỳ 2 (Toán ${selectedGrade})`;
    
    if (topicMode === 'custom') {
      return customTopic.trim() || selectedTopic;
    }
    return selectedTopic;
  };

  const activeTopicName = getEffectiveTopicName();

  const handleSelectGrade = (g: GradeLevel) => {
    setSelectedGrade(g);
    const topics = CURRICULUM_MATH_TOPICS[g] || [];
    if (topics.length > 0) {
      setSelectedTopic(topics[0].name);
      setCustomTopic('');
    }
  };

  const handleStartPractice = async () => {
    if (!studentName.trim()) {
      alert('Vui lòng nhập họ và tên của em trước khi bắt đầu.');
      return;
    }

    if (!activeTopicName.trim()) {
      alert('Vui lòng chọn hoặc nhập chuyên đề Toán muốn ôn tập.');
      return;
    }

    setIsGenerating(true);
    setGenerationStep('Đang tạo bài luyện...');

    try {
      // Step 1: Lắp ráp đề 3 Tầng (Kho Thầy/Cô + Hoán vị A-B-C-D + AI Bù đắp)
      const result = await PracticeEngineService.assemble3LayerPracticeExam({
        grade: selectedGrade,
        topic: activeTopicName,
        scope: practiceScope,
        targetCount: questionCount,
        difficulty: difficulty,
        onStepProgress: (stepText) => setGenerationStep(stepText)
      });

      if (!result.questions || result.questions.length === 0) {
        throw new Error('Không thể lắp ráp đề thi lúc này');
      }

      setGenerationStep(result.sourceSummary);

      // Step 2: Đóng gói thành đề thi Assignment
      const durationMinutes = Math.max(10, questionCount * 2);
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let randomSuffix = '';
      for (let i = 0; i < 4; i++) {
        randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const codePrefix = practiceScope === 'topic' ? `TL${selectedGrade}` : `THI${selectedGrade}`;
      const assignmentCode = `${codePrefix}-${randomSuffix}`;

      // Xác định tên lớp
      let effectiveClassName = customClassName.trim();
      if (selectedClassId && selectedClassId !== 'other') {
        const found = classes.find(c => c.id === selectedClassId);
        if (found) effectiveClassName = `Lớp ${found.name}`;
      }
      if (!effectiveClassName) {
        effectiveClassName = `Lớp ${selectedGrade}`;
      }

      let examTitle = `Tự luyện: ${activeTopicName} (Toán ${selectedGrade})`;
      if (practiceScope === 'gk1') examTitle = `Thi thử Giữa học kỳ 1 (Toán ${selectedGrade})`;
      if (practiceScope === 'hk1') examTitle = `Thi thử Cuối học kỳ 1 (Toán ${selectedGrade})`;
      if (practiceScope === 'gk2') examTitle = `Thi thử Giữa học kỳ 2 (Toán ${selectedGrade})`;
      if (practiceScope === 'hk2') examTitle = `Thi thử Cuối học kỳ 2 (Toán ${selectedGrade})`;

      const newAssignment: Assignment = {
        id: `asg_practice_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: examTitle,
        assignmentCode: assignmentCode,
        grade: selectedGrade,
        topic: activeTopicName,
        classId: selectedClassId || 'other',
        className: effectiveClassName,
        durationMinutes: durationMinutes,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        allowViewResult: true,
        questions: result.questions,
        createdAt: new Date().toISOString(),
        isPublished: true
      };

      // Step 3: Lưu vào bộ nhớ cục bộ và Cloud Firestore
      StorageService.saveAssignment(newAssignment);
      try {
        await FirestoreService.saveExam(newAssignment);
      } catch (fErr) {
        console.warn('Lưu Cloud bài ôn tập (chế độ dự phòng offline):', fErr);
      }

      // Lưu lại thông tin học sinh
      try {
        localStorage.setItem('toan_thcs_student_name', studentName.trim());
        localStorage.setItem('toan_thcs_student_class', effectiveClassName);
      } catch {
        // ignore
      }

      setGenerationStep('Đã tạo xong. Đang mở bài...');
      await new Promise(r => setTimeout(r, 600));

      // Bắt đầu làm bài
      onStartExam(newAssignment, studentName.trim(), selectedClassId || 'other', effectiveClassName);

    } catch (err: any) {
      console.error('Lỗi khi lắp ráp đề ôn tập 3 tầng:', err);
      alert('Có lỗi khi tạo đề ôn tập. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại với số câu ít hơn.');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 shadow-md border border-slate-200 dark:border-slate-800 space-y-5">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">AI ôn tập</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Chọn lớp, nội dung và số câu.
          </p>
        </div>
        <Sparkles className="w-5 h-5 text-violet-600" />
      </div>

      {/* Step 1: Chọn Khối lớp */}
      <div>
        <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-2.5 flex items-center gap-1.5">
          <GraduationCap className="w-4 h-4 text-violet-600" />
          <span>1. Lớp</span>
        </label>
        <div className="grid grid-cols-4 gap-2.5">
          {(['6', '7', '8', '9'] as GradeLevel[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => handleSelectGrade(g)}
              className={`py-2.5 px-2 rounded-xl font-black text-sm transition-all cursor-pointer flex items-center justify-center ${
                selectedGrade === g
                  ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md scale-102 ring-2 ring-violet-400'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <span className="text-base sm:text-lg">Lớp {g}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Chọn Phạm vi Tự Luyện (Chuyên đề HOẶC Thi thử Giữa kỳ / Cuối kỳ) */}
      <div>
        <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
          <Target className="w-4 h-4 text-violet-600" />
          <span>2. Nội dung</span>
        </label>

        {/* Scope Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 text-xs font-bold">
          <button
            type="button"
            onClick={() => setPracticeScope('topic')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              practiceScope === 'topic'
                ? 'bg-violet-600 text-white border-violet-600 shadow-xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Chuyên đề</span>
          </button>

          <button
            type="button"
            onClick={() => setPracticeScope('gk1')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              practiceScope === 'gk1'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            <span>GK1</span>
          </button>

          <button
            type="button"
            onClick={() => setPracticeScope('hk1')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              practiceScope === 'hk1'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-amber-300" />
            <span>HK1</span>
          </button>

          <button
            type="button"
            onClick={() => setPracticeScope('gk2')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              practiceScope === 'gk2'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            <span>GK2</span>
          </button>

          <button
            type="button"
            onClick={() => setPracticeScope('hk2')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              practiceScope === 'hk2'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-amber-300" />
            <span>HK2</span>
          </button>
        </div>

        {/* If Mode is Topic: Show list of topics */}
        {practiceScope === 'topic' ? (
          <div className="space-y-3">
            {/* SUB-TABS: CHỦ ĐỀ CÓ SẴN vs CHỦ ĐỀ HỌC SINH YÊU CẦU */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
              <button
                type="button"
                onClick={() => setTopicMode('preset')}
                className={`pb-2.5 px-3.5 text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                  topicMode === 'preset'
                    ? 'border-violet-600 text-violet-700 dark:text-violet-300 font-extrabold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Chủ đề SGK</span>
              </button>
              <button
                type="button"
                onClick={() => setTopicMode('custom')}
                className={`pb-2.5 px-3.5 text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                  topicMode === 'custom'
                    ? 'border-violet-600 text-violet-700 dark:text-violet-300 font-extrabold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Tự nhập</span>
              </button>
            </div>

            {topicMode === 'preset' ? (
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="relative flex-1 max-w-xs">
                    <input
                      type="text"
                      value={topicSearch}
                      onChange={(e) => setTopicSearch(e.target.value)}
                      placeholder="Tìm chuyên đề..."
                      className="w-full pl-3 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  {/* Category Filter Pills */}
                  <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setTopicCategory('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        topicCategory === 'all'
                          ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 font-bold shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopicCategory('algebra')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        topicCategory === 'algebra'
                          ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 font-bold shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Đại số
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopicCategory('geometry')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        topicCategory === 'geometry'
                          ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 font-bold shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Hình học
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopicCategory('statistics')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        topicCategory === 'statistics'
                          ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 font-bold shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Thống kê
                    </button>
                  </div>
                </div>

                {/* Curriculum Topics List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1 pr-1.5 custom-scrollbar">
                  {filteredTopics.map((topic) => {
                    const isSelected = selectedTopic === topic.name;
                    return (
                      <div
                        key={topic.id}
                        onClick={() => setSelectedTopic(topic.name)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center space-x-2.5 ${
                          isSelected
                            ? 'border-violet-600 bg-violet-50/80 dark:bg-violet-950/60 text-violet-900 dark:text-violet-100 ring-1 ring-violet-500 shadow-2xs'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                          topic.category === 'geometry'
                            ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600'
                            : topic.category === 'statistics'
                            ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-600'
                            : 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600'
                        }`}>
                          {topic.category === 'geometry' ? (
                            <Shapes className="w-3.5 h-3.5" />
                          ) : topic.category === 'statistics' ? (
                            <PieChart className="w-3.5 h-3.5" />
                          ) : (
                            <Calculator className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold leading-snug line-clamp-2">
                            {topic.name}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* TAB: CHỦ ĐỀ HỌC SINH YÊU CẦU */
              <div className="space-y-3 p-3 bg-violet-50/50 dark:bg-violet-950/30 rounded-2xl border border-violet-200 dark:border-violet-900">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                    <span>Nhập chuyên đề</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder="Ví dụ: Phân tích đa thức thành nhân tử"
                      className="w-full pl-3.5 pr-16 py-2.5 bg-white dark:bg-slate-800 border-2 border-violet-300 dark:border-violet-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-2xs"
                    />
                    {customTopic && (
                      <button
                        type="button"
                        onClick={() => setCustomTopic('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Suggestion Chips */}
                <div>
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5">
                    Gợi ý nhanh
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_STUDENT_REQUESTS[selectedGrade]?.map((popTopic, idx) => {
                      const isPicked = customTopic.trim() === popTopic;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCustomTopic(popTopic)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                            isPicked
                              ? 'bg-violet-600 text-white border-violet-600 shadow-2xs font-bold'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-violet-300 hover:bg-violet-50/60'
                          }`}
                        >
                          {popTopic}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

          </div>
        ) : (
          /* Midterm / Final Exam Scope Summary Banner */
          <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200">
            <div className="font-bold text-sm mb-1 flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
              <Award className="w-4 h-4 text-amber-500" />
              <span>
                {practiceScope === 'gk1' && `Giữa kỳ 1 • Toán ${selectedGrade}`}
                {practiceScope === 'hk1' && `Cuối kỳ 1 • Toán ${selectedGrade}`}
                {practiceScope === 'gk2' && `Giữa kỳ 2 • Toán ${selectedGrade}`}
                {practiceScope === 'hk2' && `Cuối kỳ 2 • Toán ${selectedGrade}`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Cấp độ nhận thức & Số lượng câu hỏi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Mức độ khó */}
        <div>
          <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
            <Target className="w-4 h-4 text-violet-600" />
            <span>3. Mức độ</span>
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setDifficulty('Hỗn hợp')}
              className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer ${
                difficulty === 'Hỗn hợp'
                  ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'
              }`}
            >
              Hỗn hợp
            </button>
            <button
              type="button"
              onClick={() => setDifficulty('Thông hiểu')}
              className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer ${
                difficulty === 'Thông hiểu'
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'
              }`}
            >
              Cơ bản
            </button>
            <button
              type="button"
              onClick={() => setDifficulty('Vận dụng')}
              className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer ${
                difficulty === 'Vận dụng'
                  ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'
              }`}
            >
              Vận dụng
            </button>
            <button
              type="button"
              onClick={() => setDifficulty('Vận dụng cao')}
              className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer ${
                difficulty === 'Vận dụng cao'
                  ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'
              }`}
            >
              Nâng cao
            </button>
          </div>
        </div>

        {/* Số câu & Thời lượng */}
        <div>
          <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-violet-600" />
            <span>4. Số câu</span>
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setQuestionCount(5)}
              className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer text-center ${
                questionCount === 5
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'
              }`}
            >
              <div>5 câu</div>
            </button>
            <button
              type="button"
              onClick={() => setQuestionCount(10)}
              className={`p-2.5 rounded-xl border font-bold transition-all cursor-pointer text-center ${
                questionCount === 10
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'
              }`}
            >
              <div>10 câu</div>
            </button>
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
            </button>
          </div>
        </div>
      </div>

      {/* Step 4: Thông tin học sinh */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Họ và tên <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Họ và tên"
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Lớp
          </label>
          <input
            type="text"
            value={customClassName}
            onChange={(e) => setCustomClassName(e.target.value)}
            placeholder={`Ví dụ: ${selectedGrade}A1`}
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>

      {/* Loading Progress State */}
      {isGenerating && (
        <div className="p-4 bg-violet-50 dark:bg-violet-950/60 rounded-2xl border border-violet-200 dark:border-violet-800 flex items-center space-x-3 animate-in fade-in">
          <Loader2 className="w-5 h-5 text-violet-600 animate-spin shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-violet-900 dark:text-violet-200">
              {generationStep || 'Đang tạo bài luyện...'}
            </p>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="button"
        onClick={handleStartPractice}
        disabled={isGenerating || !studentName.trim() || !activeTopicName.trim()}
        className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 text-white font-extrabold text-base sm:text-lg rounded-2xl shadow-xl hover:shadow-2xl transition-all transform active:scale-[0.99] flex items-center justify-center space-x-2.5 cursor-pointer"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Đang tạo...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 text-amber-300" />
            <span>Tạo bài luyện</span>
            <ArrowRight className="w-5 h-5 ml-1" />
          </>
        )}
      </button>

      {/* Socratic Tutor Modal for Practice */}
      {socraticPracticeContext && (
        <SocraticTutorModal
          isOpen={Boolean(socraticPracticeContext)}
          onClose={() => setSocraticPracticeContext(null)}
          context={socraticPracticeContext}
        />
      )}
    </div>
  );
};
