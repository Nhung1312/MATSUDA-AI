import React, { useState, useMemo } from 'react';
import { Assignment, ClassRoom, Question, Submission } from '../../types';
import { StorageService } from '../../services/storageService';
import { FileUploadModal } from '../../components/FileUploadModal';
import { PrintExamModal } from '../../components/PrintExamModal';
import { GenerateSimilarExamModal } from '../../components/GenerateSimilarExamModal';
import { AiSolveExamModal } from '../../components/AiSolveExamModal';
import { AiBatchSolveModal } from '../../components/AiBatchSolveModal';
import { TeacherSemesterExamModal } from '../../components/TeacherSemesterExamModal';
import { FirestoreService } from '../../services/firestoreService';
import { 
  BookOpen, 
  Plus, 
  Share2, 
  BarChart3, 
  Trash2, 
  Clock, 
  Play, 
  Search, 
  CheckCircle2,
  Copy,
  Check,
  UploadCloud,
  Printer,
  Filter,
  X,
  ArrowUpDown,
  Layers,
  Shapes,
  Calculator,
  PieChart,
  Tag,
  Shuffle,
  Edit3,
  Link2,
  Sparkles,
  AlertTriangle,
  Image as ImageIcon,
  CheckSquare,
  Square
} from 'lucide-react';
import { getAssignmentShareLink } from '../../utils/urlUtils';
import { isQuestionMissingImage } from '../../utils/questionUtils';

interface TeacherAssignmentsProps {
  assignments: Assignment[];
  classes: ClassRoom[];
  submissions: Submission[];
  initialFilterClass?: string;
  onRefresh: () => void;
  onNavigate: (tab: string, params?: any) => void;
  onOpenShare: (assignment: Assignment) => void;
  onTestAssignment: (assignment: Assignment) => void;
}

export const TeacherAssignments: React.FC<TeacherAssignmentsProps> = ({
  assignments = [],
  classes = [],
  submissions = [],
  initialFilterClass,
  onRefresh,
  onNavigate,
  onOpenShare,
  onTestAssignment
}) => {
  const safeAssignments = useMemo(() => Array.isArray(assignments) ? assignments.filter((a): a is Assignment => Boolean(a && typeof a === 'object')) : [], [assignments]);
  const safeClasses = useMemo(() => Array.isArray(classes) ? classes.filter((c): c is ClassRoom => Boolean(c && typeof c === 'object')) : [], [classes]);
  const safeSubmissions = useMemo(() => Array.isArray(submissions) ? submissions.filter((s): s is Submission => Boolean(s && typeof s === 'object')) : [], [submissions]);

  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterTopicCategory, setFilterTopicCategory] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>(initialFilterClass || 'all');
  const [filterMissingImagesOnly, setFilterMissingImagesOnly] = useState<boolean>(false);
  const [filterUnsolvedOnly, setFilterUnsolvedOnly] = useState<boolean>(false);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const [showBatchSolveModal, setShowBatchSolveModal] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title' | 'questions' | 'duration'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [printingAssignment, setPrintingAssignment] = useState<Assignment | null>(null);
  const [similarExamAssignment, setSimilarExamAssignment] = useState<Assignment | null>(null);
  const [aiSolvingAssignment, setAiSolvingAssignment] = useState<Assignment | null>(null);
  const [showSemesterExamModal, setShowSemesterExamModal] = useState<boolean>(false);

  const handleCopyLink = async (assignmentCode: string) => {
    const link = getAssignmentShareLink(assignmentCode);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(assignmentCode);
      setTimeout(() => setCopiedLink(null), 2500);
    } catch {
      // fallback
    }
  };

  const handleImportQuestions = (questions: Question[]) => {
    onNavigate('create', {
      initialQuestions: questions,
      initialTitle: 'Đề kiểm tra nhập từ tệp'
    });
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (asg: Assignment) => {
    const titleText = asg.title || asg.assignmentCode;
    if (window.confirm(`Bạn có chắc muốn xóa vĩnh viễn bài tập "${titleText}" (${asg.assignmentCode})?\n\nThao tác này sẽ xóa đề thi khỏi cả bộ nhớ máy và Cloud Firestore.`)) {
      try {
        setDeletingId(asg.id);
        await StorageService.deleteAssignmentAsync(asg.id, asg.assignmentCode);
        await onRefresh();
      } catch (err) {
        console.error('Lỗi khi xóa bài tập:', err);
        await onRefresh();
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleDeleteAllFiltered = async () => {
    if (filteredAssignments.length === 0) return;
    const count = filteredAssignments.length;
    if (window.confirm(`Bạn có chắc muốn xóa vĩnh viễn toàn bộ ${count} bài tập này?\n\nThao tác này sẽ dọn dẹp sạch cả trên máy tính và trên Cloud Firestore.`)) {
      try {
        setDeletingId('all');
        await StorageService.clearAllAssignmentsAsync(filteredAssignments);
        await onRefresh();
      } catch (err) {
        console.error('Lỗi khi xóa tất cả bài tập:', err);
        await onRefresh();
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      //
    }
  };

  // Extract distinct topics dynamically
  const uniqueTopics = useMemo(() => {
    const topicsSet = new Set<string>();
    safeAssignments.forEach(a => {
      if (a.topic && a.topic.trim()) {
        topicsSet.add(a.topic.trim());
      }
    });
    return Array.from(topicsSet);
  }, [safeAssignments]);

  // Topic classification helper
  const matchesTopicCategory = (topic: string, category: string): boolean => {
    if (category === 'all') return true;
    const t = (topic || '').toLowerCase();
    if (category === 'algebra') {
      // Đại số & Số học
      return t.includes('đại số') || t.includes('số học') || t.includes('phân số') || 
             t.includes('số nguyên') || t.includes('số hữu tỉ') || t.includes('số thực') || 
             t.includes('phương trình') || t.includes('hệ phương trình') || t.includes('bất đẳng thức') ||
             t.includes('hằng đẳng thức') || t.includes('đa thức') || t.includes('đơn thức') || t.includes('tính toán');
    }
    if (category === 'geometry') {
      // Hình học & Đo lường
      return t.includes('hình học') || t.includes('hình') || t.includes('đoạn thẳng') || 
             t.includes('góc') || t.includes('tam giác') || t.includes('tứ giác') || 
             t.includes('đường tròn') || t.includes('pythagore') || t.includes('diện tích') || t.includes('chu vi') || t.includes('không gian');
    }
    if (category === 'statistics') {
      // Thống kê & Xác suất
      return t.includes('thống kê') || t.includes('xác suất') || t.includes('biểu đồ') || t.includes('số liệu') || t.includes('tần số');
    }
    // Specific custom topic match
    return t === category.toLowerCase();
  };

  // Nhận diện đề thi chưa có bảng đáp án chuẩn (toàn bộ câu trắc nghiệm mặc định A hoặc chưa có đáp án)
  const isAssignmentUnsolved = (asg: Assignment): boolean => {
    const mcqs = (asg.questions || []).filter(q => q.type === 'multiple_choice' || (q.options && q.options.length >= 2));
    if (mcqs.length === 0) return false;
    return mcqs.every(q => !q.correctAnswer || q.correctAnswer.trim().toUpperCase() === 'A');
  };

  // Đếm tổng số bài tập chưa có đáp án chuẩn
  const totalUnsolvedAssignments = useMemo(() => {
    return safeAssignments.filter(isAssignmentUnsolved).length;
  }, [safeAssignments]);

  // Đếm tổng số bài tập có chứa câu hỏi thiếu hình vẽ
  const totalMissingImagesAssignments = useMemo(() => {
    return safeAssignments.filter(asg => (asg.questions || []).some(q => isQuestionMissingImage(q))).length;
  }, [safeAssignments]);

  const hasActiveFilters = filterGrade !== 'all' || filterTopicCategory !== 'all' || filterClass !== 'all' || searchQuery.trim() !== '' || filterMissingImagesOnly || filterUnsolvedOnly;

  const clearAllFilters = () => {
    setFilterGrade('all');
    setFilterTopicCategory('all');
    setFilterClass('all');
    setFilterMissingImagesOnly(false);
    setFilterUnsolvedOnly(false);
    setSearchQuery('');
  };

  const filteredAssignments = useMemo(() => {
    return safeAssignments
      .filter(a => {
        if (filterGrade !== 'all' && a.grade !== filterGrade) return false;
        if (filterClass !== 'all') {
          // Lớp cụ thể: khớp chính xác ID lớp, hoặc tên lớp (vd: '6A1'), hoặc bài tập giao cho toàn khối / 'all'
          const isDirectClass = a.classId === filterClass;
          const targetCls = safeClasses.find(c => c.id === filterClass);
          const isNameMatch = targetCls && (a.className === targetCls.name || a.classId === targetCls.name);
          const isAllClass = a.classId === 'all' || !a.classId || a.className === 'Toàn khối';
          if (!isDirectClass && !isNameMatch && !isAllClass) return false;
        }
        if (filterTopicCategory !== 'all' && !matchesTopicCategory(a.topic, filterTopicCategory)) return false;
        if (filterMissingImagesOnly && !(a.questions || []).some(q => isQuestionMissingImage(q))) return false;
        if (filterUnsolvedOnly && !isAssignmentUnsolved(a)) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = (a.title || '').toLowerCase().includes(q);
          const matchTopic = (a.topic || '').toLowerCase().includes(q);
          const matchCode = (a.assignmentCode || a.id || '').toLowerCase().includes(q);
          const matchGrade = `khối ${a.grade || ''}`.includes(q) || `lớp ${a.grade || ''}`.includes(q);
          const matchClassName = (a.className || '').toLowerCase().includes(q);
          if (!matchTitle && !matchTopic && !matchCode && !matchGrade && !matchClassName) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        if (sortBy === 'oldest') return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '', 'vi');
        if (sortBy === 'questions') return (Array.isArray(b.questions) ? b.questions.length : 0) - (Array.isArray(a.questions) ? a.questions.length : 0);
        if (sortBy === 'duration') return (b.durationMinutes || 0) - (a.durationMinutes || 0);
        return 0;
      });
  }, [safeAssignments, safeClasses, filterGrade, filterClass, filterTopicCategory, filterMissingImagesOnly, filterUnsolvedOnly, searchQuery, sortBy]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Quản lý bài tập & Đề thi</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tạo mã bài tập, quản lý ngân hàng câu hỏi, lọc theo lớp học và chủ đề Đại số / Hình học.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowSemesterExamModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold rounded-xl shadow-md text-xs sm:text-sm transition-all active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>Tạo đề Giữa kỳ / Cuối kỳ (4 Mã đề)</span>
          </button>
          <button
            onClick={() => setShowFileUploadModal(true)}
            className="inline-flex items-center space-x-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 rounded-xl shadow-xs text-xs sm:text-sm transition-all active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Tách đề PDF / Dán ảnh AI</span>
          </button>
          <button
            onClick={() => onNavigate('create')}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md text-xs sm:text-sm transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tạo bài mới</span>
          </button>
        </div>
      </div>

      {/* Advanced Filters & Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          {/* Search Box */}
          <div className="relative lg:col-span-4">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên bài, chủ đề, mã bài..."
              className="w-full pl-9 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Xóa tìm kiếm"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Grade Filter */}
          <div className="lg:col-span-2">
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">🎓 Tất cả các lớp</option>
              <option value="6">Lớp 6</option>
              <option value="7">Lớp 7</option>
              <option value="8">Lớp 8</option>
              <option value="9">Lớp 9</option>
            </select>
          </div>

          {/* Topic / Subject Filter */}
          <div className="lg:col-span-3">
            <select
              value={filterTopicCategory}
              onChange={(e) => setFilterTopicCategory(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">📐 Tất cả chủ đề Toán</option>
              <optgroup label="Phân môn chính">
                <option value="algebra">🔢 Đại số & Số học</option>
                <option value="geometry">📐 Hình học & Đo lường</option>
                <option value="statistics">📊 Thống kê & Xác suất</option>
              </optgroup>
              {uniqueTopics.length > 0 && (
                <optgroup label="Chủ đề cụ thể đã tạo">
                  {uniqueTopics.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Class Filter */}
          <div className="lg:col-span-2">
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">🏫 Tất cả lớp học</option>
              {safeClasses.map(cls => (
                <option key={cls.id} value={cls.id}>Lớp {cls.name}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="lg:col-span-1">
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="w-full px-2 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              title="Sắp xếp danh sách"
            >
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
              <option value="title">Tên A-Z</option>
              <option value="questions">Nhiều câu</option>
              <option value="duration">Thời gian</option>
            </select>
          </div>
        </div>

        {/* Quick Topic Pills & Active Filters State */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Lọc nhanh:</span>
            
            {/* Quick buttons */}
            <button
              onClick={() => setFilterTopicCategory(filterTopicCategory === 'algebra' ? 'all' : 'algebra')}
              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterTopicCategory === 'algebra'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Calculator className="w-3 h-3" />
              <span>Đại số</span>
            </button>

            <button
              onClick={() => setFilterTopicCategory(filterTopicCategory === 'geometry' ? 'all' : 'geometry')}
              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterTopicCategory === 'geometry'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Shapes className="w-3 h-3" />
              <span>Hình học</span>
            </button>

            <button
              onClick={() => setFilterTopicCategory(filterTopicCategory === 'statistics' ? 'all' : 'statistics')}
              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterTopicCategory === 'statistics'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <PieChart className="w-3 h-3" />
              <span>Xác suất & Thống kê</span>
            </button>

            {/* MỚI: Nút lọc nhanh các đề có câu hỏi thiếu hình vẽ */}
            <button
              onClick={() => setFilterMissingImagesOnly(!filterMissingImagesOnly)}
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterMissingImagesOnly
                  ? 'bg-amber-500 text-white shadow-xs'
                  : totalMissingImagesAssignments > 0
                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 hover:bg-amber-200 border border-amber-300 dark:border-amber-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Lọc các đề thi có chứa câu hỏi nhắc đến hình vẽ nhưng chưa có ảnh minh họa"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Đề có câu thiếu hình ({totalMissingImagesAssignments})</span>
            </button>

            {/* MỚI: Nút lọc nhanh các đề chưa có đáp án chuẩn */}
            <button
              onClick={() => setFilterUnsolvedOnly(!filterUnsolvedOnly)}
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterUnsolvedOnly
                  ? 'bg-violet-600 text-white shadow-xs'
                  : totalUnsolvedAssignments > 0
                  ? 'bg-violet-100 dark:bg-violet-950/70 text-violet-900 dark:text-violet-200 hover:bg-violet-200 border border-violet-300 dark:border-violet-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Lọc các đề thi chưa có bảng đáp án chuẩn (mặc định A)"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span>Đề chưa có đáp án ({totalUnsolvedAssignments})</span>
            </button>
          </div>

          <div className="flex items-center space-x-3 text-slate-500 dark:text-slate-400">
            <span>
              Hiển thị <strong className="text-slate-800 dark:text-slate-100">{filteredAssignments.length}</strong> / {assignments.length} bài
            </span>
            {filteredAssignments.length > 0 && (
              <button
                onClick={handleDeleteAllFiltered}
                disabled={deletingId === 'all'}
                className="inline-flex items-center space-x-1 px-2.5 py-1 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/80 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                title="Xóa toàn bộ các bài tập đang hiển thị trong danh sách này"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>{deletingId === 'all' ? 'Đang xóa...' : `Xóa tất cả (${filteredAssignments.length})`}</span>
              </button>
            )}
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center space-x-1 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Xóa bộ lọc</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MỚI: THANH CHỌN HÀNG LOẠT & AI TỰ ĐỘNG GIẢI ĐỀ */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-violet-50 to-indigo-50/70 dark:from-violet-950/40 dark:to-indigo-950/30 rounded-3xl border border-violet-200 dark:border-violet-800/80 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Nút chọn tất cả / bỏ chọn */}
          <button
            type="button"
            onClick={() => {
              if (selectedAssignmentIds.length === filteredAssignments.length && filteredAssignments.length > 0) {
                setSelectedAssignmentIds([]);
              } else {
                setSelectedAssignmentIds(filteredAssignments.map(a => a.id));
              }
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            {selectedAssignmentIds.length === filteredAssignments.length && filteredAssignments.length > 0 ? (
              <>
                <CheckSquare className="w-4 h-4 text-violet-600" />
                <span>Bỏ chọn tất cả</span>
              </>
            ) : (
              <>
                <Square className="w-4 h-4 text-slate-400" />
                <span>Chọn tất cả ({filteredAssignments.length} đề)</span>
              </>
            )}
          </button>

          {/* Nút chọn nhanh tất cả đề chưa có đáp án */}
          {totalUnsolvedAssignments > 0 && (
            <button
              type="button"
              onClick={() => {
                const unsolvedIds = safeAssignments.filter(isAssignmentUnsolved).map(a => a.id);
                setSelectedAssignmentIds(unsolvedIds);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer active:scale-95"
              title="Chọn nhanh toàn bộ các đề thi đang để đáp án mặc định A"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>⚡ Chọn nhanh {totalUnsolvedAssignments} đề chưa có đáp án</span>
            </button>
          )}

          {selectedAssignmentIds.length > 0 && (
            <span className="text-xs font-black text-violet-900 dark:text-violet-200 pl-1">
              Đã chọn: <strong className="text-sm underline">{selectedAssignmentIds.length}</strong> đề
            </span>
          )}
        </div>

        {/* Nút kích hoạt AI giải hàng loạt khi có đề được chọn */}
        {selectedAssignmentIds.length > 0 && (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setSelectedAssignmentIds([])}
              className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 font-semibold px-2 py-1 cursor-pointer"
            >
              Hủy chọn
            </button>
            <button
              type="button"
              onClick={() => setShowBatchSolveModal(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all active:scale-95 cursor-pointer animate-pulse"
              title="Bắt đầu tiến trình AI tự động giải ngầm cho toàn bộ đề thi đã chọn"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>🤖 Bắt đầu AI Giải {selectedAssignmentIds.length} đề đã chọn</span>
            </button>
          </div>
        )}
      </div>

      {/* Assignments Cards List */}
      {filteredAssignments.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-dashed border-slate-200 dark:border-slate-800">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="font-bold text-slate-700 dark:text-slate-200 text-lg">Không tìm thấy bài tập nào phù hợp</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
            {hasActiveFilters 
              ? 'Thử thay đổi từ khóa tìm kiếm, khối lớp hoặc chủ đề để hiển thị kết quả.'
              : 'Bấm "+ Tạo bài mới" để soạn bộ câu hỏi Toán THCS và giao cho học sinh.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="mt-4 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-bold rounded-xl border border-indigo-200 dark:border-indigo-800 cursor-pointer"
            >
              Đặt lại toàn bộ bộ lọc
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAssignments.map((asg) => {
            const asgSubs = safeSubmissions.filter(s => s.assignmentId === asg.id);
            const targetClass = safeClasses.find(c => c.id === asg.classId);
            const classStudentCount = targetClass ? (targetClass.students?.length || 0) : 10;

            // Determine topic badge color
            const isGeometry = matchesTopicCategory(asg.topic, 'geometry');
            const isStatistics = matchesTopicCategory(asg.topic, 'statistics');
            const missingImgCount = (asg.questions || []).filter(q => isQuestionMissingImage(q)).length;
            const isSelected = selectedAssignmentIds.includes(asg.id);
            const isUnsolved = isAssignmentUnsolved(asg);

            return (
              <div
                key={asg.id}
                className={`bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-violet-500 dark:border-violet-500 ring-2 ring-violet-400/40 bg-violet-50/20 dark:bg-violet-950/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  {/* Top Meta */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Checkbox chọn đề để AI giải hàng loạt */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAssignmentIds(prev => 
                            prev.includes(asg.id) ? prev.filter(id => id !== asg.id) : [...prev, asg.id]
                          );
                        }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all cursor-pointer mr-0.5 shrink-0 ${
                          isSelected
                            ? 'bg-violet-600 border-violet-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-violet-400'
                        }`}
                        title={isSelected ? "Bỏ chọn đề này" : "Chọn đề này để AI giải hàng loạt"}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : null}
                      </button>

                      <span className="bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                        Lớp {asg.grade}
                      </span>
                      <span className="bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                        {asg.className ? `Lớp ${asg.className}` : 'Tất cả học sinh'}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        isGeometry 
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                          : isStatistics
                          ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300'
                          : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                      }`}>
                        {isGeometry ? '📐 Hình học' : isStatistics ? '📊 Thống kê' : '🔢 Đại số'}
                      </span>

                      {/* MỚI: Huy hiệu nếu đề chưa có bảng đáp án chuẩn */}
                      {isUnsolved && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800 flex items-center gap-1 shadow-2xs">
                          <Sparkles className="w-3 h-3 text-rose-600" />
                          <span>Chưa có đáp án</span>
                        </span>
                      )}

                      {/* MỚI: Huy hiệu cảnh báo câu hỏi cần chèn hình vẽ */}
                      {missingImgCount > 0 && (
                        <button
                          type="button"
                          onClick={() => onNavigate('create', { editingAssignment: asg, initialFilter: 'missing_image' })}
                          className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/90 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 transition-all cursor-pointer shadow-2xs"
                          title="Đề có câu nhắc đến hình vẽ nhưng chưa chèn ảnh. Bấm để mở và lọc riêng các câu này"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-600 animate-pulse" />
                          <span>{missingImgCount} câu cần chèn hình</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => onNavigate('create', { editingAssignment: asg })}
                        className="text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 p-1 rounded-lg transition-colors cursor-pointer"
                        title="Sửa bài tập & Câu hỏi"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(asg)}
                        disabled={deletingId === asg.id}
                        className={`p-1 rounded-lg transition-colors cursor-pointer ${
                          deletingId === asg.id
                            ? 'text-rose-400 opacity-60'
                            : 'text-slate-300 dark:text-slate-600 hover:text-rose-600 dark:hover:text-rose-400'
                        }`}
                        title="Xóa bài tập này vĩnh viễn"
                      >
                        {deletingId === asg.id ? (
                          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <h3 className="font-bold text-lg text-slate-900 dark:text-white line-clamp-1 mt-1">{asg.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{asg.topic}</p>

                  {/* Code chip */}
                  <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Mã bài tập</span>
                      <span className="font-mono font-extrabold text-indigo-900 dark:text-indigo-300 text-base">
                        {asg.assignmentCode}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleCopyCode(asg.assignmentCode)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-slate-600 border border-indigo-200 dark:border-slate-600 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                        title="Sao chép mã bài tập"
                      >
                        {copiedCode === asg.assignmentCode ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-700 dark:text-emerald-400">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Chép mã</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleCopyLink(asg.assignmentCode)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                        title="Sao chép link làm bài gửi học sinh (Học sinh KHÔNG cần đăng nhập tài khoản)"
                      >
                        {copiedLink === asg.assignmentCode ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Đã chép link</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3.5 h-3.5" />
                            <span>Chép link HS</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Details stats */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center space-x-1">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      <span>{Array.isArray(asg.questions) ? asg.questions.length : 0} câu</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{asg.durationMinutes > 0 ? `${asg.durationMinutes} phút` : 'Tự do'}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {asgSubs.length}/{classStudentCount} đã nộp
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <button
                    onClick={() => setAiSolvingAssignment(asg)}
                    className="flex items-center justify-center space-x-1 py-2 px-1.5 bg-violet-50 dark:bg-violet-950/60 hover:bg-violet-100 dark:hover:bg-violet-900/80 text-violet-700 dark:text-violet-300 font-bold rounded-xl transition-colors border border-violet-200 dark:border-violet-800 cursor-pointer shadow-2xs"
                    title="AI Tự động giải toán & Thiết lập bảng đáp án chuẩn A-B-C-D (Bảo toàn 100% đề thi)"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                    <span>AI Lập đáp án</span>
                  </button>

                  <button
                    onClick={() => onNavigate('create', { editingAssignment: asg })}
                    className="flex items-center justify-center space-x-1 py-2 px-1.5 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/80 text-amber-800 dark:text-amber-200 font-bold rounded-xl transition-colors border border-amber-200 dark:border-amber-800 cursor-pointer shadow-2xs"
                    title="Sửa câu hỏi, đề bài, đáp án và thang điểm"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Sửa câu hỏi</span>
                  </button>

                  <button
                    onClick={() => setPrintingAssignment(asg)}
                    className="flex items-center justify-center space-x-1 py-2 px-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 font-bold rounded-xl transition-colors border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                    title="In đề thi / Xuất PDF chuẩn Bộ GD&ĐT"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>In đề</span>
                  </button>

                  <button
                    onClick={() => setSimilarExamAssignment(asg)}
                    className="flex items-center justify-center space-x-1 py-2 px-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl transition-colors border border-emerald-200 dark:border-emerald-800 cursor-pointer"
                    title="Tạo đề tương tự / Biến thể mã đề (102, B...)"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>Đề tương tự</span>
                  </button>

                  <button
                    onClick={() => onOpenShare(asg)}
                    className="flex items-center justify-center space-x-1 py-2 px-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 font-bold rounded-xl transition-colors border border-blue-200 dark:border-blue-800 cursor-pointer"
                    title="Lấy mã QR và liên kết"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Lấy QR</span>
                  </button>

                  <button
                    onClick={() => onTestAssignment(asg)}
                    className="flex items-center justify-center space-x-1 py-2 px-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer"
                    title="Làm thử"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Làm thử</span>
                  </button>

                  <button
                    onClick={() => onNavigate('results', { assignmentId: asg.id })}
                    className="flex items-center justify-center space-x-1 py-2 px-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
                    title="Xem bảng xếp hạng và phân tích kết quả"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Kết quả</span>
                  </button>

                  <button
                    onClick={() => handleDelete(asg)}
                    disabled={deletingId === asg.id}
                    className="flex items-center justify-center space-x-1 py-2 px-1.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 font-bold rounded-xl transition-colors border border-rose-200 dark:border-rose-800 cursor-pointer shadow-2xs"
                    title="Xóa vĩnh viễn bài tập này"
                  >
                    {deletingId === asg.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    )}
                    <span>{deletingId === asg.id ? 'Đang xóa...' : 'Xóa bài'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* File Upload Modal for Teacher */}
      <FileUploadModal
        isOpen={showFileUploadModal}
        onClose={() => setShowFileUploadModal(false)}
        onImportQuestions={handleImportQuestions}
      />

      {/* Print Exam Modal */}
      {printingAssignment && (
        <PrintExamModal
          isOpen={!!printingAssignment}
          onClose={() => setPrintingAssignment(null)}
          assignment={printingAssignment}
        />
      )}

      {/* Generate Similar Exam Modal */}
      {similarExamAssignment && (
        <GenerateSimilarExamModal
          isOpen={!!similarExamAssignment}
          onClose={() => setSimilarExamAssignment(null)}
          assignment={similarExamAssignment}
          classes={classes}
          onSuccess={() => {
            onRefresh();
          }}
          onNavigateToEdit={(newAsg) => {
            onRefresh();
            onNavigate('results', { assignmentId: newAsg.id });
          }}
        />
      )}

      {/* AI Solve & Setup Answer Key Modal */}
      {aiSolvingAssignment && (
        <AiSolveExamModal
          isOpen={!!aiSolvingAssignment}
          onClose={() => setAiSolvingAssignment(null)}
          examTitle={aiSolvingAssignment.title}
          grade={aiSolvingAssignment.grade}
          topic={aiSolvingAssignment.topic}
          questions={aiSolvingAssignment.questions || []}
          onApplyAnswers={async (updatedQuestions) => {
            const updatedAsg: Assignment = {
              ...aiSolvingAssignment,
              questions: updatedQuestions
            };
            // 1. Lưu đồng bộ lên Cloud Firestore
            try {
              await FirestoreService.saveExam(updatedAsg);
            } catch (err) {
              console.warn('Lỗi lưu Firestore:', err);
            }
            // 2. Lưu bộ nhớ máy LocalStorage
            StorageService.saveAssignment(updatedAsg);
            alert(`Đã cập nhật bảng đáp án chuẩn thành công cho đề "${updatedAsg.title}"!\nHọc sinh khi nộp bài sẽ được tự động so khớp chính xác 100%.`);
            setAiSolvingAssignment(null);
            await onRefresh();
          }}
        />
      )}

      {/* AI Batch Solve Modal (Giải hàng loạt nhiều đề cùng lúc) */}
      {showBatchSolveModal && (
        <AiBatchSolveModal
          isOpen={showBatchSolveModal}
          onClose={() => setShowBatchSolveModal(false)}
          selectedAssignments={safeAssignments.filter(a => selectedAssignmentIds.includes(a.id))}
          onFinished={async () => {
            await onRefresh();
            setSelectedAssignmentIds([]);
          }}
        />
      )}

      {/* Teacher Semester Exam Modal (Tạo đề Giữa kỳ / Cuối kỳ 3 Tầng) */}
      <TeacherSemesterExamModal
        isOpen={showSemesterExamModal}
        onClose={() => setShowSemesterExamModal(false)}
        classes={safeClasses}
        onExamsCreated={async () => {
          await onRefresh();
        }}
        onOpenPrintModal={(exam) => {
          setPrintingAssignment(exam);
        }}
      />
    </div>
  );
};
