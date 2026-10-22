import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { StorageService } from './services/storageService';
import { auth } from './firebase';
import { FirestoreService } from './services/firestoreService';
import { Assignment, ClassRoom, Submission } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { Navbar } from './components/Navbar';
import { StudentProgressBar } from './components/StudentProgressBar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { QRCodeModal } from './components/QRCodeModal';
import { HomePage } from './pages/HomePage';
import { GradeAssignmentsPage } from './pages/GradeAssignmentsPage';
import { TeacherLayout } from './pages/teacher/TeacherLayout';
import { StudentJoinPage } from './pages/student/StudentJoinPage';
import { StudentExamPage } from './pages/student/StudentExamPage';
import { StudentResultPage } from './pages/student/StudentResultPage';
import { LoginPage } from './pages/LoginPage';
import { ContestJoinPage } from './pages/student/contest/ContestJoinPage';
import { ContestExamPage } from './pages/student/contest/ContestExamPage';
import { ContestResultPage } from './pages/student/contest/ContestResultPage';
import { ContestLeaderboardPage } from './pages/student/contest/ContestLeaderboardPage';
import { useLearningProgressStore } from './store/useLearningProgressStore';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const verifiedUid = user?.uid && auth.currentUser?.uid === user.uid ? user.uid : null;
  const sessionKey = verifiedUid || (user?.uid === 'teacher_preview_user' ? 'explicit-preview' : null);
  const currentSession = useRef(sessionKey);
  currentSession.current = sessionKey;
  const refreshVersion = useRef(0);
  const [syncState, setSyncState] = useState<'idle' | 'loading' | 'ready' | 'partial' | 'error'>('idle');

  // Persistent storage state
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  // Student exam taking flow state with sessionStorage restore support
  const [examSession, setExamSession] = useState<{
    assignment?: Assignment;
    studentName?: string;
    classId?: string;
    className?: string;
    submission?: Submission;
    previewFromTeacher?: boolean;
    showcasePreview?: boolean;
  }>(() => {
    try {
      const saved = sessionStorage.getItem('toan_thcs_exam_session');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return {};
  });

  const updateExamSession = (session: typeof examSession | ((prev: typeof examSession) => typeof examSession)) => {
    setExamSession(prev => {
      const next = typeof session === 'function' ? session(prev) : session;
      try {
        if (next && (next.assignment || next.submission)) {
          sessionStorage.setItem('toan_thcs_exam_session', JSON.stringify(next));
        } else {
          sessionStorage.removeItem('toan_thcs_exam_session');
        }
      } catch {
        // ignore
      }
      return next;
    });
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Share modal state
  const [shareAssignment, setShareAssignment] = useState<Assignment | null>(null);

  // Initialize and load data on mount
  useEffect(() => {
    try { StorageService.initDemoData(); }
    catch (error) { console.warn('Cache đầy; không chặn ứng dụng:', error); }

    // Check URL query on root or Hash for legacy/direct assignment join e.g. #assignment=... or /?code=...
    const handleUrlDirectJoin = () => {
      // 1. Check Query parameter on root path
      if (window.location.pathname === '/' || window.location.pathname === '') {
        const params = new URLSearchParams(window.location.search);
        const queryCode = params.get('code') || params.get('assignment');
        if (queryCode) {
          const code = decodeURIComponent(queryCode).trim().toUpperCase();
          navigate(`/join?code=${code}`);
          return;
        }
      }

      // 2. Check Hash e.g. #assignment=... or #/join?code=...
      const hash = window.location.hash;
      if (hash) {
        if (hash.includes('assignment=')) {
          const codeMatch = hash.match(/assignment=([^&]+)/);
          if (codeMatch && codeMatch[1]) {
            const code = decodeURIComponent(codeMatch[1]).trim().toUpperCase();
            navigate(`/join?code=${code}`);
            return;
          }
        }
        if (hash.includes('code=')) {
          const codeMatch = hash.match(/code=([^&]+)/);
          if (codeMatch && codeMatch[1]) {
            const code = decodeURIComponent(codeMatch[1]).trim().toUpperCase();
            navigate(`/join?code=${code}`);
            return;
          }
        }
      }
    };

    handleUrlDirectJoin();
    window.addEventListener('hashchange', handleUrlDirectJoin);
    return () => window.removeEventListener('hashchange', handleUrlDirectJoin);
  }, []);

  // Read-only login sync: never migrate cached exams or classes into production.
  useEffect(() => {
    if (loading) return;
    setClasses([]);
    setAssignments([]);
    setSubmissions([]);
    void refreshAllData();
  }, [loading, sessionKey, user?.email]);

  const refreshAllData = async () => {
    const requestId = ++refreshVersion.current;
    const owner = verifiedUid;
    const token = sessionKey;
    const current = () => requestId === refreshVersion.current
      && currentSession.current === token && (!owner || auth.currentUser?.uid === owner);
    if (!owner) {
      try {
        const localClasses = StorageService.getClasses();
        const localAssignments = StorageService.getAssignments();
        const localSubmissions = StorageService.getSubmissions();
        if (!current()) return;
        setClasses(localClasses);
        setAssignments(localAssignments);
        setSubmissions(localSubmissions);
      } catch (error) {
        console.warn('Không đọc được cache trên máy:', error);
      }
      if (current()) setSyncState('idle');
      return;
    }
    setSyncState('loading');
    try {
      const profile = await FirestoreService.getTeacherProfile(owner, true);
      if (!current()) return;
      const cloudClasses = Array.isArray(profile?.classes) ? profile.classes : [];
      setClasses(cloudClasses);
      try { StorageService.setClasses(cloudClasses); }
      catch { console.warn('Cache lớp đầy, vẫn giữ danh sách Cloud trên màn hình.'); }

      const cloudExams = await FirestoreService.getExams(owner, user?.email, true);
      if (!current()) return;
      // Never filter a Cloud snapshot with flags belonging to another browser login.
      const hidden = new Set((profile?.deletedAssignmentKeys || []).map(
        (k: string) => k.replace(/\s+/g, '').toUpperCase()));
      const isSample = (a: Assignment) => {
        const code = (a.assignmentCode || '').replace(/\s+/g, '').toUpperCase();
        return /^asg_toan[6789]_/.test(a.id)
          || ['TOAN6A1-8K4P','TOAN6-HINH1','TOAN7-DECUONG','TOAN7-TAMGIAC','TOAN8-HANGDANGTHUC','TOAN8-TUGIAC','TOAN9-CANTHUC','TOAN9-DUONGTRON'].includes(code)
          || /EUJ9|Y973|K74Z|FLMH/.test(code);
      };
      const visibleExams = cloudExams.filter(a => {
        const code = (a.assignmentCode || a.id).replace(/\s+/g, '').toUpperCase();
        return !hidden.has(a.id.toUpperCase()) && !hidden.has(code)
          && !(profile?.hasClearedDemoData && isSample(a));
      });
      setAssignments(visibleExams);
      try { StorageService.setAssignments(visibleExams); }
      catch { console.warn('Cache đề đầy, đề Cloud vẫn được hiển thị.'); }

      const cloudResults = await FirestoreService.getAllResults(true);
      if (!current()) return;
      const keys = new Set(visibleExams.flatMap(a => [a.id,a.assignmentCode || ''])
        .map(k => k.replace(/\s+/g, '').toUpperCase()));
      const ownedResults = cloudResults.filter(s =>
        keys.has((s.assignmentId || '').replace(/\s+/g, '').toUpperCase()));
      setSubmissions(ownedResults);
      try { StorageService.setSubmissions(ownedResults); }
      catch { console.warn('Cache bài nộp đầy, kết quả Cloud vẫn được hiển thị.'); }
      setSyncState(!profile || !profile.classes?.length ? 'partial' : 'ready');
    } catch (error) {
      if (!current()) return;
      setSyncState('error');
      console.warn('Đọc dữ liệu Cloud chưa hoàn tất, không ghi đè lên Cloud:', error);
    }
  };

  const handleResetData = () => {
    if (window.confirm('Khôi phục toàn bộ dữ liệu về trạng thái mẫu ban đầu cho Lớp 6, 7, 8, 9?')) {
      StorageService.resetAllData();
      if (user?.uid) {
        FirestoreService.saveTeacherProfile(user.uid, {
          hasClearedDemoData: false,
          deletedAssignmentKeys: [],
          classes: StorageService.getClasses()
        }).catch(() => {});
      }
      refreshAllData();
      alert('Đã khôi phục dữ liệu mẫu thành công!');
    }
  };

  const handleClearDemoData = async () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa hết toàn bộ dữ liệu mẫu (các đề thi, lớp học và kết quả nộp bài mẫu có sẵn)?\n\nLưu ý: Mọi bài tập hoặc lớp học do Thầy/Cô tự tạo thêm sẽ được giữ nguyên an toàn.')) {
      const result = await StorageService.clearDemoDataAsync(user?.uid);
      await refreshAllData();
      alert(`Đã xóa sạch dữ liệu mẫu thành công!\n• Đề mẫu đã xóa: ${result.deletedAssignments}\n• Lớp mẫu đã xóa: ${result.deletedClasses}\n• Lượt nộp mẫu đã xóa: ${result.deletedSubmissions}`);
    }
  };

  const handleStartExam = (
    assignment: Assignment,
    studentName: string,
    classId: string,
    className: string
  ) => {
    updateExamSession({
      assignment,
      studentName,
      classId,
      className
    });
    // Update student name in zustand store
    if (studentName && studentName !== 'Học sinh') {
      useLearningProgressStore.getState().setStudentName(studentName);
    }
    navigate('/exam');
  };

  const handleFinishExam = (submission: Submission) => {
    refreshAllData();
    if (examSession.assignment) {
      // Record progress into Zustand persistent store
      useLearningProgressStore.getState().recordSubmission(submission, examSession.assignment);
    }
    updateExamSession(prev => ({
      ...prev,
      submission
    }));
    navigate('/result');
  };

  const handleRetakeExam = () => {
    if (examSession.assignment && examSession.studentName) {
      navigate('/exam');
    } else {
      navigate('/join');
    }
  };

  const handleTestAssignmentFromTeacher = (assignment: Assignment) => {
    updateExamSession({
      assignment,
      studentName: 'Giáo viên (Làm thử)',
      classId: assignment.classId,
      className: assignment.className || 'Tất cả học sinh'
    });
    navigate('/exam');
  };

  // Đợt 8B: mở ngay một bài nộp đã có ở đúng giao diện học sinh để demo
  // chu trình AI mà không phải chờ làm bài/chờ API chấm lại.
  const handlePreviewSubmissionFromTeacher = (assignment: Assignment, submission: Submission) => {
    updateExamSession({
      assignment,
      submission,
      studentName: submission.studentName || 'Học sinh',
      classId: submission.classId || assignment.classId,
      className: submission.className || assignment.className || 'Tất cả học sinh',
      previewFromTeacher: true,
      showcasePreview: assignment.id.startsWith('showcase_')
    });
    navigate('/result');
  };

  // 8H: tách rõ trải nghiệm học sinh và giáo viên để demo không bị rối.
  const isTakingExam = location.pathname === '/exam' || location.pathname.endsWith('/exam');
  const isTeacherArea = location.pathname.startsWith('/teacher');
  const isHomePage = location.pathname === '/';
  const isStudentEntryPage =
    location.pathname === '/join' ||
    location.pathname.startsWith('/join/') ||
    location.pathname === '/practice' ||
    location.pathname === '/ai-practice' ||
    location.pathname.startsWith('/assignment/') ||
    location.pathname.startsWith('/test/') ||
    (location.pathname.startsWith('/exam/') && location.pathname !== '/exam');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Màn làm bài có header riêng; ẩn Navbar chung để tập trung vào đề. */}
      {!isTakingExam && (
        <Navbar onResetData={handleResetData} onClearDemoData={handleClearDemoData} />
      )}

      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-center text-xs font-bold text-amber-800">
          Mất kết nối mạng • dữ liệu trên máy vẫn được giữ, tính năng AI sẽ chờ khi có mạng
        </div>
      )}

      {isTeacherArea && verifiedUid && syncState !== 'ready' && syncState !== 'idle' && (
        <div role="status" className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-center text-xs font-bold text-amber-900">
          {syncState === 'loading'
            ? 'Đang tải dữ liệu từ Firebase; số liệu chưa được xác nhận.'
            : syncState === 'partial'
              ? 'Hồ sơ Cloud của tài khoản hiện tại chưa có danh sách lớp; không tự ghi đè lớp.'
              : 'Chưa tải đủ dữ liệu Firebase; số liệu hiển thị có thể chưa đầy đủ.'}
        </div>
      )}
      {isTeacherArea && user?.uid === 'teacher_preview_user' && (
        <div role="status" className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-center text-xs font-bold text-amber-900">
          Chế độ giáo viên xem trước: không phải tài khoản Google thật; số liệu chỉ là dữ liệu trên máy.
        </div>
      )}
      {/* Top Zustand Learning Progress Bar (Sticky / Header Status Bar) */}
      {!isTakingExam && !isTeacherArea && !isHomePage && !isStudentEntryPage && (
        <StudentProgressBar assignments={assignments} />
      )}

      {/* Main Page Routing */}
      <main className="flex-1 pb-20 md:pb-6">
        <Routes>
          {/* Home Page with 4 Grade Cards */}
          <Route 
            path="/" 
            element={<HomePage assignments={assignments} />} 
          />

          {/* Login Page */}
          <Route 
            path="/login" 
            element={<LoginPage />} 
          />

          {/* Specific Grade Assignments Page */}
          <Route
            path="/grade/:gradeId"
            element={
              <GradeAssignmentsPage
                assignments={assignments}
                classes={classes}
                onRefresh={refreshAllData}
                onTestAssignment={handleTestAssignmentFromTeacher}
              />
            }
          />

          {/* Student Join / Enter Code Page */}
          <Route
            path="/join"
            element={<StudentJoinPage onStartExam={handleStartExam} />}
          />
          <Route
            path="/practice"
            element={<StudentJoinPage initialTab="ai_practice" onStartExam={handleStartExam} />}
          />
          <Route
            path="/ai-practice"
            element={<StudentJoinPage initialTab="ai_practice" onStartExam={handleStartExam} />}
          />
          <Route
            path="/join/:code"
            element={<StudentJoinPage onStartExam={handleStartExam} />}
          />
          <Route
            path="/assignment/:code"
            element={<StudentJoinPage onStartExam={handleStartExam} />}
          />
          <Route
            path="/exam/:code"
            element={<StudentJoinPage onStartExam={handleStartExam} />}
          />
          <Route
            path="/test/:code"
            element={<StudentJoinPage onStartExam={handleStartExam} />}
          />

          {/* Student Active Exam Page */}
          <Route
            path="/exam"
            element={
              examSession.assignment ? (
                <StudentExamPage
                  key={`${examSession.assignment.id}:${examSession.studentName || ''}:${(examSession.assignment as Assignment & { updatedAt?: string }).updatedAt || ''}`}
                  assignment={examSession.assignment}
                  studentName={examSession.studentName || 'Học sinh'}
                  classId={examSession.classId || 'other'}
                  className={examSession.className || 'Tự do'}
                  onFinishExam={handleFinishExam}
                />
              ) : (
                <Navigate to="/join" replace />
              )
            }
          />

          {/* Student Result & Review Page */}
          <Route
            path="/result"
            element={
              examSession.submission && examSession.assignment ? (
                <StudentResultPage
                  submission={examSession.submission}
                  assignment={examSession.assignment}
                  onRetake={handleRetakeExam}
                  isDemoPreview={!!examSession.showcasePreview}
                  isTeacherPreview={!!examSession.previewFromTeacher}
                  onGoHome={() => {
                    const shouldReturnToTeacher = !!examSession.previewFromTeacher;
                    updateExamSession({});
                    navigate(shouldReturnToTeacher ? '/teacher#judge-demo' : '/');
                  }}
                />
              ) : (
                <Navigate to="/join" replace />
              )
            }
          />

          {/* Online Contest (Thi trực tuyến) Routes */}
          <Route path="/contest/:code" element={<ContestJoinPage />} />
          <Route path="/contest/:code/exam" element={<ContestExamPage />} />
          <Route path="/contest/:code/result/:submissionId" element={<ContestResultPage />} />
          <Route path="/contest/:code/ranking" element={<ContestLeaderboardPage />} />

          {/* Protected Teacher Portal */}
          <Route
            path="/teacher/*"
            element={
              <PrivateRoute>
                {verifiedUid && (syncState === 'loading' || syncState === 'idle') ? (
                  <div className="mx-auto max-w-xl p-8 text-center text-slate-700" role="status">
                    <div className="text-lg font-bold">Đang đồng bộ tài khoản giáo viên...</div>
                    <p className="mt-3 text-sm">Chỉ hiển thị số liệu sau khi Firebase xác nhận. Chưa có kết quả tải không có nghĩa dữ liệu đã mất.</p>
                  </div>
                ) : verifiedUid && syncState === 'error' ? (
                  <div className="mx-auto max-w-xl p-8 text-center text-slate-700" role="alert">
                    <div className="text-lg font-bold text-amber-800">Không tải được dữ liệu mới từ Firebase</div>
                    <p className="mt-3 text-sm">Không hiển thị số 0 giả khi mạng hoặc Firebase gặp lỗi. Dữ liệu trên Cloud chưa bị thay đổi.</p>
                    <button
                      type="button"
                      className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white"
                      onClick={() => void refreshAllData()}
                    >Tải lại dữ liệu Cloud</button>
                  </div>
                ) : (
                  <TeacherLayout
                    classes={Array.isArray(classes) ? classes : []}
                    assignments={Array.isArray(assignments) ? assignments : []}
                    submissions={Array.isArray(submissions) ? submissions : []}
                    onRefreshData={refreshAllData}
                    onOpenShare={(asg) => setShareAssignment(asg)}
                    onTestAssignment={handleTestAssignmentFromTeacher}
                    onPreviewSubmission={handlePreviewSubmissionFromTeacher}
                    onResetData={handleResetData}
                    onClearDemoData={handleClearDemoData}
                  />
                )}
              </PrivateRoute>
            }
          />

          {/* Catch-all redirect to Home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* PWA / mobile student controls: ẩn trong khu vực giáo viên để demo sạch và tập trung. */}
      {!isTeacherArea && !isTakingExam && <PWAInstallBanner />}

      {!isTakingExam && !isTeacherArea && !isStudentEntryPage && (
        <MobileBottomNav 
          onOpenProgress={() => useLearningProgressStore.getState().setProgressModalOpen(true)} 
        />
      )}

      {/* QR Code & Share Modal */}
      {shareAssignment && (
        <QRCodeModal
          assignment={shareAssignment}
          isOpen={!!shareAssignment}
          onClose={() => setShareAssignment(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

