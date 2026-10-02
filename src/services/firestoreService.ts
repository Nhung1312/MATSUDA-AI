import { 
  db, 
  auth,
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp 
} from '../firebase';
import { Assignment, Submission, ClassRoom, ExamTemplate, Contest, ContestSubmission } from '../types';

export const EXAMS_COLLECTION = 'exams';
export const RESULTS_COLLECTION = 'results';
export const CLASSES_COLLECTION = 'classes';
export const EXAM_TEMPLATES_COLLECTION = 'exam_templates'; // MỚI: Collection cho Kho Đề
export const CONTESTS_COLLECTION = 'contests'; // MỚI: Collection cho Cuộc thi trực tuyến
export const CONTEST_SUBMISSIONS_COLLECTION = 'contest_submissions'; // MỚI: Kết quả thi trực tuyến
export const CONTEST_DRAFTS_COLLECTION = 'contest_drafts'; // MỚI: Lưu nháp thi trực tuyến
export const TEACHERS_COLLECTION = 'teachers'; // Hồ sơ và dữ liệu đồng bộ của Giáo viên

/**
 * Hàm làm sạch dữ liệu trước khi gửi lên Cloud Firestore.
 * Trong Firebase SDK, nếu bất kỳ trường nào có giá trị `undefined`,
 * setDoc sẽ throw Exception "Unsupported field value: undefined" và hủy toàn bộ thao tác ghi.
 * Hàm này loại bỏ 100% các giá trị undefined ở mọi cấp độ sâu để đảm bảo ghi thành công tuyệt đối.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined || data === null) return data;
  return JSON.parse(JSON.stringify(data));
}

/**
 * Helper chuẩn hóa tài liệu đề thi từ Firestore để đảm bảo không bao giờ bị undefined
 * (nhất là mảng questions, assignmentCode, title) gây lỗi trắng màn hình (WSOD)
 */
export function normalizeAssignmentDoc(data: any, id: string): Assignment {
  const safeData = (data && typeof data === 'object') ? data : {};
  return {
    ...safeData,
    id: id || safeData.id || `asg_${Date.now()}`,
    title: safeData.title || 'Bài tập',
    grade: safeData.grade || '6',
    topic: safeData.topic || 'Toán học',
    classId: safeData.classId || 'all',
    className: safeData.className || 'Tất cả học sinh',
    questions: Array.isArray(safeData.questions) ? safeData.questions : [],
    durationMinutes: Number(safeData.durationMinutes) || 0,
    deadline: safeData.deadline || '',
    allowViewResult: safeData.allowViewResult !== false,
    assignmentCode: safeData.assignmentCode || id || '',
    createdAt: safeData.createdAt || new Date().toISOString(),
    isPublished: safeData.isPublished !== false,
    type: safeData.type || (safeData.pdfUrl ? 'pdf' : 'text'),
    pdfUrl: safeData.pdfUrl || undefined,
    templateId: safeData.templateId || undefined
  };
}

export class FirestoreService {
  /**
   * 1. Lưu đề thi mới hoặc cập nhật đề thi vào Firestore collection "exams"
   */
  static async saveExam(
    assignment: Assignment, 
    teacherUser?: { uid: string; email?: string | null; displayName?: string | null }
  ): Promise<void> {
    try {
      const examDocRef = doc(db, EXAMS_COLLECTION, assignment.id);
      const currentAuthUser = auth.currentUser;
      const effectiveTeacher = teacherUser || (currentAuthUser ? {
        uid: currentAuthUser.uid,
        email: currentAuthUser.email || '',
        displayName: currentAuthUser.displayName || 'Giáo viên'
      } : undefined);
       
      const payload: any = {
        ...assignment,
        assignmentCode: (assignment.assignmentCode || '').toUpperCase().trim(),
        updatedAt: new Date().toISOString()
      };

      if (effectiveTeacher?.uid) {
        payload.teacherId = effectiveTeacher.uid;
        payload.teacherEmail = effectiveTeacher.email || '';
        payload.teacherName = effectiveTeacher.displayName || 'Giáo viên';
      }

      // Làm sạch toàn bộ các giá trị undefined trước khi setDoc
      const cleanPayload = sanitizeForFirestore(payload);

      await setDoc(examDocRef, cleanPayload, { merge: true });
      console.log(`[Firestore] Đã lưu đề thi ${assignment.id} (${assignment.assignmentCode}) lên Cloud Firestore thành công.`);
    } catch (error) {
      console.error('[Firestore Error] Không thể lưu đề thi lên Firestore:', error);
      throw error;
    }
  }

  /**
   * 2. Tìm kiếm đề thi theo "Mã đề" (assignmentCode) trên Firestore
   */
  static async getExamByCode(code: string): Promise<Assignment | null> {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();
     
    try {
      const q = query(
        collection(db, EXAMS_COLLECTION),
        where('assignmentCode', '==', cleanCode)
      );

      const querySnapshot = await getDocs(q);
       
      if (!querySnapshot.empty) {
        return normalizeAssignmentDoc(querySnapshot.docs[0].data(), querySnapshot.docs[0].id);
      }

      const docRef = doc(db, EXAMS_COLLECTION, cleanCode);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return normalizeAssignmentDoc(docSnap.data(), docSnap.id);
      }

      // Dự phòng tìm kiếm mềm (bỏ dấu gạch ngang hoặc khoảng trắng thừa)
      const codeNoDash = cleanCode.replace(/[^A-Z0-9]/g, '');
      if (codeNoDash) {
        const allExams = await this.getExams();
        const found = allExams.find(e => {
          const rawCode = (e.assignmentCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
          const rawId = (e.id || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
          return rawCode === codeNoDash || rawId === codeNoDash;
        });
        if (found) return found;
      }

      return null;
    } catch (error) {
      console.error('[Firestore Error] Lỗi tìm đề theo mã:', error);
      return null;
    }
  }

  /**
   * Lấy chi tiết đề thi theo ID
   */
  static async getExamById(id: string): Promise<Assignment | null> {
    try {
      const docRef = doc(db, EXAMS_COLLECTION, id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return normalizeAssignmentDoc(docSnap.data(), docSnap.id);
      }
      return null;
    } catch (error) {
      console.error('[Firestore Error] Lỗi lấy đề thi theo ID:', error);
      return null;
    }
  }

  /**
   * 3. Lưu kết quả nộp bài của học sinh vào Firestore collection "results"
   */
  static async saveResult(submission: Submission): Promise<void> {
    try {
      const resultDocRef = doc(db, RESULTS_COLLECTION, submission.id);
       
      const payload = {
        ...submission,
        createdAt: new Date().toISOString()
      };

      await setDoc(resultDocRef, sanitizeForFirestore(payload), { merge: true });
      console.log(`[Firestore] Đã lưu kết quả bài nộp của học sinh ${submission.studentName} (${submission.totalScore}đ) lên Cloud Firestore.`);
    } catch (error) {
      console.error('[Firestore Error] Không thể lưu kết quả nộp bài lên Firestore:', error);
      throw error;
    }
  }

  /**
   * Lấy danh sách đề thi của giáo viên (lọc theo teacherId) hoặc toàn bộ đề trên Firestore
   */
  static async getExams(teacherId?: string, teacherEmail?: string | null): Promise<Assignment[]> {
    try {
      if (!teacherId) {
        const q = query(collection(db, EXAMS_COLLECTION));
        const querySnapshot = await getDocs(q);
        const exams: Assignment[] = [];
        querySnapshot.forEach((docSnap) => {
          exams.push(normalizeAssignmentDoc(docSnap.data(), docSnap.id));
        });
        return exams;
      }

      // Query lọc theo teacherId của giáo viên (Đảm bảo giáo viên A không nhìn thấy đề giáo viên B)
      const q = query(
        collection(db, EXAMS_COLLECTION),
        where('teacherId', '==', teacherId)
      );
      const querySnapshot = await getDocs(q);
      const map = new Map<string, Assignment>();
      querySnapshot.forEach((docSnap) => {
        map.set(docSnap.id, normalizeAssignmentDoc(docSnap.data(), docSnap.id));
      });

      // Nếu có email giáo viên, query thêm theo teacherEmail để không bị sót đề cũ tạo trước đó
      if (teacherEmail) {
        try {
          const qEmail = query(
            collection(db, EXAMS_COLLECTION),
            where('teacherEmail', '==', teacherEmail)
          );
          const emailSnap = await getDocs(qEmail);
          emailSnap.forEach((docSnap) => {
            if (!map.has(docSnap.id)) {
              map.set(docSnap.id, normalizeAssignmentDoc(docSnap.data(), docSnap.id));
            }
          });
        } catch (emailErr) {
          console.warn('[Firestore] Query teacherEmail fallback non-fatal:', emailErr);
        }
      }

      return Array.from(map.values());
    } catch (error) {
      console.error('[Firestore Error] Lỗi tải danh sách đề thi:', error);
      return [];
    }
  }

  /**
   * Lấy danh sách kết quả bài làm theo assignmentId từ Firestore
   */
  static async getResultsByAssignment(assignmentId: string): Promise<Submission[]> {
    try {
      const q = query(
        collection(db, RESULTS_COLLECTION),
        where('assignmentId', '==', assignmentId)
      );
      const querySnapshot = await getDocs(q);
      const results: Submission[] = [];
      querySnapshot.forEach((docSnap) => {
        results.push({
          ...(docSnap.data() as Submission),
          id: docSnap.id
        });
      });
      return results;
    } catch (error) {
      console.error('[Firestore Error] Lỗi tải danh sách kết quả bài thi:', error);
      return [];
    }
  }

  /**
   * Lấy toàn bộ kết quả bài nộp từ Firestore (Dùng cho Giáo viên đồng bộ giữa các máy)
   */
  static async getAllResults(): Promise<Submission[]> {
    try {
      const q = query(collection(db, RESULTS_COLLECTION));
      const querySnapshot = await getDocs(q);
      const results: Submission[] = [];
      querySnapshot.forEach((docSnap) => {
        results.push({
          ...(docSnap.data() as Submission),
          id: docSnap.id
        });
      });
      return results;
    } catch (error) {
      console.error('[Firestore Error] Lỗi tải tất cả kết quả từ Firestore:', error);
      return [];
    }
  }

  /**
   * Xóa đề thi triệt để trên Firestore (hỗ trợ cả assignmentId và assignmentCode)
   */
  static async deleteExam(assignmentId: string, assignmentCode?: string): Promise<void> {
    try {
      if (assignmentId) {
        try {
          await deleteDoc(doc(db, EXAMS_COLLECTION, assignmentId));
        } catch (err) {
          console.warn(`[Firestore] Lỗi xóa doc theo id ${assignmentId}:`, err);
        }
      }

      if (assignmentCode) {
        const rawCode = assignmentCode.trim().toUpperCase();
        const noSpaceCode = rawCode.replace(/\s+/g, '');
        const withDashCode = rawCode.replace(/\s*-\s*/g, '-');

        const codesToTry = Array.from(new Set([rawCode, noSpaceCode, withDashCode]));

        for (const code of codesToTry) {
          try {
            await deleteDoc(doc(db, EXAMS_COLLECTION, code));
          } catch {}

          try {
            const q = query(
              collection(db, EXAMS_COLLECTION),
              where('assignmentCode', '==', code)
            );
            const snap = await getDocs(q);
            for (const d of snap.docs) {
              await deleteDoc(d.ref);
            }
          } catch {}
        }
      }

      // Ghi nhận khóa đã xóa vào hồ sơ giáo viên để đồng bộ xóa sang các máy tính khác
      if (auth.currentUser?.uid) {
        try {
          const profile = await FirestoreService.getTeacherProfile(auth.currentUser.uid);
          const currentDeleted = profile?.deletedAssignmentKeys || [];
          const keysToAdd = [assignmentId, assignmentCode].filter(Boolean) as string[];
          const updatedDeleted = Array.from(new Set([...currentDeleted, ...keysToAdd]));
          await FirestoreService.saveTeacherProfile(auth.currentUser.uid, {
            deletedAssignmentKeys: updatedDeleted
          });
        } catch (e) {
          console.warn('[Firestore] Không thể lưu danh sách đề đã xóa vào hồ sơ giáo viên:', e);
        }
      }

      console.log(`[Firestore] Đã xóa đề thi ${assignmentId} (${assignmentCode || ''}) trên Cloud Firestore.`);
    } catch (error) {
      console.error('[Firestore Error] Lỗi xóa đề thi trên Firestore:', error);
      throw error;
    }
  }

  // ==========================================
  // CÁC HÀM MỚI CHO KHO ĐỀ (EXAM TEMPLATES)
  // ==========================================

  /**
   * Lưu một đề mẫu vào Kho Đề (exam_templates)
   */
  static async saveExamTemplate(
    template: ExamTemplate,
    teacherUser?: { uid: string; email?: string | null; displayName?: string | null }
  ): Promise<void> {
    try {
      const templateDocRef = doc(db, EXAM_TEMPLATES_COLLECTION, template.id);
      
      const payload: any = {
        ...template,
        updatedAt: new Date().toISOString()
      };

      if (teacherUser) {
        payload.teacherId = teacherUser.uid;
        payload.teacherEmail = teacherUser.email || '';
        payload.teacherName = teacherUser.displayName || 'Giáo viên';
      }

      await setDoc(templateDocRef, sanitizeForFirestore(payload), { merge: true });
      console.log(`[Firestore] Đã lưu đề mẫu ${template.id} (${template.title}) vào Kho Đề.`);
    } catch (error) {
      console.error('[Firestore Error] Không thể lưu đề mẫu vào Kho Đề:', error);
      throw error;
    }
  }

  /**
   * Lấy danh sách toàn bộ đề mẫu trong Kho Đề (hỗ trợ lọc theo giáo viên)
   */
  static async getExamTemplates(teacherId?: string): Promise<ExamTemplate[]> {
    try {
      let q;
      if (teacherId) {
        q = query(
          collection(db, EXAM_TEMPLATES_COLLECTION),
          where('teacherId', '==', teacherId)
        );
      } else {
        q = query(collection(db, EXAM_TEMPLATES_COLLECTION));
      }

      const querySnapshot = await getDocs(q);
      const templates: ExamTemplate[] = [];
      querySnapshot.forEach((docSnap) => {
        templates.push({
          ...(docSnap.data() as ExamTemplate),
          id: docSnap.id
        });
      });
      return templates;
    } catch (error) {
      console.error('[Firestore Error] Lỗi tải danh sách Kho Đề:', error);
      return [];
    }
  }

  /**
   * Xóa một đề mẫu khỏi Kho Đề
   */
  static async deleteExamTemplate(templateId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, EXAM_TEMPLATES_COLLECTION, templateId));
      console.log(`[Firestore] Đã xóa đề mẫu ${templateId} khỏi Kho Đề.`);
    } catch (error) {
      console.error('[Firestore Error] Lỗi xóa đề mẫu khỏi Kho Đề:', error);
      throw error;
    }
  }

  // ==========================================
  // CÁC HÀM CHO HỆ THỐNG THI TRỰC TUYẾN (CONTESTS)
  // ==========================================

  /**
   * Lưu hoặc cập nhật Cuộc thi trực tuyến
   */
  static async saveContest(
    contest: Contest,
    teacherUser?: { uid: string; email?: string | null; displayName?: string | null }
  ): Promise<void> {
    try {
      const contestDocRef = doc(db, CONTESTS_COLLECTION, contest.id);
      
      const payload: any = {
        ...contest,
        code: contest.code.toUpperCase().trim(),
        updatedAt: new Date().toISOString()
      };

      if (teacherUser) {
        payload.teacherId = teacherUser.uid;
        payload.teacherEmail = teacherUser.email || '';
        payload.teacherName = teacherUser.displayName || 'Giáo viên';
      }

      await setDoc(contestDocRef, sanitizeForFirestore(payload), { merge: true });
      console.log(`[Firestore] Đã lưu cuộc thi ${contest.id} (${contest.code}) lên Cloud Firestore.`);
    } catch (error) {
      console.error('[Firestore Error] Không thể lưu cuộc thi lên Firestore:', error);
      throw error;
    }
  }

  /**
   * Tìm kiếm cuộc thi theo Mã cuộc thi (code)
   */
  static async getContestByCode(code: string): Promise<Contest | null> {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();

    try {
      const q = query(
        collection(db, CONTESTS_COLLECTION),
        where('code', '==', cleanCode)
      );

      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docData = querySnapshot.docs[0].data() as Contest;
        return {
          ...docData,
          id: querySnapshot.docs[0].id
        };
      }

      // Thử tìm theo Document ID
      const docRef = doc(db, CONTESTS_COLLECTION, cleanCode);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return {
          ...(docSnap.data() as Contest),
          id: docSnap.id
        };
      }

      return null;
    } catch (error) {
      console.error('[Firestore Error] Lỗi tìm cuộc thi theo mã:', error);
      return null;
    }
  }

  /**
   * Lấy chi tiết cuộc thi theo ID
   */
  static async getContestById(id: string): Promise<Contest | null> {
    try {
      const docRef = doc(db, CONTESTS_COLLECTION, id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return {
          ...(docSnap.data() as Contest),
          id: docSnap.id
        };
      }
      return null;
    } catch (error) {
      console.error('[Firestore Error] Lỗi lấy cuộc thi theo ID:', error);
      return null;
    }
  }

  /**
   * Lấy danh sách tất cả cuộc thi (hỗ trợ lọc theo giáo viên)
   */
  static async getContests(teacherId?: string): Promise<Contest[]> {
    try {
      let q;
      if (teacherId) {
        q = query(
          collection(db, CONTESTS_COLLECTION),
          where('teacherId', '==', teacherId)
        );
      } else {
        q = query(collection(db, CONTESTS_COLLECTION));
      }

      const querySnapshot = await getDocs(q);
      const contests: Contest[] = [];
      querySnapshot.forEach((docSnap) => {
        contests.push({
          ...(docSnap.data() as Contest),
          id: docSnap.id
        });
      });
      return contests;
    } catch (error) {
      console.error('[Firestore Error] Lỗi tải danh sách cuộc thi:', error);
      return [];
    }
  }

  /**
   * Xóa cuộc thi
   */
  static async deleteContest(contestId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, CONTESTS_COLLECTION, contestId));
      console.log(`[Firestore] Đã xóa cuộc thi ${contestId}.`);
    } catch (error) {
      console.error('[Firestore Error] Lỗi xóa cuộc thi:', error);
      throw error;
    }
  }

  /**
   * Lưu bài làm của thí sinh vào collection contest_submissions
   */
  static async saveContestSubmission(submission: ContestSubmission): Promise<void> {
    try {
      const submissionDocRef = doc(db, CONTEST_SUBMISSIONS_COLLECTION, submission.id);
      const payload = {
        ...submission,
        createdAt: new Date().toISOString()
      };
      await setDoc(submissionDocRef, sanitizeForFirestore(payload), { merge: true });
      console.log(`[Firestore] Đã lưu bài nộp cuộc thi của học sinh ${submission.studentName} (${submission.totalScore}đ).`);
    } catch (error) {
      console.error('[Firestore Error] Không thể lưu bài nộp cuộc thi:', error);
      throw error;
    }
  }

  /**
   * Lấy tất cả bài thi của một cuộc thi (dùng cho Bảng xếp hạng và Chấm điểm)
   */
  static async getContestSubmissions(contestId: string): Promise<ContestSubmission[]> {
    try {
      const q = query(
        collection(db, CONTEST_SUBMISSIONS_COLLECTION),
        where('contestId', '==', contestId)
      );
      const querySnapshot = await getDocs(q);
      const submissions: ContestSubmission[] = [];
      querySnapshot.forEach((docSnap) => {
        submissions.push({
          ...(docSnap.data() as ContestSubmission),
          id: docSnap.id
        });
      });
      return submissions;
    } catch (error) {
      console.error('[Firestore Error] Lỗi tải danh sách bài nộp cuộc thi:', error);
      return [];
    }
  }

  /**
   * Cập nhật điểm và nhận xét tự luận của bài nộp
   */
  static async updateContestSubmission(submissionId: string, updates: Partial<ContestSubmission>): Promise<void> {
    try {
      const docRef = doc(db, CONTEST_SUBMISSIONS_COLLECTION, submissionId);
      const payload = {
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
    } catch (error) {
      console.error('[Firestore Error] Lỗi cập nhật bài nộp cuộc thi:', error);
      throw error;
    }
  }

  /**
   * Lưu nháp bài thi trực tuyến lên Firestore để đồng bộ giữa các thiết bị hoặc tránh mất dữ liệu khi mất mạng
   */
  static async saveContestDraft(contestId: string, studentName: string, draftData: any): Promise<void> {
    try {
      const draftKey = `${contestId}_${encodeURIComponent(studentName.trim())}`;
      const docRef = doc(db, CONTEST_DRAFTS_COLLECTION, draftKey);
      const payload = {
        contestId,
        studentName,
        ...draftData,
        lastSavedAt: new Date().toISOString()
      };
      await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
    } catch (error) {
      console.warn('[Firestore] Lỗi lưu nháp cuộc thi (non-fatal):', error);
    }
  }

  /**
   * Lấy nháp bài thi trực tuyến nếu có
   */
  static async getContestDraft(contestId: string, studentName: string): Promise<any | null> {
    try {
      const draftKey = `${contestId}_${encodeURIComponent(studentName.trim())}`;
      const docRef = doc(db, CONTEST_DRAFTS_COLLECTION, draftKey);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (error) {
      console.warn('[Firestore] Lỗi đọc nháp cuộc thi:', error);
      return null;
    }
  }

  // ==========================================
  // ĐỒNG BỘ DỮ LIỆU TÀI KHOẢN GIÁO VIÊN
  // ==========================================

  /**
   * Lưu thông tin cấu hình và trạng thái của Giáo viên (cờ đã xóa dữ liệu mẫu, danh sách đề đã xóa)
   */
  static async saveTeacherProfile(
    teacherId: string, 
    data: Partial<{ 
      email: string; 
      displayName: string; 
      hasClearedDemoData: boolean; 
      deletedAssignmentKeys: string[];
      classes: ClassRoom[];
      cloudInitialized: boolean;
      hasMigratedInitialData: boolean;
      updatedAt: string;
      [key: string]: any;
    }>
  ): Promise<void> {
    if (!teacherId) return;
    try {
      const teacherDocRef = doc(db, TEACHERS_COLLECTION, teacherId);
      const payload = {
        ...data,
        updatedAt: new Date().toISOString()
      };
      await setDoc(teacherDocRef, sanitizeForFirestore(payload), { merge: true });
      console.log(`[Firestore] Đã lưu thông tin giáo viên ${teacherId} lên Cloud Firestore.`);
    } catch (error) {
      console.warn('[Firestore Error] Không thể lưu thông tin giáo viên:', error);
    }
  }

  /**
   * Đọc cấu hình và trạng thái của Giáo viên từ Cloud Firestore
   */
  static async getTeacherProfile(teacherId: string): Promise<{
    email?: string;
    displayName?: string;
    hasClearedDemoData?: boolean;
    deletedAssignmentKeys?: string[];
    classes?: ClassRoom[];
    cloudInitialized?: boolean;
    hasMigratedInitialData?: boolean;
    [key: string]: any;
  } | null> {
    if (!teacherId) return null;
    try {
      const teacherDocRef = doc(db, TEACHERS_COLLECTION, teacherId);
      const snap = await getDoc(teacherDocRef);
      if (snap.exists()) {
        const data = snap.data() || {};
        return {
          ...data,
          classes: Array.isArray(data.classes) ? data.classes : [],
          deletedAssignmentKeys: Array.isArray(data.deletedAssignmentKeys) ? data.deletedAssignmentKeys : [],
          cloudInitialized: Boolean(data.cloudInitialized)
        };
      }
      return null;
    } catch (error) {
      console.warn('[Firestore Error] Lỗi đọc thông tin giáo viên:', error);
      return null;
    }
  }

  /**
   * Lấy danh sách Lớp học của Giáo viên từ Cloud Firestore (luôn trả về mảng)
   */
  static async getTeacherClasses(teacherId: string): Promise<ClassRoom[]> {
    if (!teacherId) return [];
    try {
      const profile = await this.getTeacherProfile(teacherId);
      if (profile && Array.isArray(profile.classes)) {
        return profile.classes;
      }
      return [];
    } catch (error) {
      console.warn('[Firestore Error] Lỗi đọc lớp học giáo viên:', error);
      return [];
    }
  }

  /**
   * Lưu danh sách Lớp học của Giáo viên lên Cloud Firestore
   */
  static async saveTeacherClasses(teacherId: string, classes: ClassRoom[]): Promise<void> {
    if (!teacherId) return;
    try {
      const teacherDocRef = doc(db, TEACHERS_COLLECTION, teacherId);
      const safeClasses = Array.isArray(classes) ? classes : [];
      const payload = {
        classes: safeClasses,
        classesUpdatedAt: new Date().toISOString(),
        cloudInitialized: true
      };
      await setDoc(teacherDocRef, sanitizeForFirestore(payload), { merge: true });
      console.log(`[Firestore] Đã đồng bộ ${safeClasses.length} lớp học của giáo viên ${teacherId} lên Cloud.`);
    } catch (error) {
      console.warn('[Firestore Error] Lỗi đồng bộ lớp học lên Firestore:', error);
    }
  }
}
