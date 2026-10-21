export interface ExamSaveDiagnostics {
  code: string;
  stage: 'prepare' | 'firestore';
  projectId: string;
  authState: 'firebase' | 'anonymous' | 'none';
  ownerMatches: boolean;
  payloadBytes: number;
}

export class ExamCloudSaveError extends Error {
  constructor(public diagnostics: ExamSaveDiagnostics) {
    super(formatExamSaveFailure({ diagnostics }));
    this.name = 'ExamCloudSaveError';
  }
}

// Diagnostic size only: JSON bytes differ from Firestore's encoded document
// size. Do not reject borderline documents based on this estimate.
export function examPayloadBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

export function formatExamSaveFailure(error: unknown): string {
  const d = (error as any)?.diagnostics as ExamSaveDiagnostics | undefined;
  const rawCode = String(d?.code || (error as any)?.code || 'unknown');
  const code = /^[a-zA-Z0-9_/-]{1,80}$/.test(rawCode) ? rawCode : 'unknown';
  const shortCode = code.replace(/^firestore\//, '');
  const reason: Record<string, string> = {
    'permission-denied': 'Firestore từ chối quyền ghi. Kiểm tra đăng nhập Firebase, Rules và App Check của đúng dự án.',
    unauthenticated: 'Phiên Firebase chưa hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại bằng Google.',
    unavailable: 'Chưa kết nối được máy chủ Firestore. Kiểm tra mạng rồi thử lưu lại.',
    'deadline-exceeded': 'Chưa nhận được xác nhận Firestore trong thời gian chờ. Thử lại trên cùng đề.',
    'resource-exhausted': 'Firestore báo hết hạn mức tài nguyên. Kiểm tra Usage/Billing của dự án Firebase.',
    'invalid-argument': 'Firestore từ chối dữ liệu đề. Kiểm tra kiểu dữ liệu, ảnh/PDF đính kèm và giới hạn tài liệu 1 MiB.',
    'document-too-large': 'Dữ liệu ảnh/PDF trong đề vượt giới hạn tài liệu Firestore 1 MiB. Giảm dung lượng đính kèm rồi lưu lại.',
    'owner-mismatch': 'Tài khoản Firebase hiện tại khác tài khoản giáo viên đang mở. Hãy đăng nhập lại đúng tài khoản.',
    unknown: 'Chưa xác định được nguyên nhân từ mã lỗi; không kết luận là do mạng hoặc đăng nhập.'
  };
  const details = d ? ` Dự án: ${d.projectId}; phiên Firebase: ${d.authState}; JSON: ${d.payloadBytes} byte; bước: ${d.stage}.` : '';
  return `Chưa lưu được đề lên Firebase [${code}]. ${reason[shortCode] || reason.unknown}${details} Không gửi link cho học sinh. Nội dung đang nhập được giữ nguyên; bạn có thể thử lưu lại.`;
}
