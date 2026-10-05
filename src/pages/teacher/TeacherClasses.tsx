import React, { useMemo, useState } from 'react';
import { ClassRoom, Student, GradeLevel, Assignment, Submission } from '../../types';
import { StorageService } from '../../services/storageService';
import { FirestoreService } from '../../services/firestoreService';
import { useAuth } from '../../context/AuthContext';
import { 
  Users, 
  Plus, 
  Trash2, 
  Edit3, 
  FileSpreadsheet, 
  UserPlus, 
  Search, 
  Check, 
  X, 
  AlertCircle,
  GraduationCap,
  BookOpen,
  Calendar,
  Clock,
  HelpCircle,
  ArrowRight
} from 'lucide-react';

interface TeacherClassesProps {
  classes: ClassRoom[];
  assignments?: Assignment[];
  submissions?: Submission[];
  onRefresh: () => void;
  onNavigate?: (tab: string, params?: any) => void;
}

export const TeacherClasses: React.FC<TeacherClassesProps> = ({ classes = [], assignments = [], submissions = [], onRefresh, onNavigate }) => {
  const safeClasses = Array.isArray(classes) ? classes.filter((c): c is ClassRoom => Boolean(c && typeof c === 'object')) : [];
  const safeAssignments = Array.isArray(assignments) ? assignments.filter((a): a is Assignment => Boolean(a && typeof a === 'object')) : [];
  const safeSubmissions = Array.isArray(submissions) ? submissions.filter((s): s is Submission => Boolean(s && typeof s === 'object')) : [];
  const { user } = useAuth();
  const [selectedClassId, setSelectedClassId] = useState<string>(safeClasses[0]?.id || '');
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [showImportExcelModal, setShowImportExcelModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);

  // Đồng bộ danh sách lớp lên Cloud Firestore của tài khoản Giáo viên
  const syncToCloud = (updatedClasses: ClassRoom[]) => {
    if (user?.uid) {
      FirestoreService.saveTeacherClasses(user.uid, updatedClasses).catch(err => {
        console.warn('Lỗi đồng bộ lớp học lên Firestore:', err);
      });
    }
  };
  
  // Class Form
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState<GradeLevel>('6');
  const [newAcademicYear, setNewAcademicYear] = useState('2026-2027');

  // Single Student Form
  const [studentName, setStudentName] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [studentGender, setStudentGender] = useState<'Nam' | 'Nữ'>('Nam');

  // Excel paste text
  const [excelPasteText, setExcelPasteText] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [classSubTab, setClassSubTab] = useState<'students' | 'assignments'>('students');
  const [classFormError, setClassFormError] = useState('');
  const [studentFormError, setStudentFormError] = useState('');

  const normalizeKey = (value?: string) => (value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');

  const currentClass = safeClasses.find(c => c.id === selectedClassId) || safeClasses[0];

  const classAssignments = safeAssignments.filter(a => 
    currentClass && (
      a.classId === currentClass.id || 
      a.classId === currentClass.name || 
      a.className === currentClass.name || 
      a.classId === 'all' || 
      !a.classId
    )
  );

  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const duplicated = safeClasses.some(cls => normalizeKey(cls.name) === normalizeKey(newClassName) && normalizeKey(cls.academicYear) === normalizeKey(newAcademicYear));
    if (duplicated) {
      setClassFormError(`Lớp ${newClassName.trim().toUpperCase()} đã tồn tại trong năm học ${newAcademicYear}.`);
      return;
    }
    setClassFormError('');

    const newClass: ClassRoom = {
      id: `class_${Date.now()}`,
      name: newClassName.trim().toUpperCase(),
      grade: newClassGrade,
      academicYear: newAcademicYear,
      students: [],
      createdAt: new Date().toISOString()
    };

    StorageService.saveClass(newClass);
    syncToCloud(StorageService.getClasses());
    onRefresh();
    setSelectedClassId(newClass.id);
    setNewClassName('');
    setShowAddClassModal(false);
  };

  const handleDeleteClass = (classId: string, className: string) => {
    const cls = safeClasses.find(c => c.id === classId);
    const linkedAssignments = safeAssignments.filter(a => a.classId === classId || a.classId === className || a.className === className);
    const assignmentKeys = new Set(linkedAssignments.flatMap(a => [a.id, a.assignmentCode].filter(Boolean)));
    const linkedSubmissions = safeSubmissions.filter(sub => sub.classId === classId || sub.className === className || assignmentKeys.has(sub.assignmentId));
    const warning = `Bạn có chắc muốn xóa lớp ${className}?\n\n• ${cls?.students?.length || 0} học sinh\n• ${linkedAssignments.length} bài đã giao liên quan\n• ${linkedSubmissions.length} bài nộp liên quan\n\nChỉ hồ sơ lớp và danh sách học sinh bị xóa; bài đã giao và bài nộp không bị xóa tự động.`;
    if (window.confirm(warning)) {
      StorageService.deleteClass(classId);
      syncToCloud(StorageService.getClasses());
      onRefresh();
      if (selectedClassId === classId) {
        const remaining = classes.filter(c => c.id !== classId);
        setSelectedClassId(remaining[0]?.id || '');
      }
    }
  };

  const handleAddSingleStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClass || !studentName.trim()) return;
    const students = currentClass.students || [];
    const duplicateCode = studentCode.trim() && students.some(st => normalizeKey(st.code) === normalizeKey(studentCode));
    const duplicateName = students.some(st => normalizeKey(st.name) === normalizeKey(studentName));
    if (duplicateCode || duplicateName) {
      setStudentFormError(duplicateCode ? 'Mã học sinh này đã tồn tại trong lớp.' : 'Học sinh có cùng họ tên đã tồn tại trong lớp. Hãy kiểm tra trước khi thêm.');
      return;
    }
    setStudentFormError('');

    const newStudent: Student = {
      id: `st_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: studentName.trim(),
      classId: currentClass.id,
      code: studentCode.trim() || `HS${(currentClass.students?.length || 0) + 1}`,
      gender: studentGender
    };

    const updatedClass: ClassRoom = {
      ...currentClass,
      students: [...(currentClass.students || []), newStudent]
    };

    StorageService.saveClass(updatedClass);
    syncToCloud(StorageService.getClasses());
    onRefresh();
    setStudentName('');
    setStudentCode('');
    setShowAddStudentModal(false);
  };

  const handleDeleteStudent = (studentId: string) => {
    if (!currentClass) return;
    const updatedStudents = (currentClass.students || []).filter(s => s.id !== studentId);
    const updatedClass: ClassRoom = {
      ...currentClass,
      students: updatedStudents
    };
    StorageService.saveClass(updatedClass);
    syncToCloud(StorageService.getClasses());
    onRefresh();
  };

  const importPreview = useMemo(() => {
    if (!currentClass || !excelPasteText.trim()) return { valid: [] as Student[], skipped: [] as string[] };
    const existingNames = new Set((currentClass.students || []).map(st => normalizeKey(st.name)));
    const existingCodes = new Set((currentClass.students || []).map(st => normalizeKey(st.code)).filter(Boolean));
    const batchNames = new Set<string>();
    const batchCodes = new Set<string>();
    const valid: Student[] = [];
    const skipped: string[] = [];

    excelPasteText.split('\n').map(l => l.trim()).filter(Boolean).forEach((line, index) => {
      const columns = line.split(/[\t,;]/).map(c => c.trim()).filter(Boolean);
      const lower = columns.map(c => normalizeKey(c));
      if (index === 0 && lower.some(c => ['stt', 'họ và tên', 'họ tên', 'tên học sinh', 'mã học sinh', 'mã hs', 'giới tính'].includes(c))) {
        skipped.push(`Dòng ${index + 1}: bỏ qua tiêu đề`);
        return;
      }
      let name = '';
      let code = '';
      let gender: 'Nam' | 'Nữ' = 'Nam';
      if (columns.length >= 2) {
        if (/^\d+$/.test(columns[0])) {
          name = columns[1] || '';
          const genderCell = columns.find(c => /^(nam|nữ|nu)$/i.test(c));
          if (genderCell) gender = normalizeKey(genderCell).includes('nữ') || normalizeKey(genderCell) === 'nu' ? 'Nữ' : 'Nam';
        } else if (columns[0].toLowerCase().startsWith('hs')) {
          code = columns[0]; name = columns[1] || '';
          if (columns[2]) gender = normalizeKey(columns[2]).includes('nữ') || normalizeKey(columns[2]) === 'nu' ? 'Nữ' : 'Nam';
        } else {
          name = columns[0]; code = columns[1] || '';
          if (columns[2]) gender = normalizeKey(columns[2]).includes('nữ') || normalizeKey(columns[2]) === 'nu' ? 'Nữ' : 'Nam';
        }
      } else {
        name = line.replace(/^\d+[\.\-\)]\s*/, '').trim();
      }
      if (!name) { skipped.push(`Dòng ${index + 1}: thiếu họ tên`); return; }
      const nameKey = normalizeKey(name), codeKey = normalizeKey(code);
      if (existingNames.has(nameKey) || batchNames.has(nameKey)) { skipped.push(`Dòng ${index + 1}: trùng họ tên “${name}”`); return; }
      if (codeKey && (existingCodes.has(codeKey) || batchCodes.has(codeKey))) { skipped.push(`Dòng ${index + 1}: trùng mã “${code}”`); return; }
      const fallbackCode = `HS${(currentClass.students?.length || 0) + valid.length + 1}`;
      valid.push({ id: `st_${Date.now()}_${index}`, name, classId: currentClass.id, code: code || fallbackCode, gender });
      batchNames.add(nameKey); batchCodes.add(normalizeKey(code || fallbackCode));
    });
    return { valid, skipped };
  }, [currentClass, excelPasteText]);

  const handleImportExcel = () => {
    if (!currentClass || importPreview.valid.length === 0) return;
    StorageService.saveClass({ ...currentClass, students: [...(currentClass.students || []), ...importPreview.valid] });
    syncToCloud(StorageService.getClasses());
    onRefresh();
    setExcelPasteText('');
    setShowImportExcelModal(false);
  };

  const filteredStudents = (currentClass?.students || []).filter(s =>
    s.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
    (s.code && s.code.toLowerCase().includes(searchKeyword.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Quản lý lớp học & Học sinh</h1>
          <p className="text-sm text-slate-500">
            Tạo danh sách lớp, thêm học sinh hoặc nhập hàng loạt từ Excel/Google Sheets.
          </p>
        </div>
        <button
          onClick={() => setShowAddClassModal(true)}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm text-sm transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>+ Thêm lớp học mới</span>
        </button>
      </div>

      {/* Main Grid: Class Selector & Student Table */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column: Classes List */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2">
          <div className="text-xs font-bold uppercase text-slate-400 px-2 mb-2">
            Danh sách lớp ({safeClasses.length})
          </div>

          {safeClasses.length === 0 ? (
            <div className="text-center py-8 px-3">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">Chưa có lớp học</div>
              <div className="text-xs text-slate-400 mt-1">Tạo lớp đầu tiên để thêm học sinh và giao bài.</div>
              <button
                type="button"
                onClick={() => setShowAddClassModal(true)}
                className="mt-3 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
              >
                Tạo lớp
              </button>
            </div>
          ) : (
            safeClasses.map((cls) => {
              const isSelected = cls.id === currentClass?.id;
              return (
                <div
                  key={cls.id}
                  onClick={() => setSelectedClassId(cls.id)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      {cls.grade}
                    </div>
                    <div>
                      <div className="font-bold text-sm">Lớp {cls.name}</div>
                      <div className={`text-xs ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                        {cls.students?.length || 0} học sinh
                      </div>
                    </div>
                  </div>

                  {/* Delete class */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClass(cls.id, cls.name);
                    }}
                    className={`p-1.5 rounded-lg opacity-80 hover:opacity-100 transition-opacity ${
                      isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-rose-50 text-rose-500'
                    }`}
                    title="Xóa lớp"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Right column: Class Details & Student List */}
        <div className="lg:col-span-3 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
          {currentClass ? (
            <>
              {/* Class Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                      Lớp {currentClass.grade}
                    </span>
                    <h2 className="text-xl font-extrabold text-slate-900">
                      Lớp {currentClass.name}
                    </h2>
                    <span className="text-xs text-slate-400">
                      ({currentClass.academicYear})
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Sĩ số hiện tại: <strong className="text-slate-800">{currentClass.students?.length || 0}</strong> học sinh
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowImportExcelModal(true)}
                    className="inline-flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Dán từ Excel</span>
                  </button>

                  <button
                    onClick={() => setShowAddStudentModal(true)}
                    className="inline-flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ Thêm học sinh</span>
                  </button>
                </div>
              </div>

              {/* Sub-tabs: Học sinh vs Bài tập đã giao */}
              <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setClassSubTab('students')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    classSubTab === 'students'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Danh sách học sinh ({currentClass.students?.length || 0})</span>
                </button>

                <button
                  onClick={() => setClassSubTab('assignments')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    classSubTab === 'assignments'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Bài tập & Sửa câu hỏi ({classAssignments.length})</span>
                </button>
              </div>

              {/* TAB 1: DANH SÁCH HỌC SINH */}
              {classSubTab === 'students' && (
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="Tìm kiếm học sinh theo tên hoặc mã..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>
                    <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                      Hiển thị {filteredStudents.length} / {currentClass.students?.length || 0}
                    </span>
                  </div>

                  {filteredStudents.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-700">Chưa có học sinh</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Thêm học sinh để bắt đầu theo dõi lớp.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-y border-slate-200">
                            <th className="py-2.5 px-3 text-center w-12">STT</th>
                            <th className="py-2.5 px-3">Mã HS</th>
                            <th className="py-2.5 px-4">Họ và tên</th>
                            <th className="py-2.5 px-3 text-center">Giới tính</th>
                            <th className="py-2.5 px-3 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredStudents.map((st, idx) => (
                            <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 px-3 text-center text-xs font-semibold text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-xs font-bold text-indigo-700">
                                {st.code || `HS${idx + 1}`}
                              </td>
                              <td className="py-2.5 px-4 font-semibold text-slate-800">
                                {st.name}
                              </td>
                              <td className="py-2.5 px-3 text-center text-xs">
                                <span
                                  className={`px-2 py-0.5 rounded-full font-medium ${
                                    st.gender === 'Nữ'
                                      ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                      : 'bg-blue-50 text-blue-700 border border-blue-100'
                                  }`}
                                >
                                  {st.gender || 'Nam'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => handleDeleteStudent(st.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                                  title="Xóa học sinh"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: BÀI TẬP VÀ CHỈNH SỬA CÂU HỎI TRỰC TIẾP */}
              {classSubTab === 'assignments' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/70 border border-amber-200/80 p-3.5 rounded-2xl">
                    <div className="text-xs text-amber-900">
                      <span className="font-bold">Các bài tập & đề kiểm tra áp dụng cho lớp {currentClass.name}:</span>
                      <p className="text-amber-700 text-[11px] mt-0.5">
                        Thầy cô có thể bấm nút <strong>"Sửa câu hỏi"</strong> để chỉnh sửa đề bài, đáp án đúng, gợi ý hoặc thang điểm bất kỳ lúc nào.
                      </p>
                    </div>
                    {onNavigate && (
                      <button
                        onClick={() => onNavigate('create')}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Soạn bài tập mới</span>
                      </button>
                    )}
                  </div>

                  {classAssignments.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <BookOpen className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-700">Chưa có bài tập</p>
                      <p className="text-xs text-slate-400 mt-1 mb-3">
                        Tạo bài đầu tiên cho lớp {currentClass.name}.
                      </p>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('create')}
                          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Tạo bài tập đầu tiên</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {classAssignments.map((asg) => (
                        <div
                          key={asg.id}
                          className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-amber-300 hover:shadow-md transition-all flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-indigo-100 text-indigo-800">
                                  Khối {asg.grade}
                                </span>
                                <span className="font-mono font-black text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                                  {asg.assignmentCode}
                                </span>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                                  {asg.type === 'pdf' ? 'Đề PDF' : 'Trắc nghiệm'}
                                </span>
                              </div>
                            </div>

                            <h4 className="font-bold text-sm text-slate-900 line-clamp-2 mb-1.5">
                              {asg.title}
                            </h4>
                            <p className="text-xs text-slate-500 line-clamp-1 mb-3">
                              {asg.topic || 'Toán học THCS'}
                            </p>

                            <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                              <span className="inline-flex items-center space-x-1">
                                <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
                                <strong className="text-slate-800">{asg.questions.length}</strong> câu
                              </span>
                              <span className="inline-flex items-center space-x-1">
                                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                                <span>{asg.durationMinutes ? `${asg.durationMinutes} phút` : 'Tự do'}</span>
                              </span>
                              {asg.deadline && (
                                <span className="inline-flex items-center space-x-1">
                                  <Calendar className="w-3.5 h-3.5 text-rose-500" />
                                  <span>Hạn: {asg.deadline}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                            {onNavigate && (
                              <button
                                onClick={() => onNavigate('create', { editingAssignment: asg })}
                                className="flex-1 inline-flex items-center justify-center space-x-1.5 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
                                title="Mở trình soạn thảo để sửa đề bài, câu hỏi, phương án và đáp án đúng"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>SỬA CÂU HỎI</span>
                              </button>
                            )}

                            {onNavigate && (
                              <button
                                onClick={() => onNavigate('assignments', { filterClass: currentClass.id })}
                                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                                title="Xem trong danh sách bài tập đầy đủ"
                              >
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-slate-400">
              Vui lòng chọn hoặc tạo lớp học.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Class */}
      {showAddClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-900">Thêm lớp học mới</h3>
              <button onClick={() => setShowAddClassModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateClass} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lớp</label>
                <select
                  value={newClassGrade}
                  onChange={(e) => setNewClassGrade(e.target.value as GradeLevel)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold"
                >
                  <option value="6">Lớp 6</option>
                  <option value="7">Lớp 7</option>
                  <option value="8">Lớp 8</option>
                  <option value="9">Lớp 9</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên lớp</label>
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => { setNewClassName(e.target.value); setClassFormError(''); }}
                  placeholder="Ví dụ: 6A2, 7A1..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Năm học</label>
                <input
                  type="text"
                  value={newAcademicYear}
                  onChange={(e) => setNewAcademicYear(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              {classFormError && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">{classFormError}</div>}
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddClassModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
                >
                  Tạo lớp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Single Student */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-lg text-slate-900">Thêm học sinh vào lớp {currentClass?.name}</h3>
              <button onClick={() => setShowAddStudentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddSingleStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Họ và tên học sinh *</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => { setStudentName(e.target.value); setStudentFormError(''); }}
                  placeholder="Ví dụ: Nguyễn Văn Hùng"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã học sinh</label>
                  <input
                    type="text"
                    value={studentCode}
                    onChange={(e) => { setStudentCode(e.target.value); setStudentFormError(''); }}
                    placeholder="HS..."
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Giới tính</label>
                  <select
                    value={studentGender}
                    onChange={(e) => setStudentGender(e.target.value as 'Nam' | 'Nữ')}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
              </div>

              {studentFormError && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">{studentFormError}</div>}
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddStudentModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
                >
                  Thêm học sinh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Import Excel / Google Sheets Paste */}
      {showImportExcelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xl shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-lg text-slate-900">
                  Dán danh sách từ Excel / Sheets vào {currentClass?.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Hỗ trợ dán cột Họ tên hoặc các cột [STT, Họ tên, Giới tính] từ Excel.
                </p>
              </div>
              <button onClick={() => setShowImportExcelModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <textarea
                value={excelPasteText}
                onChange={(e) => setExcelPasteText(e.target.value)}
                placeholder={`Dán danh sách vào đây. Ví dụ:\n1. Nguyễn Văn An\n2. Trần Thị Bình\n3. Lê Hoàng Cường\n...`}
                rows={8}
                className="w-full p-3 font-mono text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Xem trước: <strong>{importPreview.valid.length}</strong> học sinh hợp lệ sẽ được thêm; <strong>{importPreview.skipped.length}</strong> dòng được bỏ qua/cần kiểm tra.
                </span>
              </div>
              {importPreview.skipped.length > 0 && (
                <div className="max-h-28 overflow-y-auto p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 space-y-1">
                  {importPreview.skipped.slice(0, 12).map((item, index) => <div key={index}>• {item}</div>)}
                  {importPreview.skipped.length > 12 && <div>… và {importPreview.skipped.length - 12} dòng khác</div>}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => setShowImportExcelModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleImportExcel}
                disabled={!excelPasteText.trim() || importPreview.valid.length === 0}
                className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl shadow-sm"
              >
                Nhập {importPreview.valid.length} học sinh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
