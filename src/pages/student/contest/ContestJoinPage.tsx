import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Contest } from '../../../types';
import { FirestoreService } from '../../../services/firestoreService';
import { StorageService } from '../../../services/storageService';
import { 
  getContestStatus, 
  getContestStatusMeta, 
  formatContestDateTime, 
  getRelativeTimeRemaining 
} from '../../../utils/contestUtils';
import { 
  Trophy, 
  Clock, 
  Calendar, 
  FileText, 
  User, 
  Users, 
  Play, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  ShieldAlert,
  ArrowLeft
} from 'lucide-react';

export const ContestJoinPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Student info input
  const [studentName, setStudentName] = useState(() => {
    return localStorage.getItem('toan_thcs_student_name') || '';
  });
  const [studentClass, setStudentClass] = useState(() => {
    return localStorage.getItem('toan_thcs_student_class') || '';
  });
  const [hasSubmittedBefore, setHasSubmittedBefore] = useState(false);

  const [activeContests, setActiveContests] = useState<Contest[]>([]);
  const [inputCode, setInputCode] = useState(code === 'THI' ? '' : code || '');

  useEffect(() => {
    if (code && code !== 'THI') {
      loadContest(code);
    } else {
      setLoading(false);
      loadActiveContests();
    }
  }, [code]);

  const loadActiveContests = async () => {
    try {
      const list = await FirestoreService.getContests();
      setActiveContests(list);
    } catch (e) {
      console.warn('Lỗi tải danh sách cuộc thi:', e);
    }
  };

  const loadContest = async (contestCode: string) => {
    setLoading(true);
    setError(null);
    try {
      const found = await FirestoreService.getContestByCode(contestCode);
      if (!found) {
        setError('Không tìm thấy cuộc thi với mã này. Vui lòng kiểm tra lại!');
        loadActiveContests();
        return;
      }
      setContest(found);

      // Kiểm tra xem học sinh này đã thi chưa
      const existingSubmissions = StorageService.getContestSubmissions(found.id);
      const studentKey = `${studentName.trim()}_${studentClass.trim()}`.toLowerCase();
      const matched = existingSubmissions.find(s => 
        `${s.studentName.trim()}_${s.studentClass.trim()}`.toLowerCase() === studentKey
      );

      if (matched && found.maxAttempts === 1) {
        setHasSubmittedBefore(true);
      }
    } catch (e) {
      console.error(e);
      setError('Lỗi khi tải thông tin cuộc thi.');
      loadActiveContests();
    } finally {
      setLoading(false);
    }
  };

  const handleStartExam = () => {
    if (!contest) return;

    const trimmedName = studentName.trim();
    const trimmedClass = studentClass.trim();

    if (!trimmedName) {
      alert('Vui lòng nhập Họ và tên của em!');
      return;
    }
    if (!trimmedClass) {
      alert('Vui lòng nhập Lớp của em (Ví dụ: 7A1)!');
      return;
    }

    // Lưu vào LocalStorage
    localStorage.setItem('toan_thcs_student_name', trimmedName);
    localStorage.setItem('toan_thcs_student_class', trimmedClass);

    // Chuyển sang màn hình thi
    navigate(`/contest/${contest.code}/exam`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Đang chuẩn bị cuộc thi...</p>
        </div>
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 py-8">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto">
              <Trophy className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Tham gia Thi trực tuyến</h2>
            <p className="text-xs text-slate-500">
              Nhập mã cuộc thi được Thầy/Cô cung cấp để bước vào phòng thi.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form nhập mã */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputCode.trim()) {
                navigate(`/contest/${inputCode.trim().toUpperCase()}`);
              }
            }}
            className="space-y-3"
          >
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Mã cuộc thi:
              </label>
              <input
                type="text"
                placeholder="Ví dụ: THI2025, TOAN7-CK2..."
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 text-sm font-bold font-mono tracking-wider uppercase rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <Play className="w-4 h-4" />
              <span>Vào phòng thi</span>
            </button>
          </form>

          {/* Danh sách các cuộc thi có sẵn */}
          {activeContests.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase block">
                Các cuộc thi đang mở ({activeContests.length}):
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activeContests.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate(`/contest/${c.code}`)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:border-orange-400 text-left flex items-center justify-between text-xs transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{c.title}</div>
                      <div className="text-[11px] text-slate-500">
                        Khối {c.grade} • {c.durationMinutes} phút • Mã: <strong className="font-mono text-orange-600">{c.code}</strong>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-center pt-2">
            <button
              onClick={() => navigate('/')}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              ← Về trang chủ
            </button>
          </div>
        </div>
      </div>
    );
  }

  const status = getContestStatus(contest);
  const statusMeta = getContestStatusMeta(status);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 py-8">
      <div className="max-w-xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-6 sm:p-8 text-white relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full blur-xl pointer-events-none" />
          
          <div className="relative z-10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-xs text-[11px] font-black uppercase tracking-wider">
                <Trophy className="w-3.5 h-3.5" />
                <span>Khối {contest.grade} • Đấu Trường Toán</span>
              </span>

              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${statusMeta.badgeClass}`}>
                {statusMeta.label}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight pt-1">
              {contest.title}
            </h1>
            {contest.topic && (
              <p className="text-amber-100 text-xs font-medium">Chuyên đề: {contest.topic}</p>
            )}
          </div>
        </div>

        {/* Contest Details */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Quick Specs */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold block">Thời lượng</span>
              <span className="text-sm font-black text-slate-800 dark:text-slate-200">
                {contest.durationMinutes} phút
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold block">Số lượng</span>
              <span className="text-sm font-black text-slate-800 dark:text-slate-200">
                {contest.questions.length} câu
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-semibold block">Số lần thi</span>
              <span className="text-sm font-black text-slate-800 dark:text-slate-200">
                {contest.maxAttempts === 1 ? '1 lần duy nhất' : `${contest.maxAttempts} lần`}
              </span>
            </div>
          </div>

          {/* Schedule Info */}
          <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400 flex items-center space-x-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>Bắt đầu mở thi:</span>
              </span>
              <strong className="text-slate-800 dark:text-slate-200">{formatContestDateTime(contest.startTime)}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400 flex items-center space-x-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-rose-600" />
                <span>Hết hạn đóng đề:</span>
              </span>
              <strong className="text-slate-800 dark:text-slate-200">{formatContestDateTime(contest.endTime)}</strong>
            </div>
          </div>

          {/* STATUS CONDITION */}
          {status === 'upcoming' ? (
            <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-center space-y-2">
              <Clock className="w-8 h-8 text-amber-600 mx-auto animate-bounce" />
              <h3 className="text-sm font-black text-amber-900 dark:text-amber-200">
                Cuộc thi chưa bắt đầu!
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Thời gian mở còn lại: <strong>{getRelativeTimeRemaining(contest.startTime)}</strong>
              </p>
              <p className="text-[11px] text-slate-500">
                Vui lòng quay lại đúng giờ để tham gia thi đấu.
              </p>
            </div>
          ) : status === 'ended' ? (
            <div className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-800 text-center space-y-3">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
                Cuộc thi đã kết thúc!
              </h3>
              <p className="text-xs text-slate-500">
                Thời gian làm bài cho cuộc thi này đã khép lại. Em có thể xem Bảng Xếp Hạng tổng kết bên dưới:
              </p>
              <button
                onClick={() => navigate(`/contest/${contest.code}/ranking`)}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-xs"
              >
                <Trophy className="w-4 h-4" />
                <span>Xem Bảng Xếp Hạng</span>
              </button>
            </div>
          ) : (
            /* ONGOING - Cho phép điền thông tin và thi */
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Họ và tên học sinh <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Ví dụ: Nguyễn Văn An"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Lớp <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Users className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Ví dụ: 7A1"
                      value={studentClass}
                      onChange={(e) => setStudentClass(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
              </div>

              {/* Anti-cheat note */}
              <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 flex items-start space-x-2.5 text-xs text-rose-800 dark:text-rose-300">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <div className="space-y-0.5">
                  <span className="font-bold block">Quy định phòng thi trực tuyến:</span>
                  <p className="text-[11px] leading-relaxed">
                    Hệ thống tự động giám sát và đếm số lần chuyển tab hoặc mở ứng dụng khác. Hãy làm bài nghiêm túc trên cùng một màn hình để tránh bị trừ điểm hoặc hủy bài thi.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleStartExam}
                className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-black text-sm shadow-lg hover:shadow-xl transition-all active:scale-98 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>BẮT ĐẦU LÀM BÀI THI</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Public ranking link */}
          <div className="pt-2 text-center">
            <button
              onClick={() => navigate(`/contest/${contest.code}/ranking`)}
              className="text-xs font-bold text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors inline-flex items-center space-x-1"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>Xem Bảng Xếp Hạng hiện tại của cuộc thi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
