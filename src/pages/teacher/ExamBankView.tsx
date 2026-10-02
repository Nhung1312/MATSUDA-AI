import React, { useState, useEffect } from 'react';
import { ExamTemplate, Assignment, ClassRoom } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { AiSolveExamModal } from '../../components/AiSolveExamModal';
import { 
  Layers, 
  Plus, 
  Trash2, 
  Send, 
  FileText, 
  BookOpen, 
  ArrowLeft,
  Eye,
  Sparkles
} from 'lucide-react';

interface ExamBankViewProps {
  teacherId?: string;
  classes: ClassRoom[];
  onNavigate: (tab: string, params?: any) => void;
}

export const ExamBankView: React.FC<ExamBankViewProps> = ({
  teacherId,
  classes,
  onNavigate
}) => {
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  
  // State để xem trước PDF
  const [viewingTemplate, setViewingTemplate] = useState<ExamTemplate | null>(null);
  
  // State cho Modal giao bài
  const [selectedTemplate, setSelectedTemplate] = useState<ExamTemplate | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [aiSolvingTemplate, setAiSolvingTemplate] = useState<ExamTemplate | null>(null);
  
  const [targetClassId, setTargetClassId] = useState(classes[0]?.id || 'all');
  const [duration, setDuration] = useState(45);
  const [deadline, setDeadline] = useState('');

  useEffect(() => {
    loadTemplates();
  }, [teacherId]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await FirestoreService.getExamTemplates(teacherId);
      setTemplates(data);
      if (data.length > 0) setViewingTemplate(data[0]); // Tự động chọn đề đầu tiên để xem
    } catch (error) {
      console.error('Lỗi tải kho đề:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, templateId: string, title: string) => {
    e.stopPropagation(); // Ngăn click nhầm vào thẻ card
    if (window.confirm(`Bạn có chắc chắn muốn xóa đề mẫu "${title}" khỏi kho không?`)) {
      try {
        await FirestoreService.deleteExamTemplate(templateId);
        setTemplates(prev => prev.filter(t => t.id !== templateId));
        if (viewingTemplate?.id === templateId) setViewingTemplate(null);
      } catch (error) {
        alert('Không thể xóa đề mẫu này.');
      }
    }
  };

  const handleOpenAssign = (e: React.MouseEvent, template: ExamTemplate) => {
    e.stopPropagation(); // Ngăn click nhầm vào thẻ card
    setSelectedTemplate(template);
    setShowAssignModal(true);
  };

  const handlePublishFromBank = async () => {
    if (!selectedTemplate) return;

    const targetClass = classes.find(c => c.id === targetClassId);
    const newAssignment: Assignment = {
      id: 'asg_' + Date.now(),
      title: selectedTemplate.title,
      grade: selectedTemplate.grade,
      topic: selectedTemplate.topic,
      classId: targetClassId,
      className: targetClass ? targetClass.name : 'Tất cả học sinh',
      templateId: selectedTemplate.id,
      pdfUrl: selectedTemplate.pdfUrl,
      // Thêm flag để nhận diện đề PDF
      type: selectedTemplate.pdfUrl ? 'pdf' : 'text', 
      questions: selectedTemplate.questions,
      durationMinutes: Number(duration),
      deadline: deadline || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      allowViewResult: true,
      assignmentCode: 'TOAN' + selectedTemplate.grade + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
      createdAt: new Date().toISOString(),
      isPublished: true
    };

    try {
      await FirestoreService.saveExam(newAssignment);
      alert(`Đã giao bài thành công! Mã đề cho học sinh là: ${newAssignment.assignmentCode}`);
      setShowAssignModal(false);
      onNavigate('assignments');
    } catch (error) {
      alert('Lỗi khi tạo bài tập từ kho đề.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header bar */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => onNavigate('overview')}
            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="inline-flex items-center space-x-1.5 bg-violet-50 text-violet-700 text-[11px] font-bold px-3 py-1 rounded-full mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Quản lý tài nguyên PDF</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">📚 Kho Đề Mẫu Của Tôi</h1>
          </div>
        </div>

        <button
          onClick={() => onNavigate('create', { initialMode: 'pdf' })}
          className="inline-flex items-center space-x-2 bg-violet-600 hover:bg-violet-700 text-white font-extrabold px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer text-xs sm:text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Tải lên đề PDF mới</span>
        </button>
      </div>

      {/* Main Content: 2 Columns */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Đang tải danh sách kho đề...</div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-4">
          <div className="w-16 h-16 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center mx-auto">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Kho đề của bạn đang trống</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Hãy tải lên các đề thi PDF để lưu trữ và giao bài nhanh chóng cho học sinh.
          </p>
          <button
            onClick={() => onNavigate('create', { initialMode: 'pdf' })}
            className="px-5 py-2.5 bg-violet-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-violet-700"
          >
            Tạo đề mẫu đầu tiên
          </button>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 h-[700px]">
          
          {/* CỘT TRÁI: Danh sách đề */}
          <div className="w-full lg:w-1/3 bg-white rounded-3xl p-4 border border-slate-200 shadow-sm overflow-y-auto flex flex-col gap-3">
            <h2 className="font-bold text-slate-800 px-2 pb-2 border-b">Danh sách đề thi ({templates.length})</h2>
            {templates.map((tpl) => (
              <div 
                key={tpl.id} 
                onClick={() => setViewingTemplate(tpl)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  viewingTemplate?.id === tpl.id 
                    ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100' 
                    : 'border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="bg-white text-indigo-700 font-bold text-[10px] px-2 py-1 rounded-md border shadow-xs">
                    Khối {tpl.grade}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                    {tpl.questions?.length || 0} câu
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm line-clamp-2 mb-1">{tpl.title}</h3>
                {tpl.topic && <p className="text-[11px] text-slate-500 mb-3">{tpl.topic}</p>}

                <div className="flex items-center gap-1.5 mt-2 pt-3 border-t border-slate-200/60">
                  <button
                    onClick={(e) => handleOpenAssign(e, tpl)}
                    className="flex-1 inline-flex justify-center items-center space-x-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Giao bài</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAiSolvingTemplate(tpl);
                    }}
                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
                    title="AI Tự động giải đề & Lập đáp án chuẩn"
                  >
                    <Sparkles className="w-3 h-3 text-violet-600" />
                    <span>AI Đáp án</span>
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, tpl.id, tpl.title)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Xóa đề mẫu"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* CỘT PHẢI: Trình xem PDF */}
          <div className="w-full lg:w-2/3 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {viewingTemplate ? (
              <>
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                  <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                    <FileText className="w-4 h-4 text-violet-600" />
                    {viewingTemplate.title}
                  </div>
                  {viewingTemplate.pdfUrl ? (
                    <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold">PDF Sẵn sàng</span>
                  ) : (
                    <span className="text-[11px] bg-rose-100 text-rose-700 px-2 py-1 rounded font-bold">Không có PDF</span>
                  )}
                </div>
                <div className="flex-1 bg-slate-200 relative">
                  {viewingTemplate.pdfUrl ? (
                    <iframe 
                      src={`${viewingTemplate.pdfUrl}#toolbar=0`} 
                      className="w-full h-full border-none"
                      title="PDF Preview"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 flex-col">
                      <FileText className="w-12 h-12 mb-2 opacity-50" />
                      <p>Đề này chưa được đính kèm file PDF</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                <Eye className="w-12 h-12 mb-3 text-slate-300" />
                <p className="font-medium">Chọn một đề thi bên trái để xem trước</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Cấu hình Giao bài nhanh từ Kho (Giữ nguyên của bạn) */}
      {showAssignModal && selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-slate-900">🚀 Giao đề: {selectedTemplate.title}</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Chọn lớp tiếp nhận:</label>
                <select
                  value={targetClassId}
                  onChange={(e) => setTargetClassId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold outline-none focus:border-violet-500"
                >
                  <option value="all">Toàn bộ học sinh (Tất cả)</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>Lớp {c.name} (Khối {c.grade})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Thời gian làm bài (phút):</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Hạn chót nộp bài:</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                onClick={handlePublishFromBank}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md"
              >
                Xác nhận giao bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Solve & Answer Key Modal for Exam Template */}
      {aiSolvingTemplate && (
        <AiSolveExamModal
          isOpen={!!aiSolvingTemplate}
          onClose={() => setAiSolvingTemplate(null)}
          examTitle={aiSolvingTemplate.title}
          grade={aiSolvingTemplate.grade}
          topic={aiSolvingTemplate.topic}
          questions={aiSolvingTemplate.questions || []}
          onApplyAnswers={async (updatedQuestions) => {
            const updatedTpl: ExamTemplate = {
              ...aiSolvingTemplate,
              questions: updatedQuestions,
              updatedAt: new Date().toISOString()
            };
            try {
              await FirestoreService.saveExamTemplate(updatedTpl);
              alert(`Đã cập nhật bảng đáp án chuẩn thành công cho đề "${updatedTpl.title}"!`);
              setAiSolvingTemplate(null);
              await loadTemplates();
            } catch (err) {
              console.error('Lỗi lưu đề mẫu:', err);
              alert('Có lỗi khi lưu đáp án đề mẫu. Vui lòng thử lại.');
            }
          }}
        />
      )}
    </div>
  );
};
