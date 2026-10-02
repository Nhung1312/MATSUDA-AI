import React, { useState } from 'react';
import { Assignment } from '../types';
import { MathDisplay } from './MathDisplay';
import { 
  Printer, 
  X, 
  FileText, 
  CheckCircle2, 
  Settings2, 
  Download, 
  Eye, 
  FileCheck,
  Award,
  Layers
} from 'lucide-react';

interface PrintExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment;
}

export const PrintExamModal: React.FC<PrintExamModalProps> = ({
  isOpen,
  onClose,
  assignment
}) => {
  const [printMode, setPrintMode] = useState<'exam_only' | 'exam_with_solutions' | 'answer_sheet'>('exam_only');
  const [schoolName, setSchoolName] = useState('TRƯỜNG THCS NGUYỄN DU');
  const [examSemester, setExamSemester] = useState('KIỂM TRA ĐỊNH KỲ MÔN TOÁN');
  const [schoolYear, setSchoolYear] = useState('Năm học: 2025 - 2026');
  const [showAnswerKey, setShowAnswerKey] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const questions = assignment.questions || [];

  return (
    <>
      {/* 
        Nhúng CSS trực tiếp: 
        Đảm bảo khi in sẽ ẩn TOÀN BỘ giao diện Dashboard bên dưới, 
        chỉ giữ lại duy nhất nội dung của khối có id="print-area" 
      */}
      <style type="text/css" media="print">
        {`
          @page { size: auto; margin: 15mm; }
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            width: 100% !important; 
            margin: 0 !important; 
            padding: 0 !important; 
          }
        `}
      </style>

      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
        {/* Print Controls Floating Box (Hidden during print) */}
        <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden print:hidden">
          {/* Modal Top Bar */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  In đề thi & Xuất PDF chuẩn Bộ GD&ĐT
                </h2>
                <p className="text-xs text-slate-500">
                  Tự động dàn trang khổ A4, ẩn các chi tiết web khi in
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrint}
                className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>In ngay / Lưu PDF</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Print Configuration Options */}
          <div className="p-4 bg-indigo-50/50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Mode Selector */}
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-700">Chế độ in:</span>
              <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => {
                    setPrintMode('exam_only');
                    setShowAnswerKey(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                    printMode === 'exam_only'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📄 Đề học sinh làm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintMode('exam_with_solutions');
                    setShowAnswerKey(true);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                    printMode === 'exam_with_solutions'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🔑 Đề + Đáp án & Lời giải
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintMode('answer_sheet');
                    setShowAnswerKey(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                    printMode === 'answer_sheet'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📝 Phiếu tô trắc nghiệm
                </button>
              </div>
            </div>

            {/* Quick Header Fields */}
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="Tên trường..."
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 w-44"
                title="Tên trường hiển thị trên góc trái đề thi"
              />
              <input
                type="text"
                value={examSemester}
                onChange={(e) => setExamSemester(e.target.value)}
                placeholder="Kỳ thi..."
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 w-48"
                title="Tiêu đề kỳ thi"
              />
            </div>
          </div>

          {/* Paper Document Preview Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/60 flex justify-center">
            {/* Printable A4 Sheet Mockup */}
            <div className="bg-white text-black w-full max-w-[820px] min-h-[1050px] p-8 sm:p-12 shadow-xl rounded-xl border border-slate-300 font-serif leading-normal select-text">
              {/* 1. Standard Ministry / School Header */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b-2 border-black mb-4">
                <div className="text-center font-sans">
                  <div className="font-bold text-xs uppercase tracking-wide">{schoolName}</div>
                  <div className="text-[11px] text-slate-700 uppercase font-semibold">TỔ BỘ MÔN TOÁN - TIN</div>
                  <div className="text-[10px] text-slate-600 mt-0.5">{schoolYear}</div>
                  <div className="mt-2 text-xs font-bold border border-black inline-block px-3 py-0.5 uppercase">
                    MÃ ĐỀ: {assignment.assignmentCode}
                  </div>
                </div>

                <div className="text-center font-sans">
                  <div className="font-extrabold text-sm uppercase tracking-wide">{examSemester}</div>
                  <div className="font-bold text-xs mt-0.5 uppercase">MÔN: TOÁN - LỚP {assignment.grade}</div>
                  <div className="text-[11px] text-slate-700 italic mt-0.5">
                    Thời gian làm bài: {assignment.durationMinutes > 0 ? `${assignment.durationMinutes} phút` : '45 phút'} (Không kể thời gian phát đề)
                  </div>
                </div>
              </div>

              {/* Student Info Box & Grade Box */}
              <div className="grid grid-cols-3 gap-3 border border-black p-3 mb-6 font-sans text-xs">
                <div className="col-span-2 space-y-1.5">
                  <div>Họ và tên thí sinh: ............................................................................</div>
                  <div className="flex space-x-6">
                    <div>Lớp: <strong>{assignment.className || '...........'}</strong></div>
                    <div>SBD: ......................................</div>
                    <div>Phòng thi: ...........</div>
                  </div>
                </div>

                <div className="border-l border-black pl-3 flex flex-col justify-between text-center">
                  <div className="font-bold uppercase text-[11px]">ĐIỂM & LỜI PHÊ</div>
                  <div className="h-10 border border-dashed border-slate-400 rounded-sm flex items-center justify-center text-slate-300 text-[10px]">
                    (Điểm số)
                  </div>
                </div>
              </div>

              {/* Exam Title */}
              <div className="text-center mb-6 font-sans">
                <h1 className="text-base sm:text-lg font-black uppercase tracking-wide">
                  {assignment.title}
                </h1>
                {assignment.topic && (
                  <p className="text-xs text-slate-600 italic">Chủ đề: {assignment.topic}</p>
                )}
              </div>

              {/* Mode 1 & 2: Questions List */}
              {printMode !== 'answer_sheet' && (
                <div className="space-y-5 font-serif text-[13.5px] leading-relaxed">
                  <div className="font-sans font-bold text-xs uppercase tracking-wider bg-slate-100 p-1.5 rounded-sm border border-slate-300">
                    PHẦN CÂU HỎI ({questions.length} CÂU)
                  </div>

                  {questions.map((q, idx) => {
                    return (
                      <div key={q.id} className="break-inside-avoid space-y-2">
                        {/* Question Text */}
                        <div className="flex items-start space-x-1.5">
                          <span className="font-sans font-bold whitespace-nowrap">
                            Câu {idx + 1}. ({q.points} điểm):
                          </span>
                          <div className="flex-1 font-medium">
                            <MathDisplay text={q.question} />
                            {q.imageUrl && (
                              <div className="my-2 flex justify-center">
                                <img 
                                  src={q.imageUrl} 
                                  alt={`Hình vẽ câu ${idx + 1}`} 
                                  className="max-h-48 max-w-sm object-contain border border-slate-300 rounded-sm"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Multiple choice options */}
                        {q.options && q.options.length > 0 && q.options.some(o => o.text.trim()) && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-4 text-xs font-sans">
                            {q.options.map((opt) => {
                              const isCorrect = q.correctAnswer === opt.id;
                              return (
                                <div
                                  key={opt.id}
                                  className={`flex items-start space-x-1.5 p-1 rounded-sm ${
                                    showAnswerKey && isCorrect ? 'bg-amber-100 font-bold border border-amber-400' : ''
                                  }`}
                                >
                                  <span className="font-bold">{opt.id}.</span>
                                  <span><MathDisplay text={opt.text} /></span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Solutions & Explanation (if enabled) */}
                        {showAnswerKey && (
                          <div className="mt-2 p-2.5 bg-slate-50 border border-slate-300 rounded-sm text-xs font-sans text-slate-800 space-y-1">
                            <div>
                              <span className="font-bold text-emerald-700">Đáp án đúng: {q.correctAnswer}</span>
                              {q.topicHint && <span className="text-slate-500 ml-2">({q.topicHint})</span>}
                            </div>
                            {q.explanation && (
                              <div className="italic text-slate-600">
                                <strong>Hướng dẫn giải:</strong> <MathDisplay text={q.explanation} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Exam Ending Footer */}
                  <div className="text-center pt-8 border-t border-black/30 font-sans text-xs italic text-slate-600">
                    ---------- HẾT ----------<br />
                    <span className="text-[11px]">Cán bộ coi thi không giải thích gì thêm. Thí sinh không được sử dụng tài liệu.</span>
                  </div>
                </div>
              )}

              {/* Mode 3: Answer Sheet Template */}
              {printMode === 'answer_sheet' && (
                <div className="space-y-6 font-sans">
                  <div className="text-center font-bold text-sm uppercase mb-4">
                    PHIẾU TRẢ LỜI TRẮC NGHIỆM
                  </div>
                  <p className="text-xs text-slate-600 italic text-center mb-6">
                    (Thí sinh dùng bút chì/bút mực tô kín vào ô tròn chứa chữ cái tương ứng với đáp án chọn)
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {questions.map((q, idx) => (
                      <div key={q.id} className="p-2 border border-slate-300 rounded-md flex items-center justify-between text-xs">
                        <span className="font-bold w-12">Câu {idx + 1}:</span>
                        <div className="flex space-x-2">
                          {['A', 'B', 'C', 'D'].map((opt) => (
                            <div
                              key={opt}
                              className="w-5 h-5 rounded-full border border-black flex items-center justify-center font-bold text-[10px]"
                            >
                              {opt}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 
          Actual Pure Print Area 
          Giải pháp cho KaTeX: Để div này trôi dạt ra ngoài màn hình (-9999px) thay vì dùng "hidden".
          Điều này giúp KaTeX luôn trong trạng thái được render ngầm đầy đủ.
        */}
        <div 
          id="print-area" 
          className="absolute -left-[9999px] top-0 bg-white text-black p-0 m-0 w-full print:static print:left-auto print:top-auto print:w-full"
        >
          {/* Pure Print Container without scrollbars or wrappers */}
          <div className="w-full max-w-full p-8 font-serif leading-normal">
            {/* Header */}
            <div className="grid grid-cols-2 gap-4 pb-3 border-b-2 border-black mb-3">
              <div className="text-center font-sans">
                <div className="font-bold text-xs uppercase">{schoolName}</div>
                <div className="text-[11px] uppercase font-semibold">TỔ BỘ MÔN TOÁN - TIN</div>
                <div className="text-[10px] text-slate-700">{schoolYear}</div>
                <div className="mt-1 text-xs font-bold border border-black inline-block px-3 py-0.5 uppercase">
                  MÃ ĐỀ: {assignment.assignmentCode}
                </div>
              </div>

              <div className="text-center font-sans">
                <div className="font-extrabold text-sm uppercase">{examSemester}</div>
                <div className="font-bold text-xs uppercase">MÔN: TOÁN - KHỐI {assignment.grade}</div>
                <div className="text-[11px] italic">
                  Thời gian: {assignment.durationMinutes > 0 ? `${assignment.durationMinutes} phút` : '45 phút'}
                </div>
              </div>
            </div>

            {/* Student Info Box */}
            <div className="grid grid-cols-3 gap-3 border border-black p-3 mb-5 font-sans text-xs">
              <div className="col-span-2 space-y-1.5">
                <div>Họ và tên thí sinh: ............................................................................</div>
                <div className="flex space-x-6">
                  <div>Lớp: <strong>{assignment.className || '...........'}</strong></div>
                  <div>SBD: ......................................</div>
                  <div>Phòng thi: ...........</div>
                </div>
              </div>

              <div className="border-l border-black pl-3 flex flex-col justify-between text-center">
                <div className="font-bold uppercase text-[11px]">ĐIỂM & LỜI PHÊ</div>
                <div className="h-10 border border-dashed border-slate-400 rounded-sm"></div>
              </div>
            </div>

            {/* Exam Title */}
            <div className="text-center mb-5 font-sans">
              <h1 className="text-base font-bold uppercase">{assignment.title}</h1>
            </div>

            {/* Questions */}
            {printMode !== 'answer_sheet' ? (
              <div className="space-y-4 text-[13px] leading-relaxed">
                {questions.map((q, idx) => (
                  <div key={q.id} className="break-inside-avoid space-y-1.5">
                    <div className="flex items-start space-x-1.5">
                      <span className="font-sans font-bold whitespace-nowrap">
                        Câu {idx + 1}. ({q.points} điểm):
                      </span>
                      <div className="flex-1 font-medium">
                        <MathDisplay text={q.question} />
                        {q.imageUrl && (
                          <div className="my-2 flex justify-center">
                            <img 
                              src={q.imageUrl} 
                              alt={`Hình vẽ câu ${idx + 1}`} 
                              className="max-h-40 max-w-xs object-contain border border-slate-300 rounded-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 pl-4 text-xs font-sans">
                        {q.options.map((opt) => (
                          <div key={opt.id} className="flex items-start space-x-1">
                            <span className="font-bold">{opt.id}.</span>
                            <span><MathDisplay text={opt.text} /></span>
                          </div>
                        ))}
                      </div>
                    )}

                    {showAnswerKey && (
                      <div className="mt-1 p-2 bg-slate-50 border border-slate-300 text-xs font-sans">
                        <strong>Đáp án: {q.correctAnswer}</strong>. {q.explanation && <span>Lời giải: <MathDisplay text={q.explanation} /></span>}
                      </div>
                    )}
                  </div>
                ))}

                <div className="text-center pt-6 border-t border-black font-sans text-xs italic">
                  ---------- HẾT ----------
                </div>
              </div>
            ) : (
              <div className="space-y-4 font-sans text-xs">
                <div className="text-center font-bold text-sm uppercase">PHIẾU TRẢ LỜI TRẮC NGHIỆM</div>
                <div className="grid grid-cols-4 gap-3">
                  {questions.map((q, idx) => (
                    <div key={q.id} className="p-2 border border-black flex items-center justify-between">
                      <span className="font-bold">Câu {idx + 1}:</span>
                      <div className="flex space-x-1.5">
                        {['A', 'B', 'C', 'D'].map((opt) => (
                          <span key={opt} className="w-4 h-4 rounded-full border border-black inline-flex items-center justify-center font-bold text-[9px]">
                            {opt}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
