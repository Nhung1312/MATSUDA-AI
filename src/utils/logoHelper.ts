/**
 * Helper quản lý Logo & Icon của ứng dụng
 * Tự động ưu tiên logo tùy chỉnh lưu trữ nội bộ (localStorage)
 * hoặc mặc định tải icon gốc từ /icon-192.png
 */

export const getAppLogo = (): string => {
  if (typeof window !== 'undefined') {
    try {
      const custom = localStorage.getItem('toan_custom_logo');
      if (custom && custom.length > 50) return custom;
    } catch {
      // Ignore localStorage error
    }
  }
  return '/icon-192.png';
};

export const setAppLogo = (dataUrl: string): void => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('toan_custom_logo', dataUrl);
      window.dispatchEvent(new CustomEvent('app_logo_updated', { detail: dataUrl }));
    } catch (e) {
      console.warn('Không thể lưu logo vào localStorage:', e);
    }
  }
};

export const resetAppLogo = (): void => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('toan_custom_logo');
      window.dispatchEvent(new CustomEvent('app_logo_updated', { detail: '/icon-192.png' }));
    } catch {}
  }
};
