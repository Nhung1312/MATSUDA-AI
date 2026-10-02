import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Contest, ContestSubmission } from '../../../types';
import { FirestoreService } from '../../../services/firestoreService';
import { StorageService } from '../../../services/storageService';
import { rankContestSubmissions, getContestStatus, getContestStatusMeta, formatContestDateTime } from '../../../utils/contestUtils';
import { 
  Trophy, 
  Search, 
  Filter, 
  ArrowLeft, 
  Play, 
  Clock, 
  Medal, 
  Users, 
  RefreshCw 
} from 'lucide-react';

export const ContestLeaderboardPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [contest, setContest] = useState<Contest | null>(null);
  const [submissions, setSubmissions] = useState<ContestSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => {
    loadLeaderboard();
  }, [code]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      if (!code) return;
      const c = await FirestoreService.getContestByCode(code);
      setContest(c);

      if (c) {
        // Nạp danh sách bài thi
        const localSubs = StorageService.getContestSubmissions(c.id);
        const cloudSubs = await FirestoreService.getContestSubmissions(c.id);

        const map = new Map<string, ContestSubmission>();
        localSubs.forEach(s => map.set(s.id, s));
        cloudSubs.forEach(s => map.set(s.id, s));

        const ranked = rankContestSubmissions(Array.from(map.values()));
        setSubmissions(ranked);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full text-center space-y-4 border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Không tìm thấy cuộc thi</h2>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs"
          >
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  const status = getContestStatus(contest);
  const statusMeta = getContestStatusMeta(status);

  // Danh sách lớp
  const classList = Array.from(new Set(submissions.map(s => s.studentClass).filter(Boolean)));

  // Lọc
  const filteredSubmissions = submissions.filter(s => {
    if (classFilter !== 'all' && s.studentClass !== classFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return s.studentName.toLowerCase().includes(q) || (s.studentClass || '').toLowerCase().includes(q);
    }
    return true;
  });

  const top1 = submissions[0];
  const top2 = submissions[1];
  const top3 = submissions[2];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 flex flex-col items-center">
      <div className="max-w-4xl w-full space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(`/contest/${contest.code}`)}
            className="flex items-center space-x-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Thông tin cuộc thi</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadLeaderboard}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Cập nhật</span>
            </button>

            {status === 'ongoing' && (
              <button
                onClick={() => navigate(`/contest/${contest.code}`)}
                className="flex items-center space-x-1 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-xs transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Vào thi ngay</span>
              </button>
            )}
          </div>
        </div>

        {/* Header Banner */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 rounded-3xl p-6 sm:p-8 text-white shadow-xl text-center space-y-3 relative overflow-hidden">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-xs text-xs font-black uppercase tracking-wider">
            <Trophy className="w-4 h-4" />
            <span>BẢNG VÀNG XẾP HẠNG</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black">{contest.title}</h1>
          <p className="text-xs text-amber-100 max-w-lg mx-auto">
            Khối {contest.grade} • {contest.durationMinutes} phút • Tổng số {submissions.length} thí sinh đã nộp bài
          </p>
        </div>

        {/* TOP 3 PODIUM */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end pt-2">
            {/* HẠNG 2 */}
            <div className="order-2 sm:order-1 bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-slate-300 dark:border-slate-700 text-center shadow-xs space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-300 dark:bg-slate-700 text-white flex items-center justify-center text-xl font-black mx-auto shadow-sm">
                🥈
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                Hạng Nhì
              </span>
              <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">
                {top2 ? top2.studentName : '---'}
              </h3>
              <p className="text-xs text-slate-500">
                Lớp {top2 ? top2.studentClass : '--'} • {top2 ? `${top2.timeSpentSeconds}s` : '--'}
              </p>
              <div className="text-2xl font-black text-slate-700 dark:text-slate-300 pt-1">
                {top2 ? `${top2.totalScore}đ` : '--'}
              </div>
            </div>

            {/* HẠNG 1 - TÔN VINH CAO NHẤT */}
            <div className="order-1 sm:order-2 bg-gradient-to-b from-amber-50 to-amber-100/70 dark:from-amber-950/40 dark:to-amber-900/20 rounded-3xl p-6 border-2 border-amber-400 text-center shadow-lg space-y-2 relative -translate-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-2xl font-black mx-auto shadow-md">
                🥇
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                QUÁN QUÂN (HẠNG NHẤT)
              </span>
              <h3 className="font-black text-base text-slate-900 dark:text-white truncate">
                {top1 ? top1.studentName : '---'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Lớp {top1 ? top1.studentClass : '--'} • {top1 ? `${top1.timeSpentSeconds}s` : '--'}
              </p>
              <div className="text-3xl font-black text-amber-600 dark:text-amber-400 pt-1">
                {top1 ? `${top1.totalScore}đ` : '--'}
              </div>
            </div>

            {/* HẠNG 3 */}
            <div className="order-3 sm:order-3 bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 border-orange-300 dark:border-orange-800 text-center shadow-xs space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-orange-400 text-white flex items-center justify-center text-xl font-black mx-auto shadow-sm">
                🥉
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-600 block">
                Hạng Ba
              </span>
              <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">
                {top3 ? top3.studentName : '---'}
              </h3>
              <p className="text-xs text-slate-500">
                Lớp {top3 ? top3.studentClass : '--'} • {top3 ? `${top3.timeSpentSeconds}s` : '--'}
              </p>
              <div className="text-2xl font-black text-orange-600 dark:text-orange-400 pt-1">
                {top3 ? `${top3.totalScore}đ` : '--'}
              </div>
            </div>
          </div>
        )}

        {/* FULL LEADERBOARD TABLE */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Bảng thành tích chi tiết ({filteredSubmissions.length} thí sinh)
            </h3>

            <div className="flex items-center space-x-2">
              {classList.length > 0 && (
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  <option value="all">Tất cả lớp</option>
                  {classList.map(cls => (
                    <option key={cls} value={cls}>Lớp {cls}</option>
                  ))}
                </select>
              )}

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm kiếm theo tên..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {filteredSubmissions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Chưa có thí sinh nào trong danh sách này.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase text-[10px]">
                    <th className="py-3 px-3">Hạng</th>
                    <th className="py-3 px-3">Thí sinh</th>
                    <th className="py-3 px-3">Lớp</th>
                    <th className="py-3 px-3">Điểm số</th>
                    <th className="py-3 px-3">Số câu đúng</th>
                    <th className="py-3 px-3 text-right">Thời gian làm bài</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredSubmissions.map((s, idx) => {
                    const isTop1 = idx === 0;
                    const isTop2 = idx === 1;
                    const isTop3 = idx === 2;

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3 font-black">
                          {isTop1 ? (
                            <span className="w-6 h-6 rounded-full bg-amber-400 text-white flex items-center justify-center text-xs">
                              1
                            </span>
                          ) : isTop2 ? (
                            <span className="w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-600 text-white flex items-center justify-center text-xs">
                              2
                            </span>
                          ) : isTop3 ? (
                            <span className="w-6 h-6 rounded-full bg-orange-400 text-white flex items-center justify-center text-xs">
                              3
                            </span>
                          ) : (
                            <span className="text-slate-400 pl-2">#{idx + 1}</span>
                          )}
                        </td>

                        <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                          {s.studentName}
                        </td>

                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                            {s.studentClass || 'Tự do'}
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          <span className="text-sm font-black text-orange-600 dark:text-orange-400">
                            {s.totalScore}
                          </span>
                          <span className="text-[10px] text-slate-400">/10</span>
                        </td>

                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-semibold">
                          {s.correctCount}/{s.totalQuestions} câu
                        </td>

                        <td className="py-3 px-3 text-right font-mono text-slate-500">
                          {Math.floor(s.timeSpentSeconds / 60)}p {s.timeSpentSeconds % 60}s
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
