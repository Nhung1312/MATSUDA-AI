/**
 * Tiện ích xử lý, tối ưu hóa và dán ảnh cho câu hỏi (Hình vẽ hình học, đồ thị, sơ đồ)
 */

export async function processQuestionImage(file: File | Blob, maxDim = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    // Nếu là SVG, giữ nguyên dạng Data URL để đạt độ nét vector tuyệt đối
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Giữ tỉ lệ và giới hạn kích thước tối đa 1200px để tối ưu dung lượng lưu trữ Firestore / LocalStorage
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Vẽ nền trắng trước để tránh trường hợp ảnh PNG có nền trong suốt bị đen khi xuất JPEG/WebP
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // Vẽ hình vẽ lên canvas với bộ lọc làm mịn
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Xuất ảnh nén JPEG chất lượng cao (rõ nét chữ số, kí hiệu toán học)
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch {
          resolve(e.target?.result as string);
        }
      };

      img.onerror = () => {
        resolve(e.target?.result as string);
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Đọc ảnh từ Clipboard nếu trình duyệt hỗ trợ Clipboard API
 */
export async function readImageFromClipboard(): Promise<File | null> {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    return null;
  }

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          return new File([blob], `screenshot_${Date.now()}.${type.split('/')[1] || 'png'}`, { type });
        }
      }
    }
  } catch (err) {
    console.warn('Clipboard read error:', err);
  }
  return null;
}
