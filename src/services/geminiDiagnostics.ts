export const VERIFICATION_MODEL = 'gemini-3.8-flash';

export interface GeminiDiagnostic {
  status: number;
  kind: 'quota' | 'invalid_key' | 'unsupported' | 'permission' | 'general';
  model: string;
  quotaMetrics: string[];
  project: string | null;
  retryAfterSeconds: number | null;
  message: string;
}

// Only allow public identifiers from structured errors. Never return raw SDK
// errors: they can contain request URLs, a key, authorization or student data.
const identifier = (value: unknown): string | null =>
  typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,180}$/.test(value) && !/AIza|key=/i.test(value) ? value : null;

export function diagnoseGeminiError(error: any, model: string): GeminiDiagnostic {
  let body = error;
  try {
    const message = String(error?.message || '');
    const start = message.indexOf('{');
    if (start >= 0) body = JSON.parse(message.slice(start));
  } catch { /* Some providers return plain text; classify without displaying it. */ }
  body = body?.error || body;
  const raw = String(body?.message || error?.message || '');
  const status = Number(body?.code || error?.status || error?.code) || 0;
  const details: any[] = Array.isArray(body?.details) ? body.details : [];
  const violations = details.flatMap(d => Array.isArray(d?.violations) ? d.violations : []);
  const quotaMetrics = [...new Set<string>(violations.flatMap(v => [identifier(v.quotaMetric), identifier(v.quotaId)]).filter(Boolean) as string[])];
  const project = violations.map(v => identifier(v?.quotaDimensions?.project || v?.quotaDimensions?.project_id))
    .concat(details.map(d => identifier(d?.metadata?.consumer || d?.metadata?.project))).find(Boolean) || null;
  const retry = details.find(d => /RetryInfo$/.test(d?.['@type'] || ''))?.retryDelay;
  const retryValue = typeof retry === 'string' ? Number(retry.replace(/s$/, '')) : Number(retry?.seconds);
  const retryAfterSeconds = Number.isFinite(retryValue) && retryValue > 0 ? Math.ceil(retryValue) : null;
  let kind: GeminiDiagnostic['kind'] = 'general';
  if (status === 429 || /RESOURCE_EXHAUSTED|quota exceeded|rate.?limit/i.test(raw)) kind = 'quota';
  else if (/API_KEY_INVALID|API key not valid|API_KEY_EXPIRED/i.test(raw)) kind = 'invalid_key';
  else if (status === 404 || /NOT_FOUND|not supported|no longer available/i.test(raw)) kind = 'unsupported';
  else if (status === 403 || /PERMISSION_DENIED/i.test(raw)) kind = 'permission';
  const metricText = quotaMetrics.join(' ');
  const dimensions = [
    /perminute|per_minute/i.test(metricText) && /request/i.test(metricText) ? 'RPM (lượt/phút)' : '',
    /perminute|per_minute/i.test(metricText) && /token/i.test(metricText) ? 'TPM (token/phút)' : '',
    /perday|per_day/i.test(metricText) && /request/i.test(metricText) ? 'RPD (lượt/ngày)' : '',
    /free.?tier/i.test(metricText) ? 'Google trả quota có nhãn FreeTier; đối chiếu dự án của key với dự án đã bật Billing.' : '',
    /paid.?tier/i.test(metricText) ? 'Google trả quota có nhãn PaidTier; key trả phí vẫn có hạn mức.' : ''
  ].filter(Boolean).join('; ');
  const reasons = {
    quota: `Google báo 429 RESOURCE_EXHAUSTED. ${dimensions || 'Google chưa trả chi tiết để phân biệt RPM/TPM/RPD, giới hạn chi tiêu hay quá tải tạm thời.'} Đã dừng gọi; giữ kết quả trước đó. Kiểm tra Rate limits, Billing Tier và giới hạn chi tiêu của đúng dự án trong AI Studio.`,
    invalid_key: 'Google từ chối API Key. Kiểm tra key còn hiệu lực và đúng dự án; không gửi key trong ảnh/log.',
    unsupported: 'Google không tìm thấy hoặc không hỗ trợ model này cho API hiện tại. Không tự chuyển model; chưa thẩm định thành công.',
    permission: 'Google từ chối quyền truy cập. Kiểm tra API restrictions, quyền model và Billing của dự án; chưa xác nhận key sai hay hết quota.',
    general: 'Chưa hoàn tất yêu cầu Gemini. Chưa xác định nguyên nhân từ mã phản hồi; kết quả cũ được giữ nguyên.'
  };
  return { status, kind, model, quotaMetrics, project, retryAfterSeconds,
    message: `[${status || 'NO_STATUS'}] Model: ${model}. ${reasons[kind]}${project ? ` Dự án Google trả về: ${project}.` : ' Dự án/Billing chưa được xác minh tự động.'}${quotaMetrics.length ? ` Quota: ${quotaMetrics.join(', ')}.` : ''}${retryAfterSeconds ? ` Google đề nghị chờ ${retryAfterSeconds}s trước khi thử lại.` : ''}` };
}

export class GeminiRequestError extends Error {
  status: number;
  isQuota: boolean;
  constructor(public diagnostic: GeminiDiagnostic) {
    super(diagnostic.message);
    this.name = 'GeminiRequestError';
    this.status = diagnostic.status;
    this.isQuota = diagnostic.kind === 'quota';
  }
}

const cooldowns = new Map<string, { until: number; error: GeminiRequestError }>();
export function checkGeminiCooldown(key: string): void {
  const entry = cooldowns.get(key);
  if (entry && entry.until > Date.now()) throw new GeminiRequestError({ ...entry.error.diagnostic,
    message: `${entry.error.message} Đang tạm dừng tại máy này, còn ${Math.ceil((entry.until - Date.now()) / 1000)}s; chưa gửi yêu cầu mới.` });
  if (entry) cooldowns.delete(key);
}
export function safeGeminiError(error: unknown, model: string, key: string): GeminiRequestError {
  if (error instanceof GeminiRequestError) return error; // No new response: do not extend the cooldown.
  const safe = new GeminiRequestError(diagnoseGeminiError(error, model));
  if (safe.isQuota) cooldowns.set(key, { until: Date.now() + Math.max(60, safe.diagnostic.retryAfterSeconds || 0) * 1000, error: safe });
  return safe;
}

export async function apiKeyFingerprint(key: string | null): Promise<string> {
  if (!key) return 'chưa có key';
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key.trim()));
    return Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 12);
  } catch { return 'không đọc được dấu vân tay'; }
}
