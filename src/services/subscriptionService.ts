import { 
  db, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  collection, 
  serverTimestamp 
} from '../firebase';
import { TeacherSubscription, PaymentPlan, PaymentRequest, SubscriptionPlanId } from '../types';

export const TEACHERS_COLLECTION = 'teachers';
export const PAYMENTS_COLLECTION = 'payment_requests';

/**
 * ============================================================================
 * CỜ CẤU HÌNH BẬT/TẮT CHẾ ĐỘ THU PHÍ TOÀN HỆ THỐNG (GLOBAL BILLING SWITCH)
 * ============================================================================
 * 
 * - ĐẶT false (HIỆN TẠI): TẠM THỜI TẮT toàn bộ cơ chế thu phí/gia hạn.
 *   → Tất cả người dùng/giáo viên được sử dụng toàn bộ tính năng miễn phí 100%.
 *   → Bỏ qua mọi giới hạn hết hạn, không tự động khóa tài khoản.
 *   → Ẩn banner và cảnh báo hết hạn/yêu cầu gia hạn.
 *   → Không can thiệp hoặc làm mất dữ liệu người dùng/lịch sử thanh toán.
 * 
 * - ĐẶT true (SAU NÀY): BẬT LẠI toàn bộ cơ chế tính phí/gia hạn ban đầu.
 *   → Khôi phục kiểm tra 15 ngày dùng thử, kiểm tra tài khoản hết hạn,
 *     yêu cầu thanh toán và hiển thị đầy đủ cảnh báo gia hạn.
 * 
 * >>> ĐỔI GIÁ TRỊ TẠI DÒNG DƯỚI ĐÂY THÀNH true ĐỂ BẬT LẠI CHẾ ĐỘ TRẢ PHÍ <<<
 */
export const BILLING_ENABLED = false;

// Thông tin tài khoản ngân hàng nhận thanh toán (từ VietQR của cô Nguyễn Thị Nhung)
export const BANK_CONFIG = {
  bankId: 'agribank', // Napas Bin: 970405
  bankName: 'Ngân hàng Nông nghiệp & PTNT (Agribank)',
  accountNumber: '3522215050349',
  accountHolder: 'NGUYEN THI NHUNG',
  hotlineZalo: '0988.xxx.xxx' // Hỗ trợ kích hoạt nhanh qua Zalo
};

// Danh sách các gói cước bản quyền (Tập trung gói chuẩn 199K/Năm)
export const SUBSCRIPTION_PLANS: PaymentPlan[] = [
  {
    id: 'yearly',
    name: 'Gói Bản Quyền 1 Năm Học (12 tháng)',
    price: 199000,
    originalPrice: 399000,
    durationMonths: 12,
    description: 'Sử dụng trọn gói 12 tháng không giới hạn: Tạo đề trắc nghiệm + tự luận, phòng thi chống gian lận, AI chấm bài & ngân hàng đề Toán THCS.',
    popular: true,
    badge: '199K / Năm'
  },
  {
    id: 'lifetime',
    name: 'Gói Bản Quyền Vĩnh Viễn (Trọn đời)',
    price: 399000,
    originalPrice: 800000,
    durationMonths: 999,
    description: 'Sử dụng không giới hạn thời gian, bảo lưu bản quyền vĩnh viễn và miễn phí cập nhật các tính năng AI mới.',
    badge: 'Tiết kiệm nhất'
  }
];

export class SubscriptionService {
  /**
   * Kiểm tra xem hệ thống có đang bật chế độ thu phí hay không
   */
  static isBillingEnabled(): boolean {
    return BILLING_ENABLED;
  }

  /**
   * Kiểm tra quyền truy cập tính năng (Tạo đề, AI chấm bài, Xuất bản đề thi, v.v.)
   * Khi BILLING_ENABLED = false: Luôn cho phép truy cập đầy đủ (trả về true).
   * Khi BILLING_ENABLED = true: Kiểm tra trạng thái gói thực tế (chỉ khóa nếu đã expired).
   */
  static hasFeatureAccess(sub?: TeacherSubscription | null): boolean {
    if (!BILLING_ENABLED) return true;
    if (!sub) return true;
    return sub.status !== 'expired';
  }

  /**
   * Kiểm tra xem tài khoản có bị coi là hết hạn hay không
   * Khi BILLING_ENABLED = false: Không bao giờ bị hết hạn (trả về false).
   * Khi BILLING_ENABLED = true: Phản ánh đúng trạng thái thực tế ('expired').
   */
  static isExpired(sub?: TeacherSubscription | null): boolean {
    if (!BILLING_ENABLED) return false;
    return sub?.status === 'expired';
  }

  private static getStorageKey(teacherId: string): string {
    return `toan_thcs_sub_${teacherId}`;
  }

  /**
   * Tạo đường dẫn ảnh VietQR động chuẩn Napas từ thông tin tài khoản Agribank
   * Nhúng tự động số tiền (199.000 đ) và nội dung tin nhắn mẫu
   */
  static getVietQrImageUrl(amount: number, memo: string): string {
    const cleanMemo = encodeURIComponent(memo.trim());
    return `https://img.vietqr.io/image/agribank-3522215050349-compact2.png?amount=${amount}&addInfo=${cleanMemo}&accountName=NGUYEN%20THI%20NHUNG`;
  }

  /**
   * Tạo cấu trúc tin nhắn mẫu chuyển khoản ngắn gọn, chuẩn mọi ngân hàng (Ví dụ: TOAN199K GV1014)
   */
  static generateTransferCode(teacherId: string, email?: string | null): string {
    let suffix = '';
    if (email) {
      const namePart = email.split('@')[0];
      const match = namePart.match(/\d+$/);
      if (match) {
        suffix = match[0].slice(-4);
      } else {
        suffix = namePart.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
      }
    }
    if (!suffix) {
      suffix = teacherId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
    }
    return `TOAN199K GV${suffix}`;
  }

  /**
   * Lấy thông tin bản quyền và 15 ngày dùng thử của Giáo viên
   * Đồng bộ hai chiều: Firestore Cloud và cache LocalStorage
   */
  static async getSubscription(user: { uid: string; email?: string | null; displayName?: string | null }): Promise<TeacherSubscription> {
    const teacherId = user.uid;
    const storageKey = this.getStorageKey(teacherId);

    // 1. Đọc từ Cache LocalStorage trước để giao diện mượt, không chờ
    let cachedSub: TeacherSubscription | null = null;
    try {
      const local = localStorage.getItem(storageKey);
      if (local) {
        cachedSub = JSON.parse(local);
      }
    } catch {}

    // 2. Lấy dữ liệu thực tế từ Cloud Firestore
    try {
      const docRef = doc(db, TEACHERS_COLLECTION, teacherId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const registeredAt = data.registeredAt || new Date().toISOString();
        const trialEndsAt = data.trialEndsAt || new Date(new Date(registeredAt).getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
        const isVip = Boolean(data.isVip);
        const vipExpiresAt = data.vipExpiresAt || null;

        const sub: TeacherSubscription = {
          teacherId,
          email: user.email || data.email || '',
          displayName: user.displayName || data.displayName || 'Giáo viên',
          registeredAt,
          trialEndsAt,
          isVip,
          vipPlan: data.vipPlan,
          vipExpiresAt,
          activatedAt: data.activatedAt,
          activationCode: data.activationCode,
          status: this.computeStatus(isVip, vipExpiresAt, trialEndsAt),
          daysLeft: this.computeDaysLeft(trialEndsAt)
        };

        // Cập nhật lại cache
        try {
          localStorage.setItem(storageKey, JSON.stringify(sub));
        } catch {}

        return sub;
      } else {
        // Giáo viên mới lần đầu vào hệ thống -> Tạo hồ sơ dùng thử 15 ngày
        const now = new Date();
        const trialEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 ngày dùng thử

        const newSub: TeacherSubscription = {
          teacherId,
          email: user.email || '',
          displayName: user.displayName || 'Giáo viên',
          registeredAt: now.toISOString(),
          trialEndsAt: trialEnd.toISOString(),
          isVip: false,
          status: this.computeStatus(false, null, trialEnd.toISOString()),
          daysLeft: this.computeDaysLeft(trialEnd.toISOString())
        };

        // Lưu vào Cloud Firestore
        await setDoc(docRef, {
          ...newSub,
          createdAt: serverTimestamp()
        }, { merge: true });

        try {
          localStorage.setItem(storageKey, JSON.stringify(newSub));
        } catch {}

        return newSub;
      }
    } catch (error) {
      console.warn('[Subscription] Lỗi kết nối Firestore, chuyển sang dùng cache local:', error);

      if (cachedSub) {
        // Tính lại số ngày còn lại theo đồng hồ máy khách
        cachedSub.daysLeft = this.computeDaysLeft(cachedSub.trialEndsAt);
        cachedSub.status = this.computeStatus(cachedSub.isVip, cachedSub.vipExpiresAt, cachedSub.trialEndsAt);
        return cachedSub;
      }

      // Khởi tạo tạm 15 ngày dùng thử nếu chưa từng có dữ liệu
      const now = new Date();
      const trialEndTime = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
      const fallbackSub: TeacherSubscription = {
        teacherId,
        email: user.email || '',
        displayName: user.displayName || 'Giáo viên',
        registeredAt: now.toISOString(),
        trialEndsAt: trialEndTime,
        isVip: false,
        status: this.computeStatus(false, null, trialEndTime),
        daysLeft: this.computeDaysLeft(trialEndTime)
      };
      return fallbackSub;
    }
  }

  /**
   * Tính số ngày dùng thử còn lại
   */
  private static computeDaysLeft(trialEndsAt: string): number {
    if (!BILLING_ENABLED) {
      // Khi tạm tắt thu phí: không tính hạn đếm ngược
      return 999;
    }
    const end = new Date(trialEndsAt).getTime();
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Xác định trạng thái tài khoản
   */
  private static computeStatus(isVip: boolean, vipExpiresAt?: string | null, trialEndsAt?: string): 'trial' | 'active' | 'expired' {
    if (!BILLING_ENABLED) {
      // Khi tạm tắt thu phí: toàn bộ tài khoản luôn ở trạng thái 'active' để sử dụng trọn vẹn mọi tính năng
      return 'active';
    }

    if (isVip) {
      if (!vipExpiresAt) return 'active'; // Trọn đời
      const exp = new Date(vipExpiresAt).getTime();
      return exp > Date.now() ? 'active' : 'expired';
    }

    if (trialEndsAt) {
      const end = new Date(trialEndsAt).getTime();
      return end > Date.now() ? 'trial' : 'expired';
    }

    return 'expired';
  }

  /**
   * Kích hoạt bản quyền qua Mã kích hoạt hoặc Admin phê duyệt
   */
  static async activateWithCode(
    teacherId: string, 
    code: string,
    userProfile?: { email?: string; displayName?: string }
  ): Promise<{ success: boolean; message: string; sub?: TeacherSubscription }> {
    const cleanCode = code.trim().toUpperCase();

    // Danh sách các mã kích hoạt hợp lệ
    let plan: SubscriptionPlanId = 'lifetime';
    let durationMonths = 999;

    if (['TOAN2026VIP', 'AGRIBANK_VIP', 'THCS2026', 'TOANVIP', 'NHUNGTTHCS'].includes(cleanCode)) {
      plan = 'lifetime';
      durationMonths = 999;
    } else if (['TOAN199K', '199K', 'TOAN1YEAR', 'NAM2026', 'TOAN2026'].includes(cleanCode)) {
      plan = 'yearly';
      durationMonths = 12;
    } else if (cleanCode === 'TOANHK' || cleanCode === 'HOCKY') {
      plan = 'semester';
      durationMonths = 6;
    } else {
      return { 
        success: false, 
        message: 'Mã kích hoạt không hợp lệ hoặc đã hết hạn sử dụng. Vui lòng kiểm tra lại hoặc liên hệ Zalo quản trị viên.' 
      };
    }

    const now = new Date();
    let vipExpiresAt: string | null = null;
    if (durationMonths < 999) {
      const expDate = new Date(now);
      expDate.setMonth(expDate.getMonth() + durationMonths);
      vipExpiresAt = expDate.toISOString();
    }

    const updatedData: Partial<TeacherSubscription> = {
      isVip: true,
      vipPlan: plan,
      vipExpiresAt,
      activatedAt: now.toISOString(),
      activationCode: cleanCode,
      status: 'active'
    };

    try {
      const docRef = doc(db, TEACHERS_COLLECTION, teacherId);
      await setDoc(docRef, {
        ...updatedData,
        email: userProfile?.email || '',
        displayName: userProfile?.displayName || 'Giáo viên',
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('Lỗi ghi Firestore khi kích hoạt, lưu vào cache local:', e);
    }

    // Cập nhật Cache Local
    const storageKey = this.getStorageKey(teacherId);
    let current: any = {};
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) current = JSON.parse(cached);
    } catch {}

    const newSub: TeacherSubscription = {
      ...current,
      teacherId,
      email: userProfile?.email || current.email || '',
      displayName: userProfile?.displayName || current.displayName || 'Giáo viên',
      registeredAt: current.registeredAt || now.toISOString(),
      trialEndsAt: current.trialEndsAt || now.toISOString(),
      isVip: true,
      vipPlan: plan,
      vipExpiresAt,
      activatedAt: now.toISOString(),
      activationCode: cleanCode,
      status: 'active',
      daysLeft: 999
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(newSub));
    } catch {}

    return {
      success: true,
      message: `Chúc mừng Thầy/Cô! Đã kích hoạt thành công ${plan === 'lifetime' ? 'Bản quyền Vĩnh viễn' : `Gói ${durationMonths} tháng`}.`,
      sub: newSub
    };
  }

  /**
   * Gửi thông báo xác nhận đã chuyển khoản lên Firestore để Admin duyệt
   */
  static async submitPaymentRequest(request: {
    teacherId: string;
    teacherEmail: string;
    teacherName: string;
    plan: PaymentPlan;
    transferCode: string;
  }): Promise<void> {
    try {
      await addDoc(collection(db, PAYMENTS_COLLECTION), {
        teacherId: request.teacherId,
        teacherEmail: request.teacherEmail,
        teacherName: request.teacherName,
        planId: request.plan.id,
        planName: request.plan.name,
        amount: request.plan.price,
        transferCode: request.transferCode,
        status: 'pending',
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Lỗi gửi yêu cầu thanh toán:', e);
    }
  }
}
