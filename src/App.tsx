import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { StorageService } from './services/storageService';
import { auth, firebaseConfig } from './firebase';
import { setTeacherSyncDiagnostics, TeacherSyncDiagnostics } from './services/teacherSyncDiagnostics';
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
  const { user } = useAuth();
  const cloudRefreshVersion = useRef(0);
  const currentTeacherUid = useRef(user?.uid || null);
  currentTeacherUid.current = user?.uid || null;

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
    StorageService.initDemoData();
    refreshAllData();

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

  // Read-only on sign-in. Never migrate a browser cache or an empty class list
  // into a teacher's production profile merely because a read was missing/failed.
  useEffect(() => {
    setClasses([]); setAssignments([]); setSubmissions([]);
    void refreshAllData();
  }, [user?.uid, user?.email]);

  const refreshAllData = async () => {
    const version = ++cloudRefreshVersion.current;
    const owner = user?.uid || null;
    const current = () => version === cloudRefreshVersion.current && currentTeacherUid.current === owner;
    StorageService.setCloudCacheOwner(owner);
    if (!owner) {
      setClasses(StorageService.getClasses());
      setAssignments(StorageService.getAssignments());
      setSubmissions(StorageService.getSubmissions());
      setTeacherSyncDiagnostics({ status: 'idle' });
      return;
    }
    const diagnostic: TeacherSyncDiagnostics = { status: 'loading', uid: owner,
      firebaseUid: auth.currentUser?.uid || null, email: user?.email || null, projectId: firebaseConfig.projectId };
    setTeacherSyncDiagnostics(diagnostic);
    try {
      let profile: Awaited<ReturnType<typeof FirestoreService.getTeacherProfile>> | undefined;
      try { profile = await FirestoreService.getTeacherProfile(owner, { requireServer: true }); }
      catch (error: any) {
        const code = String(error?.code || 'unknown');
        diagnostic.errorCode = /^[a-z/-]{1,70}$/.test(code) ? code : 'unknown';
        diagnostic.classesState = 'read-error';
      }
      if (!current()) return;
      if (profile !== undefined) {
        const cloudClasses = Array.isArray(profile?.classes) ? profile.classes : [];
        diagnostic.classesState = !profile ? 'profile-missing' : !Array.isArray(profile.classes) ? 'field-missing' : cloudClasses.length ? 'present' : 'empty';
        diagnostic.classCount = cloudClasses.length;
        setClasses(cloudClasses);
        StorageService.cacheCloudClasses(cloudClasses);
      }
      const cloudExams = await FirestoreService.getExams(owner, user?.email, { requireServer: true,
        onQuery: counts => Object.assign(diagnostic, counts) });
      if (!current()) return;
      // Browser deletion/demo flags can be stale or belong to a different UID.
      // Only the current teacher's Cloud profile can filter a Cloud snapshot.
      const deleted = new Set<string>((profile?.deletedAssignmentKeys || []).map((key: string) => key.replace(/\s+/g, '').toUpperCase()));
      const validCloudExams = cloudExams.filter(a => {
        const code = (a.assignmentCode || a.id).replace(/\s+/g, '').toUpperCase();
        if (deleted.has(a.id.toUpperCase()) || deleted.has(code)) return false;
        return !profile?.hasClearedDemoData || !(/^asg_toan[6789]_/.test(a.id)
          || ['TOAN6A1-8K4P', 'TOAN6-HINH1', 'TOAN7-DECUONG', 'TOAN7-TAMGIAC', 'TOAN8-HANGDANGTHUC', 'TOAN8-TUGIAC', 'TOAN9-CANTHUC', 'TOAN9-DUONGTRON'].includes(code)
          || /EUJ9|Y973|K74Z|FLMH/.test(code));
      });
      // State is updated before any optional cache work. No LocalStorage write,
      // no historical saveExam/saveResult/profile write anywhere in this read path.
      setAssignments(validCloudExams);
      StorageService.cacheCloudAssignments(validCloudExams);
      diagnostic.cloudExams = cloudExams.length;
      diagnostic.visibleExams = validCloudExams.length;
      const examKeys = new Set(validCloudExams.flatMap(a => [a.id, a.assignmentCode || '']).map(key => key.replace(/\s+/g, '').toUpperCase()));
      const allResults = await FirestoreService.getAllResults({ requireServer: true });
      if (!current()) return;
      const ownedResults = allResults.filter(s => examKeys.has((s.assignmentId || '').replace(/\s+/g, '').toUpperCase()));
      setSubmissions(ownedResults);
      StorageService.cacheCloudSubmissions(ownedResults);
      setTeacherSyncDiagnostics({ ...diagnostic, status: diagnostic.emailQueryFailed || diagnostic.errorCode ? 'partial' : 'ready' });
    } catch (error: any) {
      if (!current()) return;
      const code = String(error?.code || 'unknown');
      setTeacherSyncDiagnostics({ ...diagnostic, status: diagnostic.visibleExams === undefined ? 'error' : 'partial', errorCode: /^[a-z/-]{1,70}$/.test(code) ? code : 'unknown' });
      console.warn('Chưa hoàn tất đọc Cloud; giữ dữ liệu phiên hiện tại, không ghi ngược cache.');
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

