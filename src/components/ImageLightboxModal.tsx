import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';

interface ImageLightboxModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  onClose: () => void;
  title?: string;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  title = 'Ảnh chụp bài làm'
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  if (!isOpen || !imageUrl) return null;

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation(prev => (prev + 90) % 360);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `bai_lam_${Date.now()}.jpg`;
    a.click();
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div 
        className="w-full max-w-5xl flex items-center justify-between py-2.5 px-4 bg-slate-900/80 rounded-2xl border border-slate-800 text-white mb-3 shrink-0 z-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="font-bold text-sm truncate pr-2">{title}</div>
        
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          <button
            onClick={handleZoomIn}
            title="Phóng to"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Thu nhỏ"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotate}
            title="Xoay ảnh 90°"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            title="Tải ảnh về máy"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            title="Đóng (Esc)"
            className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors cursor-pointer ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div 
        className="flex-1 w-full max-w-5xl flex items-center justify-center overflow-auto p-2"
        onClick={e => e.stopPropagation()}
      >
        <div 
          className="transition-transform duration-200 select-none flex items-center justify-center"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center'
          }}
        >
          <img
            src={imageUrl}
            alt="Bài làm học sinh"
            className="max-h-[80vh] max-w-full object-contain rounded-xl shadow-2xl border border-slate-700 bg-white"
            draggable={false}
          />
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-[11px] text-slate-400 mt-2 text-center pointer-events-none">
        Nhấp ra ngoài hoặc nút Đóng để thoát • Sử dụng công cụ xoay/phóng to để đọc bài viết tay
      </div>
    </div>
  );
};
