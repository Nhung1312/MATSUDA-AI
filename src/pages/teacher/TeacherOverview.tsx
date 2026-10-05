import React from 'react';
import { Assignment, ClassRoom, Submission } from '../../types';
import { SHOWCASE_DEMO_ASSIGNMENT, SHOWCASE_DEMO_SUBMISSION } from '../../data/showcaseDemo';
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
  Settings,
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
  const activeAssignments = safeAssignments.filter(a => Boolean(a && a.isPublished)).length;
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
  const isUsingShowcaseFallback = !richRealTarget;

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
            <span>Matsuda AI • Trợ lý AI cho Giáo viên Toán THCS</span>
          </div>

          {/* Main Heading without slash */}
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
            Từ một bài làm sai → thành một lộ trình học cá nhân
          </h1>
          
          {/* Subtitle */}
          <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed font-medium">
            Từ PDF, ảnh chụp, Word hay LaTeX, Matsuda AI giúp giáo viên số hóa đề, giao bài, chấm tự luận theo từng bước, tìm lỗi gốc và tạo vòng luyện lại để học sinh tiến bộ — thay vì chỉ dừng ở một con điểm.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-4 max-w-3xl">
            <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 px-3 py-2">
              <div className="text-[10px] font-black uppercase text-sky-700 dark:text-sky-300">Đầu vào</div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">PDF • Ảnh • Word • LaTeX → đề số hóa.</div>
            </div>
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 px-3 py-2">
              <div className="text-[10px] font-black uppercase text-blue-700 dark:text-blue-300">Vấn đề</div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">GV khó chấm sâu từng bài và theo dõi lỗi lặp lại.</div>
            </div>
            <div className="rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900 px-3 py-2">
              <div className="text-[10px] font-black uppercase text-violet-700 dark:text-violet-300">AI hỗ trợ</div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">Phân tích bước giải, tìm lỗi gốc, chấm theo barem.</div>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-2">
              <div className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">Kết quả</div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">Lỗi sai trở thành bài luyện và dữ liệu tiến bộ.</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => document.getElementById('judge-demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="inline-flex items-center space-x-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-extrabold px-4 sm:px-5 py-2.5 rounded-xl shadow-xs hover:shadow-md transition-all active:scale-95 text-xs sm:text-sm cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>Xem demo AI 2 phút</span>
            </button>

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

      {/* ĐỢT 8A: AI LEARNING LOOP - trình bày rõ giá trị khác biệt của hệ thống */}
      <section className="bg-gradient-to-br from-indigo-50 via-white to-emerald-50 dark:from-indigo-950/30 dark:via-slate-900 dark:to-emerald-950/20 rounded-3xl p-5 sm:p-6 border border-indigo-200/70 dark:border-indigo-900/60 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-1.5 bg-indigo-100/80 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Chu trình AI khép kín</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              AI không dừng ở việc cho điểm — mỗi lỗi sai trở thành một lộ trình học tập
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              Tài liệu có sẵn được tách thành câu hỏi số hóa, giáo viên duyệt rồi giao bài; sau đó hệ thống hỗ trợ chấm từng bước, tìm lỗi gốc, tạo bài luyện cá nhân và ghi nhận tiến bộ.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 shrink-0">
            <div className="bg-white/90 dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-blue-900 px-3 py-2 text-center">
              <div className="text-lg font-black text-blue-700 dark:text-blue-300">{aiAnalyzedAnswers}</div>
              <div className="text-[9px] font-bold text-slate-500 uppercase">Lượt AI phân tích</div>
            </div>
            <div className="bg-white/90 dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-900 px-3 py-2 text-center">
              <div className="text-lg font-black text-amber-700 dark:text-amber-300">{rootErrorsDetected}</div>
              <div className="text-[9px] font-bold text-slate-500 uppercase">Lỗi gốc</div>
            </div>
            <div className="bg-white/90 dark:bg-slate-900 rounded-xl border border-violet-200 dark:border-violet-900 px-3 py-2 text-center">
              <div className="text-lg font-black text-violet-700 dark:text-violet-300">{pendingTeacherReviews}</div>
              <div className="text-[9px] font-bold text-slate-500 uppercase">Chờ GV duyệt</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {[
            ['1', 'Tách đề nguồn', 'PDF / Ảnh / Word / LaTeX'],
            ['2', 'Giáo viên duyệt & giao', 'Kiểm tra câu hỏi → QR / mã bài'],
            ['3', 'AI chấm từng bước', 'Điểm + Step Analysis'],
            ['4', 'Phát hiện lỗi gốc', 'First / cascading / independent'],
            ['5', 'Luyện cá nhân', 'Sổ tay câu sai + bài tương tự + Socratic'],
            ['6', 'Theo dõi tiến bộ', 'Làm lại → AI kiểm tra → làm chủ']
          ].map(([index, title, desc], idx) => (
            <React.Fragment key={index}>
              <div className="bg-white/90 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 relative">
                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black mb-2">
                  {index}
                </div>
                <div className="text-xs font-black text-slate-900 dark:text-white">{title}</div>
                <div className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1">{desc}</div>
                {idx < 5 && (
                  <ArrowRight className="hidden sm:block absolute -right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 z-10" />
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      </section>
      {/* ĐỢT 8B: KỊCH BẢN DEMO NHANH 3–5 PHÚT */}
      <section id="judge-demo" className="scroll-mt-28 rounded-3xl border-2 border-dashed border-fuchsia-200 dark:border-fuchsia-900 bg-gradient-to-r from-fuchsia-50 via-white to-indigo-50 dark:from-fuchsia-950/20 dark:via-slate-900 dark:to-indigo-950/20 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-fuchsia-100 dark:bg-fuchsia-950 text-fuchsia-700 dark:text-fuchsia-300 text-[10px] font-black uppercase tracking-wider mb-2">
              <Play className="w-3.5 h-3.5" />
              <span>Demo trọng tâm cho giám khảo • 2–5 phút</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              Đi theo 5 bước này để trình diễn toàn bộ giá trị cốt lõi
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
              Hệ thống tự chọn bài có dữ liệu phù hợp nhất để giảm thao tác và tránh phải chờ AI xử lý lại trong lúc thuyết trình.
            </p>

            <div className="mt-4 rounded-2xl bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[10px] font-black uppercase text-slate-400">Hồ sơ AI dùng cho bước 4</div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${isUsingShowcaseFallback ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {isUsingShowcaseFallback ? 'DỮ LIỆU MINH HỌA DỰ PHÒNG' : 'DỮ LIỆU THẬT ĐÃ CÓ'}
                </span>
              </div>
              <div className="font-black text-sm text-slate-900 dark:text-white mt-1">{analysisDemoAssignment.title}</div>
              <div className="text-xs text-slate-500 mt-1">
                Lớp {analysisDemoAssignment.grade} • {analysisDemoAssignment.topic || 'Toán THCS'} • {analysisDemoSubmission.studentName}
              </div>
              {isUsingShowcaseFallback && (
                <div className="text-[10px] text-amber-700 mt-2">
                  Hồ sơ này được tính sẵn để demo ổn định, không ghi vào Firestore và không thay đổi dữ liệu học sinh thật.
                </div>
              )}
              {liveDemoAssignment && liveDemoAssignment.id !== analysisDemoAssignment.id && (
                <div className="text-[10px] text-slate-500 mt-2">
                  Bước 2, 3 và 5 vẫn dùng đề thật hiện có: <strong>{liveDemoAssignment.title}</strong>.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 flex-1">
            <button
              onClick={() => onNavigate('create')}
              className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900 p-3.5 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="w-7 h-7 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black">1</span>
                <FileText className="w-4 h-4 text-violet-500" />
              </div>
              <div className="font-black text-xs text-slate-900 dark:text-white mt-2">Tách đề nguồn</div>
              <div className="text-[10px] text-slate-500 mt-1">PDF / ảnh / Word / LaTeX → câu hỏi để giáo viên duyệt.</div>
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
              <div className="font-black text-xs text-slate-900 dark:text-white mt-2">GV duyệt & giao bài</div>
              <div className="text-[10px] text-slate-500 mt-1">Giáo viên kiểm tra câu hỏi rồi phát QR/link; AI không tự xuất bản thay giáo viên.</div>
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
              <div className="font-black text-xs text-slate-900 dark:text-white mt-2">HS làm & nộp</div>
              <div className="text-[10px] text-slate-500 mt-1">Minh họa trải nghiệm học sinh làm bài trên điện thoại hoặc máy tính.</div>
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
              <div className="font-black text-xs text-slate-900 dark:text-white mt-2">Xem AI chấm & lỗi gốc</div>
              <div className="text-[10px] text-slate-500 mt-1">Mở ngay bài đã chấm: Step Analysis → lỗi gốc → luyện lại.</div>
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
              <div className="font-black text-xs text-slate-900 dark:text-white mt-2">Kết quả lớp</div>
              <div className="text-[10px] text-slate-500 mt-1">Chốt demo bằng thống kê, bài cần duyệt và tiến bộ học tập.</div>
            </button>
          </div>
        </div>

        <div className="mt-4 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-fuchsia-500" />
          <span><strong className="text-slate-700 dark:text-slate-200">Mẹo demo:</strong> nếu thời gian ngắn, chỉ mở Bước 1 và Bước 4 để cho thấy hai điểm khác biệt mạnh nhất: số hóa đề nguồn và chẩn đoán lỗi từng bước.</span>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="rounded-2xl bg-white/90 dark:bg-slate-900 border border-sky-200 dark:border-sky-900 p-3.5">
            <div className="text-[10px] font-black uppercase text-sky-700 dark:text-sky-300">Thông điệp 1</div>
            <div className="text-xs font-black text-slate-900 dark:text-white mt-1">Tận dụng tài liệu giáo viên đang có</div>
            <div className="text-[10px] leading-relaxed text-slate-500 mt-1">
              Không phải soạn lại từ đầu: PDF, ảnh, Word, LaTeX được đưa về một cấu trúc câu hỏi để giáo viên duyệt.
            </div>
          </div>
          <div className="rounded-2xl bg-white/90 dark:bg-slate-900 border border-fuchsia-200 dark:border-fuchsia-900 p-3.5">
            <div className="text-[10px] font-black uppercase text-fuchsia-700 dark:text-fuchsia-300">Thông điệp 2</div>
            <div className="text-xs font-black text-slate-900 dark:text-white mt-1">AI không chỉ cho một con điểm</div>
            <div className="text-[10px] leading-relaxed text-slate-500 mt-1">
              Hệ thống phân tích từng bước, tìm lỗi gốc và phân biệt lỗi kéo theo để phản hồi đúng chỗ học sinh vướng.
            </div>
          </div>
          <div className="rounded-2xl bg-white/90 dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 p-3.5">
            <div className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">Thông điệp 3</div>
            <div className="text-xs font-black text-slate-900 dark:text-white mt-1">Giáo viên vẫn là người quyết định</div>
            <div className="text-[10px] leading-relaxed text-slate-500 mt-1">
              AI hỗ trợ số hóa và chấm; câu chưa chắc chắn được đưa về trạng thái chờ duyệt, không tự biến thành điểm chính thức.
            </div>
          </div>
        </div>
      </section>
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
