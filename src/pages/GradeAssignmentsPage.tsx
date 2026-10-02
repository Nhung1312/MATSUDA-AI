import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Assignment, GradeLevel, ClassRoom } from '../types';
import { ALL_GRADE_METAS } from '../data';
import { PrintExamModal } from '../components/PrintExamModal';
import { QRCodeModal } from '../components/QRCodeModal';
import { 
  BookOpen, 
  Search, 
  Filter, 
  X, 
  ArrowLeft, 
  Play, 
  Share2, 
  Printer, 
  Clock, 
  HelpCircle, 
  ChevronRight, 
  Plus, 
  Sparkles,
  Calculator,
  Shapes,
  PieChart,
  CheckCircle2,
  GraduationCap
} from 'lucide-react';

interface GradeAssignmentsPageProps {
  assignments: Assignment[];
  classes: ClassRoom[];
  onRefresh: () => void;
  onTestAssignment?: (assignment: Assignment) => void;
}

export const GradeAssignmentsPage: React.FC<GradeAssignmentsPageProps> = ({
  assignments,
  classes,
  onRefresh,
  onTestAssignment
}) => {
  const { gradeId } = useParams<{ gradeId: string }>();
  const navigate = useNavigate();

  // Validate gradeId
  const validGrade = (gradeId === '6' || gradeId === '7' || gradeId === '8' || gradeId === '9') ? (gradeId as GradeLevel) : '6';
  const gradeMeta = ALL_GRADE_METAS[validGrade] || ALL_GRADE_METAS['6'];

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTopicCategory, setFilterTopicCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title' | 'questions' | 'duration'>('newest');

  // Modals state
  const [printingAssignment, setPrintingAssignment] = useState<Assignment | null>(null);
  const [sharingAssignment, setSharingAssignment] = useState<Assignment | null>(null);

  // Filter assignments for this specific grade
  const gradeAssignments = useMemo(() => {
    return assignments.filter(a => a.grade === validGrade);
  }, [assignments, validGrade]);

  // Topic classification helper
  const matchesTopicCategory = (topic: string, category: string): boolean => {
    if (category === 'all') return true;
    const t = (topic || '').toLowerCase();
    if (category === 'algebra') {
      return t.includes('đại số') || t.includes('số học') || t.includes('phân số') || 
             t.includes('số nguyên') || t.includes('số hữu tỉ') || t.includes('số thực') || 
             t.includes('phương trình') || t.includes('hằng đẳng thức') || t.includes('đa thức') ||
             t.includes('căn') || t.includes('tính toán');
    }
    if (category === 'geometry') {
      return t.includes('hình học') || t.includes('hình') || t.includes('đoạn thẳng') || 
             t.includes('góc') || t.includes('tam giác') || t.includes('tứ giác') || 
             t.includes('đường tròn') || t.includes('pythagore') || t.includes('hệ thức lượng');
    }
    if (category === 'statistics') {
      return t.includes('thống kê') || t.includes('xác suất') || t.includes('biểu đồ');
    }
    return t === category.toLowerCase();
  };

  const filteredAssignments = useMemo(() => {
    return gradeAssignments
      .filter(a => {
        if (filterTopicCategory !== 'all' && !matchesTopicCategory(a.topic, filterTopicCategory)) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = a.title.toLowerCase().includes(q);
          const matchTopic = a.topic.toLowerCase().includes(q);
          const matchCode = a.assignmentCode.toLowerCase().includes(q);
          if (!matchTitle && !matchTopic && !matchCode) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sortBy === 'title') return a.title.localeCompare(b.title, 'vi');
        if (sortBy === 'questions') return b.questions.length - a.questions.length;
        if (sortBy === 'duration') return (b.durationMinutes || 0) - (a.durationMinutes || 0);
        return 0;
      });
  }, [gradeAssignments, filterTopicCategory, searchQuery, sortBy]);

  const handleStartExam = (asg: Assignment) => {
    navigate(`/join?code=${asg.assignmentCode}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-5 space-y-3.5 sm:space-y-4 animate-in fade-in duration-150">
      {/* Top Bar: Clean Breadcrumb & Quick Actions */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <Link 
          to="/"
          className="inline-flex items-center space-x-1 font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Trang chủ</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-900 dark:text-white font-black">Lớp {validGrade}</span>
        </Link>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => navigate(`/teacher/create?grade=${validGrade}`)}
            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Tạo đề mới</span>
          </button>
        </div>
      </div>

      {/* Grade Hero Banner - Compact & Elevated */}
      <div className={`p-4 sm:p-5 rounded-2xl border ${gradeMeta.colorScheme.border} ${gradeMeta.colorScheme.lightBg} shadow-2xs relative overflow-hidden`}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${gradeMeta.colorScheme.badgeBg} ${gradeMeta.colorScheme.badgeText}`}>
                {gradeMeta.badge}
              </span>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {gradeMeta.title} – {gradeMeta.subtitle}
              </h1>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
              {gradeMeta.description}
            </p>

            {/* Quick Topic Chips */}
            <div className="pt-1 flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-slate-400 font-medium mr-1">Chủ đề:</span>
              {gradeMeta.sampleTopics.map((topic, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-white/70 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-1 md:pt-0">
            <button
              onClick={() => navigate('/join')}
              className={`inline-flex items-center justify-center space-x-1.5 px-4 py-2 ${gradeMeta.colorScheme.btnBg} font-bold rounded-xl shadow-xs text-xs transition-all cursor-pointer active:scale-95`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Vào phòng thi tự do</span>
            </button>
          </div>
        </div>
      </div>

      {/* Streamlined Search & Filter Controls (Single Clean Strip) */}
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-2.5">
        {/* Main Controls Row */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Tìm bài kiểm tra Lớp ${validGrade}, mã bài, chủ đề...`}
              className="w-full pl-8 pr-8 py-2 bg-slate-50 dark:bg-slate-800/80 border-0 ring-1 ring-slate-200/80 dark:ring-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills & Sort */}
          <div className="flex items-center space-x-1.5 w-full sm:w-auto shrink-0 justify-between sm:justify-end">
            {/* Quick Topic Filter Tabs */}
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs">
              <button
                onClick={() => setFilterTopicCategory('all')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  filterTopicCategory === 'all'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Tất cả ({gradeAssignments.length})
              </button>
              <button
                onClick={() => setFilterTopicCategory('algebra')}
                className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  filterTopicCategory === 'algebra'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Đại số
              </button>
              <button
                onClick={() => setFilterTopicCategory('geometry')}
                className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  filterTopicCategory === 'geometry'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Hình học
              </button>
            </div>

            {/* Sort By Dropdown */}
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800/80 border-0 ring-1 ring-slate-200/80 dark:ring-slate-700/80 rounded-xl text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
              <option value="title">Tên A-Z</option>
              <option value="questions">Số câu</option>
              <option value="duration">Thời gian</option>
            </select>
          </div>
        </div>
      </div>

      {/* Assignment List */}
      {filteredAssignments.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-dashed border-slate-200 dark:border-slate-800">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="font-bold text-slate-700 dark:text-slate-200 text-lg">Chưa có bài tập nào phù hợp cho Lớp {validGrade}</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
            Thầy cô có thể bấm "+ Thêm đề Lớp {validGrade}" để soạn câu hỏi hoặc tải tệp Word/Excel lên.
          </p>
          <button
            onClick={() => navigate(`/teacher/create?grade=${validGrade}`)}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
          >
            + Soạn đề kiểm tra Lớp {validGrade}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-4.5">
          {filteredAssignments.map((asg) => {
            const isGeometry = matchesTopicCategory(asg.topic, 'geometry');

            return (
              <div
                key={asg.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700/80 transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Card Header Badges */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center space-x-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${gradeMeta.colorScheme.badgeBg} ${gradeMeta.colorScheme.badgeText}`}>
                        Lớp {asg.grade}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isGeometry 
                          ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60'
                          : 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60'
                      }`}>
                        {isGeometry ? '📐 Hình học' : '🔢 Đại số'}
                      </span>
                    </div>

                    <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900">
                      {asg.assignmentCode}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 mt-1.5">
                    {asg.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                    {asg.topic}
                  </p>

                  {/* Details stats */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                    <div className="flex items-center space-x-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
                      <span><strong>{asg.questions.length}</strong> câu hỏi</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>{asg.durationMinutes > 0 ? `${asg.durationMinutes} phút` : 'Tự do'}</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <button
                    onClick={() => handleStartExam(asg)}
                    className="w-full py-2 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-98"
                  >
                    <span>LÀM BÀI NGAY</span>
                    <Play className="w-3 h-3 fill-white" />
                  </button>

                  <div className="grid grid-cols-3 gap-1.5 text-[11px] font-semibold">
                    <button
                      onClick={() => setPrintingAssignment(asg)}
                      className="py-1 px-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center space-x-1 cursor-pointer transition-colors"
                      title="In đề thi / Xuất PDF"
                    >
                      <Printer className="w-3 h-3 text-slate-500" />
                      <span>In PDF</span>
                    </button>

                    <button
                      onClick={() => setSharingAssignment(asg)}
                      className="py-1 px-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-200/80 dark:border-blue-800/80 flex items-center justify-center space-x-1 cursor-pointer transition-colors"
                      title="Lấy mã QR chia sẻ"
                    >
                      <Share2 className="w-3 h-3 text-blue-600" />
                      <span>Lấy QR</span>
                    </button>

                    <button
                      onClick={() => {
                        if (onTestAssignment) {
                          onTestAssignment(asg);
                        } else {
                          navigate(`/join?code=${asg.assignmentCode}`);
                        }
                      }}
                      className="py-1 px-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-center space-x-1 cursor-pointer transition-colors"
                      title="Làm thử chế độ giáo viên"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      <span>Làm thử</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Print Exam Modal */}
      {printingAssignment && (
        <PrintExamModal
          isOpen={!!printingAssignment}
          onClose={() => setPrintingAssignment(null)}
          assignment={printingAssignment}
        />
      )}

      {/* Share QR Modal */}
      {sharingAssignment && (
        <QRCodeModal
          isOpen={!!sharingAssignment}
          onClose={() => setSharingAssignment(null)}
          assignment={sharingAssignment}
        />
      )}
    </div>
  );
};
