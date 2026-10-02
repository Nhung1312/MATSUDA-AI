import { Contest, ContestStatus, ContestSubmission, Question, QuestionOption } from '../types';
import { isEssayQuestion } from './questionUtils';

/**
 * Xác định trạng thái của Cuộc thi: 'upcoming' | 'ongoing' | 'ended'
 */
export function getContestStatus(contest: Contest): ContestStatus {
  const now = new Date().getTime();
  const startTime = new Date(contest.startTime).getTime();
  const endTime = new Date(contest.endTime).getTime();

  if (now < startTime) {
    return 'upcoming';
  }
  if (now > endTime) {
    return 'ended';
  }
  return 'ongoing';
}

/**
 * Lấy nhãn và màu sắc hiển thị trạng thái cuộc thi
 */
export function getContestStatusMeta(status: ContestStatus): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (status) {
    case 'ongoing':
      return {
        label: 'Đang diễn ra',
        badgeClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
        dotClass: 'bg-emerald-500 animate-pulse'
      };
    case 'upcoming':
      return {
        label: 'Sắp diễn ra',
        badgeClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
        dotClass: 'bg-amber-500'
      };
    case 'ended':
      return {
        label: 'Đã kết thúc',
        badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
        dotClass: 'bg-slate-400'
      };
  }
}

/**
 * Định dạng ngày giờ thân thiện theo chuẩn Việt Nam (vd: 14:30 20/03/2026)
 */
export function formatContestDateTime(isoString: string): string {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  } catch {
    return isoString;
  }
}

/**
 * Tính toán thời gian đếm ngược thân thiện
 */
export function getRelativeTimeRemaining(targetIso: string): string {
  const target = new Date(targetIso).getTime();
  const diff = target - Date.now();
  if (diff <= 0) return 'Đã hết giờ';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) return `${days} ngày ${hours} giờ nữa`;
  if (hours > 0) return `${hours} giờ ${minutes} phút nữa`;
  if (minutes > 0) return `${minutes} phút ${seconds} giây nữa`;
  return `${seconds} giây nữa`;
}

/**
 * Xếp hạng thí sinh theo quy tắc:
 * 1. Tổng điểm cao hơn đứng trước
 * 2. Nếu bằng điểm: thời gian làm bài ít hơn (nhanh hơn) đứng trước
 * 3. Nếu vẫn bằng: nộp bài sớm hơn đứng trước
 */
export function rankContestSubmissions(submissions: ContestSubmission[]): ContestSubmission[] {
  return [...submissions].sort((a, b) => {
    // 1. Điểm tổng
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    // 2. Thời gian làm bài (giây)
    if (a.timeSpentSeconds !== b.timeSpentSeconds) {
      return a.timeSpentSeconds - b.timeSpentSeconds;
    }
    // 3. Thời điểm nộp
    return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
  });
}

/**
 * Trộn ngẫu nhiên thứ tự câu hỏi và đáp án cho cuộc thi
 * Giữ nguyên ánh xạ đáp án đúng (correctAnswer)
 */
export function shuffleContestQuestions(
  questions: Question[],
  shuffleQ: boolean,
  shuffleOpts: boolean
): Question[] {
  if (!questions || questions.length === 0) return [];

  // 1. Phân tách danh sách thành 2 nhóm độc lập: Trắc nghiệm & Tự luận
  const mcqList: Question[] = [];
  const essayList: Question[] = [];

  questions.forEach(q => {
    const isEssay = isEssayQuestion(q);
    const cloned: Question = {
      ...q,
      type: isEssay ? 'essay' : (q.type || 'multiple_choice'),
      options: q.options ? q.options.map(opt => ({ ...opt })) : []
    };
    if (isEssay) {
      essayList.push(cloned);
    } else {
      mcqList.push(cloned);
    }
  });

  // 2. Trộn thứ tự câu hỏi trong nội bộ nhóm Trắc nghiệm nếu có cờ shuffleQ
  if (shuffleQ) {
    for (let i = mcqList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mcqList[i], mcqList[j]] = [mcqList[j], mcqList[i]];
    }
  }

  // 3. Trộn đáp án các câu trắc nghiệm nếu có cờ shuffleOpts
  const standardLabels = ['A', 'B', 'C', 'D', 'E', 'F'];
  const processedMcq = mcqList.map((q) => {
    if (!shuffleOpts || !q.options || q.options.length <= 1) {
      return q;
    }

    const cleanCorrect = (q.correctAnswer || '').trim().toUpperCase();

    // 1. So khớp theo id (ví dụ: 'A', 'B', 'C', 'D')
    let originalCorrectIdx = q.options.findIndex(
      opt => (opt.id || '').trim().toUpperCase() === cleanCorrect
    );

    // 2. Nếu chưa thấy, thử so khớp theo nhãn chuẩn A=0, B=1, C=2, D=3
    if (originalCorrectIdx === -1 && ['A', 'B', 'C', 'D', 'E', 'F'].includes(cleanCorrect)) {
      const idxFromLetter = cleanCorrect.charCodeAt(0) - 65;
      if (idxFromLetter >= 0 && idxFromLetter < q.options.length) {
        originalCorrectIdx = idxFromLetter;
      }
    }

    // 3. Nếu vẫn chưa thấy, so khớp theo nội dung văn bản (text)
    if (originalCorrectIdx === -1 && cleanCorrect) {
      originalCorrectIdx = q.options.findIndex(
        opt => (opt.text || '').trim().toUpperCase() === cleanCorrect
      );
    }

    // Gắn nhãn ban đầu (originalId) và cờ isCorrect ban đầu cho từng option
    const taggedOptions = q.options.map((opt, optI) => {
      const fallbackLabel = standardLabels[optI] || String.fromCharCode(65 + optI);
      const originalId = (opt.id && opt.id.trim()) ? opt.id.trim() : fallbackLabel;
      const isOriginallyCorrect = originalCorrectIdx !== -1 
        ? optI === originalCorrectIdx 
        : (originalId.toUpperCase() === cleanCorrect);

      return {
        ...opt,
        originalId,
        isOriginallyCorrect
      };
    });

    for (let i = taggedOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [taggedOptions[i], taggedOptions[j]] = [taggedOptions[j], taggedOptions[i]];
    }

    let newCorrect = q.correctAnswer;
    const newOptions: (QuestionOption & { originalId?: string })[] = taggedOptions.map((opt, optIdx) => {
      const label = standardLabels[optIdx] || String.fromCharCode(65 + optIdx);
      if (opt.isOriginallyCorrect) {
        newCorrect = label;
      }
      return {
        id: label,
        text: opt.text,
        originalId: opt.originalId
      };
    });

    return {
      ...q,
      options: newOptions,
      correctAnswer: newCorrect
    };
  });

  const processedEssay = essayList.map(q => ({
    ...q,
    type: 'essay' as const,
    options: []
  }));

  // Ghép lại: Luôn luôn TRẮC NGHIỆM TRƯỚC, TỰ LUẬN SAU, đánh số liên tục
  return [...processedMcq, ...processedEssay].map((q, idx) => ({
    ...q,
    order: idx + 1
  }));
}
