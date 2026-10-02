import { Question, Assignment } from '../../types';

export const GRADE7_QUESTIONS_DECUONG: Question[] = [
  {
    id: 'dt7_q1',
    order: 1,
    question: 'Tập hợp số hữu tỉ được kí hiệu là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: 'N' },
      { id: 'B', text: 'Z' },
      { id: 'C', text: 'R' },
      { id: 'D', text: 'Q' }
    ],
    correctAnswer: 'D',
    points: 0.5,
    explanation: 'Tập hợp các số hữu tỉ được kí hiệu là Q. Tập số tự nhiên là N, tập số nguyên là Z, tập số thực là R.',
    topicHint: 'Khái niệm và kí hiệu số hữu tỉ'
  },
  {
    id: 'dt7_q2',
    order: 2,
    question: 'Cách viết nào sau đây là sai?',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '-1/2 ∈ Q' },
      { id: 'B', text: '-5 ∈ Q' },
      { id: 'C', text: '-7/3 ∈ Z' },
      { id: 'D', text: '-7/3 ∉ N' }
    ],
    correctAnswer: 'C',
    points: 0.5,
    explanation: '-7/3 là số hữu tỉ nhưng không phải số nguyên (-7 không chia hết cho 3), nên cách viết -7/3 ∈ Z là SAI.',
    topicHint: 'Kí hiệu tập hợp số'
  },
  {
    id: 'dt7_q3',
    order: 3,
    question: 'Số không phải số hữu tỉ trong các số sau là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '1,5' },
      { id: 'B', text: '-9/0' },
      { id: 'C', text: '-5/9' },
      { id: 'D', text: '3 5/8' }
    ],
    correctAnswer: 'B',
    points: 0.5,
    explanation: 'Số hữu tỉ có dạng a/b với a, b ∈ Z và mẫu b ≠ 0. Phân số -9/0 có mẫu bằng 0 nên không xác định, không phải số hữu tỉ.',
    topicHint: 'Điều kiện xác định số hữu tỉ'
  },
  {
    id: 'dt7_q4',
    order: 4,
    question: 'Số đối của số -2/3 là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '3/2' },
      { id: 'B', text: '-3/2' },
      { id: 'C', text: '-2/3' },
      { id: 'D', text: '2/3' }
    ],
    correctAnswer: 'D',
    points: 0.5,
    explanation: 'Số đối của số hữu tỉ x là -x. Do đó số đối của -2/3 là -(-2/3) = 2/3.',
    topicHint: 'Số đối của số hữu tỉ'
  },
  {
    id: 'dt7_q5',
    order: 5,
    question: 'Số nghịch đảo của số -0,8 là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '0,8' },
      { id: 'B', text: '-8/10' },
      { id: 'C', text: '-5/4' },
      { id: 'D', text: '5/4' }
    ],
    correctAnswer: 'C',
    points: 0.5,
    explanation: 'Ta có -0,8 = -8/10 = -4/5. Số nghịch đảo của -4/5 là 1/(-4/5) = -5/4.',
    topicHint: 'Số nghịch đảo'
  },
  {
    id: 'dt7_q6',
    order: 6,
    question: "Hai đường thẳng xx' và yy' cắt nhau tại O. Góc đối đỉnh của góc xOy là:",
    type: 'multiple_choice',
    options: [
      { id: 'A', text: "Góc x'Oy'" },
      { id: 'B', text: "Góc x'Oy" },
      { id: 'C', text: 'Góc xOy' },
      { id: 'D', text: "Góc y'Ox" }
    ],
    correctAnswer: 'A',
    points: 0.5,
    explanation: "Vì tia Ox' là tia đối của Ox, Oy' là tia đối của Oy nên góc x'Oy' là góc đối đỉnh của góc xOy.",
    topicHint: 'Hình học – Góc đối đỉnh'
  },
  {
    id: 'dt7_q7',
    order: 7,
    question: 'Giá trị thích hợp điền vào ô trống trong: √□ = 7 và √169 = □ lần lượt là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '49 và 13' },
      { id: 'B', text: '14 và 13' },
      { id: 'C', text: '49 và 14' },
      { id: 'D', text: '7 và 169' }
    ],
    correctAnswer: 'A',
    points: 0.5,
    explanation: 'Vì 7² = 49 nên √49 = 7. Vì 13² = 169 nên √169 = 13.',
    topicHint: 'Căn bậc hai số học'
  },
  {
    id: 'dt7_q8',
    order: 8,
    question: 'Giá trị của biểu thức √((2/5)²) là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '2/5' },
      { id: 'B', text: '4/25' },
      { id: 'C', text: '5/2' },
      { id: 'D', text: '4/5' }
    ],
    correctAnswer: 'A',
    points: 0.5,
    explanation: 'Với a ≥ 0 thì √(a²) = a. Do đó √((2/5)²) = 2/5.',
    topicHint: 'Căn bậc hai số học'
  },
  {
    id: 'dt7_q9',
    order: 9,
    question: 'Phân số -2/15 viết dưới dạng số thập phân vô hạn tuần hoàn là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '-0,1(3)' },
      { id: 'B', text: '-0,(13)' },
      { id: 'C', text: '-0,133' },
      { id: 'D', text: '-0,(3)' }
    ],
    correctAnswer: 'A',
    points: 0.5,
    explanation: '-2 : 15 = -0,1333... = -0,1(3). Chu kì là 3.',
    topicHint: 'Số thập phân vô hạn tuần hoàn'
  },
  {
    id: 'dt7_q10',
    order: 10,
    question: 'Tính giá trị biểu thức: A = 3·√16 - 4·√(1/4):',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '10' },
      { id: 'B', text: '12' },
      { id: 'C', text: '8' },
      { id: 'D', text: '14' }
    ],
    correctAnswer: 'A',
    points: 0.5,
    explanation: 'A = 3·4 - 4·(1/2) = 12 - 2 = 10.',
    topicHint: 'Tính giá trị biểu thức chứa căn bậc hai'
  }
];

export const GRADE7_ASSIGNMENTS: Assignment[] = [
  {
    id: 'asg_toan7_decuong',
    title: 'Đề Cương Ôn Tập Môn Toán 7',
    grade: '7',
    topic: 'Số hữu tỉ – Căn bậc hai – Số thập phân – Góc đối đỉnh',
    classId: 'class_7a2',
    className: '7A2',
    questions: GRADE7_QUESTIONS_DECUONG,
    durationMinutes: 45,
    deadline: '2026-10-15T23:59:59',
    allowViewResult: true,
    assignmentCode: 'TOAN7-DECUONG',
    createdAt: '2026-08-23T08:00:00Z',
    isPublished: true
  },
  {
    id: 'asg_toan7_tamgiac',
    title: 'Toán 7 – Các trường hợp bằng nhau của tam giác',
    grade: '7',
    topic: 'Hình học: Tam giác bằng nhau (c-c-c, c-g-c, g-c-g)',
    classId: 'class_7a2',
    className: '7A2',
    questions: [
      {
        id: 'g7_tg_1',
        order: 1,
        question: 'Tổng ba góc trong một tam giác bằng bao nhiêu?',
        type: 'multiple_choice',
        options: [
          { id: 'A', text: '90°' },
          { id: 'B', text: '180°' },
          { id: 'C', text: '360°' },
          { id: 'D', text: '270°' }
        ],
        correctAnswer: 'B',
        points: 1,
        explanation: 'Định lý tổng ba góc trong một tam giác luôn bằng 180°.',
        topicHint: 'Tổng ba góc của một tam giác'
      },
      {
        id: 'g7_tg_2',
        order: 2,
        question: 'Tam giác ABC vuông tại A có góc B = 35°. Số đo của góc C là:',
        type: 'multiple_choice',
        options: [
          { id: 'A', text: '55°' },
          { id: 'B', text: '65°' },
          { id: 'C', text: '45°' },
          { id: 'D', text: '35°' }
        ],
        correctAnswer: 'A',
        points: 1,
        explanation: 'Trong tam giác vuông, hai góc nhọn phụ nhau: góc C = 90° - 35° = 55°.',
        topicHint: 'Tam giác vuông'
      }
    ],
    durationMinutes: 15,
    deadline: '2026-10-20T23:59:59',
    allowViewResult: true,
    assignmentCode: 'TOAN7-TAMGIAC',
    createdAt: '2026-08-22T10:00:00Z',
    isPublished: true
  }
];
