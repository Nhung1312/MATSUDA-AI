import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, ExternalLink, X, Download, Share2, Trophy, UserCheck } from 'lucide-react';
import { Contest } from '../../types';
import { getContestShareLink } from '../../utils/urlUtils';

interface ContestQRModalProps {
  contest: Contest;
  isOpen: boolean;
  onClose: () => void;
}

export const ContestQRModal: React.FC<ContestQRModalProps> = ({ contest, isOpen, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Link thi công khai cho học sinh (không bắt đăng nhập)
  const contestLink = getContestShareLink(contest.code);

  useEffect(() => {
    if (isOpen && contest.code) {
      QRCode.toDataURL(contestLink, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('Lỗi tạo QR:', err));
    }
  }, [isOpen, contest.code, contestLink]);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(contest.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(contestLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR_CuocThi_${contest.code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Chia sẻ Cuộc thi</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Gửi cho học sinh quét mã hoặc mở link</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Contest info */}
          <div className="text-center">
            <h4 className="font-bold text-slate-900 dark:text-white text-base">{contest.title}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Khối {contest.grade} • {contest.durationMinutes} phút • {contest.questions.length} câu hỏi
            </p>
          </div>

          {/* Student No-Login Notice */}
          <div className="p-3 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-left flex items-start space-x-2.5">
            <UserCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block text-amber-900 dark:text-amber-300">Dành cho Học sinh:</span>
              <p className="text-[11px] text-amber-800 dark:text-amber-300/80 leading-relaxed">
                Học sinh <strong>không cần đăng nhập tài khoản</strong>. Chỉ cần bấm vào link hoặc quét mã QR, sau đó điền <strong>Họ và tên</strong> cùng <strong>Lớp</strong> là làm bài được ngay.
              </p>
            </div>
          </div>

          {/* QR Container */}
          <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code ${contest.code}`}
                className="w-48 h-48 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 bg-white p-2"
              />
            ) : (
              <div className="w-48 h-48 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
            )}

            <button
              onClick={handleDownloadQR}
              className="mt-3 flex items-center space-x-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 py-1 px-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải ảnh QR code</span>
            </button>
          </div>

          {/* Code Box */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Mã tham gia cuộc thi
            </label>
            <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="font-mono text-lg font-black tracking-wider text-indigo-600 dark:text-indigo-400">
                {contest.code}
              </span>
              <button
                onClick={handleCopyCode}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-colors shadow-2xs"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Đã sao chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao chép mã</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Direct Link */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Đường dẫn trực tiếp
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={contestLink}
                className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 select-all"
              />
              <button
                onClick={handleCopyLink}
                className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shrink-0"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Đã chép</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Chép link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
