import React, { useRef, useState } from 'react';
import { 
  Image as ImageIcon, 
  Upload, 
  Clipboard, 
  Trash2, 
  ZoomIn, 
  RefreshCw, 
  Loader2, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { processQuestionImage, readImageFromClipboard } from '../utils/imageProcessUtils';
import { ImageLightboxModal } from './ImageLightboxModal';

interface QuestionImageUploadProps {
  imageUrl?: string;
  onImageChange: (newImageUrl?: string) => void;
  questionOrder?: number;
}

export const QuestionImageUpload: React.FC<QuestionImageUploadProps> = ({
  imageUrl,
  onImageChange,
  questionOrder
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleFileProcess = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Tệp chọn không phải là hình ảnh. Vui lòng chọn tệp ảnh (PNG, JPG, SVG, WebP)!', 'error');
      return;
    }

    try {
      setIsProcessing(true);
      const compressedDataUrl = await processQuestionImage(file);
      onImageChange(compressedDataUrl);
      showToast('Đã thêm hình vẽ minh họa cho câu hỏi thành công!', 'success');
    } catch (err) {
      console.error('Lỗi nén ảnh câu hỏi:', err);
      showToast('Không thể xử lý ảnh này. Vui lòng thử lại!', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
    // Reset file input để có thể chọn lại cùng 1 file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Hỗ trợ kéo thả ảnh
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileProcess(files[0]);
    }
  };

  // Hỗ trợ dán ảnh qua phím Ctrl+V khi focus vào vùng này
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            handleFileProcess(file);
            return;
          }
        }
      }
    }
  };

  // Nút bấm "Dán ảnh từ bộ nhớ tạm"
  const handlePasteButtonClick = async () => {
    try {
      setIsProcessing(true);
      const file = await readImageFromClipboard();
      if (file) {
        await handleFileProcess(file);
      } else {
        showToast('Không tìm thấy ảnh trong bộ nhớ tạm. Thầy/Cô hãy chụp màn hình rồi bấm Ctrl + V trực tiếp nhé!', 'info');
      }
    } catch {
      showToast('Thầy/Cô hãy nhấn phím Ctrl + V trực tiếp vào ô này để dán ảnh nhé!', 'info');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveImage = () => {
    if (confirm('Thầy/Cô có chắc chắn muốn xóa hình vẽ minh họa của câu này?')) {
      onImageChange(undefined);
      showToast('Đã xóa hình vẽ minh họa', 'info');
    }
  };

  return (
    <div 
      className="mt-3"
      onPaste={handlePaste}
      tabIndex={0}
      aria-label="Khu vực tải hoặc dán hình vẽ minh họa câu hỏi"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Thông báo nhanh Toast */}
      {toastMsg && (
        <div className={`mb-2 p-2 rounded-xl text-xs flex items-center gap-1.5 transition-all animate-in fade-in ${
          toastMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : toastMsg.type === 'error'
            ? 'bg-rose-50 text-rose-800 border border-rose-200'
            : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
        }`}>
          {toastMsg.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
          {toastMsg.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
          {toastMsg.type === 'info' && <Clipboard className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* TRƯỜNG HỢP 1: ĐÃ CÓ ẢNH MINH HỌA */}
      {imageUrl ? (
        <div className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>Hình vẽ / Đồ thị minh họa:</span>
            </span>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => setShowLightbox(true)}
                className="px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg flex items-center gap-1 transition-colors"
                title="Xem ảnh kích thước lớn"
              >
                <ZoomIn className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Phóng to</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-lg flex items-center gap-1 transition-colors"
                title="Chọn ảnh khác thay thế"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Đổi ảnh</span>
              </button>

              <button
                type="button"
                onClick={handleRemoveImage}
                className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 rounded-lg flex items-center gap-1 transition-colors"
                title="Xóa hình này"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Xóa ảnh</span>
              </button>
            </div>
          </div>

          {/* Vùng xem trước hình ảnh */}
          <div 
            className="relative bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center min-h-[140px] max-h-72 overflow-hidden cursor-pointer group"
            onClick={() => setShowLightbox(true)}
          >
            <img
              src={imageUrl}
              alt={questionOrder ? `Hình vẽ câu ${questionOrder}` : 'Hình vẽ câu hỏi'}
              className="max-h-64 max-w-full object-contain rounded-lg transition-transform duration-200 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-indigo-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl pointer-events-none">
              <span className="px-3 py-1.5 bg-black/75 text-white text-xs font-semibold rounded-full flex items-center gap-1.5 backdrop-blur-xs">
                <ZoomIn className="w-3.5 h-3.5" />
                <span>Nhấp để phóng to ảnh</span>
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* TRƯỜNG HỢP 2: CHƯA CÓ ẢNH - KHU VỰC TẢI LÊN / DÁN ẢNH */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative p-3 rounded-2xl border-2 border-dashed transition-all ${
            isDragOver 
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-400/30' 
              : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 hover:bg-indigo-50/20 hover:border-indigo-300 dark:bg-slate-800/40'
          }`}
        >
          {isProcessing ? (
            <div className="py-4 flex flex-col items-center justify-center space-y-2 text-indigo-600">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs font-semibold">Đang xử lý và tối ưu hóa hình vẽ...</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>Hình vẽ / Đồ thị minh họa</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md font-medium">
                      Tùy chọn
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Kéo thả, chọn file hoặc <strong className="text-indigo-600 dark:text-indigo-400">bấm Ctrl + V</strong> để dán trực tiếp ảnh chụp
                  </div>
                </div>
              </div>

              {/* Nút tác vụ tải & dán */}
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Tải ảnh lên</span>
                </button>

                <button
                  type="button"
                  onClick={handlePasteButtonClick}
                  title="Dán ảnh vừa chụp (hoặc dùng phím tắt Ctrl + V)"
                  className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer active:scale-95"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>Dán ảnh (Ctrl+V)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal phóng to xem ảnh chi tiết */}
      <ImageLightboxModal
        isOpen={showLightbox}
        imageUrl={imageUrl || null}
        onClose={() => setShowLightbox(false)}
        title={questionOrder ? `Hình vẽ minh họa - Câu ${questionOrder}` : 'Hình vẽ minh họa'}
      />
    </div>
  );
};
