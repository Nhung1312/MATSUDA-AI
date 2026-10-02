import { Assignment, GradeLevel } from '../types';
import { GRADE6_ASSIGNMENTS } from './grade6';
import { GRADE7_ASSIGNMENTS } from './grade7';
import { GRADE8_ASSIGNMENTS } from './grade8';
import { GRADE9_ASSIGNMENTS } from './grade9';

export * from './grade6';
export * from './grade7';
export * from './grade8';
export * from './grade9';

export interface GradeMetaInfo {
  grade: GradeLevel;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  colorScheme: {
    badgeBg: string;
    badgeText: string;
    border: string;
    hoverBorder: string;
    gradientFrom: string;
    gradientTo: string;
    btnBg: string;
    btnHover: string;
    accentText: string;
    lightBg: string;
  };
  topics: {
    algebra: string[];
    geometry: string[];
    statistics: string[];
  };
  sampleTopics: string[];
}

export const ALL_GRADE_METAS: Record<GradeLevel, GradeMetaInfo> = {
  '6': {
    grade: '6',
    title: 'Lớp 6',
    subtitle: 'Số học & Hình học trực quan',
    description: 'Tập hợp số tự nhiên, Phân số, Số thập phân, Hình tam giác đều, Hình vuông, Đoạn thẳng & Góc.',
    badge: 'Lớp 6 - Khởi đầu cấp 2',
    colorScheme: {
      badgeBg: 'bg-blue-100 dark:bg-blue-950/80',
      badgeText: 'text-blue-800 dark:text-blue-300',
      border: 'border-blue-200 dark:border-blue-850',
      hoverBorder: 'hover:border-blue-500 dark:hover:border-blue-400',
      gradientFrom: 'from-blue-600',
      gradientTo: 'to-indigo-600',
      btnBg: 'bg-blue-600 hover:bg-blue-700 text-white',
      btnHover: 'hover:bg-blue-700',
      accentText: 'text-blue-600 dark:text-blue-400',
      lightBg: 'bg-blue-50/60 dark:bg-blue-950/30'
    },
    topics: {
      algebra: ['Số tự nhiên & Phép chia có dư', 'Số nguyên & Quy tắc dấu', 'Phân số & Các phép tính', 'Số thập phân & Tỉ số phần trăm'],
      geometry: ['Tam giác đều, Hình vuông, Lục giác đều', 'Hình chữ nhật, Hình thoi, Hình bình hành', 'Điểm, Đoạn thẳng & Trung điểm', 'Góc & Số đo góc'],
      statistics: ['Thu thập và tổ chức dữ liệu', 'Biểu đồ cột, Biểu đồ cột kép', 'Xác suất thực nghiệm']
    },
    sampleTopics: ['Phân số', 'Số nguyên', 'Tam giác đều', 'Biểu đồ cột']
  },
  '7': {
    grade: '7',
    title: 'Lớp 7',
    subtitle: 'Số hữu tỉ, Căn bậc hai & Tam giác',
    description: 'Số hữu tỉ, Căn bậc hai số học, Số thập phân vô hạn tuần hoàn, Góc đối đỉnh, Tam giác bằng nhau.',
    badge: 'Lớp 7 - Nâng cao tư duy',
    colorScheme: {
      badgeBg: 'bg-emerald-100 dark:bg-emerald-950/80',
      badgeText: 'text-emerald-800 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-850',
      hoverBorder: 'hover:border-emerald-500 dark:hover:border-emerald-400',
      gradientFrom: 'from-emerald-600',
      gradientTo: 'to-teal-600',
      btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      btnHover: 'hover:bg-emerald-700',
      accentText: 'text-emerald-600 dark:text-emerald-400',
      lightBg: 'bg-emerald-50/60 dark:bg-emerald-950/30'
    },
    topics: {
      algebra: ['Tập hợp số hữu tỉ Q', 'Căn bậc hai số học & Số thực R', 'Tỉ lệ thức & Đại lượng tỉ lệ', 'Biểu thức đại số & Đa thức một biến'],
      geometry: ['Góc ở vị trí đặc biệt & Tia phân giác', 'Hai đường thẳng song song', 'Tam giác bằng nhau (c-c-c, c-g-c, g-c-g)', 'Tam giác cân, Định lý Pythagore cơ bản'],
      statistics: ['Bảng thống kê và biểu đồ đoạn thẳng', 'Biểu đồ hình quạt tròn', 'Biến cố và xác suất của biến cố']
    },
    sampleTopics: ['Số hữu tỉ Q', 'Căn bậc hai', 'Tam giác bằng nhau', 'Biểu đồ quạt']
  },
  '8': {
    grade: '8',
    title: 'Lớp 8',
    subtitle: 'Hằng đẳng thức, Đa thức & Tứ giác',
    description: '7 Hằng đẳng thức đáng nhớ, Phân tích đa thức thành nhân tử, Định lý Pythagore, Định lý Thalès.',
    badge: 'Lớp 8 - Đột phá kiến thức',
    colorScheme: {
      badgeBg: 'bg-purple-100 dark:bg-purple-950/80',
      badgeText: 'text-purple-800 dark:text-purple-300',
      border: 'border-purple-200 dark:border-purple-850',
      hoverBorder: 'hover:border-purple-500 dark:hover:border-purple-400',
      gradientFrom: 'from-purple-600',
      gradientTo: 'to-pink-600',
      btnBg: 'bg-purple-600 hover:bg-purple-700 text-white',
      btnHover: 'hover:bg-purple-700',
      accentText: 'text-purple-600 dark:text-purple-400',
      lightBg: 'bg-purple-50/60 dark:bg-purple-950/30'
    },
    topics: {
      algebra: ['7 Hằng đẳng thức đáng nhớ', 'Phân tích đa thức thành nhân tử', 'Phân thức đại số', 'Hàm số bậc nhất y = ax + b'],
      geometry: ['Tứ giác: Hình bình hành, Hình chữ nhật, Hình thoi, Hình vuông', 'Định lý Thalès trong tam giác', 'Tam giác đồng dạng', 'Hình chóp tam giác đều & Tứ giác đều'],
      statistics: ['Phương pháp thu thập và phân loại dữ liệu', 'Biểu đồ tần số', 'Xác suất của biến cố ngẫu nhiên']
    },
    sampleTopics: ['Hằng đẳng thức', 'Phân tích đa thức', 'Định lý Pythagore', 'Tứ giác đặc biệt']
  },
  '9': {
    grade: '9',
    title: 'Lớp 9',
    subtitle: 'Hệ phương trình, Phương trình bậc 2 & Đường tròn',
    description: 'Căn thức bậc 2 & bậc 3, Hệ hai phương trình bậc nhất, Hàm số y = ax², Đường tròn & Ôn thi vào 10.',
    badge: 'Lớp 9 - Trọng tâm thi vào 10',
    colorScheme: {
      badgeBg: 'bg-rose-100 dark:bg-rose-950/80',
      badgeText: 'text-rose-800 dark:text-rose-300',
      border: 'border-rose-200 dark:border-rose-850',
      hoverBorder: 'hover:border-rose-500 dark:hover:border-rose-400',
      gradientFrom: 'from-rose-600',
      gradientTo: 'to-amber-600',
      btnBg: 'bg-rose-600 hover:bg-rose-700 text-white',
      btnHover: 'hover:bg-rose-700',
      accentText: 'text-rose-600 dark:text-rose-400',
      lightBg: 'bg-rose-50/60 dark:bg-rose-950/30'
    },
    topics: {
      algebra: ['Căn bậc hai và Căn thức bậc hai', 'Hệ phương trình bậc nhất hai ẩn', 'Hàm số y = ax² & Phương trình bậc hai một ẩn', 'Hệ thức Vi-ét và ứng dụng'],
      geometry: ['Hệ thức lượng trong tam giác vuông', 'Đường tròn & Tiếp tuyến của đường tròn', 'Góc ở tâm, Góc nội tiếp & Góc tạo bởi tiếp tuyến và dây cung', 'Tứ giác nội tiếp đường tròn & Hình trụ, nón, cầu'],
      statistics: ['Bảng phân bố tần số & Tần số tương đối', 'Phép thử ngẫu nhiên và xác suất']
    },
    sampleTopics: ['Căn thức bậc hai', 'Hệ hai phương trình', 'Góc nội tiếp đường tròn', 'Ôn thi vào 10']
  }
};

export const INITIAL_ALL_ASSIGNMENTS: Assignment[] = [
  ...GRADE7_ASSIGNMENTS,
  ...GRADE6_ASSIGNMENTS,
  ...GRADE8_ASSIGNMENTS,
  ...GRADE9_ASSIGNMENTS
];
