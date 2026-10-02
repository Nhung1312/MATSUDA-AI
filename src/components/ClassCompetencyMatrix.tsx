import React, { useMemo, useState } from 'react';
import { Assignment, Submission } from '../types';
import { 
  computeClassCompetencyReport, 
  CognitiveLevel, 
  TopicCompetency 
} from '../utils/competencyAnalysis';
import { 
  BarChart3, 
  Award, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Sparkles, 
  Shuffle, 
  Brain, 
  Target, 
  BookOpen, 
  Users, 
  TrendingUp, 
  Printer, 
  FileText,
  HelpCircle,
  ArrowRight
} from 'lucide-react';

interface ClassCompetencyMatrixProps {
  assignment: Assignment;
  submissions: Submission[];
  onOpenSimilarExamModal: () => void;
}

export const ClassCompetencyMatrix: React.FC<ClassCompetencyMatrixProps> = ({
  assignment,
  submissions,
  onOpenSimilarExamModal
}) => {
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<'all' | 'struggling' | 'developing' | 'mastered'>('all');

  const report = useMemo(() => {
    return computeClassCompetencyReport(assignment, submissions);
  }, [assignment, submissions]);

  const filteredTopics = useMemo(() => {
    if (selectedTopicFilter === 'all') return report.topicCompetencies;
    return report.topicCompetencies.filter(t => t.status === selectedTopicFilter);
  }, [report.topicCompetencies, selectedTopicFilter]);

  const handlePrintReport = () => {
    window.print();
  };

  if (submissions.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-dashed border-slate-200 dark:border-slate-800">
        <Brain className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <h3 className="font-bold text-slate-700 dark:text-slate-200 text-base">
          Chưa có dữ liệu bài nộp để phân tích năng lực
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-md mx-auto">
          Khi học sinh hoàn thành và nộp bài kiểm tra, hệ thống sẽ tự động tổng hợp ma trận năng lực theo 4 mức độ nhận thức của Bộ GD&ĐT.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner Overview */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 bg-white/10 text-indigo-200 text-[11px] font-bold px-3 py-1 rounded-full mb-2 backdrop-blur-xs">
              <Brain className="w-3.5 h-3.5 text-indigo-300" />
              <span>Chuẩn Khung Năng Lực Bộ Giáo Dục &amp; Đào Tạo</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Ma Trận Năng Lực &amp; Phổ Tư Duy Lớp Học
            </h2>
            <p className="text-xs text-indigo-200/90 mt-1 max-w-xl">
              Đánh giá tỷ lệ thành thạo của học sinh theo 4 cấp độ tư duy Toán học và bản đồ làm chủ từng chuyên đề kiến thức.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onOpenSimilarExamModal}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
              title="Tạo mã đề mới chống nhìn bài hoặc đề tương tự"
            >
              <Shuffle className="w-4 h-4" />
              <span>Tạo đề tương tự</span>
            </button>

            <button
              onClick={handlePrintReport}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-white/15 hover:bg-white/25 text-white font-bold text-xs rounded-xl backdrop-blur-xs border border-white/20 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>In báo cáo</span>
            </button>
          </div>
        </div>

        {/* Quick KPI stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-indigo-700/60">
          <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-xs">
            <div className="text-[11px] text-indigo-200 font-semibold">Tỉ lệ đúng toàn bài</div>
            <div className="text-2xl font-extrabold text-emerald-300 mt-0.5">
              {report.overallAccuracy}%
            </div>
          </div>
          <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-xs">
            <div className="text-[11px] text-indigo-200 font-semibold">Đã nộp bài</div>
            <div className="text-2xl font-extrabold text-white mt-0.5">
              {report.submittedCount} <span className="text-xs font-normal text-indigo-200">bài</span>
            </div>
          </div>
          <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-xs">
            <div className="text-[11px] text-indigo-200 font-semibold">Chuyên đề nắm vững</div>
            <div className="text-2xl font-extrabold text-indigo-200 mt-0.5">
              {report.topicCompetencies.filter(t => t.status === 'mastered').length}/{report.topicCompetencies.length}
            </div>
          </div>
          <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-xs">
            <div className="text-[11px] text-indigo-200 font-semibold">Cần bồi dưỡng</div>
            <div className="text-2xl font-extrabold text-rose-300 mt-0.5">
              {report.strugglingStudentsSummary.length} <span className="text-xs font-normal text-indigo-200">em</span>
            </div>
          </div>
        </div>
      </div>

      {/* BLOCK 1: 4 CẤP ĐỘ NHẬN THỨC THEO CHUẨN BỘ GD&ĐT */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              Phân Bố Năng Lực 4 Cấp Độ Tư Duy
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Khung đánh giá chuẩn hóa: Nhận biết • Thông hiểu • Vận dụng • Vận dụng cao
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {report.cognitiveCompetencies.map((comp) => {
            let colorTheme = {
              badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
              barBg: 'bg-emerald-500',
              textColor: 'text-emerald-600 dark:text-emerald-400'
            };

            if (comp.level === 'Thông hiểu') {
              colorTheme = {
                badgeBg: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                barBg: 'bg-blue-500',
                textColor: 'text-blue-600 dark:text-blue-400'
              };
            } else if (comp.level === 'Vận dụng') {
              colorTheme = {
                badgeBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                barBg: 'bg-amber-500',
                textColor: 'text-amber-600 dark:text-amber-400'
              };
            } else if (comp.level === 'Vận dụng cao') {
              colorTheme = {
                badgeBg: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                barBg: 'bg-purple-500',
                textColor: 'text-purple-600 dark:text-purple-400'
              };
            }

            return (
              <div
                key={comp.level}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${colorTheme.badgeBg}`}>
                      {comp.level}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">
                      {comp.questionCount} câu hỏi
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed min-h-[36px]">
                    {comp.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center justify-between mb-1 text-xs font-bold">
                    <span className="text-slate-600 dark:text-slate-300">Tỉ lệ làm đúng</span>
                    <span className={colorTheme.textColor}>
                      {comp.averageAccuracy}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${colorTheme.barBg}`}
                      style={{ width: `${comp.averageAccuracy}%` }}
                    />
                  </div>

                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 flex justify-between">
                    <span>Đạt chuẩn: {comp.passedStudentsCount}/{report.submittedCount} HS</span>
                    <span>{comp.averageAccuracy >= 70 ? '✓ Đạt yêu cầu' : '⚠️ Cần củng cố'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BLOCK 2: BẢN ĐỒ NHIỆT CHUYÊN ĐỀ KIẾN THỨC (TOPIC MASTERY HEATMAP) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                Bản Đồ Năng Lực Theo Chuyên Đề Kiến Thức
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Xanh: Nắm vững (&ge;80%) • Vàng: Cần củng cố (50-79%) • Đỏ: Báo động (&lt;50%)
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setSelectedTopicFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                selectedTopicFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Tất cả ({report.topicCompetencies.length})
            </button>
            <button
              onClick={() => setSelectedTopicFilter('struggling')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                selectedTopicFilter === 'struggling'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
              }`}
            >
              🔴 Hổng kiến thức
            </button>
            <button
              onClick={() => setSelectedTopicFilter('developing')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                selectedTopicFilter === 'developing'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
              }`}
            >
              🟡 Cần củng cố
            </button>
            <button
              onClick={() => setSelectedTopicFilter('mastered')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                selectedTopicFilter === 'mastered'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
              }`}
            >
              🟢 Nắm vững
            </button>
          </div>
        </div>

        {/* Topics Table / Cards Grid */}
        <div className="space-y-3">
          {filteredTopics.map((item) => {
            const isMastered = item.status === 'mastered';
            const isStruggling = item.status === 'struggling';

            return (
              <div
                key={item.topic}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-slate-300"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      isMastered ? 'bg-emerald-500' : isStruggling ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'
                    }`} />
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                      {item.topic}
                    </h4>
                    <span className="text-[11px] font-semibold text-slate-400 bg-white dark:bg-slate-700 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600">
                      {item.totalQuestions} câu
                    </span>
                  </div>

                  {/* List of struggling students in this topic */}
                  {item.strugglingStudents.length > 0 ? (
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-rose-600 dark:text-rose-400">HS làm sai:</span>
                      {item.strugglingStudents.slice(0, 4).map((st) => (
                        <span
                          key={st.name}
                          className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 text-[11px]"
                        >
                          {st.name} ({st.incorrectCount} câu)
                        </span>
                      ))}
                      {item.strugglingStudents.length > 4 && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          +{item.strugglingStudents.length - 4} em khác
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>100% học sinh nộp bài đều trả lời đúng chuyên đề này!</span>
                    </p>
                  )}
                </div>

                {/* Score & Status indicator */}
                <div className="flex items-center space-x-4 shrink-0 justify-between md:justify-end">
                  <div className="w-32">
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-slate-500">Độ chính xác</span>
                      <span className={
                        isMastered ? 'text-emerald-600' : isStruggling ? 'text-rose-600' : 'text-amber-600'
                      }>
                        {item.averageAccuracy}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isMastered ? 'bg-emerald-500' : isStruggling ? 'bg-rose-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${item.averageAccuracy}%` }}
                      />
                    </div>
                  </div>

                  <span className={`text-xs font-black px-3 py-1 rounded-xl border ${
                    isMastered
                      ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200'
                      : isStruggling
                      ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200'
                      : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200'
                  }`}>
                    {isMastered ? 'Nắm vững' : isStruggling ? 'Cần phụ đạo' : 'Cần củng cố'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BLOCK 3: DANH SÁCH HỌC SINH CẦN PHỤ ĐẠO & KẾ HOẠCH BỒI DƯỠNG */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                Kế Hoạch Bồi Dưỡng &amp; Phụ Đạo Học Sinh
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Các em học sinh cần kèm cặp hoặc giao thêm bài tập rèn luyện
              </p>
            </div>
          </div>

          <button
            onClick={onOpenSimilarExamModal}
            className="inline-flex items-center space-x-1 px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold rounded-xl border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Tạo đề ôn tập củng cố</span>
          </button>
        </div>

        {report.strugglingStudentsSummary.length === 0 ? (
          <div className="p-6 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
            <div className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">
              Chúc mừng Thầy Cô!
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              100% học sinh trong lớp đều đạt kết quả từ khá trở lên trong bài kiểm tra này.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {report.strugglingStudentsSummary.map((st) => (
              <div key={st.studentName} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {st.studentName}
                    </span>
                    <span className="font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300">
                      {st.score} điểm
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-400">Chuyên đề cần ôn:</span>
                    {st.weakTopics.map(topic => (
                      <span
                        key={topic}
                        className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-medium"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="shrink-0">
                  <button
                    onClick={onOpenSimilarExamModal}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 font-bold transition-colors cursor-pointer"
                  >
                    <span>Giao bài tương tự</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
