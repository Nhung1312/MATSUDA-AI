import React, { useState, useMemo } from 'react';
import {
  X,
  Scale,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  HelpCircle,
  Percent
} from 'lucide-react';
import { Question, QuestionType } from '../types';
import { parseDecimalPoint, formatDecimalPoint } from '../utils/questionUtils';

interface PointDistributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  targetTotalPoints: number;
  onUpdateTargetTotalPoints: (newTarget: number) => void;
  onApplyPoints: (updatedQuestions: Question[], message: string) => void;
}

export const PointDistributionModal: React.FC<PointDistributionModalProps> = ({
  isOpen,
  onClose,
  questions,
  targetTotalPoints,
  onUpdateTargetTotalPoints,
  onApplyPoints
}) => {
  const [activeTab, setActiveTab] = useState<'equal' | 'by_type' | 'quick_edit'>('equal');

  // Tab 1: Equal distribution states
  const [targetInput, setTargetInput] = useState<string>(String(targetTotalPoints || 10));
  const [balanceRemainder, setBalanceRemainder] = useState<boolean>(true);

  // Tab 2: By type distribution states
  const [byTypeMode, setByTypeMode] = useState<'per_question' | 'total_per_type'>('per_question');
  
  // Counts of each type
  const typeCounts = useMemo(() => {
    const counts: Record<QuestionType, number> = {
      multiple_choice: 0,
      true_false: 0,
      short_answer: 0,
      essay: 0
    };
    questions.forEach(q => {
      const t: QuestionType = q.type || 'multiple_choice';
      if (counts[t] !== undefined) {
        counts[t]++;
      } else {
        counts.multiple_choice++;
      }
    });
    return counts;
  }, [questions]);

  // Points per question per type inputs (strings to allow typing comma/dot)
  const [typePointsInput, setTypePointsInput] = useState<Record<QuestionType, string>>({
    multiple_choice: '0.25',
    true_false: '0.5',
    short_answer: '0.5',
    essay: '1.5'
  });

  // Total points per type inputs
  const [typeTotalsInput, setTypeTotalsInput] = useState<Record<QuestionType, string>>({
    multiple_choice: '3.0',
    true_false: '1.0',
    short_answer: '1.0',
    essay: '5.0'
  });

  // Tab 3: Quick edit per question
  const [editingPoints, setEditingPoints] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    questions.forEach(q => {
      map[q.id] = formatDecimalPoint(q.points || 0.5);
    });
    return map;
  });

  if (!isOpen) return null;

  const currentTotal = Math.round(questions.reduce((sum, q) => sum + (q.points || 0), 0) * 100) / 100;
  const parsedTarget = parseDecimalPoint(targetInput, 10);

  // --- HANDLER TAB 1: EQUAL DISTRIBUTION ---
  const handleApplyEqual = () => {
    if (questions.length === 0) return;
    const target = parsedTarget > 0 ? parsedTarget : 10;
    onUpdateTargetTotalPoints(target);

    const count = questions.length;
    const basePoint = Math.floor((target / count) * 100) / 100;
    let remainder = Math.round((target - basePoint * count) * 100) / 100;

    const updated = questions.map((q, idx) => {
      let p = basePoint;
      if (balanceRemainder && idx === count - 1 && Math.abs(remainder) > 0.0001) {
        p = Math.round((p + remainder) * 100) / 100;
      }
      return { ...q, points: Math.max(0.01, p) };
    });

    onApplyPoints(
      updated,
      `Đã chia đều ${target} điểm cho toàn bộ ${count} câu hỏi (${basePoint}đ/câu${balanceRemainder && remainder !== 0 ? `, câu cuối ${updated[count - 1].points}đ` : ''})!`
    );
    onClose();
  };

  // --- HANDLER TAB 2: BY TYPE DISTRIBUTION ---
  const handleApplyByType = () => {
    if (questions.length === 0) return;

    let updated: Question[] = [];
    let summaryMsg = '';

    if (byTypeMode === 'per_question') {
      const mcP = parseDecimalPoint(typePointsInput.multiple_choice, 0.25);
      const tfP = parseDecimalPoint(typePointsInput.true_false, 0.5);
      const saP = parseDecimalPoint(typePointsInput.short_answer, 0.5);
      const esP = parseDecimalPoint(typePointsInput.essay, 1.5);

      updated = questions.map(q => {
        let p = mcP;
        if (q.type === 'true_false') p = tfP;
        else if (q.type === 'short_answer') p = saP;
        else if (q.type === 'essay') p = esP;
        return { ...q, points: Math.max(0.01, p) };
      });

      const newSum = Math.round(updated.reduce((sum, q) => sum + (q.points || 0), 0) * 100) / 100;
      onUpdateTargetTotalPoints(newSum);
      summaryMsg = `Đã phân phối điểm theo từng câu: TN (${mcP}đ), Đ/S (${tfP}đ), TLN (${saP}đ), Tự luận (${esP}đ) • Tổng: ${newSum}đ`;
    } else {
      // Total per type mode
      const mcTotal = parseDecimalPoint(typeTotalsInput.multiple_choice, 0);
      const tfTotal = parseDecimalPoint(typeTotalsInput.true_false, 0);
      const saTotal = parseDecimalPoint(typeTotalsInput.short_answer, 0);
      const esTotal = parseDecimalPoint(typeTotalsInput.essay, 0);

      const mcEach = typeCounts.multiple_choice > 0 ? Math.round((mcTotal / typeCounts.multiple_choice) * 100) / 100 : 0;
      const tfEach = typeCounts.true_false > 0 ? Math.round((tfTotal / typeCounts.true_false) * 100) / 100 : 0;
      const saEach = typeCounts.short_answer > 0 ? Math.round((saTotal / typeCounts.short_answer) * 100) / 100 : 0;
      const esEach = typeCounts.essay > 0 ? Math.round((esTotal / typeCounts.essay) * 100) / 100 : 0;

      updated = questions.map(q => {
        let p = mcEach;
        if (q.type === 'true_false') p = tfEach;
        else if (q.type === 'short_answer') p = saEach;
        else if (q.type === 'essay') p = esEach;
        return { ...q, points: Math.max(0.01, p) };
      });

      const targetSum = Math.round((mcTotal + tfTotal + saTotal + esTotal) * 100) / 100;
      onUpdateTargetTotalPoints(targetSum);
      summaryMsg = `Đã chia tổng điểm theo nhóm: TN (${mcTotal}đ), Đ/S (${tfTotal}đ), TLN (${saTotal}đ), Tự luận (${esTotal}đ) • Tổng: ${targetSum}đ`;
    }

    onApplyPoints(updated, summaryMsg);
    onClose();
  };

  // --- HANDLER TAB 3: QUICK EDIT ---
  const handleApplyQuickEdit = () => {
    const updated = questions.map(q => {
      const raw = editingPoints[q.id];
      const parsed = parseDecimalPoint(raw, q.points || 0.5);
      return { ...q, points: Math.max(0.01, parsed) };
    });

    const newSum = Math.round(updated.reduce((sum, q) => sum + (q.points || 0), 0) * 100) / 100;
    onApplyPoints(updated, `Đã cập nhật điểm cho ${questions.length} câu hỏi • Tổng điểm thực tế: ${newSum}đ!`);
    onClose();
  };

  const handleBulkSetPoints = (val: number) => {
    const newMap: Record<string, string> = {};
    questions.forEach(q => {
      newMap[q.id] = formatDecimalPoint(val);
    });
    setEditingPoints(newMap);
  };

  const handleAutoBalanceLastQuestion = () => {
    if (questions.length === 0) return;
    const target = parsedTarget > 0 ? parsedTarget : 10;
    const currentSum = Math.round(questions.reduce((sum, q) => sum + (q.points || 0), 0) * 100) / 100;
    const diff = Math.round((target - currentSum) * 100) / 100;
    if (Math.abs(diff) < 0.001) {
      alert('Tổng điểm thực tế đã khớp hoàn toàn với mục tiêu!');
      return;
    }

    const updated = [...questions];
    // Ưu tiên bù vào câu tự luận cuối cùng hoặc câu cuối cùng
    const lastEssayIdx = updated.findLastIndex(q => q.type === 'essay');
    const targetIdx = lastEssayIdx !== -1 ? lastEssayIdx : updated.length - 1;
    const newPoint = Math.max(0.01, Math.round((updated[targetIdx].points + diff) * 100) / 100);
    updated[targetIdx] = {
      ...updated[targetIdx],
      points: newPoint
    };

    onApplyPoints(
      updated,
      `Đã cân bằng tổng điểm ${target}đ: Điều chỉnh câu ${targetIdx + 1} thành ${newPoint}đ (${diff > 0 ? `+${diff}` : diff}đ)!`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100">
                Bộ công cụ phân bổ điểm đề thi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tùy chỉnh điểm linh hoạt • Hỗ trợ mọi số điểm lẻ (0,1; 0,25; 0,3; 0,5; 0,75; 1,25...)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Overview Bar */}
        <div className="mt-3.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center space-x-4">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Số câu hỏi: </span>
              <strong className="text-slate-900 dark:text-slate-100 font-bold">{questions.length} câu</strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Tổng điểm thực tế: </span>
              <strong className="text-indigo-600 dark:text-indigo-400 font-black text-sm">{currentTotal}đ</strong>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-500 dark:text-slate-400">Mục tiêu: </span>
            <input
              type="text"
              inputMode="decimal"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              className="w-16 px-2 py-0.5 text-xs font-bold text-center bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500"
              placeholder="10.0"
            />
            <span className="font-bold text-slate-600 dark:text-slate-400">điểm</span>
          </div>
        </div>

        {/* Target warning banner */}
        {Math.abs(currentTotal - parsedTarget) > 0.001 && parsedTarget > 0 && (
          <div className="mt-2.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Tổng điểm thực tế ({currentTotal}đ) chưa khớp mục tiêu ({parsedTarget}đ) • Lệch: {Math.round((currentTotal - parsedTarget) * 100) / 100 > 0 ? `+${Math.round((currentTotal - parsedTarget) * 100) / 100}` : Math.round((currentTotal - parsedTarget) * 100) / 100}đ
              </span>
            </div>
            <button
              type="button"
              onClick={handleAutoBalanceLastQuestion}
              className="px-2 py-0.5 bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-950 dark:text-amber-100 rounded-md font-bold text-[10px] shrink-0 cursor-pointer transition-colors"
            >
              Cân bằng câu cuối
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 mt-3.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('equal')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
              activeTab === 'equal'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>1. Tự chia đều theo mục tiêu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('by_type')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
              activeTab === 'by_type'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Phân phối theo dạng câu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('quick_edit')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
              activeTab === 'quick_edit'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>3. Bảng gán nhanh từng câu</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {/* TAB 1: EQUAL DISTRIBUTION */}
          {activeTab === 'equal' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 dark:text-slate-200">
                    Tổng điểm mục tiêu cần chia đều:
                  </label>
                  <div className="flex items-center space-x-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      className="w-20 px-3 py-1.5 text-sm font-black text-center bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-xl text-indigo-700 dark:text-indigo-300"
                      placeholder="10"
                    />
                    <span className="font-bold text-slate-500">điểm</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 pt-1 border-t border-indigo-100 dark:border-indigo-900">
                  <div className="flex justify-between">
                    <span>Số lượng câu hỏi trong đề:</span>
                    <strong className="font-bold text-slate-800 dark:text-slate-200">{questions.length} câu</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Điểm trung bình mỗi câu:</span>
                    <strong className="font-black text-indigo-600 dark:text-indigo-400 text-xs">
                      {questions.length > 0 ? (parsedTarget / questions.length).toFixed(3) : 0}đ ≈ {questions.length > 0 ? (Math.round((parsedTarget / questions.length) * 100) / 100) : 0}đ
                    </strong>
                  </div>
                </div>

                <label className="flex items-center space-x-2 pt-1 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={balanceRemainder}
                    onChange={(e) => setBalanceRemainder(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span>
                    Tự động bù phần dư làm tròn vào câu cuối cùng để tổng khớp 100% mục tiêu
                  </span>
                </label>
              </div>

              {/* Presets */}
              <div>
                <span className="text-[11px] font-bold text-slate-500 block mb-1.5 uppercase">
                  Mục tiêu phổ biến nhanh:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[10, 15, 20, 5, 8, 100].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTargetInput(String(val))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        parsedTarget === val
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {val} điểm
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BY TYPE DISTRIBUTION */}
          {activeTab === 'by_type' && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center space-x-3 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setByTypeMode('per_question')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                    byTypeMode === 'per_question'
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Cách A: Đặt điểm cho mỗi câu theo dạng
                </button>
                <button
                  type="button"
                  onClick={() => setByTypeMode('total_per_type')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                    byTypeMode === 'total_per_type'
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Cách B: Đặt tổng điểm cho mỗi nhóm dạng
                </button>
              </div>

              {/* Grid 4 Question Types */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Trắc nghiệm nhiều lựa chọn */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      🎯 Trắc nghiệm
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[10px]">
                      {typeCounts.multiple_choice} câu
                    </span>
                  </div>
                  {byTypeMode === 'per_question' ? (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-500">Mỗi câu:</span>
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typePointsInput.multiple_choice}
                          onChange={(e) => setTypePointsInput({ ...typePointsInput, multiple_choice: e.target.value })}
                          className="w-16 px-2 py-1 text-center font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                          placeholder="0.25"
                        />
                        <span>điểm</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-500">Tổng nhóm:</span>
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typeTotalsInput.multiple_choice}
                          onChange={(e) => setTypeTotalsInput({ ...typeTotalsInput, multiple_choice: e.target.value })}
                          className="w-16 px-2 py-1 text-center font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                          placeholder="3.0"
                        />
                        <span>điểm</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Đúng / Sai */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      ⚖️ Đúng / Sai
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                      {typeCounts.true_false} câu
                    </span>
                  </div>
                  {byTypeMode === 'per_question' ? (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-500">Mỗi câu:</span>
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typePointsInput.true_false}
                          onChange={(e) => setTypePointsInput({ ...typePointsInput, true_false: e.target.value })}
                          className="w-16 px-2 py-1 text-center font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                          placeholder="0.5"
                        />
                        <span>điểm</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-500">Tổng nhóm:</span>
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typeTotalsInput.true_false}
                          onChange={(e) => setTypeTotalsInput({ ...typeTotalsInput, true_false: e.target.value })}
                          className="w-16 px-2 py-1 text-center font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                          placeholder="1.0"
                        />
                        <span>điểm</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Trả lời ngắn */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      ✏️ Trả lời ngắn
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold text-[10px]">
                      {typeCounts.short_answer} câu
                    </span>
                  </div>
                  {byTypeMode === 'per_question' ? (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-500">Mỗi câu:</span>
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typePointsInput.short_answer}
                          onChange={(e) => setTypePointsInput({ ...typePointsInput, short_answer: e.target.value })}
                          className="w-16 px-2 py-1 text-center font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                          placeholder="0.5"
                        />
                        <span>điểm</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-500">Tổng nhóm:</span>
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typeTotalsInput.short_answer}
                          onChange={(e) => setTypeTotalsInput({ ...typeTotalsInput, short_answer: e.target.value })}
                          className="w-16 px-2 py-1 text-center font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                          placeholder="1.0"
                        />
                        <span>điểm</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Tự luận */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      ✍️ Tự luận
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold text-[10px]">
                      {typeCounts.essay} câu
                    </span>
                  </div>
                  {byTypeMode === 'per_question' ? (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-500">Mỗi câu:</span>
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typePointsInput.essay}
                          onChange={(e) => setTypePointsInput({ ...typePointsInput, essay: e.target.value })}
                          className="w-16 px-2 py-1 text-center font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                          placeholder="1.5"
                        />
                        <span>điểm</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-500">Tổng nhóm:</span>
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typeTotalsInput.essay}
                          onChange={(e) => setTypeTotalsInput({ ...typeTotalsInput, essay: e.target.value })}
                          className="w-16 px-2 py-1 text-center font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                          placeholder="5.0"
                        />
                        <span>điểm</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: QUICK TABLE PER-QUESTION */}
          {activeTab === 'quick_edit' && (
            <div className="space-y-3 text-xs">
              {/* Bulk buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">Gán nhanh tất cả:</span>
                {[0.25, 0.5, 0.3, 0.75, 1.0, 1.5, 2.0].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleBulkSetPoints(val)}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 font-bold text-[11px] border border-slate-200 transition-colors cursor-pointer"
                  >
                    {val}đ
                  </button>
                ))}
              </div>

              {/* Compact Question Grid */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 max-h-56 overflow-y-auto space-y-1.5 bg-slate-50/50 dark:bg-slate-800/30">
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 line-clamp-1 max-w-[240px] text-[11px]">
                        {q.question || `Câu hỏi số ${idx + 1}`}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 uppercase font-bold">
                        {q.type === 'essay' ? 'Tự luận' : q.type === 'short_answer' ? 'Điền số' : q.type === 'true_false' ? 'Đúng/Sai' : 'Trắc nghiệm'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editingPoints[q.id] ?? formatDecimalPoint(q.points)}
                        onChange={(e) => {
                          setEditingPoints({
                            ...editingPoints,
                            [q.id]: e.target.value
                          });
                        }}
                        className="w-14 px-1.5 py-0.5 text-center font-bold bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md text-xs"
                      />
                      <span className="text-slate-400">đ</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeTab === 'equal') handleApplyEqual();
              else if (activeTab === 'by_type') handleApplyByType();
              else handleApplyQuickEdit();
            }}
            className="px-5 py-2.5 text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer flex items-center space-x-1.5"
          >
            <Check className="w-4 h-4" />
            <span>
              {activeTab === 'equal'
                ? 'Áp dụng chia đều'
                : activeTab === 'by_type'
                ? 'Áp dụng phân phối theo dạng'
                : 'Lưu điểm đã chỉnh'}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
