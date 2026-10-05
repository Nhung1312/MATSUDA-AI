import React, { useEffect } from 'react';
import { Assignment, ClassRoom, Submission } from '../../types';
import { SHOWCASE_DEMO_ASSIGNMENT, SHOWCASE_DEMO_SUBMISSION } from '../../data/showcaseDemo';
import { 
  Users, 
  BookOpen, 
  FileText, 
  CheckCircle2, 
  PlusCircle, 
  Share2, 
  BarChart3, 
  ArrowRight,
  Sparkles,
  Layers,
  Edit3,
  Play,
  Eye,
  QrCode
} from 'lucide-react';

interface TeacherOverviewProps {
  classes: ClassRoom[];
  assignments: Assignment[];
  submissions: Submission[];
  onNavigate: (tab: string, params?: any) => void;
  onOpenShare: (assignment: Assignment) => void;
  onTestAssignment: (assignment: Assignment) => void;
  onPreviewSubmission: (assignment: Assignment, submission: Submission) => void;
}

export const TeacherOverview: React.FC<TeacherOverviewProps> = ({
  classes = [],
  assignments = [],
  submissions = [],
  onNavigate,
  onOpenShare,
  onTestAssignment,
  onPreviewSubmission
}) => {
  const safeClasses = Array.isArray(classes) ? classes.filter((c): c is ClassRoom => Boolean(c && typeof c === 'object')) : [];
  const safeAssignments = Array.isArray(assignments) ? assignments.filter((a): a is Assignment => Boolean(a && typeof a === 'object')) : [];
  const safeSubmissions = Array.isArray(submissions) ? submissions.filter((s): s is Submission => Boolean(s && typeof s === 'object')) : [];

  const totalStudents = safeClasses.reduce((acc, c) => acc + (Array.isArray(c?.students) ? c.students.length : 0), 0);
  const totalAssignments = safeAssignments.length;
  const totalSubmissions = safeSubmissions.length;

  // Đợt 8A: số liệu tóm tắt cho chu trình AI khép kín trên dashboard.
  const aiAnalyzedAnswers = safeSubmissions.reduce(
    (sum, sub) => sum + (Array.isArray(sub.answers)
      ? sub.answers.filter(a => a.aiGraded || (a.stepAnalysis && a.stepAnalysis.length > 0) || !!a.stepGradingResponse).length
      : 0),
    0
  );
  const rootErrorsDetected = safeSubmissions.reduce(
    (sum, sub) => sum + (Array.isArray(sub.answers)
      ? sub.answers.filter(a => a.firstErrorStep !== undefined && a.firstErrorStep !== null).length
      : 0),
    0
  );
  const pendingTeacherReviews = safeSubmissions.reduce(
    (sum, sub) => sum + (Array.isArray(sub.answers)
      ? sub.answers.filter(a => a.needsTeacherReview && a.teacherScore === undefined).length
      : 0),
    0
  );

  // Đợt 8B: tự chọn dữ liệu demo tốt nhất.
  // Ưu tiên bài đã có Step Analysis/lỗi gốc để người xem thấy ngay giá trị AI.
  const demoCandidates = safeAssignments.map(assignment => {
    const assignmentSubmissions = safeSubmissions.filter(s => s.assignmentId === assignment.id);
    const richSubmission = assignmentSubmissions.find(s =>
      Array.isArray(s.answers) && s.answers.some(a =>
        !!a.stepGradingResponse ||
        (a.stepAnalysis && a.stepAnalysis.length > 0) ||
        (a.firstErrorStep !== undefined && a.firstErrorStep !== null)
      )
    );
    return {
      assignment,
      submission: richSubmission || assignmentSubmissions[0],
      quality: richSubmission ? 3 : assignmentSubmissions.length > 0 ? 2 : assignment.isPublished ? 1 : 0
    };
  }).sort((a, b) => b.quality - a.quality);
  const demoTarget = demoCandidates[0];
  const liveDemoAssignment = demoTarget?.assignment;
  const richRealTarget = demoCandidates.find(item => item.quality === 3);
  const analysisDemoAssignment = richRealTarget?.assignment || SHOWCASE_DEMO_ASSIGNMENT;
  const analysisDemoSubmission = richRealTarget?.submission || SHOWCASE_DEMO_SUBMISSION;

  // 8I: khi quay lại từ hồ sơ học sinh, trở đúng khối demo rồi xóa hash
  // để những lần vào Dashboard sau không bị tự động cuộn ngoài ý muốn.
  useEffect(() => {
    if (window.location.hash !== '#judge-demo') return;
    const timer = window.setTimeout(() => {
      document.getElementById('judge-demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }, 120);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Welcome Banner - Modern Minimalist Clean UI */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 text-slate-900 dark:text-white shadow-sm border border-slate-200/90 dark:border-slate-800 relative overflow-hidden">
        {/* Subtle geometric background glow & accents */}
        <div className="absolute right-0 top-0 w-80 h-80 bg-gradient-to-br from-blue-100/60 to-indigo-100/40 dark:from-indigo-950/40 dark:to-blue-950/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        
        <div className="relative z-10 max-w-2xl">
          {/* Refined Badge */}
          <div className="inline-flex items-center space-x-1.5 text-blue-700 dark:text-blue-300 text-[11px] font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Matsuda AI • Toán THCS</span>
          </div>

          {/* Main Heading without slash */}
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
            Giao bài • Chấm từng bước • Học từ lỗi sai
          </h1>
          
          {/* Subtitle */}
          <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm mt-2 font-medium">
            Bắt đầu từ tài liệu có sẵn hoặc mở demo AI 3 phút.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => document.getElementById('judge-demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-extrabold px-4 sm:px-5 py-2.5 rounded-xl shadow-xs hover:shadow-md transition-all active:scale-95 text-xs sm:text-sm cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>Xem demo AI 3 phút</span>
            </button>

            {/* Primary Action Button */}
            <button
              onClick={() => onNavigate('create', { autoOpenImport: true })}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-4 sm:px-5 py-2.5 rounded-xl shadow-xs hover:shadow-md transition-all active:scale-95 text-xs sm:text-sm cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Tạo bài</span>
            </button>

            {/* Nút Kho Đề Mẫu */}
            <button
              onClick={() => onNavigate('exam_bank')}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2.5 rounded-xl transition-all text-xs cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>Kho đề</span>
            </button>

          </div>
        </div>
      </div>

      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-black text-slate-900 dark:text-white">Chu trình học từ lỗi sai</h2>
          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
            <span>AI: {aiAnalyzedAnswers}</span>
            <span>Lỗi gốc: {rootErrorsDetected}</span>
            <span>Chờ duyệt: {pendingTeacherReviews}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            ['1','Tách đề'],
            ['2','GV duyệt & giao'],
            ['3','AI chấm'],
            ['4','Lỗi gốc'],
            ['5','Luyện lại']
          ].map(([n, label]) => (
            <div key={n} className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{n}</span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{label}</span>
            </div>
          ))}
        </div>
      </section>
      {/* ĐỢT 8B: KỊCH BẢN DEMO NHANH 3–5 PHÚT */}
      <section id="judge-demo" className="scroll-mt-28 rounded-2xl border border-dashed border-fuchsia-200 dark:border-fuchsia-900 bg-gradient-to-r from-fuchsia-50 via-white to-indigo-50 dark:from-fuchsia-950/20 dark:via-slate-900 dark:to-indigo-950/20 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-fuchsia-100 dark:bg-fuchsia-950 text-fuchsia-700 dark:text-fuchsia-300 text-[10px] font-black uppercase tracking-wider mb-2">
              <Play className="w-3.5 h-3.5" />
              <span>Demo 3 phút</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              5 bước demo • trọng tâm: AI chấm & lỗi gốc
            </h2>

   </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 flex-1">
            <button
              onClick={() => onNavigate('create', { autoOpenImport: true })}
              className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900 p-3.5 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="w-7 h-7 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black">1</span>
                <FileText className="w-4 h-4 text-violet-500" />
              </div>
              <div className="mt-2 inline-flex px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[9px] font-black">0:00–0:35</div>
              <div className="font-black text-xs text-slate-900 dark:text-white mt-1.5">Tách đề nguồn</div>
              <div className="text-[10px] text-slate-500 mt-1">PDF / Ảnh / Word / LaTeX</div>
            </button>

            <button
              disabled={!liveDemoAssignment}
              onClick={() => liveDemoAssignment && onOpenShare(liveDemoAssignment)}
              className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900 p-3.5 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">2</span>
                <QrCode className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-2 inline-flex px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[9px] font-black">0:35–1:00</div>
              <div className="font-black text-xs text-slate-900 dark:text-white mt-1.5">QR / mã bài</div>
              <div className="text-[10px] text-slate-500 mt-1">Giao cho học sinh</div>
            </button>

            <button
              disabled={!liveDemoAssignment}
              onClick={() => liveDemoAssignment && onTestAssignment(liveDemoAssignment)}
              className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 p-3.5 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">3</span>
                <Play className="w-4 h-4 text-blue-500" />
              </div>
              <div className="mt-2 inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[9px] font-black">1:00–1:20</div>
              <div className="font-black text-xs text-slate-900 dark:text-white mt-1.5">Mở bài học sinh</div>
              <div className="text-[10px] text-slate-500 mt-1">Làm thử & nộp</div>
            </button>

            <button
              disabled={!analysisDemoAssignment || !analysisDemoSubmission}
              onClick={() => onPreviewSubmission(analysisDemoAssignment, analysisDemoSubmission)}
              className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-fuchsia-200 dark:border-fuchsia-900 p-3.5 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="w-7 h-7 rounded-full bg-fuchsia-600 text-white flex items-center justify-center text-xs font-black">4</span>
                <Eye className="w-4 h-4 text-fuchsia-500" />
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="inline-flex px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 text-[9px] font-black">1:20–2:35</span>
                <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-black">TRỌNG TÂM</span>
              </div>
              <div className="font-black text-xs text-slate-900 dark:text-white mt-1.5">AI chấm & lỗi gốc</div>
              <div className="text-[10px] text-slate-500 mt-1">Step Analysis</div>
            </button>

            <button
              disabled={!liveDemoAssignment}
              onClick={() => liveDemoAssignment && onNavigate('results', { assignmentId: liveDemoAssignment.id })}
              className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 p-3.5 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black">5</span>
                <BarChart3 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2 inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black">2:35–3:00</div>
              <div className="font-black text-xs text-slate-900 dark:text-white mt-1.5">Kết quả lớp</div>
              <div className="text-[10px] text-slate-500 mt-1">Thống kê & bài cần duyệt</div>
            </button>
          </div>
        </div>

        <details className="mt-3 rounded-2xl bg-slate-950 text-slate-100 border border-slate-800 overflow-hidden">
          <summary className="cursor-pointer px-4 py-3 text-xs font-black flex items-center gap-2 select-none">
            <Play className="w-3.5 h-3.5 text-fuchsia-300" />
            Kịch bản nói 3 phút — bấm để mở khi tập demo
          </summary>
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-5 gap-2 text-[10px] leading-relaxed">
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5">
              <strong className="text-violet-300">0:00–0:35</strong>
              <p className="mt-1">“Giáo viên không cần soạn lại. Tôi có thể bắt đầu từ PDF, ảnh, Word hoặc LaTeX và đưa về cấu trúc câu hỏi để kiểm tra.”</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5">
              <strong className="text-indigo-300">0:35–1:00</strong>
              <p className="mt-1">“AI hỗ trợ số hóa, nhưng giáo viên là người duyệt cuối rồi mới giao bằng QR hoặc mã bài.”</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5">
              <strong className="text-blue-300">1:00–1:20</strong>
              <p className="mt-1">“Học sinh làm trên điện thoại hoặc máy tính; tự luận có thể nhập lời giải hoặc gửi ảnh bài làm.”</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5">
              <strong className="text-fuchsia-300">1:20–2:35</strong>
              <p className="mt-1">“Điểm khác biệt là AI không chỉ cho điểm: hệ thống phân tích từng bước, tìm lỗi gốc và phân biệt lỗi kéo theo.”</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-2.5">
              <strong className="text-emerald-300">2:35–3:00</strong>
              <p className="mt-1">“Lỗi sai được đưa vào luyện cá nhân và dữ liệu tiến bộ; kết quả AI chưa chắc chắn luôn chờ giáo viên duyệt.”</p>
            </div>
          </div>
        </details>

      </section>
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Số lớp học</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900">{safeClasses.length}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-blue-600 mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Học sinh</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900">{totalStudents}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-violet-600 mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Tổng bài tập</span>
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900">{totalAssignments}</div>
        </div>


        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Bài đã nộp</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900">{totalSubmissions}</div>
        </div>
      </div>

      {/* Recent Assignments Table */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3 mb-4">
          <h2 className="text-lg font-bold text-slate-900">Bài tập gần đây</h2>
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
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-medium">
                    <p className="text-sm font-bold text-slate-700">Chưa có bài tập</p>
                    <button
                      type="button"
                      onClick={() => onNavigate('create', { autoOpenImport: true })}
                      className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
                    >
                      Tạo bài
                    </button>
                  </td>
                </tr>
              ) : (
                safeAssignments.slice(0, 5).map((asg) => {
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
