import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { StorageService } from '../../services/storageService';
import { FirestoreService } from '../../services/firestoreService';
import { Assignment, ClassRoom } from '../../types';
import { StudentAiPracticeView } from '../../components/StudentAiPracticeView';
import { 
  ArrowRight, 
  Clock, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  BookOpen,
  Search,
  Filter,
  Calculator,
  Shapes,
  PieChart,
  Moon,
  ChevronRight,
  Zap,
  GraduationCap,
  Loader2,
  UserCheck
} from 'lucide-react';

interface StudentJoinPageProps {
  initialCode?: string;
  initialTab?: 'enter_code' | 'browse_exams' | 'ai_practice';
  onStartExam: (assignment: Assignment, studentName: string, classId: string, className: string) => void;
}

export const StudentJoinPage: React.FC<StudentJoinPageProps> = ({ initialCode = '', initialTab, onStartExam }) => {
  const [searchParams] = useSearchParams();
  const { code: paramCode } = useParams<{ code?: string }>();
  const queryCode = searchParams.get('code') || paramCode || initialCode;
  const queryTab = searchParams.get('tab') as ('enter_code' | 'browse_exams' | 'ai_practice' | null);
  
  const [code, setCode] = useState(queryCode);
  const [studentName, setStudentName] = useState(() => {
    try {
      return localStorage.getItem('toan_thcs_student_name') || '';
    } catch {
      return '';
    }
  });
  const [selectedClassId, setSelectedClassId] = useState('');
  const [customClassName, setCustomClassName] = useState(() => {
    try {
      return localStorage.getItem('toan_thcs_student_class') || '';
    } catch {
      return '';
    }
  });
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [recentAssignments, setRecentAssignments] = useState<Assignment[]>([]);

  // Search & Filter state for exam browser
  const [activeTab, setActiveTab] = useState<'enter_code' | 'browse_exams' | 'ai_practice'>(() => {
    if (initialTab) return initialTab;
    if (queryTab === 'ai_practice') return 'ai_practice';
    if (queryTab === 'browse_exams') return 'browse_exams';
    return 'enter_code';
  });
  const [examSearch, setExamSearch] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedTopicType, setSelectedTopicType] = useState<string>('all');

  useEffect(() => {
    const loadedClasses = StorageService.getClasses();
    setClasses(loadedClasses);
    if (loadedClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(loadedClasses[0].id);
    } else if (loadedClasses.length === 0) {
      setSelectedClassId('other');
    }
    
    // Load both local and firestore assignments for catalog
    const localAssignments = StorageService.getAssignments();
    setRecentAssignments(localAssignments);

    FirestoreService.getExams().then((cloudExams) => {
      if (cloudExams && cloudExams.length > 0) {
        // Merge cloud exams with local exams without duplicates
        setRecentAssignments((prev) => {
          const map = new Map<string, Assignment>();
          prev.forEach(a => map.set(a.assignmentCode.toUpperCase(), a));
          cloudExams.forEach(a => map.set(a.assignmentCode.toUpperCase(), a));
          return Array.from(map.values());
        });
      }
    }).catch(err => {
      console.warn('Could not fetch cloud exams:', err);
    });

    const effectiveCode = queryCode || initialCode;
    if (effectiveCode) {
      setCode(effectiveCode);
      handleLookupCode(effectiveCode);
    }
  }, [queryCode, initialCode]);

  const handleLookupCode = async (searchCode: string) => {
    setErrorMsg('');
    if (!searchCode.trim()) {
      setAssignment(null);
      return;
    }

    setIsSearching(true);
    const cleanCode = searchCode.trim().toUpperCase();

    // 1. Try local storage first
    let found = StorageService.getAssignmentByCode(cleanCode);

    // 2. If not found locally, query Cloud Firestore
    if (!found) {
      try {
        found = await FirestoreService.getExamByCode(cleanCode);
        if (found) {
          // Cache in local storage for faster subsequent access
          StorageService.saveAssignment(found);
        } else {
          // Kiểm tra xem có phải mã Cuộc thi trực tuyến (Contest) không
          const contest = await FirestoreService.getContestByCode(cleanCode);
          if (contest) {
            setIsSearching(false);
            window.location.href = `/contest/${cleanCode}`;
            return;
          }
        }
      } catch (err) {
        console.error('Lỗi khi tra cứu Firestore:', err);
      }
    }

    setIsSearching(false);

    if (found) {
      setAssignment(found);
      if (found.classId && found.classId !== 'all') {
        setSelectedClassId(found.classId);
      } else {
        setSelectedClassId('other');
        if (found.className && !customClassName) {
          setCustomClassName(found.className);
        } else if (found.grade && !customClassName) {
          setCustomClassName(`Lớp ${found.grade}`);
        }
      }
    } else {
      setAssignment(null);
      setErrorMsg('Không tìm thấy bài tập với mã này. Vui lòng kiểm tra lại mã bài tập do giáo viên cung cấp.');
    }
  };

  const handleSelectExamFromCatalog = (selectedAsg: Assignment) => {
    setCode(selectedAsg.assignmentCode);
    setAssignment(selectedAsg);
    if (selectedAsg.classId && selectedAsg.classId !== 'all') {
      setSelectedClassId(selectedAsg.classId);
    } else {
      setSelectedClassId('other');
      if (selectedAsg.className && !customClassName) {
        setCustomClassName(selectedAsg.className);
      }
    }
    setActiveTab('enter_code');
    setErrorMsg('');
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignment) {
      setErrorMsg('Vui lòng nhập mã bài tập hợp lệ hoặc chọn một đề từ kho bài tập.');
      return;
    }
    const cleanName = studentName.trim();
    if (!cleanName) {
      setErrorMsg('Vui lòng nhập Họ và tên của bạn.');
      return;
    }

    let className = 'Tự do';
    const foundClass = classes.find(c => c.id === selectedClassId);
    if (foundClass) {
      className = foundClass.name;
    } else if (customClassName.trim()) {
      className = customClassName.trim();
    }

    // Persist student profile locally so they never have to re-enter
    try {
      localStorage.setItem('toan_thcs_student_name', cleanName);
      localStorage.setItem('toan_thcs_student_class', className);
    } catch {
      // ignore
    }

    onStartExam(assignment, cleanName, selectedClassId || 'other', className);
  };

  // Filter exams in catalog
  const filteredCatalog = useMemo(() => {
    return recentAssignments.filter(a => {
      if (selectedGrade !== 'all' && a.grade !== selectedGrade) return false;
      
      const t = (a.topic || '').toLowerCase();
      if (selectedTopicType === 'algebra') {
        const isAlgebra = t.includes('đại số') || t.includes('số học') || t.includes('phân số') || 
                          t.includes('số nguyên') || t.includes('số hữu tỉ') || t.includes('số thực') || 
                          t.includes('phương trình') || t.includes('bất đẳng thức') || t.includes('tính toán');
        if (!isAlgebra) return false;
      } else if (selectedTopicType === 'geometry') {
        const isGeometry = t.includes('hình học') || t.includes('hình') || t.includes('đoạn thẳng') || 
                           t.includes('góc') || t.includes('tam giác') || t.includes('tứ giác') || 
                           t.includes('đường tròn') || t.includes('pythagore');
        if (!isGeometry) return false;
      } else if (selectedTopicType === 'statistics') {
        const isStats = t.includes('thống kê') || t.includes('xác suất') || t.includes('biểu đồ');
        if (!isStats) return false;
      }

      if (examSearch.trim()) {
        const q = examSearch.toLowerCase().trim();
        const matchTitle = a.title.toLowerCase().includes(q);
        const matchTopic = a.topic.toLowerCase().includes(q);
        const matchCode = a.assignmentCode.toLowerCase().includes(q);
        if (!matchTitle && !matchTopic && !matchCode) return false;
      }

      return true;
    });
  }, [recentAssignments, selectedGrade, selectedTopicType, examSearch]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 mb-3 shadow-inner">
          <GraduationCap className="w-8 h-8" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Vào phòng làm bài thi Toán
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-md mx-auto">
          Nhập mã bài tập hoặc chọn đề thi từ kho luyện tập để bắt đầu làm bài và chấm điểm tức thì.
        </p>

        {/* Reassurance Banner for Students */}
        <div className="mt-3 inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
          <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Học sinh làm bài trực tiếp • Không cần đăng nhập tài khoản Google</span>
        </div>

        {/* Tab switchers: Nhập mã vs Kho đề thi */}
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl mt-5 border border-slate-200 dark:border-slate-700 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('enter_code')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'enter_code'
                ? 'bg-white dark:bg-emerald-600 text-emerald-800 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            🔑 1. Nhập mã bài thi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('browse_exams')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'browse_exams'
                ? 'bg-white dark:bg-emerald-600 text-emerald-800 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>2. Kho đề tự luyện ({recentAssignments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai_practice')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ai_practice'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xs'
                : 'text-violet-700 dark:text-violet-300 hover:text-violet-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>3. AI Tạo đề ôn tập</span>
          </button>
        </div>
      </div>

      {activeTab === 'ai_practice' ? (
        <StudentAiPracticeView
          classes={classes}
          studentName={studentName}
          setStudentName={setStudentName}
          selectedClassId={selectedClassId}
          setSelectedClassId={setSelectedClassId}
          customClassName={customClassName}
          setCustomClassName={setCustomClassName}
          onStartExam={onStartExam}
        />
      ) : activeTab === 'enter_code' ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100 dark:border-slate-800">
          <form onSubmit={handleStart} className="space-y-5">
            {/* Step 1: Mã bài tập */}
            <div>
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                1. Mã bài tập <span className="text-rose-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setCode(val);
                    if (val.length >= 6) {
                      handleLookupCode(val);
                    }
                  }}
                  placeholder="Ví dụ: TOAN6A1-8K4P"
                  className="flex-1 uppercase font-mono font-bold tracking-wider px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal text-base"
                  required
                />
                <button
                  type="button"
                  onClick={() => handleLookupCode(code)}
                  disabled={isSearching}
                  className="px-4 py-3 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white text-sm font-semibold rounded-xl transition-colors shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang tìm...</span>
                    </>
                  ) : (
                    <span>Kiểm tra</span>
                  )}
                </button>
              </div>
              
              {/* Quick Demo Code Selection Chips */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-600 dark:text-slate-400">Chọn nhanh đề mẫu:</span>
                {recentAssignments.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setCode(a.assignmentCode);
                      handleLookupCode(a.assignmentCode);
                    }}
                    className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-md font-mono font-semibold border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                  >
                    {a.assignmentCode} ({a.className || a.title})
                  </button>
                ))}
              </div>
            </div>

            {/* Assignment Preview Card if found */}
            {assignment && (
              <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Đã tìm thấy bài tập
                    </span>
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg">{assignment.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Chủ đề: <span className="font-medium text-slate-800 dark:text-slate-200">{assignment.topic}</span> • Lớp {assignment.grade}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/60 text-xs">
                  <div className="flex items-center space-x-1 text-slate-700 dark:text-slate-300">
                    <HelpCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span><strong>{assignment.questions.length}</strong> câu hỏi</span>
                  </div>
                  <div className="flex items-center space-x-1 text-slate-700 dark:text-slate-300">
                    <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {assignment.durationMinutes > 0 ? (
                        <strong>{assignment.durationMinutes} phút</strong>
                      ) : (
                        'Tự do'
                      )}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 text-slate-700 dark:text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Tự chấm ngay</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Họ và tên */}
            <div>
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                2. Họ và tên học sinh <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Văn An"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white text-base"
                required
              />
            </div>

            {/* Step 3: Chọn lớp */}
            <div>
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                3. Lớp học <span className="text-rose-500">*</span>
              </label>
              {classes.length > 0 ? (
                <>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white text-base cursor-pointer"
                  >
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        Lớp {cls.name} (Lớp {cls.grade}) - {cls.students?.length || 0} học sinh
                      </option>
                    ))}
                    <option value="other">-- Lớp khác (Tự nhập tên lớp) --</option>
                  </select>

                  {selectedClassId === 'other' && (
                    <input
                      type="text"
                      value={customClassName}
                      onChange={(e) => setCustomClassName(e.target.value)}
                      placeholder="Nhập tên lớp của bạn (Ví dụ: 6A1, 7A, 8B...)"
                      className="mt-2 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white text-sm"
                      required={selectedClassId === 'other'}
                    />
                  )}
                </>
              ) : (
                <input
                  type="text"
                  value={customClassName}
                  onChange={(e) => setCustomClassName(e.target.value)}
                  placeholder="Nhập tên lớp của bạn (Ví dụ: 6A1, 7A2, 8B, 9C...)"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white text-base"
                  required
                />
              )}
            </div>

            {/* Error display */}
            {errorMsg && (
              <div className="flex items-start space-x-2 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Start Exam Button */}
            <button
              type="submit"
              className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all transform active:scale-[0.99] flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>BẮT ĐẦU LÀM BÀI</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Học sinh không cần tạo tài khoản. Kết quả sẽ được lưu và chấm tự động ngay khi bấm nộp bài.
            </p>
          </div>
        </div>
      ) : (
        /* Exam Catalog Browser */
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-lg border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={examSearch}
                  onChange={(e) => setExamSearch(e.target.value)}
                  placeholder="Tìm đề kiểm tra, chủ đề..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Grade Filter */}
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="all">🎓 Tất cả các lớp</option>
                <option value="6">Lớp 6</option>
                <option value="7">Lớp 7</option>
                <option value="8">Lớp 8</option>
                <option value="9">Lớp 9</option>
              </select>

              {/* Topic Filter */}
              <select
                value={selectedTopicType}
                onChange={(e) => setSelectedTopicType(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="all">📐 Tất cả chủ đề</option>
                <option value="algebra">🔢 Đại số & Số học</option>
                <option value="geometry">📐 Hình học</option>
                <option value="statistics">📊 Thống kê & Xác suất</option>
              </select>
            </div>
          </div>

          {/* Exam List */}
          {filteredCatalog.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800">
              <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="font-bold text-slate-700 dark:text-slate-300">Không tìm thấy bài tập phù hợp</p>
              <p className="text-xs text-slate-400 mt-1">Thử chọn lớp học hoặc chủ đề khác.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredCatalog.map((asg) => (
                <div
                  key={asg.id}
                  onClick={() => handleSelectExamFromCatalog(asg)}
                  className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                        Lớp {asg.grade}
                      </span>
                      <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md">
                        {asg.assignmentCode}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {asg.title}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      {asg.topic}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {asg.questions.length} câu
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {asg.durationMinutes > 0 ? `${asg.durationMinutes}p` : 'Tự do'}
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                      Chọn bài <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
