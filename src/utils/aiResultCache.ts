// Local result reuse. No API keys or image bytes are stored in this cache.
const CACHE_KEY = 'toan_thcs_ai_result_cache_v3';
const LIMIT = 160;
const MAX_BYTES = 1500000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const memory = new Map<string, { at: number; value: any }>();
let loaded = false;

function readStore() {
  if (loaded) return;
  loaded = true;
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    for (const [key, entry] of Object.entries(data)) {
      const item = entry as any;
      if (typeof item?.at === 'number' && Date.now() - item.at < TTL_MS) memory.set(key, item);
    }
  } catch { /* Storage unavailable: memory cache still works. */ }
}

export async function fingerprintAIInput(value: unknown): Promise<string | null> {
  // Disable reuse when a cryptographic digest is unavailable; never guess equivalence.
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

export function readAIResult<T>(namespace: string, fingerprint: string | null): T | undefined {
  if (!fingerprint) return undefined;
  readStore();
  const item = memory.get(`${namespace}:${fingerprint}`);
  if (!item || Date.now() - item.at >= TTL_MS) return undefined;
  return JSON.parse(JSON.stringify(item.value));
}

export function writeAIResult(namespace: string, fingerprint: string | null, value: unknown): void {
  if (!fingerprint) return;
  readStore();
  memory.set(`${namespace}:${fingerprint}`, { at: Date.now(), value: JSON.parse(JSON.stringify(value)) });
  while (memory.size > LIMIT) memory.delete(memory.keys().next().value!);
  try {
    let serialized = JSON.stringify(Object.fromEntries(memory));
    while (serialized.length * 2 > MAX_BYTES && memory.size > 1) {
      memory.delete(memory.keys().next().value!);
      serialized = JSON.stringify(Object.fromEntries(memory));
    }
    localStorage.setItem(CACHE_KEY, serialized);
  } catch { /* Do not discard a completed AI result because storage is full. */ }
}

/** Convert source image bytes without resizing or cropping. */
export async function loadAIImage(url: string): Promise<{ mimeType: string; data: string }> {
  const inline = url.match(/^data:(image\/[^;]+);base64,([\s\S]+)$/);
  if (inline) return { mimeType: inline[1], data: inline[2] };
  if (!/^https?:\/\//i.test(url)) throw new Error('Định dạng ảnh chưa đọc được.');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Không tải được ảnh nguồn.');
  const mimeType = response.headers.get('content-type')?.split(';')[0] || '';
  if (!mimeType.startsWith('image/')) throw new Error('Nguồn tải về không phải tệp ảnh.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return { mimeType, data: btoa(binary) };
}

export function isAIQuotaError(error: any): boolean {
  return Number(error?.status || error?.code) === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(String(error?.message || error));
}
