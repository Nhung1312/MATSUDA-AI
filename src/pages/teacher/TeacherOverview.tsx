import React from 'react';
import { Assignment, ClassRoom, Submission } from '../../types';
import { 
  Users, 
  BookOpen, 
  FileText, 
  CheckCircle2, 
  PlusCircle, 
  TrendingUp, 
  Share2, 
  BarChart3, 
  ArrowRight,
  Sparkles,
  Layers,
  Edit3,
  Settings
} from 'lucide-react';

interface TeacherOverviewProps {
  classes: ClassRoom[];
  assignments: Assignment[];
  submissions: Submission[];
  onNavigate: (tab: string, params?: any) => void;
  onOpenShare: (assignment: Assignment) => void;
}

export const TeacherOverview: React.FC<TeacherOverviewProps> = ({
  classes = [],
  assignments = [],
  submissions = [],
  onNavigate,
  onOpenShare
}) => {
  const safeClasses = Array.isArray(classes) ? classes.filter((c): c is ClassRoom => Boolean(c && typeof c === 'object')) : [];
  const safeAssignments = Array.isArray(assignments) ? assignments.filter((a): a is Assignment => Boolean(a && typeof a === 'object')) : [];
  const safeSubmissions = Array.isArray(submissions) ? submissions.filter((s): s is Submission => Boolean(s && typeof s === 'object')) : [];

  const totalStudents = safeClasses.reduce((acc, c) => acc + (Array.isArray(c?.students) ? c.students.length : 0), 0);
  const totalAssignments = safeAssignments.length;
  const activeAssignments = safeAssignments.filter(a => Boolean(a && a.isPublished)).length;
  const totalSubmissions = safeSubmissions.length;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Welcome Banner - Modern Minimalist Clean UI */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 text-slate-900 dark:text-white shadow-sm hover:shadow-md border border-slate-200/90 dark:border-slate-800 relative overflow-hidden transition-all">
        {/* Subtle geometric background glow & accents */}
        <div className="absolute right-0 top-0 w-80 h-80 bg-gradient-to-br from-blue-100/60 to-indigo-100/40 dark:from-indigo-950/40 dark:to-blue-950/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        
        {/* Geometric Accent Icon in Top Right */}
        <div className="hidden md:flex absolute right-8 top-1/2 -translate-y-1/2 w-28 h-28 rounded-3xl bg-gradient-to-br from-indigo-50 to-blue-50/60 dark:from-slate-800/80 dark:to-slate-800/40 border border-indigo-100/80 dark:border-slate-700/60 items-center justify-center shadow-xs pointer-events-none rotate-3">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 -rotate-3">
            <BookOpen className="w-8 h-8 stroke-[2.2]" />
          </div>
        </div>

        <div className="relative z-10 max-w-2xl">
          {/* Refined Badge */}
          <div className="inline-flex items-center space-x-1.5 bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 text-[11px] font-bold px-3 py-1 rounded-full mb-3 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Khu vực Quản trị Giáo viên</span>
          </div>

          {/* Main Heading without slash */}
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
            Chào mừng Thầy Cô đến với TOÁN THCS
          </h1>
          
          {/* Subtitle */}
          <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed font-medium">
            Hệ thống tạo đề, giao bài tập tự động bằng mã QR và phân tích chi tiết kết quả học tập của từng lớp.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mt-6">
            {/* Primary Action Button */}
            <button
              onClick={() => onNavigate('create')}
              className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-4 sm:px-5 py-2.5 rounded-xl shadow-xs hover:shadow-md transition-all active:scale-95 text-xs sm:text-sm cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Tạo bài tập mới</span>
            </button>

            {/* Nút Kho Đề Mẫu */}
            <button
              onClick={() => onNavigate('exam_bank')}
              className="inline-flex items-center space-x-2 bg-violet-600 hover:bg-violet-700 text-white font-extrabold px-4 sm:px-5 py-2.5 rounded-xl shadow-xs hover:shadow-md transition-all active:scale-95 text-xs sm:text-sm cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>📚 Kho đề mẫu</span>
            </button>

            {/* Secondary Outline Action Button */}
            <button
              onClick={() => onNavigate('classes')}
              className="inline-flex items-center space-x-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-bold px-4 sm:px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs transition-all active:scale-95 text-xs sm:text-sm cursor-pointer"
            >
              <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span>Quản lý lớp học</span>
            </button>

            {/* Quick Settings & Backup Button */}
            <button
              onClick={() => onNavigate('settings')}
              className="inline-flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold px-4 sm:px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs transition-all active:scale-95 text-xs sm:text-sm cursor-pointer"
            >
              <Settings className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>⚙️ Cài đặt & Sao lưu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Số lớp học</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{safeClasses.length}</div>
          <span className="text-xs text-slate-400 mt-1 block">Lớp đang quản lý</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-blue-600 mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Học sinh</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{totalStudents}</div>
          <span className="text-xs text-slate-400 mt-1 block">Học sinh trong danh sách</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-violet-600 mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Tổng bài tập</span>
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{totalAssignments}</div>
          <span className="text-xs text-slate-400 mt-1 block">Đề thi & bài luyện</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Đang giao</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{activeAssignments}</div>
          <span className="text-xs text-slate-400 mt-1 block">Bài tập có hiệu lực</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Bài đã nộp</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{totalSubmissions}</div>
          <span className="text-xs text-slate-400 mt-1 block">Lượt nộp đã tự chấm</span>
        </div>
      </div>

      {/* Recent Assignments Table */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Danh sách bài tập gần đây</h2>
            <p className="text-xs text-slate-500">
              Theo dõi tiến độ làm bài, mã bài tập và kết quả chấm điểm của học sinh.
            </p>
          </div>
          <button
            onClick={() => onNavigate('assignments')}
            className="inline-flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            <span>Xem tất cả ({safeAssignments.length})</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-y border-slate-200">
                <th className="py-3 px-4">Bài tập</th>
                <th className="py-3 px-3">Lớp</th>
                <th className="py-3 px-3 text-center">Số câu</th>
                <th className="py-3 px-3">Mã bài</th>
                <th className="py-3 px-3 text-center">Đã nộp</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {safeAssignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 font-medium">
                    <p className="text-sm">Chưa có bài tập nào.</p>
                    <p className="text-xs text-slate-400 mt-1">Thầy Cô có thể bấm "Tạo bài tập mới" hoặc giao bài nhanh từ "Kho đề mẫu".</p>
                  </td>
                </tr>
              ) : (
                safeAssignments.slice(0, 10).map((asg) => {
                  if (!asg) return null;
                  const asgSubmissions = safeSubmissions.filter(s => s && s.assignmentId === asg.id);
                  const targetClass = safeClasses.find(c => c && c.id === asg.classId);
                  const studentCount = targetClass && Array.isArray(targetClass.students) ? targetClass.students.length : 10;
                  const questionCount = Array.isArray(asg.questions) ? asg.questions.length : 0;

                  return (
                    <tr key={asg.id || Math.random().toString()} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{asg.title || 'Bài tập'}</div>
                        <div className="text-xs text-slate-500">{asg.topic || 'Toán học'} • Lớp {asg.grade || '6'}</div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="inline-block bg-blue-100 text-blue-800 font-bold text-xs px-2.5 py-0.5 rounded-md">
                          {asg.className ? `Lớp ${asg.className}` : 'Tất cả học sinh'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-semibold text-slate-700">
                        {questionCount}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-xs">
                          {asg.assignmentCode || asg.id || '---'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs border border-emerald-200">
                          {asgSubmissions.length} / {studentCount}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => onNavigate('create', { editingAssignment: asg })}
                            title="Sửa đề bài & câu hỏi"
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold text-xs rounded-lg transition-colors border border-amber-200 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                            <span>Sửa câu hỏi</span>
                          </button>
                          <button
                            onClick={() => onOpenShare(asg)}
                            title="Lấy mã QR & Link"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onNavigate('results', { assignmentId: asg.id })}
                            title="Xem kết quả & Thống kê"
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            <span>Kết quả</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
