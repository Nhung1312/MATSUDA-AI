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
    
    // Load both local and firestore assignments for catalog (chỉ lấy đề đã thẩm định hoặc chuẩn)
    const localAssignments = StorageService.getAssignments().filter(a => a.verificationStatus !== 'unverified');
    setRecentAssignments(localAssignments);

    FirestoreService.getExams().then((cloudExams) => {
      if (cloudExams && cloudExams.length > 0) {
        // Merge cloud exams with local exams without duplicates (loại trừ unverified)
        setRecentAssignments((prev) => {
          const map = new Map<string, Assignment>();
          prev.forEach(a => {
            if (a.verificationStatus !== 'unverified') map.set(a.assignmentCode.toUpperCase(), a);
          });
          cloudExams.forEach(a => {
            if (a.verificationStatus !== 'unverified') map.set(a.assignmentCode.toUpperCase(), a);
          });
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
    <div className="max-w-3xl mx-auto px-4 py-4 sm:py-6 animate-in fade-in duration-200">
      {/* Student entry header */}
      <div className="text-center mb-4">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Học sinh
        </h1>
        <div className="mt-3 inline-flex max-w-full overflow-x-auto no-scrollbar bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('enter_code')}
            className={`shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'enter_code'
                ? 'bg-white dark:bg-emerald-600 text-emerald-800 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Nhập mã
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('browse_exams')}
            className={`shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'browse_exams'
                ? 'bg-white dark:bg-emerald-600 text-emerald-800 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Tự luyện
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai_practice')}
            className={`shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'ai_practice'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xs'
                : 'text-violet-700 dark:text-violet-300 hover:text-violet-900 dark:hover:text-white'
            }`}
          >
            AI ôn tập
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
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 shadow-md border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleStart} className="space-y-4">
            {/* Step 1: Mã bài tập */}
            <div>
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                Mã bài <span className="text-rose-500">*</span>
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
                      <span>Đang tìm</span>
                    </>
                  ) : (
                    <span>Kiểm tra</span>
                  )}
                </button>
              </div>
              
            </div>

            {/* Assignment Preview Card if found */}
            {assignment && (
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Đã tìm thấy
                    </span>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">{assignment.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Lớp {assignment.grade} • {assignment.questions.length} câu • {assignment.durationMinutes > 0 ? `${assignment.durationMinutes} phút` : 'Tự do'}
                    </p>
                  </div>
                </div>

              </div>
            )}

            {/* Step 2: Họ và tên */}
            <div>
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                Họ và tên <span className="text-rose-500">*</span>
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
                Lớp <span className="text-rose-500">*</span>
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
                        {cls.name}
                      </option>
                    ))}
                    <option value="other">Lớp khác</option>
                  </select>

                  {selectedClassId === 'other' && (
                    <input
                      type="text"
                      value={customClassName}
                      onChange={(e) => setCustomClassName(e.target.value)}
                      placeholder="Ví dụ: 7A1"
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
                  placeholder="Ví dụ: 7A1"
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
              <span>Bắt đầu</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

        </div>
      ) : (
        /* Exam Catalog Browser */
        <div className="space-y-3">
          {/* Filters Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={examSearch}
                  onChange={(e) => setExamSearch(e.target.value)}
                  placeholder="Tìm đề..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Grade Filter */}
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="all">Tất cả lớp</option>
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
                <option value="all">Tất cả chủ đề</option>
                <option value="algebra">Đại số & Số học</option>
                <option value="geometry">Hình học</option>
                <option value="statistics">Thống kê & Xác suất</option>
              </select>
            </div>
          </div>

          {/* Exam List */}
          {filteredCatalog.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800">
              <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="font-bold text-slate-700 dark:text-slate-300">Không có đề phù hợp</p>
              <p className="text-xs text-slate-400 mt-1">Thử đổi bộ lọc.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredCatalog.map((asg) => (
                <div
                  key={asg.id}
                  onClick={() => handleSelectExamFromCatalog(asg)}
                  className="bg-white dark:bg-slate-900 hover:bg-emerald-50/40 dark:hover:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-sm transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      Lớp {asg.grade}
                    </span>
                    <h4 className="font-black text-slate-900 dark:text-white text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2 mt-1">
                      {asg.title}
                    </h4>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{asg.questions.length} câu • {asg.durationMinutes > 0 ? `${asg.durationMinutes} phút` : 'Tự do'}</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                      Làm bài <ChevronRight className="w-3.5 h-3.5" />
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
