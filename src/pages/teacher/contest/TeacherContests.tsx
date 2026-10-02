import React, { useState, useEffect } from 'react';
import { Contest, ClassRoom, GradeLevel } from '../../../types';
import { FirestoreService } from '../../../services/firestoreService';
import { StorageService } from '../../../services/storageService';
import { 
  getContestStatus, 
  getContestStatusMeta, 
  formatContestDateTime 
} from '../../../utils/contestUtils';
import { ContestQRModal } from '../../../components/contest/ContestQRModal';
import { 
  Trophy, 
  PlusCircle, 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  Users, 
  FileText, 
  Share2, 
  BarChart3, 
  Edit3, 
  Trash2, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  CheckSquare, 
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';

interface TeacherContestsProps {
  onNavigate: (tab: string, params?: any) => void;
  classes: ClassRoom[];
}

export const TeacherContests: React.FC<TeacherContestsProps> = ({ onNavigate, classes }) => {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ongoing' | 'upcoming' | 'ended'>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [selectedContestForShare, setSelectedContestForShare] = useState<Contest | null>(null);
  const [submissionsCountMap, setSubmissionsCountMap] = useState<Record<string, number>>({});
  const [pendingEssayCountMap, setPendingEssayCountMap] = useState<Record<string, number>>({});

  useEffect(() => {
    loadContests();
  }, []);

  const loadContests = async () => {
    setLoading(true);
    try {
      // 1. Load local
      const localContests = StorageService.getContests();
      setContests(localContests);

      // 2. Load Firestore
      const cloudContests = await FirestoreService.getContests();
      if (cloudContests && cloudContests.length > 0) {
        const map = new Map<string, Contest>();
        localContests.forEach(c => map.set(c.id, c));
        cloudContests.forEach(c => map.set(c.id, c));
        const merged = Array.from(map.values());
        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setContests(merged);
        localStorage.setItem('toan_thcs_contests_v4', JSON.stringify(merged));
      }

      // 3. Đếm số lượng bài nộp cho mỗi cuộc thi
      const localSubmissions = StorageService.getContestSubmissions();
      const countMap: Record<string, number> = {};
      const pendingMap: Record<string, number> = {};

      localSubmissions.forEach(sub => {
        countMap[sub.contestId] = (countMap[sub.contestId] || 0) + 1;
        if (sub.hasEssay && !sub.isEssayGraded) {
          pendingMap[sub.contestId] = (pendingMap[sub.contestId] || 0) + 1;
        }
      });

      setSubmissionsCountMap(countMap);
      setPendingEssayCountMap(pendingMap);
    } catch (e) {
      console.warn('Lỗi tải danh sách cuộc thi:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContest = async (contest: Contest) => {
    if (window.confirm(`Xóa vĩnh viễn cuộc thi "${contest.title}" (${contest.code})?`)) {
      try {
        StorageService.deleteContest(contest.id);
        await FirestoreService.deleteContest(contest.id);
        setContests(prev => prev.filter(c => c.id !== contest.id));
      } catch (e) {
        alert('Lỗi xóa cuộc thi: ' + String(e));
      }
    }
  };

  // Lọc danh sách
  const filteredContests = contests.filter(c => {
    const status = getContestStatus(c);
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (gradeFilter !== 'all' && c.grade !== gradeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = c.title.toLowerCase().includes(q);
      const codeMatch = c.code.toLowerCase().includes(q);
      const topicMatch = (c.topic || '').toLowerCase().includes(q);
      if (!titleMatch && !codeMatch && !topicMatch) return false;
    }
    return true;
  });

  // Thống kê đếm
  const totalCount = contests.length;
  const ongoingCount = contests.filter(c => getContestStatus(c) === 'ongoing').length;
  const upcomingCount = contests.filter(c => getContestStatus(c) === 'upcoming').length;
  const endedCount = contests.filter(c => getContestStatus(c) === 'ended').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-xs text-xs font-black tracking-wide uppercase mb-3">
              <Trophy className="w-3.5 h-3.5" />
              <span>Đấu Trường Toán THCS</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Thi Trực Tuyến</h1>
            <p className="text-amber-100 text-xs sm:text-sm mt-1 max-w-xl">
              Tổ chức các cuộc thi trực tuyến theo thời gian thực với đồng hồ đếm ngược, chống gian lận, bảng xếp hạng trực tiếp và AI chấm tự luận.
            </p>
          </div>

          <button
            onClick={() => onNavigate('create_contest')}
            className="flex items-center space-x-2 px-5 py-3 rounded-2xl bg-white text-orange-600 hover:bg-orange-50 font-black text-sm shadow-lg hover:shadow-xl transition-all active:scale-95 shrink-0 cursor-pointer"
          >
            <PlusCircle className="w-5 h-5" />
            <span>Tạo cuộc thi mới</span>
          </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/20">
          <div className="bg-black/15 backdrop-blur-xs rounded-2xl p-3 sm:p-4">
            <span className="text-xs font-semibold text-amber-100">Tổng cuộc thi</span>
            <div className="text-2xl sm:text-3xl font-black mt-0.5">{totalCount}</div>
          </div>
          <div className="bg-black/15 backdrop-blur-xs rounded-2xl p-3 sm:p-4">
            <div className="flex items-center space-x-1 text-xs font-semibold text-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Đang diễn ra</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black mt-0.5 text-emerald-100">{ongoingCount}</div>
          </div>
          <div className="bg-black/15 backdrop-blur-xs rounded-2xl p-3 sm:p-4">
            <span className="text-xs font-semibold text-amber-100">Sắp diễn ra</span>
            <div className="text-2xl sm:text-3xl font-black mt-0.5 text-amber-200">{upcomingCount}</div>
          </div>
          <div className="bg-black/15 backdrop-blur-xs rounded-2xl p-3 sm:p-4">
            <span className="text-xs font-semibold text-amber-100">Đã kết thúc</span>
            <div className="text-2xl sm:text-3xl font-black mt-0.5 text-slate-200">{endedCount}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
          {[
            { id: 'all', label: 'Tất cả', count: totalCount },
            { id: 'ongoing', label: 'Đang diễn ra', count: ongoingCount },
            { id: 'upcoming', label: 'Sắp diễn ra', count: upcomingCount },
            { id: 'ended', label: 'Đã kết thúc', count: endedCount }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                statusFilter === tab.id ? 'bg-white/25 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Grade Filter */}
        <div className="flex items-center space-x-2">
          {/* Grade Dropdown */}
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">Tất cả Khối</option>
            <option value="6">Khối 6</option>
            <option value="7">Khối 7</option>
            <option value="8">Khối 8</option>
            <option value="9">Khối 9</option>
          </select>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên hoặc mã..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Contests List Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
          ))}
        </div>
      ) : filteredContests.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-xs max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Chưa có cuộc thi nào</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all' || gradeFilter !== 'all'
              ? 'Không tìm thấy cuộc thi phù hợp với bộ lọc hiện tại.'
              : 'Tạo cuộc thi trực tuyến đầu tiên để học sinh các khối thi đua và xếp hạng tự động.'}
          </p>
          <button
            onClick={() => onNavigate('create_contest')}
            className="mt-5 inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Tạo cuộc thi ngay</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredContests.map(contest => {
            const status = getContestStatus(contest);
            const statusMeta = getContestStatusMeta(status);
            const submissionsCount = submissionsCountMap[contest.id] || 0;
            const pendingEssayCount = pendingEssayCountMap[contest.id] || 0;

            return (
              <div
                key={contest.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                {/* Card Top */}
                <div className="p-5 space-y-3.5">
                  {/* Status & Grade Badges */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 font-extrabold text-[11px]">
                        Khối {contest.grade}
                      </span>
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {contest.code}
                      </span>
                    </div>

                    <div className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${statusMeta.badgeClass}`}>
                      <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
                      <span>{statusMeta.label}</span>
                    </div>
                  </div>

                  {/* Title & Topic */}
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base line-clamp-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                      {contest.title}
                    </h3>
                    {contest.topic && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        Chủ đề: {contest.topic}
                      </p>
                    )}
                  </div>

                  {/* Info stats */}
                  <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Số câu</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {contest.questions.length} câu
                      </span>
                    </div>
                    <div className="border-x border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 font-semibold block">Thời lượng</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {contest.durationMinutes} phút
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Thí sinh</span>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {submissionsCount} nộp
                      </span>
                    </div>
                  </div>

                  {/* Open & Close Times */}
                  <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-emerald-500" />
                        <span>Mở thi:</span>
                      </span>
                      <span className="font-semibold">{formatContestDateTime(contest.startTime)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-rose-500" />
                        <span>Đóng thi:</span>
                      </span>
                      <span className="font-semibold">{formatContestDateTime(contest.endTime)}</span>
                    </div>
                  </div>

                  {/* Pending essay grading alert if any */}
                  {pendingEssayCount > 0 && (
                    <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Có {pendingEssayCount} bài tự luận chờ Thầy/Cô chấm</span>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="p-3 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5">
                  <div className="flex items-center space-x-1">
                    {/* Share / QR */}
                    <button
                      onClick={() => setSelectedContestForShare(contest)}
                      title="Lấy mã QR & Đường dẫn chia sẻ"
                      className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-colors cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    {/* Test as student */}
                    <button
                      onClick={() => {
                        window.open(`/contest/${contest.code}`, '_blank');
                      }}
                      title="Vào thi thử nghiệm"
                      className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-700 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-colors cursor-pointer"
                    >
                      <Play className="w-4 h-4" />
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => onNavigate('create_contest', { editingContest: contest })}
                      title="Chỉnh sửa cuộc thi"
                      className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-white dark:hover:bg-slate-700 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteContest(contest)}
                      title="Xóa cuộc thi"
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-700 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Results & Ranking Button */}
                  <button
                    onClick={() => onNavigate('contest_results', { contestId: contest.id })}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Kết quả & Xếp hạng</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QR Modal */}
      {selectedContestForShare && (
        <ContestQRModal
          contest={selectedContestForShare}
          isOpen={!!selectedContestForShare}
          onClose={() => setSelectedContestForShare(null)}
        />
      )}
    </div>
  );
};
