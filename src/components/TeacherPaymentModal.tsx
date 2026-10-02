import React, { useState } from 'react';
import { 
  X, 
  Check, 
  Copy, 
  Crown, 
  Sparkles, 
  ShieldCheck, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  CreditCard, 
  KeyRound, 
  ChevronRight, 
  Info,
  PhoneCall,
  Loader2
} from 'lucide-react';
import { 
  SUBSCRIPTION_PLANS, 
  BANK_CONFIG, 
  SubscriptionService,
  BILLING_ENABLED 
} from '../services/subscriptionService';
import { PaymentPlan, TeacherSubscription } from '../types';

interface TeacherPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: TeacherSubscription | null;
  onSubscriptionUpdated: (newSub: TeacherSubscription) => void;
  user: { uid: string; email?: string | null; displayName?: string | null } | null;
}

export const TeacherPaymentModal: React.FC<TeacherPaymentModalProps> = ({
  isOpen,
  onClose,
  subscription,
  onSubscriptionUpdated,
  user
}) => {
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan>(SUBSCRIPTION_PLANS[0]); // Default to 199k/year
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [codeMessage, setCodeMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transferSubmitted, setTransferSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState<'qr' | 'code'>('qr');

  if (!isOpen) return null;

  const teacherId = user?.uid || subscription?.teacherId || 'GV';
  const transferCode = SubscriptionService.generateTransferCode(teacherId, user?.email);
  const qrImageUrl = SubscriptionService.getVietQrImageUrl(selectedPlan.price, transferCode);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleActivateWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationCode.trim()) return;

    setIsActivating(true);
    setCodeMessage(null);

    try {
      const res = await SubscriptionService.activateWithCode(
        teacherId, 
        activationCode,
        { email: user?.email || '', displayName: user?.displayName || '' }
      );

      if (res.success && res.sub) {
        setCodeMessage({ text: res.message, isError: false });
        onSubscriptionUpdated(res.sub);
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        setCodeMessage({ text: res.message, isError: true });
      }
    } finally {
      setIsActivating(false);
    }
  };

  const handleConfirmTransfer = async () => {
    setIsSubmittingTransfer(true);
    try {
      await SubscriptionService.submitPaymentRequest({
        teacherId,
        teacherEmail: user?.email || subscription?.email || '',
        teacherName: user?.displayName || subscription?.displayName || 'Giáo viên',
        plan: selectedPlan,
        transferCode
      });
      setTransferSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        
        {/* Header with Agribank & VIP Brand Accent */}
        <div className="bg-gradient-to-r from-red-700 via-rose-700 to-indigo-800 p-5 sm:p-6 text-white relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-amber-300 shadow-inner">
              <Crown className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg sm:text-xl font-black tracking-tight">
                  BẢN QUYỀN GIÁO VIÊN TOÁN THCS
                </h3>
                <span className="px-2 py-0.5 bg-amber-400 text-slate-950 text-[10px] font-black uppercase rounded-full shadow-xs">
                  VIP PRO
                </span>
              </div>
              <p className="text-xs text-rose-100 mt-1">
                Tạo đề không giới hạn • Chấm tự luận AI • Giám sát thi chống gian lận
              </p>
            </div>
          </div>

          {/* Current Status pill */}
          <div className="mt-4 pt-3 border-t border-white/20 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-white/80">Trạng thái tài khoản:</span>
              {!BILLING_ENABLED ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 font-bold border border-emerald-400/40">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Đang mở Trải nghiệm Miễn phí 100% (Đầy đủ tính năng)</span>
                </span>
              ) : subscription?.isVip ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 font-bold border border-emerald-400/40">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Đã kích hoạt VIP {subscription.vipPlan === 'lifetime' ? 'Trọn đời' : ''}</span>
                </span>
              ) : subscription?.status === 'trial' ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-500/30 text-amber-200 font-bold border border-amber-400/40">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Đang dùng thử 15 ngày (Còn {subscription.daysLeft} ngày)</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-500/40 text-rose-200 font-bold border border-rose-400/50">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Đã hết hạn 15 ngày dùng thử</span>
                </span>
              )}
            </div>

            <div className="text-[11px] text-white/90 font-mono">
              Mã GV: <strong>{transferCode}</strong>
            </div>
          </div>
        </div>

        {/* Tab Selection (Chuyển khoản VietQR / Nhập mã kích hoạt) */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 px-5 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`pb-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'qr'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Quét mã VietQR (Agribank)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`pb-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'code'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Nhập mã kích hoạt nhanh</span>
          </button>
        </div>

        {/* TAB 1: VIETQR PAYMENT */}
        {activeTab === 'qr' && (
          <div className="p-5 sm:p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            
            {/* Gói Bản Quyền 199K/Năm */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Gói bản quyền Giáo viên Toán THCS:
                </label>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  Ưu đãi 199.000 đ / 1 Năm Học
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SUBSCRIPTION_PLANS.map((plan) => {
                  const isSelected = selectedPlan.id === plan.id;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={`relative rounded-2xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-red-600 bg-red-50/40 dark:bg-red-950/20 shadow-md ring-2 ring-red-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {plan.badge && (
                        <span
                          className={`absolute -top-2.5 right-3 text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-xs ${
                            plan.popular
                              ? 'bg-red-600 text-white'
                              : 'bg-indigo-600 text-white'
                          }`}
                        >
                          {plan.badge}
                        </span>
                      )}

                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center space-x-1.5">
                          <span>{plan.name}</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                          {plan.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-baseline justify-between">
                        <div>
                          <span className="text-lg font-black text-red-600 dark:text-red-400">
                            {plan.price.toLocaleString('vi-VN')} đ
                          </span>
                          <span className="text-xs text-slate-400 line-through ml-1.5">
                            {plan.originalPrice.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hướng dẫn quét QR thông minh: Chỉ cần quét là OK */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 border border-emerald-300 dark:border-emerald-800 text-slate-800 dark:text-slate-200">
              <div className="flex items-start space-x-2.5">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div className="text-xs leading-relaxed">
                  <p className="font-extrabold text-emerald-800 dark:text-emerald-300 text-sm">
                    Chỉ cần mở App Ngân hàng quét mã QR là Xong!
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                    Mã VietQR bên dưới đã <strong>tự động điền số tiền {selectedPlan.price.toLocaleString('vi-VN')} đ</strong> và <strong>cấu trúc tin nhắn mẫu: <code className="font-mono font-bold text-red-700 dark:text-red-400">{transferCode}</code></strong>. Thầy/Cô không cần nhập tay bất kỳ thông tin nào!
                  </p>
                </div>
              </div>
            </div>

            {/* Quét mã QR Agribank + Chi tiết tài khoản */}
            <div className="bg-slate-50 dark:bg-slate-850/90 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col md:flex-row items-center gap-5">
                {/* VietQR Image */}
                <div className="bg-white p-3.5 rounded-2xl shadow-md border border-slate-200 shrink-0 text-center">
                  <img
                    src={qrImageUrl}
                    alt="VietQR Agribank NGUYEN THI NHUNG"
                    className="w-52 h-52 sm:w-56 sm:h-56 object-contain mx-auto rounded-lg"
                    referrerPolicy="no-referrer"
                  />
                  <div className="mt-2.5 flex items-center justify-center space-x-1.5 text-xs font-bold text-red-700">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                    <span>Agribank • VietQR Tự Động</span>
                  </div>
                </div>

                {/* Bank Account Details & Cấu trúc tin nhắn mẫu */}
                <div className="flex-1 w-full space-y-2.5 text-xs">
                  {/* Bank */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">Ngân hàng:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-right">
                      {BANK_CONFIG.bankName}
                    </span>
                  </div>

                  {/* Account Name */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">Chủ tài khoản:</span>
                    <span className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                      {BANK_CONFIG.accountHolder}
                    </span>
                  </div>

                  {/* Account Number */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">Số tài khoản:</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-black text-sm text-red-600 dark:text-red-400">
                        {BANK_CONFIG.accountNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(BANK_CONFIG.accountNumber, 'acc')}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-200 flex items-center space-x-1 cursor-pointer"
                        title="Sao chép số tài khoản"
                      >
                        {copiedField === 'acc' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="text-[10px] font-bold">Copy</span>
                      </button>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">Số tiền:</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-sm text-red-600 dark:text-red-400">
                        {selectedPlan.price.toLocaleString('vi-VN')} đ
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedPlan.price.toString(), 'amount')}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-200 flex items-center space-x-1 cursor-pointer"
                        title="Sao chép số tiền"
                      >
                        {copiedField === 'amount' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="text-[10px] font-bold">Copy</span>
                      </button>
                    </div>
                  </div>

                  {/* Cấu trúc tin nhắn mẫu */}
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-800 dark:text-amber-300 font-bold">
                        Cấu trúc tin nhắn mẫu:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(transferCode, 'memo')}
                        className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 rounded-lg text-amber-950 dark:text-amber-100 font-bold flex items-center space-x-1 cursor-pointer shadow-2xs"
                        title="Sao chép nội dung chuyển khoản mẫu"
                      >
                        {copiedField === 'memo' ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="text-[10px]">Sao chép tin nhắn</span>
                      </button>
                    </div>
                    <div className="mt-1 font-mono font-black text-sm text-amber-950 dark:text-amber-200 bg-white/70 dark:bg-slate-900/60 p-1.5 rounded-lg border border-amber-200 dark:border-amber-800 tracking-wider">
                      {transferCode}
                    </div>
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                      *(Khi quét QR, ngân hàng sẽ tự điền tin nhắn này, Thầy/Cô không cần nhập lại)*
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm button */}
            <div className="pt-1">
              {transferSubmitted ? (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold text-sm">Đã gửi yêu cầu xác nhận 199.000 đ thành công!</span>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                      Hệ thống đang đối soát mã giao dịch <strong>{transferCode}</strong> và sẽ tự động nâng cấp gói 1 Năm cho Thầy/Cô trong giây lát.
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmTransfer}
                  disabled={isSubmittingTransfer}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-700 hover:to-rose-800 text-white font-bold text-sm rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99] disabled:opacity-50"
                >
                  {isSubmittingTransfer ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang gửi thông tin...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Tôi đã quét mã chuyển khoản {selectedPlan.price.toLocaleString('vi-VN')} đ (Xác nhận ngay)</span>
                    </>
                  )}
                </button>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: ACTIVATION CODE */}
        {activeTab === 'code' && (
          <div className="p-5 sm:p-6 space-y-5">
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 space-y-1.5">
              <div className="flex items-center space-x-2 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Kích hoạt ngay bằng Mã bản quyền</span>
              </div>
              <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
                Nếu Thầy/Cô đã nhận được mã kích hoạt bản quyền từ Admin (hoặc mã kích hoạt: <code className="font-mono font-bold bg-white/80 dark:bg-slate-900 px-1.5 py-0.5 rounded text-indigo-700 dark:text-indigo-300">TOAN199K</code> hoặc <code className="font-mono font-bold bg-white/80 dark:bg-slate-900 px-1.5 py-0.5 rounded text-indigo-700 dark:text-indigo-300">TOAN2026VIP</code>), hãy nhập tại đây để mở khóa bản quyền ngay lập tức.
              </p>
            </div>

            <form onSubmit={handleActivateWithCode} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Nhập mã kích hoạt (Activation Key):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={activationCode}
                    onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                    placeholder="Ví dụ: TOAN2026VIP"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-sm font-mono font-bold uppercase tracking-wider text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
              </div>

              {codeMessage && (
                <div
                  className={`p-3.5 rounded-xl text-xs flex items-center space-x-2 ${
                    codeMessage.isError
                      ? 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300'
                      : 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {codeMessage.isError ? (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span>{codeMessage.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isActivating || !activationCode.trim()}
                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {isActivating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang kiểm tra mã...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Xác nhận kích hoạt VIP</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Footer info */}
        <div className="p-4 bg-slate-100/70 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Đồng bộ và bảo vệ an toàn trên Cloud Firestore</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-slate-800 dark:hover:text-white font-bold underline cursor-pointer"
          >
            Đóng cửa sổ
          </button>
        </div>

      </div>
    </div>
  );
};
