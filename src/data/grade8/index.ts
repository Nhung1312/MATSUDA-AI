import { Question, Assignment } from '../../types';

export const GRADE8_QUESTIONS_ALGEBRA: Question[] = [
  {
    id: 'g8_q1',
    order: 1,
    question: 'Khai triển hằng đẳng thức (a + b)² ta được kết quả là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: 'a² + b²' },
      { id: 'B', text: 'a² + 2ab + b²' },
      { id: 'C', text: 'a² - 2ab + b²' },
      { id: 'D', text: 'a² + ab + b²' }
    ],
    correctAnswer: 'B',
    points: 1,
    explanation: 'Hằng đẳng thức bình phương của một tổng: (a + b)² = a² + 2ab + b².',
    topicHint: 'Hằng đẳng thức đáng nhớ'
  },
  {
    id: 'g8_q2',
    order: 2,
    question: 'Biểu thức (x - 3)(x + 3) bằng:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: 'x² - 9' },
      { id: 'B', text: 'x² + 9' },
      { id: 'C', text: 'x² - 6x + 9' },
      { id: 'D', text: 'x² - 6' }
    ],
    correctAnswer: 'A',
    points: 1,
    explanation: 'Áp dụng hằng đẳng thức hiệu hai bình phương: (a - b)(a + b) = a² - b² => (x - 3)(x + 3) = x² - 9.',
    topicHint: 'Hiệu hai bình phương'
  },
  {
    id: 'g8_q3',
    order: 3,
    question: 'Phân tích đa thức x² - 4x + 4 thành nhân tử:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '(x - 2)(x + 2)' },
      { id: 'B', text: '(x - 2)²' },
      { id: 'C', text: '(x + 2)²' },
      { id: 'D', text: '(x - 4)²' }
    ],
    correctAnswer: 'B',
    points: 1,
    explanation: 'x² - 4x + 4 = x² - 2·x·2 + 2² = (x - 2)².',
    topicHint: 'Phân tích đa thức thành nhân tử'
  },
  {
    id: 'g8_q4',
    order: 4,
    question: 'Kết quả của phép chia đơn thức 12x³y² cho 4xy là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '3x²y' },
      { id: 'B', text: '3x²' },
      { id: 'C', text: '3xy' },
      { id: 'D', text: '4x²y' }
    ],
    correctAnswer: 'A',
    points: 1,
    explanation: '12x³y² : 4xy = (12:4) · (x³:x) · (y²:y) = 3x²y.',
    topicHint: 'Chia đơn thức cho đơn thức'
  }
];

export const GRADE8_QUESTIONS_GEOMETRY: Question[] = [
  {
    id: 'g8_geo_1',
    order: 1,
    question: 'Tam giác ABC vuông tại A có AB = 6 cm, AC = 8 cm. Độ dài cạnh huyền BC là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '10 cm' },
      { id: 'B', text: '14 cm' },
      { id: 'C', text: '12 cm' },
      { id: 'D', text: '7 cm' }
    ],
    correctAnswer: 'A',
    points: 1,
    explanation: 'Theo định lý Pythagore: BC² = AB² + AC² = 6² + 8² = 36 + 64 = 100 => BC = √100 = 10 cm.',
    topicHint: 'Định lý Pythagore'
  },
  {
    id: 'g8_geo_2',
    order: 2,
    question: 'Hình bình hành có một góc vuông là hình gì?',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: 'Hình thoi' },
      { id: 'B', text: 'Hình chữ nhật' },
      { id: 'C', text: 'Hình vuông' },
      { id: 'D', text: 'Hình thang cân' }
    ],
    correctAnswer: 'B',
    points: 1,
    explanation: 'Theo dấu hiệu nhận biết: Hình bình hành có một góc vuông là hình chữ nhật.',
    topicHint: 'Tứ giác - Hình chữ nhật'
  }
];

export const GRADE8_ASSIGNMENTS: Assignment[] = [
  {
    id: 'asg_toan8_hangdangthuc',
    title: 'Toán 8 – Hằng đẳng thức đáng nhớ & Phân tích đa thức',
    grade: '8',
    topic: 'Đại số: 7 hằng đẳng thức đáng nhớ',
    classId: 'class_8a1',
    className: '8A1',
    questions: GRADE8_QUESTIONS_ALGEBRA,
    durationMinutes: 30,
    deadline: '2026-10-30T23:59:59',
    allowViewResult: true,
    assignmentCode: 'TOAN8-HDT7',
    createdAt: '2026-08-22T14:00:00Z',
    isPublished: true
  },
  {
    id: 'asg_toan8_pythagore',
    title: 'Toán 8 – Định lý Pythagore & Các loại tứ giác',
    grade: '8',
    topic: 'Hình học: Định lý Pythagore & Tứ giác đặc biệt',
    classId: 'class_8a1',
    className: '8A1',
    questions: GRADE8_QUESTIONS_GEOMETRY,
    durationMinutes: 20,
    deadline: '2026-10-31T23:59:59',
    allowViewResult: true,
    assignmentCode: 'TOAN8-PYTHAGORE',
    createdAt: '2026-08-22T15:00:00Z',
    isPublished: true
  }
];
