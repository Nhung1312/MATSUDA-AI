import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { StorageService } from './services/storageService';
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

  // Persistent storage state
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  // Student exam taking flow state with sessionStorage restore support
  const [examSession, setExamSession] = useState<{
    assignment?: Assignment;
    studentName?: string;
    classId?: string;
    className?: string;
    submission?: Submission;
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

  // Tự động đồng bộ hồ sơ Giáo viên khi đăng nhập tài khoản
  useEffect(() => {
    if (!user?.uid) return;

    const syncTeacherCloudData = async () => {
      try {
        const profile = await FirestoreService.getTeacherProfile(user.uid);
        
        // 1. Nếu trên Cloud Firestore đã có dữ liệu hoặc đã được khởi tạo
        if (profile && (profile.cloudInitialized || profile.hasMigratedInitialData || (Array.isArray(profile.classes) && profile.classes.length > 0))) {
          // FIRESTORE LÀ NGUỒN CHÂN LÝ: Cloud -> LocalStorage & State
          if (profile.hasClearedDemoData) {
            StorageService.setClearedDemoData(true);
          }
          if (Array.isArray(profile.deletedAssignmentKeys)) {
            profile.deletedAssignmentKeys.forEach(k => StorageService.markAssignmentAsDeleted(k, k));
          }

          const cloudClasses = Array.isArray(profile.classes) ? profile.classes : [];
          StorageService.setClasses(cloudClasses);
          setClasses(cloudClasses);

          // Đảm bảo cờ cloudInitialized đã được lưu trên Firestore
          if (!profile.cloudInitialized) {
            await FirestoreService.saveTeacherClasses(user.uid, cloudClasses);
          }
        } else {
          // 2. TÀI KHOẢN MỚI TRÊN CLOUD: Thực hiện migrate dữ liệu local hợp lệ lên Cloud MỘT LẦN DUY NHẤT
          const isCleared = StorageService.hasClearedDemoData();
          const localClasses = StorageService.getClasses();
          const localAssignments = StorageService.getAssignments();
          const deletedKeys = Array.from(StorageService.getDeletedAssignmentKeys());

          const isSample = (a: Assignment) => {
            if (!a) return false;
            if (a.id.startsWith('asg_toan6_') || a.id.startsWith('asg_toan7_') || a.id.startsWith('asg_toan8_') || a.id.startsWith('asg_toan9_')) return true;
            const c = (a.assignmentCode || '').toUpperCase().trim();
            if (['TOAN6A1-8K4P', 'TOAN6-HINH1', 'TOAN7-DECUONG', 'TOAN7-TAMGIAC', 'TOAN8-HANGDANGTHUC', 'TOAN8-TUGIAC', 'TOAN9-CANTHUC', 'TOAN9-DUONGTRON'].includes(c)) return true;
            if (c.includes('EUJ9') || c.includes('Y973') || c.includes('K74Z') || c.includes('FLMH')) return true;
            return false;
          };

          for (const asg of localAssignments) {
            if (!isSample(asg) && !deletedKeys.includes(asg.id)) {
              try {
                await FirestoreService.saveExam(asg, {
                  uid: user.uid,
                  email: user.email || '',
                  displayName: user.displayName || 'Giáo viên'
                });
              } catch (e) {
                console.warn('Lỗi migrate đề local sang Firestore:', e);
              }
            }
          }

          await FirestoreService.saveTeacherProfile(user.uid, {
            email: user.email || '',
            displayName: user.displayName || 'Giáo viên',
            hasClearedDemoData: isCleared,
            deletedAssignmentKeys: deletedKeys,
            classes: Array.isArray(localClasses) ? localClasses : [],
            cloudInitialized: true,
            hasMigratedInitialData: true,
            updatedAt: new Date().toISOString()
          });
          setClasses(Array.isArray(localClasses) ? localClasses : []);
        }

        // Tải toàn bộ bài tập và kết quả bài làm mới nhất từ Firestore
        await refreshAllData();
      } catch (err) {
        console.warn('Lỗi khi đồng bộ dữ liệu giáo viên từ Cloud:', err);
      }
    };

    syncTeacherCloudData();
  }, [user?.uid]);

  const refreshAllData = async () => {
    const deletedKeys = StorageService.getDeletedAssignmentKeys();
    const isCleared = StorageService.hasClearedDemoData();

    const isSample = (a: Assignment) => {
      if (!a) return false;
      if (a.id.startsWith('asg_toan6_') || a.id.startsWith('asg_toan7_') || a.id.startsWith('asg_toan8_') || a.id.startsWith('asg_toan9_')) return true;
      const c = (a.assignmentCode || '').toUpperCase().trim();
      if (['TOAN6A1-8K4P', 'TOAN6-HINH1', 'TOAN7-DECUONG', 'TOAN7-TAMGIAC', 'TOAN8-HANGDANGTHUC', 'TOAN8-TUGIAC', 'TOAN9-CANTHUC', 'TOAN9-DUONGTRON'].includes(c)) return true;
      if (c.includes('EUJ9') || c.includes('Y973') || c.includes('K74Z') || c.includes('FLMH')) return true;
      return false;
    };

    // 1. Nếu chưa đăng nhập (khách vãng lai / học sinh): Chỉ đọc từ local
    if (!user?.uid) {
      const localClasses = StorageService.getClasses();
      const localAssignments = StorageService.getAssignments().filter(a => {
        const codeKey = (a.assignmentCode || a.id).replace(/\s+/g, '').toUpperCase();
        if (deletedKeys.has(a.id) || deletedKeys.has(codeKey)) return false;
        if (isCleared && isSample(a)) return false;
        return true;
      });
      const localSubmissions = StorageService.getSubmissions();

      setClasses(Array.isArray(localClasses) ? localClasses : []);
      setAssignments(Array.isArray(localAssignments) ? localAssignments : []);
      setSubmissions(Array.isArray(localSubmissions) ? localSubmissions : []);
      return;
    }

    // 2. KHI GIÁO VIÊN ĐÃ ĐĂNG NHẬP:
    // 2a. Đọc nhanh từ cache hiện tại để UI hiển thị tức thì không bị giật
    const cachedClasses = StorageService.getClasses();
    const cachedAssignments = StorageService.getAssignments().filter(a => {
      const codeKey = (a.assignmentCode || a.id).replace(/\s+/g, '').toUpperCase();
      if (deletedKeys.has(a.id) || deletedKeys.has(codeKey)) return false;
      if (isCleared && isSample(a)) return false;
      return true;
    });
    const cachedSubmissions = StorageService.getSubmissions();

    setClasses(Array.isArray(cachedClasses) ? cachedClasses : []);
    setAssignments(Array.isArray(cachedAssignments) ? cachedAssignments : []);
    setSubmissions(Array.isArray(cachedSubmissions) ? cachedSubmissions : []);

    // 2b. FIRESTORE LÀ NGUỒN CHÂN LÝ DUY NHẤT (Single Source of Truth)
    try {
      // (i) Đồng bộ danh sách Lớp học và cấu hình từ Profile Giáo viên trên Cloud
      const profile = await FirestoreService.getTeacherProfile(user.uid);
      if (profile) {
        if (profile.hasClearedDemoData) {
          StorageService.setClearedDemoData(true);
        }
        if (Array.isArray(profile.deletedAssignmentKeys)) {
          profile.deletedAssignmentKeys.forEach(k => StorageService.markAssignmentAsDeleted(k, k));
        }
        if (Array.isArray(profile.classes)) {
          StorageService.setClasses(profile.classes);
          setClasses(profile.classes);
        }
      }

      const activeDeletedKeys = StorageService.getDeletedAssignmentKeys();
      const activeIsCleared = StorageService.hasClearedDemoData();

      // (ii) Tải danh sách đề thi chính thức của đúng giáo viên từ Firestore
      const cloudExams = await FirestoreService.getExams(user.uid, user.email);
      const validCloudExams = (Array.isArray(cloudExams) ? cloudExams : []).filter(a => {
        if (!a) return false;
        const codeKey = (a.assignmentCode || a.id).replace(/\s+/g, '').toUpperCase();
        if (activeDeletedKeys.has(a.id) || activeDeletedKeys.has(codeKey)) return false;
        if (activeIsCleared && isSample(a)) return false;
        return true;
      });

      // TUYỆT ĐỐI KHÔNG MERGE LOCALSTORAGE VÀO FIRESTORE!
      // Firestore là nguồn chính: Ghi đè vào Cache và State
      StorageService.setAssignments(validCloudExams);
      setAssignments(validCloudExams);

      // (iii) Tải kết quả bài nộp của học sinh từ Firestore thuộc về các đề của giáo viên này
      const allCloudResults = await FirestoreService.getAllResults();
      const teacherExamKeys = new Set<string>();
      validCloudExams.forEach(a => {
        if (a.id) teacherExamKeys.add(a.id);
        if (a.assignmentCode) {
          teacherExamKeys.add(a.assignmentCode.toUpperCase().trim());
          teacherExamKeys.add(a.assignmentCode.replace(/\s+/g, '').toUpperCase());
        }
      });

      const teacherCloudSubmissions = (Array.isArray(allCloudResults) ? allCloudResults : []).filter(s => {
        if (!s || !s.assignmentId) return false;
        const rawId = s.assignmentId.trim();
        const cleanId = rawId.replace(/\s+/g, '').toUpperCase();
        return teacherExamKeys.has(rawId) || teacherExamKeys.has(cleanId);
      });

      // TUYỆT ĐỐI KHÔNG MERGE SUBMISSION CŨ TỪ LOCALSTORAGE!
      StorageService.setSubmissions(teacherCloudSubmissions);
      setSubmissions(teacherCloudSubmissions);
    } catch (e) {
      console.warn('Lỗi đồng bộ dữ liệu từ Firestore:', e);
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

  // Check if we are inside an ongoing active exam (to hide progress bar during test for distraction-free)
  const isTakingExam = location.pathname === '/exam' || location.pathname.endsWith('/exam');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Top Navbar */}
      <Navbar onResetData={handleResetData} onClearDemoData={handleClearDemoData} />

      {/* Top Zustand Learning Progress Bar (Sticky / Header Status Bar) */}
      {!isTakingExam && (
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
                  onGoHome={() => {
                    updateExamSession({});
                    navigate('/');
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

      {/* PWA Add to Home Screen Prompt Banner */}
      <PWAInstallBanner />

      {/* Mobile Native-Style Bottom Navigation Bar (Hidden during active test for focus) */}
      {!isTakingExam && (
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

