import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, ExternalLink, X, Download, Share2 } from 'lucide-react';
import { Assignment } from '../types';
import { getAssignmentShareLink } from '../utils/urlUtils';

interface QRCodeModalProps {
  assignment: Assignment;
  isOpen: boolean;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ assignment, isOpen, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Link bài tập công khai cho học sinh (không bắt đăng nhập)
  const shareLink = getAssignmentShareLink(assignment.assignmentCode);

  useEffect(() => {
    if (isOpen && assignment.assignmentCode) {
      QRCode.toDataURL(shareLink, {
        width: 320,
        margin: 2,
        color: {
          dark: '#1e3a8a', // Deep navy blue
          light: '#ffffff'
        }
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('Lỗi tạo QR:', err));
    }
  }, [isOpen, assignment.assignmentCode, shareLink]);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(assignment.assignmentCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR_${assignment.assignmentCode}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-100 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-5 py-3 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Share2 className="w-5 h-5" />
            <h3 className="font-bold text-base">Giao bài cho học sinh</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 text-center overflow-y-auto space-y-3">
          <div>
            <span className="inline-block text-blue-700 font-bold text-[11px] mb-1">
              Lớp {assignment.grade}{assignment.className ? ` • ${assignment.className}` : ''}
            </span>
            <h4 className="font-bold text-slate-800 text-base line-clamp-1">{assignment.title}</h4>
          </div>

          {/* QR Code Canvas */}
          <div className="inline-block p-2.5 bg-white rounded-xl border border-indigo-100 shadow-inner">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code ${assignment.assignmentCode}`}
                className="w-44 h-44 mx-auto object-contain rounded-lg"
              />
            ) : (
              <div className="w-44 h-44 flex items-center justify-center bg-slate-50 text-slate-400">
                Đang tạo mã QR...
              </div>
            )}
          </div>

          {/* Mã bài tập lớn */}
          <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-3">
            <span className="text-[11px] font-bold text-indigo-600 block mb-0.5">
              Mã bài
            </span>
            <div className="flex items-center justify-center space-x-2">
              <span className="text-xl font-mono font-extrabold text-indigo-900 tracking-wider">
                {assignment.assignmentCode}
              </span>
              <button
                onClick={handleCopyCode}
                className="p-1.5 bg-white text-indigo-600 hover:text-indigo-800 rounded-lg border border-indigo-200 shadow-xs hover:bg-indigo-50 transition-all flex items-center text-xs font-medium cursor-pointer"
                title="Sao chép mã"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Hành động chính */}
          <button
            onClick={handleCopyShareLink}
            className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors cursor-pointer text-xs"
          >
            {copiedShareLink ? (
              <>
                <Check className="w-4 h-4" />
                <span>Đã chép link</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>Chép link gửi học sinh</span>
              </>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDownloadQR}
              className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer text-xs"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Tải QR</span>
            </button>
            <a
              href={shareLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Mở thử</span>
            </a>
          </div>

        </div>
      </div>
    </div>
  );
};
