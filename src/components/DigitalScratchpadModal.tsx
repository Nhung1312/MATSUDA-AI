import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  Minus, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  Redo, 
  Trash2, 
  Download, 
  Edit3, 
  Eraser, 
  Square, 
  Circle, 
  Triangle, 
  Minus as LineIcon, 
  Eye, 
  EyeOff, 
  Grid, 
  Palette,
  Check,
  Sparkles
} from 'lucide-react';
import { soundEffects } from '../utils/soundEffects';

interface DigitalScratchpadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

type ToolType = 'pen' | 'line' | 'circle' | 'triangle' | 'rectangle' | 'eraser';
type BackgroundType = 'grid' | 'white' | 'chalkboard';

const COLORS = [
  { label: 'Xanh mực', value: '#2563eb' },
  { label: 'Đen bút bi', value: '#1e293b' },
  { label: 'Đỏ sửa bài', value: '#dc2626' },
  { label: 'Xanh lá', value: '#16a34a' },
  { label: 'Cam', value: '#ea580c' },
  { label: 'Tím', value: '#9333ea' },
  { label: 'Trắng phấn', value: '#ffffff' }
];

const STROKE_WIDTHS = [
  { label: 'Mảnh', value: 2 },
  { label: 'Vừa', value: 4 },
  { label: 'Đậm', value: 8 },
  { label: 'To', value: 14 }
];

export const DigitalScratchpadModal: React.FC<DigitalScratchpadModalProps> = ({
  isOpen,
  onClose,
  title = 'Bảng Nháp & Vẽ Hình Học'
}) => {
  const [tool, setTool] = useState<ToolType>('pen');
  const [color, setColor] = useState<string>('#2563eb');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [background, setBackground] = useState<BackgroundType>('grid');
  const [opacityPercent, setOpacityPercent] = useState<number>(100); // 100%, 85%, 70%
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Drawing state
  const isDrawingRef = useRef<boolean>(false);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // History stack for Undo / Redo
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Resize canvas to match container
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !previewCanvas || !container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    if (canvas.width !== width || canvas.height !== height) {
      // Save current content if any
      const ctx = canvas.getContext('2d');
      let prevData: ImageData | null = null;
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        try {
          prevData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch {}
      }

      canvas.width = width;
      canvas.height = height;
      previewCanvas.width = width;
      previewCanvas.height = height;

      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (prevData) {
          ctx.putImageData(prevData, 0, 0);
        } else {
          // Push initial blank state
          const initialData = ctx.getImageData(0, 0, width, height);
          setHistory([initialData]);
          setHistoryIndex(0);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const timer = setTimeout(() => {
      initCanvas();
    }, 100);
    return () => clearTimeout(timer);
  }, [isOpen, isMinimized, isFullScreen, initCanvas]);

  // Adjust default color when switching background
  useEffect(() => {
    if (background === 'chalkboard' && color === '#1e293b') {
      setColor('#ffffff');
    } else if (background !== 'chalkboard' && color === '#ffffff') {
      setColor('#2563eb');
    }
  }, [background, color]);

  // Push new state to history
  const saveStateToHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentImg = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, currentImg].slice(-25); // keep max 25 steps
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 24));
  };

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    soundEffects.playClick();
    const newIdx = historyIndex - 1;
    ctx.putImageData(history[newIdx], 0, 0);
    setHistoryIndex(newIdx);
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    soundEffects.playClick();
    const newIdx = historyIndex + 1;
    ctx.putImageData(history[newIdx], 0, 0);
    setHistoryIndex(newIdx);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    soundEffects.playClick();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveStateToHistory();
  };

  // Get coordinates relative to canvas
  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  // POINTER DOWN
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Capture pointer for smooth touch/pen
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    const coords = getCoordinates(e);
    startPosRef.current = coords;
    isDrawingRef.current = true;

    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
      ctx.lineWidth = tool === 'eraser' ? strokeWidth * 4 : strokeWidth;
      ctx.strokeStyle = tool === 'eraser' ? (background === 'chalkboard' ? '#0f172a' : '#ffffff') : color;
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Draw a point immediately
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }
  };

  // POINTER MOVE
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!canvas || !previewCanvas) return;

    const ctx = canvas.getContext('2d');
    const prevCtx = previewCanvas.getContext('2d');
    if (!ctx || !prevCtx) return;

    const coords = getCoordinates(e);

    if (tool === 'pen' || tool === 'eraser') {
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    } else {
      // Shape tool: draw preview on overlay previewCanvas
      prevCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      prevCtx.lineWidth = strokeWidth;
      prevCtx.strokeStyle = color;
      prevCtx.lineCap = 'round';
      prevCtx.lineJoin = 'round';

      const startX = startPosRef.current.x;
      const startY = startPosRef.current.y;
      const curX = coords.x;
      const curY = coords.y;

      prevCtx.beginPath();

      if (tool === 'line') {
        prevCtx.moveTo(startX, startY);
        prevCtx.lineTo(curX, curY);
      } else if (tool === 'rectangle') {
        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        prevCtx.strokeRect(x, y, w, h);
      } else if (tool === 'circle') {
        const radiusX = Math.abs(curX - startX) / 2;
        const radiusY = Math.abs(curY - startY) / 2;
        const centerX = Math.min(startX, curX) + radiusX;
        const centerY = Math.min(startY, curY) + radiusY;
        prevCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      } else if (tool === 'triangle') {
        // Isosceles triangle
        prevCtx.moveTo((startX + curX) / 2, startY);
        prevCtx.lineTo(startX, curY);
        prevCtx.lineTo(curX, curY);
        prevCtx.closePath();
      }

      prevCtx.stroke();
    }
  };

  // POINTER UP
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!canvas || !previewCanvas) return;

    const ctx = canvas.getContext('2d');
    const prevCtx = previewCanvas.getContext('2d');
    if (!ctx || !prevCtx) return;

    const coords = getCoordinates(e);

    // If it was a shape, commit preview to main canvas
    if (tool !== 'pen' && tool !== 'eraser') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const startX = startPosRef.current.x;
      const startY = startPosRef.current.y;
      const curX = coords.x;
      const curY = coords.y;

      ctx.beginPath();

      if (tool === 'line') {
        ctx.moveTo(startX, startY);
        ctx.lineTo(curX, curY);
      } else if (tool === 'rectangle') {
        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        ctx.strokeRect(x, y, w, h);
      } else if (tool === 'circle') {
        const radiusX = Math.abs(curX - startX) / 2;
        const radiusY = Math.abs(curY - startY) / 2;
        const centerX = Math.min(startX, curX) + radiusX;
        const centerY = Math.min(startY, curY) + radiusY;
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      } else if (tool === 'triangle') {
        ctx.moveTo((startX + curX) / 2, startY);
        ctx.lineTo(startX, curY);
        ctx.lineTo(curX, curY);
        ctx.closePath();
      }

      ctx.stroke();
      prevCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }

    saveStateToHistory();
  };

  // Download sketch as PNG
  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create temp canvas with chosen background
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Fill background color
    if (background === 'chalkboard') {
      tempCtx.fillStyle = '#0f172a';
    } else {
      tempCtx.fillStyle = '#ffffff';
    }
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Draw grid if grid mode
    if (background === 'grid') {
      tempCtx.strokeStyle = '#e2e8f0';
      tempCtx.lineWidth = 1;
      const gridSize = 25;
      for (let x = 0; x < tempCanvas.width; x += gridSize) {
        tempCtx.beginPath();
        tempCtx.moveTo(x, 0);
        tempCtx.lineTo(x, tempCanvas.height);
        tempCtx.stroke();
      }
      for (let y = 0; y < tempCanvas.height; y += gridSize) {
        tempCtx.beginPath();
        tempCtx.moveTo(0, y);
        tempCtx.lineTo(tempCanvas.width, y);
        tempCtx.stroke();
      }
    }

    // Overlay user drawings
    tempCtx.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.download = `bang-nhap-toan-${Date.now()}.png`;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
  };

  if (!isOpen) return null;

  // Mini Floating Pill when minimized
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 left-6 z-50 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => {
            soundEffects.playClick();
            setIsMinimized(false);
          }}
          className="flex items-center space-x-2.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-2xl border-2 border-white/20 font-bold text-xs sm:text-sm hover:scale-105 transition-all cursor-pointer group"
          title="Mở rộng bảng nháp vẽ hình"
        >
          <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
            <Edit3 className="w-3.5 h-3.5 text-white" />
          </div>
          <span>Bảng nháp vẽ hình</span>
          <Maximize2 className="w-3.5 h-3.5 text-white/70 group-hover:text-white" />
        </button>
      </div>
    );
  }

  // Background style classes
  const getCanvasBgClass = () => {
    if (background === 'chalkboard') {
      return 'bg-slate-900 border-slate-800 text-slate-100';
    }
    if (background === 'grid') {
      return 'bg-white bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] border-slate-200';
    }
    return 'bg-white border-slate-200';
  };

  return (
    <div 
      className={`fixed z-50 transition-all duration-200 flex flex-col ${
        isFullScreen 
          ? 'inset-2 sm:inset-6' 
          : 'bottom-4 left-4 sm:bottom-6 sm:left-6 w-[94vw] sm:w-[580px] h-[460px] max-h-[85vh]'
      }`}
      style={{ opacity: opacityPercent / 100 }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col h-full backdrop-blur-xl">
        
        {/* HEADER TOOLBAR */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 select-none">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-xs">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-white leading-tight">
                {title}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Chuột hoặc Bút cảm ứng • Không cần giấy nháp
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {/* Opacity selector: 100% vs 80% (cho phép nhìn xuyên qua đề) */}
            <button
              onClick={() => setOpacityPercent((prev) => (prev === 100 ? 82 : 100))}
              className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1 ${
                opacityPercent < 100
                  ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-300'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title={opacityPercent < 100 ? 'Chế độ nhìn xuyên qua: Đang bật (82%)' : 'Bật chế độ mờ nền để nhìn thấy đề bài bên dưới'}
            >
              {opacityPercent < 100 ? <Eye className="w-4 h-4 text-indigo-600" /> : <EyeOff className="w-4 h-4" />}
              <span className="text-[10px] hidden sm:inline">
                {opacityPercent < 100 ? 'Mờ 82%' : 'Mờ nền'}
              </span>
            </button>

            {/* Undo */}
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white disabled:opacity-30 cursor-pointer"
              title="Hoàn tác (Undo)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Redo */}
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white disabled:opacity-30 cursor-pointer"
              title="Làm lại (Redo)"
            >
              <Redo className="w-4 h-4" />
            </button>

            {/* Clear all */}
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer"
              title="Xóa trắng bảng nháp"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Download */}
            <button
              onClick={handleDownloadImage}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
              title="Tải hình nháp về máy (PNG)"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullScreen((prev) => !prev)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
              title={isFullScreen ? 'Thu nhỏ cửa sổ' : 'Phóng to toàn màn hình'}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Minimize */}
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
              title="Thu nhỏ thành nút nổi"
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer"
              title="Đóng bảng nháp"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TOOLS & COLOR PICKER STRIP */}
        <div className="px-3 py-2 bg-slate-100/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 select-none text-xs">
          
          {/* Tool buttons */}
          <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => {
                soundEffects.playClick();
                setTool('pen');
              }}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                tool === 'pen' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Bút vẽ tự do"
            >
              <Edit3 className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                soundEffects.playClick();
                setTool('line');
              }}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                tool === 'line' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Đoạn thẳng hình học"
            >
              <LineIcon className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                soundEffects.playClick();
                setTool('circle');
              }}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                tool === 'circle' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Đường tròn / Hình elip"
            >
              <Circle className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                soundEffects.playClick();
                setTool('triangle');
              }}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                tool === 'triangle' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Hình tam giác"
            >
              <Triangle className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                soundEffects.playClick();
                setTool('rectangle');
              }}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                tool === 'rectangle' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Hình chữ nhật / Vuông"
            >
              <Square className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                soundEffects.playClick();
                setTool('eraser');
              }}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                tool === 'eraser' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Tẩy gôm"
            >
              <Eraser className="w-4 h-4" />
            </button>
          </div>

          {/* Stroke Width Selector */}
          <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
            {STROKE_WIDTHS.map((w) => (
              <button
                key={w.value}
                onClick={() => setStrokeWidth(w.value)}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  strokeWidth === w.value ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 font-black ring-1 ring-indigo-500' : 'text-slate-500 hover:bg-slate-100'
                }`}
                title={`Nét ${w.label} (${w.value}px)`}
              >
                <div 
                  className="rounded-full bg-current" 
                  style={{ width: `${Math.max(3, w.value * 1.5)}px`, height: `${Math.max(3, w.value * 1.5)}px` }} 
                />
              </button>
            ))}
          </div>

          {/* Color palette */}
          <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-900 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => {
                  setColor(c.value);
                  if (tool === 'eraser') setTool('pen');
                }}
                className={`w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 transition-transform cursor-pointer ${
                  color === c.value ? 'scale-125 ring-2 ring-indigo-500' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
          </div>

          {/* Background selector (Caro grid / White / Chalkboard) */}
          <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold">
            <button
              onClick={() => setBackground('grid')}
              className={`px-2 py-1 rounded-lg transition-colors cursor-pointer flex items-center space-x-1 ${
                background === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
              title="Vở ô ly kẻ caro toán học"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ô ly</span>
            </button>
            <button
              onClick={() => setBackground('white')}
              className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                background === 'white' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
              title="Bảng trắng trơn"
            >
              Trắng
            </button>
            <button
              onClick={() => setBackground('chalkboard')}
              className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                background === 'chalkboard' ? 'bg-slate-800 text-cyan-300' : 'text-slate-600 dark:text-slate-300'
              }`}
              title="Bảng đen phấn trắng"
            >
              Bảng đen
            </button>
          </div>

        </div>

        {/* CANVAS DRAWING STAGE */}
        <div 
          ref={containerRef}
          className={`flex-1 relative overflow-hidden select-none cursor-crosshair touch-none ${getCanvasBgClass()}`}
        >
          {/* Main Drawing Canvas */}
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute inset-0 w-full h-full touch-none"
          />

          {/* Overlay Preview Canvas for Shapes */}
          <canvas
            ref={previewCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none touch-none"
          />
        </div>

        {/* BOTTOM HINT FOOTER */}
        <div className="px-4 py-1.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 select-none">
          <div className="flex items-center space-x-1.5">
            <span className="font-bold text-indigo-600 dark:text-indigo-400">💡 Mẹo:</span>
            <span>Chọn hình Tròn / Tam giác / Đoạn thẳng để vẽ hình học THCS chuẩn xác.</span>
          </div>
          <span className="font-mono text-[10px]">Auto-saved</span>
        </div>

      </div>
    </div>
  );
};
