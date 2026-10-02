import React, { useState, useEffect } from 'react';
import { 
  Contest, 
  Question, 
  QuestionType, 
  GradeLevel, 
  ClassRoom, 
  ExamTemplate, 
  Assignment 
} from '../../../types';
import { FirestoreService } from '../../../services/firestoreService';
import { StorageService } from '../../../services/storageService';
import { MathDisplay } from '../../../components/MathDisplay';
import { isEssayQuestion, getQuestionTypeLabel } from '../../../utils/questionUtils';
import { useAuth } from '../../../context/AuthContext';
import { 
  Trophy, 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Layers, 
  BookOpen, 
  CheckSquare, 
  Square, 
  Sparkles, 
  Clock, 
  Calendar, 
  Settings2, 
  HelpCircle,
  Shuffle,
  Eye,
  RotateCcw,
  CheckCircle2,
  FileQuestion
} from 'lucide-react';

interface TeacherCreateContestProps {
  editingContest?: Contest;
  onSaveSuccess: (savedContest: Contest) => void;
  onCancel: () => void;
}

export const TeacherCreateContest: React.FC<TeacherCreateContestProps> = ({
  editingContest,
  onSaveSuccess,
  onCancel
}) => {
  const { user } = useAuth();

  // Basic contest info
  const [title, setTitle] = useState(editingContest?.title || '');
  const [description, setDescription] = useState(editingContest?.description || '');
  const [grade, setGrade] = useState<GradeLevel>(editingContest?.grade || '7');
  const [topic, setTopic] = useState(editingContest?.topic || '');
  const [durationMinutes, setDurationMinutes] = useState<number>(editingContest?.durationMinutes || 45);
  
  // Format default start/end times
  const defaultStartTime = () => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const defaultEndTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setMinutes(0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const [startTime, setStartTime] = useState<string>(() => {
    if (editingContest?.startTime) {
      try {
        const d = new Date(editingContest.startTime);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      } catch {}
    }
    return defaultStartTime();
  });

  const [endTime, setEndTime] = useState<string>(() => {
    if (editingContest?.endTime) {
      try {
        const d = new Date(editingContest.endTime);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      } catch {}
    }
    return defaultEndTime();
  });

  const [maxAttempts, setMaxAttempts] = useState<number>(editingContest?.maxAttempts ?? 1);
  const [allowViewScore, setAllowViewScore] = useState<boolean>(editingContest?.allowViewScore ?? true);
  const [allowViewAnswer, setAllowViewAnswer] = useState<boolean>(editingContest?.allowViewAnswer ?? false);
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(editingContest?.shuffleQuestions ?? true);
  const [shuffleOptions, setShuffleOptions] = useState<boolean>(editingContest?.shuffleOptions ?? true);
  const [allowGoBack, setAllowGoBack] = useState<boolean>(editingContest?.allowGoBack ?? true);

  // Selected questions list in contest
  const [questions, setQuestions] = useState<Question[]>(editingContest?.questions || []);

  // Question bank picking modal/tab
  const [bankTab, setBankTab] = useState<'selected' | 'templates' | 'assignments' | 'custom'>('selected');
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Load templates & assignments
  useEffect(() => {
    loadSourceData();
  }, []);

  const loadSourceData = async () => {
    try {
      const localAsg = StorageService.getAssignments();
      setAssignments(localAsg);

      const cloudTemplates = await FirestoreService.getExamTemplates();
      setTemplates(cloudTemplates);
    } catch (e) {
      console.warn('Lỗi nạp kho câu hỏi:', e);
    }
  };

  // Tính tổng điểm các câu
  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

  // Thao tác với danh sách câu hỏi
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...questions];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setQuestions(next.map((q, idx) => ({ ...q, order: idx + 1 })));
  };

  const handleMoveDown = (index: number) => {
    if (index === questions.length - 1) return;
    const next = [...questions];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    setQuestions(next.map((q, idx) => ({ ...q, order: idx + 1 })));
  };

  const handleRemoveQuestion = (questionId: string) => {
    setQuestions(prev => prev.filter(q => q.id !== questionId).map((q, idx) => ({ ...q, order: idx + 1 })));
  };

  const handleUpdatePoints = (questionId: string, points: number) => {
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, points: Math.max(0.1, points) } : q));
  };

  // Thêm tất cả câu hỏi từ 1 Đề
  const handleAddAllFromList = (incoming: Question[]) => {
    const existingIds = new Set(questions.map(q => q.id));
    const newQuestions = incoming.filter(q => !existingIds.has(q.id));
    const merged = [...questions, ...newQuestions].map((q, idx) => ({
      ...q,
      order: idx + 1,
      points: q.points || 1
    }));
    setQuestions(merged);
    alert(`Đã thêm ${newQuestions.length} câu hỏi mới vào cuộc thi!`);
    setBankTab('selected');
  };

  // Tích chọn từng câu hỏi
  const handleToggleSingleQuestion = (q: Question) => {
    const exists = questions.some(existing => existing.id === q.id);
    if (exists) {
      setQuestions(prev => prev.filter(existing => existing.id !== q.id).map((item, idx) => ({ ...item, order: idx + 1 })));
    } else {
      setQuestions(prev => [...prev, { ...q, order: prev.length + 1, points: q.points || 1 }]);
    }
  };

  // Thêm câu hỏi thủ công
  const handleAddCustomQuestion = (type: QuestionType) => {
    const newQ: Question = {
      id: `q_custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      order: questions.length + 1,
      question: type === 'essay' ? 'Bài toán tự luận: Hãy trình bày các bước giải chi tiết...' : 'Câu hỏi mới: Điền nội dung vào đây...',
      type,
      options: type === 'multiple_choice' ? [
        { id: 'A', text: 'Phương án A' },
        { id: 'B', text: 'Phương án B' },
        { id: 'C', text: 'Phương án C' },
        { id: 'D', text: 'Phương án D' }
      ] : type === 'true_false' ? [
        { id: 'A', text: 'Đúng' },
        { id: 'B', text: 'Sai' }
      ] : [],
      correctAnswer: type === 'multiple_choice' ? 'A' : type === 'true_false' ? 'A' : '',
      points: type === 'essay' ? 2.0 : 1.0,
      rubric: type === 'essay' ? 'Tiêu chí chấm: Đúng công thức (0.5đ), Biến đổi chính xác (1.0đ), Kết luận đúng (0.5đ)' : undefined
    };

    setQuestions(prev => [...prev, newQ]);
    setBankTab('selected');
  };

  // Lưu cuộc thi
  const handleSave = async () => {
    if (!title.trim()) {
      alert('Vui lòng nhập tên cuộc thi!');
      return;
    }
    if (questions.length === 0) {
      alert('Vui lòng chọn ít nhất 1 câu hỏi cho cuộc thi!');
      return;
    }
    if (!startTime || !endTime) {
      alert('Vui lòng chọn thời gian bắt đầu và kết thúc!');
      return;
    }
    if (new Date(startTime).getTime() >= new Date(endTime).getTime()) {
      alert('Thời gian kết thúc phải sau thời gian bắt đầu!');
      return;
    }

    setIsSaving(true);
    try {
      const contestId = editingContest?.id || `contest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const contestCode = editingContest?.code || StorageService.generateContestCode(grade);

      const contestData: Contest = {
        id: contestId,
        code: contestCode,
        title: title.trim(),
        description: description.trim(),
        grade,
        topic: topic.trim(),
        questions,
        durationMinutes: Number(durationMinutes) || 45,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        maxAttempts: Number(maxAttempts) || 1,
        allowViewScore,
        allowViewAnswer,
        shuffleQuestions,
        shuffleOptions,
        allowGoBack,
        isPublished: true,
        createdAt: editingContest?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 1. Lưu LocalStorage
      StorageService.saveContest(contestData);

      // 2. Lưu Firestore
      await FirestoreService.saveContest(contestData, user || undefined);

      alert(`Đã lưu cuộc thi "${contestData.title}" thành công với mã: ${contestData.code}`);
      onSaveSuccess(contestData);
    } catch (e) {
      console.error('Lỗi lưu cuộc thi:', e);
      alert('Lưu cuộc thi gặp lỗi: ' + String(e));
    } finally {
      setIsSaving(false);
    }
  };

  // Danh sách câu hỏi từ nguồn đang chọn
  const activeTemplate = templates.find(t => t.id === selectedTemplateId);
  const activeAssignment = assignments.find(a => a.id === selectedAssignmentId);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          className="flex items-center space-x-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại danh sách</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Đang lưu...' : (editingContest ? 'Cập nhật cuộc thi' : 'Lưu & Xuất bản')}</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex items-center space-x-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-950/70 text-orange-600 dark:text-orange-400 flex items-center justify-center">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">
              {editingContest ? 'Chỉnh sửa Cuộc thi' : 'Tạo Cuộc Thi Trực Tuyến Mới'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Thiết lập thời gian, cấu hình thi bảo mật và chọn đề thi từ Kho đề mẫu hoặc Bài tập
            </p>
          </div>
        </div>

        {/* 1. THÔNG TIN CƠ BẢN */}
        <div className="space-y-4">
          <h3 className="text-xs font-extrabold tracking-wider uppercase text-orange-600 dark:text-orange-400">
            1. Thông tin cuộc thi
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tên cuộc thi <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Đấu trường Toán 7 – Chinh phục Số hữu tỉ"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Khối lớp <span className="text-rose-500">*</span>
              </label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value as GradeLevel)}
                className="w-full px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              >
                <option value="6">Toán Khối 6</option>
                <option value="7">Toán Khối 7</option>
                <option value="8">Toán Khối 8</option>
                <option value="9">Toán Khối 9</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Chủ đề / Chuyên đề
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="VD: Tam giác bằng nhau, Định lý Pytago..."
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Mô tả ngắn / Lời nhắn tới thí sinh
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="VD: Thí sinh chuẩn bị giấy nháp, không sử dụng tài liệu ngoài..."
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>

        {/* 2. THỜI GIAN & THỜI LƯỢNG */}
        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-xs font-extrabold tracking-wider uppercase text-orange-600 dark:text-orange-400 flex items-center space-x-1.5">
            <Clock className="w-4 h-4" />
            <span>2. Thời gian & Thời lượng thi</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Thời gian mở cuộc thi <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Thời gian đóng cuộc thi <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Thời lượng làm bài (phút)
              </label>
              <input
                type="number"
                min="5"
                max="180"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>

        {/* 3. CẤU HÌNH BẢO MẬT & TRẢ KẾT QUẢ */}
        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-xs font-extrabold tracking-wider uppercase text-orange-600 dark:text-orange-400 flex items-center space-x-1.5">
            <Settings2 className="w-4 h-4" />
            <span>3. Cấu hình bảo mật & Luật thi</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {/* Trộn câu hỏi */}
            <label className="flex items-center space-x-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-4 h-4 rounded-sm text-orange-600 focus:ring-orange-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Trộn thứ tự câu hỏi</span>
                <span className="text-[10px] text-slate-500">Mỗi thí sinh nhận thứ tự câu khác nhau</span>
              </div>
            </label>

            {/* Trộn đáp án */}
            <label className="flex items-center space-x-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="w-4 h-4 rounded-sm text-orange-600 focus:ring-orange-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Trộn đáp án A, B, C, D</span>
                <span className="text-[10px] text-slate-500">Tự động điều chỉnh đáp án đúng chuẩn xác</span>
              </div>
            </label>

            {/* Cho phép quay lại câu trước */}
            <label className="flex items-center space-x-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <input
                type="checkbox"
                checked={allowGoBack}
                onChange={(e) => setAllowGoBack(e.target.checked)}
                className="w-4 h-4 rounded-sm text-orange-600 focus:ring-orange-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Cho phép xem lại câu trước</span>
                <span className="text-[10px] text-slate-500">Nếu tắt: thí sinh chỉ được làm tuần tự</span>
              </div>
            </label>

            {/* Xem điểm sau nộp */}
            <label className="flex items-center space-x-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <input
                type="checkbox"
                checked={allowViewScore}
                onChange={(e) => setAllowViewScore(e.target.checked)}
                className="w-4 h-4 rounded-sm text-orange-600 focus:ring-orange-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Xem điểm sau khi nộp</span>
                <span className="text-[10px] text-slate-500">Hiển thị điểm trắc nghiệm tức thì</span>
              </div>
            </label>

            {/* Xem đáp án sau nộp */}
            <label className="flex items-center space-x-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <input
                type="checkbox"
                checked={allowViewAnswer}
                onChange={(e) => setAllowViewAnswer(e.target.checked)}
                className="w-4 h-4 rounded-sm text-orange-600 focus:ring-orange-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Xem đáp án chi tiết</span>
                <span className="text-[10px] text-slate-500">Khuyên tắt trong các kỳ thi chung</span>
              </div>
            </label>

            {/* Số lần làm bài */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Số lần được thi</span>
                <span className="text-[10px] text-slate-500">1 = Thi 1 lần duy nhất</span>
              </div>
              <select
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
              >
                <option value="1">1 lần duy nhất</option>
                <option value="2">Tối đa 2 lần</option>
                <option value="3">Tối đa 3 lần</option>
                <option value="0">Không giới hạn</option>
              </select>
            </div>
          </div>
        </div>

        {/* 4. CHỌN CÂU HỎI CHO CUỘC THI */}
        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-extrabold tracking-wider uppercase text-orange-600 dark:text-orange-400 flex items-center space-x-1.5">
                <FileQuestion className="w-4 h-4" />
                <span>4. Danh sách câu hỏi ({questions.length} câu • Tổng {totalPoints.toFixed(1)} điểm)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Có thể trộn trắc nghiệm, đúng/sai, trả lời ngắn và tự luận trong cùng cuộc thi
              </p>
            </div>

            {/* Source Tab Selector */}
            <div className="flex items-center space-x-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setBankTab('selected')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  bankTab === 'selected'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Đã chọn ({questions.length})
              </button>
              <button
                type="button"
                onClick={() => setBankTab('templates')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  bankTab === 'templates'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Kho đề mẫu
              </button>
              <button
                type="button"
                onClick={() => setBankTab('assignments')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  bankTab === 'assignments'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Từ Bài tập
              </button>
              <button
                type="button"
                onClick={() => setBankTab('custom')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  bankTab === 'custom'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                + Tự soạn
              </button>
            </div>
          </div>

          {/* TAB 1: DANH SÁCH CÂU HỎI ĐÃ CHỌN */}
          {bankTab === 'selected' && (
            <div className="space-y-3">
              {questions.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Chưa có câu hỏi nào trong cuộc thi này.
                  </p>
                  <div className="flex items-center justify-center space-x-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setBankTab('templates')}
                      className="px-3 py-1.5 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition-colors"
                    >
                      Lấy từ Kho đề mẫu
                    </button>
                    <button
                      type="button"
                      onClick={() => setBankTab('assignments')}
                      className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                    >
                      Lấy từ Bài tập
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {questions.map((q, idx) => {
                    const isEssay = isEssayQuestion(q);
                    return (
                      <div
                        key={q.id || idx}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex items-start justify-between gap-3"
                      >
                        <div className="flex items-start space-x-3 flex-1">
                          <span className="w-6 h-6 rounded-lg bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 font-extrabold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                                isEssay 
                                  ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                  : q.type === 'short_answer'
                                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                  : q.type === 'true_false'
                                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              }`}>
                                {getQuestionTypeLabel(q.type)}
                              </span>

                              {/* Points input */}
                              <div className="flex items-center space-x-1 text-xs">
                                <span className="text-slate-400 font-semibold text-[11px]">Điểm:</span>
                                <input
                                  type="number"
                                  step="0.25"
                                  min="0.1"
                                  max="10"
                                  value={q.points || 1}
                                  onChange={(e) => handleUpdatePoints(q.id, parseFloat(e.target.value) || 1)}
                                  className="w-14 px-1.5 py-0.5 text-xs font-bold rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-center"
                                />
                              </div>
                            </div>

                            <div className="text-xs text-slate-800 dark:text-slate-200 line-clamp-2">
                              <MathDisplay content={q.question} />
                            </div>

                            {!isEssay && q.correctAnswer && (
                              <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                Đáp án đúng: {q.correctAnswer}
                              </div>
                            )}

                            {isEssay && q.rubric && (
                              <div className="text-[11px] text-purple-600 dark:text-purple-400 line-clamp-1 italic">
                                Tiêu chí: {q.rubric}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Order & Delete Buttons */}
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveUp(idx)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                            title="Lên trên"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === questions.length - 1}
                            onClick={() => handleMoveDown(idx)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                            title="Xuống dưới"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(q.id)}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            title="Xóa câu này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CHỌN TỪ KHO ĐỀ MẪU */}
          {bankTab === 'templates' && (
            <div className="space-y-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Chọn đề từ Kho Đề Mẫu:
                </span>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="">-- Bấm để chọn đề mẫu --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      [{t.grade}] {t.title} ({t.questions?.length || 0} câu)
                    </option>
                  ))}
                </select>
              </div>

              {activeTemplate && (
                <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {activeTemplate.title} ({activeTemplate.questions?.length} câu hỏi)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddAllFromList(activeTemplate.questions)}
                      className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs"
                    >
                      + Chọn toàn bộ đề này
                    </button>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {activeTemplate.questions.map((q, qIdx) => {
                      const isSelected = questions.some(item => item.id === q.id);
                      return (
                        <div
                          key={q.id || qIdx}
                          onClick={() => handleToggleSingleQuestion(q)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors flex items-start space-x-2.5 ${
                            isSelected
                              ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="pt-0.5">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-orange-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                              Câu {qIdx + 1}: <MathDisplay content={q.question} />
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Loại: {getQuestionTypeLabel(q.type)} • Đáp án: {q.correctAnswer}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CHỌN TỪ BÀI TẬP HIỆN CÓ */}
          {bankTab === 'assignments' && (
            <div className="space-y-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Chọn từ Bài tập đã tạo:
                </span>
                <select
                  value={selectedAssignmentId}
                  onChange={(e) => setSelectedAssignmentId(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="">-- Bấm để chọn bài tập --</option>
                  {assignments.map(a => (
                    <option key={a.id} value={a.id}>
                      [{a.grade}] {a.title} ({a.questions?.length || 0} câu)
                    </option>
                  ))}
                </select>
              </div>

              {activeAssignment && (
                <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {activeAssignment.title} ({activeAssignment.questions?.length} câu hỏi)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddAllFromList(activeAssignment.questions)}
                      className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs"
                    >
                      + Chọn toàn bộ bài này
                    </button>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {activeAssignment.questions.map((q, qIdx) => {
                      const isSelected = questions.some(item => item.id === q.id);
                      return (
                        <div
                          key={q.id || qIdx}
                          onClick={() => handleToggleSingleQuestion(q)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors flex items-start space-x-2.5 ${
                            isSelected
                              ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="pt-0.5">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-orange-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                              Câu {qIdx + 1}: <MathDisplay content={q.question} />
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Loại: {getQuestionTypeLabel(q.type)} • Đáp án: {q.correctAnswer}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: THÊM CÂU HỎI MỚI / TỰ SOẠN */}
          {bankTab === 'custom' && (
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4 text-center">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Chọn định dạng câu hỏi Thầy/Cô muốn thêm vào:
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
                <button
                  type="button"
                  onClick={() => handleAddCustomQuestion('multiple_choice')}
                  className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 font-bold text-xs flex flex-col items-center space-y-1.5 transition-all active:scale-95"
                >
                  <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black">
                    A
                  </span>
                  <span>Trắc nghiệm (A,B,C,D)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddCustomQuestion('true_false')}
                  className="p-4 rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 hover:bg-blue-100 font-bold text-xs flex flex-col items-center space-y-1.5 transition-all active:scale-95"
                >
                  <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black">
                    ✓
                  </span>
                  <span>Đúng / Sai</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddCustomQuestion('short_answer')}
                  className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 font-bold text-xs flex flex-col items-center space-y-1.5 transition-all active:scale-95"
                >
                  <span className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-black">
                    =
                  </span>
                  <span>Trả lời ngắn</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddCustomQuestion('essay')}
                  className="p-4 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/60 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200 hover:bg-purple-100 font-bold text-xs flex flex-col items-center space-y-1.5 transition-all active:scale-95"
                >
                  <span className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-black">
                    ✍
                  </span>
                  <span>Tự luận (có AI chấm)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Tổng cộng: <strong className="text-slate-900 dark:text-white">{questions.length} câu hỏi</strong> •{' '}
            <strong className="text-orange-600 dark:text-orange-400">{totalPoints.toFixed(1)} điểm</strong>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Đang lưu...' : (editingContest ? 'Cập nhật cuộc thi' : 'Lưu & Xuất bản cuộc thi')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
