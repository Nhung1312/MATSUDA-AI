import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Minus, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  History, 
  Delete, 
  Divide, 
  Percent, 
  ChevronDown, 
  ChevronUp,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Calculator as CalcIcon
} from 'lucide-react';
import { soundEffects } from '../utils/soundEffects';

interface ScientificCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  isExamMode?: boolean; // If in exam, optimize layout and contrast
}

interface CalcHistoryItem {
  expression: string;
  result: string;
  timestamp: string;
}

// Helper: Convert decimal to simplified fraction a/b
function decimalToFraction(num: number): string | null {
  if (!isFinite(num) || isNaN(num) || Number.isInteger(num)) return null;
  const tolerance = 1.0e-6;
  let h1 = 1, h2 = 0;
  let k1 = 0, k2 = 1;
  let b = num;
  const sign = num < 0 ? -1 : 1;
  b = Math.abs(b);

  do {
    const a = Math.floor(b);
    let aux = h1;
    h1 = a * h1 + h2;
    h2 = aux;
    aux = k1;
    k1 = a * k1 + k2;
    k2 = aux;
    b = 1 / (b - a);
  } while (Math.abs(num * sign - (sign * h1) / k1) > num * tolerance && k1 <= 10000);

  if (k1 <= 10000 && k1 > 1) {
    return `${sign * h1}/${k1}`;
  }
  return null;
}

export const ScientificCalculatorModal: React.FC<ScientificCalculatorModalProps> = ({
  isOpen,
  onClose,
  isExamMode = false
}) => {
  const [expression, setExpression] = useState<string>('');
  const [result, setResult] = useState<string>('0');
  const [lastAnswer, setLastAnswer] = useState<string>('0');
  const [angleMode, setAngleMode] = useState<'DEG' | 'RAD'>('DEG'); // THCS standard: DEG
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isExpandedSci, setIsExpandedSci] = useState<boolean>(true); // show scientific keys
  const [history, setHistory] = useState<CalcHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const displayRef = useRef<HTMLDivElement>(null);

  // Play click sound
  const playClick = () => {
    if (!soundEnabled) return;
    try {
      soundEffects.playClick();
    } catch {}
  };

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen || isMinimized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input or textarea
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const key = e.key;
      if (key >= '0' && key <= '9') {
        e.preventDefault();
        handleInput(key);
      } else if (key === '+' || key === '-' || key === '*' || key === '/' || key === '.' || key === '(' || key === ')') {
        e.preventDefault();
        if (key === '*') handleInput('×');
        else if (key === '/') handleInput('÷');
        else handleInput(key);
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        handleCalculate();
      } else if (key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (key === 'Escape') {
        e.preventDefault();
        setIsMinimized(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMinimized, expression]);

  if (!isOpen) return null;

  // Mini Floating Pill when minimized
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => {
            playClick();
            setIsMinimized(false);
          }}
          className="flex items-center space-x-2.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-2xl border-2 border-white/20 font-bold text-xs sm:text-sm hover:scale-105 transition-all cursor-pointer group"
          title="Mở rộng máy tính khoa học mini"
        >
          <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
            <CalcIcon className="w-3.5 h-3.5 text-white" />
          </div>
          <span>Máy tính mini</span>
          <span className="font-mono text-indigo-200 text-xs font-semibold max-w-[80px] truncate">
            = {result}
          </span>
          <Maximize2 className="w-3.5 h-3.5 text-white/70 group-hover:text-white" />
        </button>
      </div>
    );
  }

  const handleInput = (val: string) => {
    playClick();
    setExpression((prev) => {
      // If previous was result and user types an operator, continue with result
      if (prev === '' && ['+', '-', '×', '÷', '^', '%'].includes(val)) {
        return result !== '0' && result !== 'Lỗi' ? `${result}${val}` : val;
      }
      return prev + val;
    });
  };

  const handleClear = () => {
    playClick();
    setExpression('');
    setResult('0');
  };

  const handleDelete = () => {
    playClick();
    setExpression((prev) => prev.slice(0, -1));
  };

  const handleToggleSign = () => {
    playClick();
    if (!expression) {
      if (result !== '0' && result !== 'Lỗi') {
        const val = parseFloat(result);
        const next = String(-val);
        setResult(next);
        setExpression(next);
      }
      return;
    }
    // Toggle sign on expression
    if (expression.startsWith('-(') && expression.endsWith(')')) {
      setExpression(expression.slice(2, -1));
    } else {
      setExpression(`-(${expression})`);
    }
  };

  const handleCalculate = () => {
    playClick();
    if (!expression.trim()) return;

    try {
      // Prepare mathematical expression string
      let sanitized = expression
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/g, `${Math.PI}`)
        .replace(/e(?![a-z])/gi, `${Math.E}`)
        .replace(/%/g, '*0.01');

      // Handle trigonometric functions in DEG vs RAD
      const angleMultiplier = angleMode === 'DEG' ? `* (Math.PI / 180)` : '';

      // Replace custom functions:
      // sin(x) -> Math.sin((x) * (Math.PI / 180))
      sanitized = sanitized.replace(/sin\(([^)]+)\)/g, `Math.sin(($1) ${angleMultiplier})`);
      sanitized = sanitized.replace(/cos\(([^)]+)\)/g, `Math.cos(($1) ${angleMultiplier})`);
      sanitized = sanitized.replace(/tan\(([^)]+)\)/g, `Math.tan(($1) ${angleMultiplier})`);
      sanitized = sanitized.replace(/cot\(([^)]+)\)/g, `(1 / Math.tan(($1) ${angleMultiplier}))`);

      // sqrt, cbrt, abs
      sanitized = sanitized.replace(/√\(([^)]+)\)/g, 'Math.sqrt($1)');
      sanitized = sanitized.replace(/√([0-9.]+)/g, 'Math.sqrt($1)');
      sanitized = sanitized.replace(/∛\(([^)]+)\)/g, 'Math.cbrt($1)');
      sanitized = sanitized.replace(/\^/g, '**');

      // Evaluate safely
      // eslint-disable-next-line no-new-func
      const evalFn = new Function(`"use strict"; return (${sanitized});`);
      const numResult = evalFn();

      if (typeof numResult !== 'number' || isNaN(numResult)) {
        setResult('Lỗi cú pháp');
        return;
      }

      if (!isFinite(numResult)) {
        setResult('Vô cực (∞)');
        return;
      }

      // Format result nicely
      let formatted = '';
      if (Number.isInteger(numResult)) {
        formatted = numResult.toString();
      } else {
        // Round to max 8 decimal places to avoid floating point precision quirks (0.1 + 0.2)
        formatted = parseFloat(numResult.toFixed(8)).toString();
      }

      setResult(formatted);
      setLastAnswer(formatted);

      // Save to history
      setHistory((prev) => [
        {
          expression,
          result: formatted,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        },
        ...prev.slice(0, 19)
      ]);
    } catch (err) {
      console.warn('Calc error:', err);
      setResult('Lỗi cú pháp');
    }
  };

  const handleCopyResult = () => {
    if (!result || result === 'Lỗi' || result === '0') return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Fraction representation of current result
  const numericResult = parseFloat(result);
  const fractionRepr = decimalToFraction(numericResult);

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 max-w-[95vw] sm:max-w-sm w-[360px] animate-in fade-in slide-in-from-bottom-5 duration-200 shadow-2xl">
      <div className="bg-slate-900/95 text-white rounded-3xl border border-slate-700/80 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col transition-all">
        
        {/* HEADER BAR */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700/80 select-none">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-xs">
              <CalcIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-xs text-white leading-tight">
                Máy Tính Khoa Học
              </h3>
              <div className="flex items-center space-x-1.5 text-[10px] text-slate-400">
                <span>Toán THCS</span>
                <span>•</span>
                <button
                  onClick={() => setAngleMode((prev) => (prev === 'DEG' ? 'RAD' : 'DEG'))}
                  className="px-1.5 py-0.2 rounded font-mono font-bold text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700/60 hover:bg-indigo-900 transition-colors cursor-pointer"
                  title="Chuyển chế độ Góc Độ (DEG) hoặc Radian (RAD)"
                >
                  {angleMode}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {/* Toggle History */}
            <button
              onClick={() => setShowHistory((prev) => !prev)}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                showHistory ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
              }`}
              title="Lịch sử tính toán"
            >
              <History className="w-4 h-4" />
            </button>

            {/* Toggle Sound */}
            <button
              onClick={() => setSoundEnabled((prev) => !prev)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 text-xs transition-colors cursor-pointer"
              title={soundEnabled ? 'Tắt âm thanh phím' : 'Bật âm thanh phím'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-indigo-400" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Minimize */}
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 text-xs transition-colors cursor-pointer"
              title="Thu nhỏ thành biểu tượng nổi"
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 text-xs transition-colors cursor-pointer"
              title="Đóng máy tính"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SCREEN DISPLAY */}
        <div 
          ref={displayRef}
          className="p-4 bg-slate-950/90 border-b border-slate-800 text-right flex flex-col justify-end min-h-[96px] select-all relative"
        >
          {/* Angle Mode & Fraction quick badge */}
          <div className="absolute top-2 left-3 flex items-center space-x-1.5">
            <span className="text-[10px] font-mono font-black text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800/60">
              {angleMode}
            </span>
            {fractionRepr && (
              <button
                onClick={() => handleInput(fractionRepr)}
                className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60 hover:bg-emerald-900 transition-colors cursor-pointer flex items-center space-x-1"
                title="Bấm để chèn dạng phân số vào phép tính"
              >
                <span>Phân số:</span>
                <span className="underline font-black">{fractionRepr}</span>
              </button>
            )}
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopyResult}
            className="absolute top-2 right-3 text-slate-500 hover:text-white text-xs p-1 rounded transition-colors"
            title="Sao chép kết quả"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Expression line */}
          <div className="font-mono text-xs text-slate-400 min-h-[18px] overflow-x-auto whitespace-nowrap tracking-wide">
            {expression || '0'}
          </div>

          {/* Result line */}
          <div className="font-mono text-2xl sm:text-3xl font-black text-white mt-1 overflow-x-auto whitespace-nowrap tracking-tight">
            {result}
          </div>
        </div>

        {/* HISTORY DRAWER */}
        {showHistory && (
          <div className="bg-slate-950/95 border-b border-slate-800 p-3 max-h-48 overflow-y-auto space-y-2 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 pb-1 border-b border-slate-800">
              <span>Lịch sử phép tính</span>
              {history.length > 0 && (
                <button
                  onClick={() => setHistory([])}
                  className="text-rose-400 hover:text-rose-300 text-[10px]"
                >
                  Xóa lịch sử
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-500">
                Chưa có phép tính nào
              </div>
            ) : (
              history.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    playClick();
                    setExpression(item.result);
                    setResult(item.result);
                    setShowHistory(false);
                  }}
                  className="w-full text-left p-2 rounded-xl bg-slate-900/80 hover:bg-indigo-950/60 border border-slate-800 text-xs transition-colors cursor-pointer group"
                >
                  <div className="font-mono text-[11px] text-slate-400 truncate">
                    {item.expression} =
                  </div>
                  <div className="font-mono text-sm font-black text-indigo-300 group-hover:text-indigo-200">
                    {item.result}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* SCIENTIFIC FUNCTION TOGGLE */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/40 border-b border-slate-800/80 text-[11px]">
          <button
            onClick={() => setIsExpandedSci((prev) => !prev)}
            className="flex items-center space-x-1 text-slate-300 hover:text-white font-semibold transition-colors cursor-pointer"
          >
            <span>Phím khoa học (Lượng giác, Căn, Luỹ thừa)</span>
            {isExpandedSci ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <span className="text-[10px] text-slate-500 font-mono">Bàn phím PC ⌨️</span>
        </div>

        {/* SCIENTIFIC KEYS ROW (COLLAPSIBLE) */}
        {isExpandedSci && (
          <div className="grid grid-cols-5 gap-1.5 p-2 bg-slate-900/60 border-b border-slate-800 text-xs font-mono font-bold">
            {/* Row 1 */}
            <button
              onClick={() => handleInput('√(')}
              className="py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Căn bậc hai"
            >
              √x
            </button>
            <button
              onClick={() => handleInput('^2')}
              className="py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Bình phương x²"
            >
              x²
            </button>
            <button
              onClick={() => handleInput('^')}
              className="py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Luỹ thừa x mũ y"
            >
              xʸ
            </button>
            <button
              onClick={() => handleInput('π')}
              className="py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Số Pi (≈ 3.14159)"
            >
              π
            </button>
            <button
              onClick={() => handleInput('e')}
              className="py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Số Euler e (≈ 2.71828)"
            >
              e
            </button>

            {/* Row 2 */}
            <button
              onClick={() => handleInput('sin(')}
              className="py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Sin"
            >
              sin
            </button>
            <button
              onClick={() => handleInput('cos(')}
              className="py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Cos"
            >
              cos
            </button>
            <button
              onClick={() => handleInput('tan(')}
              className="py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Tan"
            >
              tan
            </button>
            <button
              onClick={() => handleInput('cot(')}
              className="py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Cotan"
            >
              cot
            </button>
            <button
              onClick={() => handleInput('∛(')}
              className="py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Căn bậc 3"
            >
              ∛x
            </button>
          </div>
        )}

        {/* STANDARD KEYPAD */}
        <div className="grid grid-cols-4 gap-1.5 p-3 font-mono text-sm sm:text-base font-bold select-none">
          {/* Row 1: AC, DEL, %, ÷ */}
          <button
            onClick={handleClear}
            className="py-2.5 sm:py-3 bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white rounded-2xl border border-rose-500/30 transition-all active:scale-95 cursor-pointer shadow-xs font-black"
          >
            AC
          </button>
          <button
            onClick={handleDelete}
            className="py-2.5 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs flex items-center justify-center"
            title="Xóa 1 ký tự (Backspace)"
          >
            <Delete className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleInput('%')}
            className="py-2.5 sm:py-3 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs flex items-center justify-center"
            title="Phần trăm"
          >
            %
          </button>
          <button
            onClick={() => handleInput('÷')}
            className="py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs font-black text-lg"
          >
            ÷
          </button>

          {/* Row 2: 7, 8, 9, × */}
          <button
            onClick={() => handleInput('7')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            7
          </button>
          <button
            onClick={() => handleInput('8')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            8
          </button>
          <button
            onClick={() => handleInput('9')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            9
          </button>
          <button
            onClick={() => handleInput('×')}
            className="py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs font-black text-lg"
          >
            ×
          </button>

          {/* Row 3: 4, 5, 6, - */}
          <button
            onClick={() => handleInput('4')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            4
          </button>
          <button
            onClick={() => handleInput('5')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            5
          </button>
          <button
            onClick={() => handleInput('6')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            6
          </button>
          <button
            onClick={() => handleInput('-')}
            className="py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs font-black text-lg"
          >
            -
          </button>

          {/* Row 4: 1, 2, 3, + */}
          <button
            onClick={() => handleInput('1')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            1
          </button>
          <button
            onClick={() => handleInput('2')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            2
          </button>
          <button
            onClick={() => handleInput('3')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            3
          </button>
          <button
            onClick={() => handleInput('+')}
            className="py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs font-black text-lg"
          >
            +
          </button>

          {/* Row 5: 0, ., ±, = */}
          <button
            onClick={() => handleInput('0')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            0
          </button>
          <button
            onClick={() => handleInput('.')}
            className="py-2.5 sm:py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            .
          </button>
          <button
            onClick={handleToggleSign}
            className="py-2.5 sm:py-3 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-2xl transition-all active:scale-95 cursor-pointer shadow-xs"
            title="Đổi dấu âm / dương"
          >
            ±
          </button>
          <button
            onClick={handleCalculate}
            className="py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl transition-all active:scale-95 cursor-pointer shadow-md font-black text-xl"
          >
            =
          </button>

          {/* Row 6 Parentheses & Quick ans */}
          <button
            onClick={() => handleInput('(')}
            className="py-1.5 bg-slate-800/60 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
          >
            (
          </button>
          <button
            onClick={() => handleInput(')')}
            className="py-1.5 bg-slate-800/60 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
          >
            )
          </button>
          <button
            onClick={() => handleInput(lastAnswer)}
            className="py-1.5 bg-slate-800/60 hover:bg-slate-700 text-amber-300 rounded-xl text-xs"
            title="Sử dụng kết quả gần nhất (Ans)"
          >
            Ans
          </button>
          <button
            onClick={() => handleInput('/')}
            className="py-1.5 bg-slate-800/60 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-mono"
            title="Ký hiệu phân số a/b"
          >
            a/b
          </button>
        </div>

      </div>
    </div>
  );
};
