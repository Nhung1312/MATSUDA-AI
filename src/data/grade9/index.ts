import { Question, Assignment } from '../../types';

export const GRADE9_QUESTIONS_ALGEBRA: Question[] = [
  {
    id: 'g9_q1',
    order: 1,
    question: 'Điều kiện xác định của biểu thức √(2x - 6) là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: 'x ≥ 3' },
      { id: 'B', text: 'x > 3' },
      { id: 'C', text: 'x ≤ 3' },
      { id: 'D', text: 'x ≠ 3' }
    ],
    correctAnswer: 'A',
    points: 1,
    explanation: 'Biểu thức √A có nghĩa khi A ≥ 0 <=> 2x - 6 ≥ 0 <=> 2x ≥ 6 <=> x ≥ 3.',
    topicHint: 'Căn bậc hai - Điều kiện xác định'
  },
  {
    id: 'g9_q2',
    order: 2,
    question: 'Hệ phương trình { 2x + y = 5; x - y = 1 } có nghiệm (x; y) là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '(2; 1)' },
      { id: 'B', text: '(1; 2)' },
      { id: 'C', text: '(3; -1)' },
      { id: 'D', text: '(2; 3)' }
    ],
    correctAnswer: 'A',
    points: 1,
    explanation: 'Cộng 2 vế phương trình: 3x = 6 => x = 2. Thay vào pt (2): 2 - y = 1 => y = 1. Nghiệm là (2; 1).',
    topicHint: 'Hệ phương trình bậc nhất hai ẩn'
  },
  {
    id: 'g9_q3',
    order: 3,
    question: 'Phương trình bậc hai x² - 5x + 6 = 0 có hai nghiệm là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: 'x₁ = 2, x₂ = 3' },
      { id: 'B', text: 'x₁ = -2, x₂ = -3' },
      { id: 'C', text: 'x₁ = 1, x₂ = 6' },
      { id: 'D', text: 'x₁ = -1, x₂ = -6' }
    ],
    correctAnswer: 'A',
    points: 1,
    explanation: 'Ta có Δ = (-5)² - 4·1·6 = 25 - 24 = 1 > 0. Nghiệm x = (5 ± 1) / 2 => x₁ = 3, x₂ = 2.',
    topicHint: 'Phương trình bậc hai một ẩn'
  }
];

export const GRADE9_QUESTIONS_GEOMETRY: Question[] = [
  {
    id: 'g9_geo_1',
    order: 1,
    question: 'Số đo của góc nội tiếp chắn nửa đường tròn bằng bao nhiêu độ?',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '90°' },
      { id: 'B', text: '180°' },
      { id: 'C', text: '60°' },
      { id: 'D', text: '45°' }
    ],
    correctAnswer: 'A',
    points: 1,
    explanation: 'Định lý: Góc nội tiếp chắn nửa đường tròn là góc vuông (90°).',
    topicHint: 'Đường tròn - Góc nội tiếp'
  },
  {
    id: 'g9_geo_2',
    order: 2,
    question: 'Tam giác ABC vuông tại A có đường cao AH. Hệ thức nào sau đây là đúng?',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: 'AH² = BH · CH' },
      { id: 'B', text: 'AH = BH · CH' },
      { id: 'C', text: 'AB² = AH · BC' },
      { id: 'D', text: 'AC² = BH · BC' }
    ],
    correctAnswer: 'A',
    points: 1,
    explanation: 'Hệ thức lượng trong tam giác vuông: Bình phương đường cao ứng với cạnh huyền bằng tích hai hình chiếu của hai cạnh góc vuông trên cạnh huyền: AH² = BH · CH.',
    topicHint: 'Hệ thức lượng trong tam giác vuông'
  }
];

export const GRADE9_ASSIGNMENTS: Assignment[] = [
  {
    id: 'asg_toan9_hephuongtrinh',
    title: 'Toán 9 – Căn thức bậc hai & Hệ phương trình',
    grade: '9',
    topic: 'Đại số: Căn bậc hai & Hệ phương trình bậc nhất hai ẩn',
    classId: 'all',
    className: 'Toàn khối 9',
    questions: GRADE9_QUESTIONS_ALGEBRA,
    durationMinutes: 45,
    deadline: '2026-11-15T23:59:59',
    allowViewResult: true,
    assignmentCode: 'TOAN9-HEPT1',
    createdAt: '2026-08-23T09:00:00Z',
    isPublished: true
  },
  {
    id: 'asg_toan9_duongtron',
    title: 'Toán 9 – Hệ thức lượng tam giác vuông & Góc với đường tròn',
    grade: '9',
    topic: 'Hình học: Hệ thức lượng & Đường tròn (Góc nội tiếp)',
    classId: 'all',
    className: 'Toàn khối 9',
    questions: GRADE9_QUESTIONS_GEOMETRY,
    durationMinutes: 30,
    deadline: '2026-11-20T23:59:59',
    allowViewResult: true,
    assignmentCode: 'TOAN9-DUONGTRON',
    createdAt: '2026-08-23T09:30:00Z',
    isPublished: true
  }
];
