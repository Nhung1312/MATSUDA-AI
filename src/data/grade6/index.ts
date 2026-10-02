import { Question, Assignment } from '../../types';

export const GRADE6_QUESTIONS_FRACTIONS: Question[] = [
  {
    id: 'g6_q1',
    order: 1,
    question: 'Phân số nào sau đây lớn hơn 1?',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '1/2' },
      { id: 'B', text: '2/3' },
      { id: 'C', text: '5/4' },
      { id: 'D', text: '3/5' }
    ],
    correctAnswer: 'C',
    points: 0.5,
    explanation: 'Phân số lớn hơn 1 khi tử số lớn hơn mẫu số (với tử và mẫu dương). Ở đây 5 > 4 nên 5/4 > 1.',
    topicHint: 'So sánh phân số'
  },
  {
    id: 'g6_q2',
    order: 2,
    question: 'Phân số đối của phân số -3/7 là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '3/7' },
      { id: 'B', text: '-7/3' },
      { id: 'C', text: '7/3' },
      { id: 'D', text: '-3/-7' }
    ],
    correctAnswer: 'A',
    points: 0.5,
    explanation: 'Số đối của phân số a/b là -a/b. Do đó số đối của -3/7 là -(-3/7) = 3/7.',
    topicHint: 'Số đối của phân số'
  },
  {
    id: 'g6_q3',
    order: 3,
    question: 'Rút gọn phân số 24/36 về phân số tối giản ta được:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '12/18' },
      { id: 'B', text: '6/9' },
      { id: 'C', text: '2/3' },
      { id: 'D', text: '4/6' }
    ],
    correctAnswer: 'C',
    points: 0.5,
    explanation: 'ƯCLN(24, 36) = 12. Chia cả tử và mẫu cho 12: 24:12 / 36:12 = 2/3.',
    topicHint: 'Rút gọn phân số'
  },
  {
    id: 'g6_q4',
    order: 4,
    question: 'Kết quả của phép tính: 2/5 + 3/5 là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '5/10' },
      { id: 'B', text: '1' },
      { id: 'C', text: '6/25' },
      { id: 'D', text: '5/25' }
    ],
    correctAnswer: 'B',
    points: 0.5,
    explanation: 'Cộng hai phân số cùng mẫu: (2 + 3)/5 = 5/5 = 1.',
    topicHint: 'Cộng phân số cùng mẫu'
  },
  {
    id: 'g6_q5',
    order: 5,
    question: 'Kết quả của phép tính: 1/4 + 2/3 là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '3/7' },
      { id: 'B', text: '11/12' },
      { id: 'C', text: '3/12' },
      { id: 'D', text: '5/12' }
    ],
    correctAnswer: 'B',
    points: 0.5,
    explanation: 'Quy đồng mẫu số chung là 12: 1/4 = 3/12, 2/3 = 8/12 => 3/12 + 8/12 = 11/12.',
    topicHint: 'Cộng phân số khác mẫu'
  },
  {
    id: 'g6_q6',
    order: 6,
    question: 'Phân số nghịch đảo của phân số -5/8 là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '5/8' },
      { id: 'B', text: '-8/5' },
      { id: 'C', text: '8/5' },
      { id: 'D', text: '1' }
    ],
    correctAnswer: 'B',
    points: 0.5,
    explanation: 'Phân số nghịch đảo của a/b (a, b khác 0) là b/a. Nghịch đảo của -5/8 là 8/(-5) = -8/5.',
    topicHint: 'Phân số nghịch đảo'
  },
  {
    id: 'g6_q7',
    order: 7,
    question: 'Thực hiện phép nhân: (3/7) × (14/9) được kết quả tối giản là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '42/63' },
      { id: 'B', text: '2/3' },
      { id: 'C', text: '3/2' },
      { id: 'D', text: '6/9' }
    ],
    correctAnswer: 'B',
    points: 0.5,
    explanation: '(3 × 14) / (7 × 9) = (3 × 2 × 7) / (7 × 3 × 3) = 2/3.',
    topicHint: 'Nhân phân số'
  },
  {
    id: 'g6_q8',
    order: 8,
    question: 'Thực hiện phép chia: (4/5) : (2/15) được kết quả là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '6' },
      { id: 'B', text: '8/75' },
      { id: 'C', text: '2/3' },
      { id: 'D', text: '3/2' }
    ],
    correctAnswer: 'A',
    points: 0.5,
    explanation: '(4/5) : (2/15) = (4/5) × (15/2) = (4 × 15) / (5 × 2) = 60 / 10 = 6.',
    topicHint: 'Chia phân số'
  },
  {
    id: 'g6_q9',
    order: 9,
    question: 'Tìm x biết: x - 1/3 = 1/2',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: 'x = 1/6' },
      { id: 'B', text: 'x = 5/6' },
      { id: 'C', text: 'x = 2/5' },
      { id: 'D', text: 'x = -1/6' }
    ],
    correctAnswer: 'B',
    points: 0.5,
    explanation: 'x = 1/2 + 1/3 = 3/6 + 2/6 = 5/6.',
    topicHint: 'Tìm x với phép cộng trừ phân số'
  },
  {
    id: 'g6_q10',
    order: 10,
    question: 'Hỗn số 3 2/5 được viết dưới dạng phân số là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '17/5' },
      { id: 'B', text: '11/5' },
      { id: 'C', text: '6/5' },
      { id: 'D', text: '15/5' }
    ],
    correctAnswer: 'A',
    points: 0.5,
    explanation: '3 2/5 = (3 × 5 + 2) / 5 = (15 + 2) / 5 = 17/5.',
    topicHint: 'Chuyển đổi hỗn số'
  },
  {
    id: 'g6_q11',
    order: 11,
    question: 'Tìm 3/4 của 60:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '40' },
      { id: 'B', text: '45' },
      { id: 'C', text: '80' },
      { id: 'D', text: '50' }
    ],
    correctAnswer: 'B',
    points: 0.5,
    explanation: 'Muốn tìm m/n của số b ta tính b × (m/n) = 60 × (3/4) = 45.',
    topicHint: 'Giá trị phân số của một số'
  },
  {
    id: 'g6_q12',
    order: 12,
    question: 'Tìm một số biết 2/5 của nó bằng 20:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '8' },
      { id: 'B', text: '50' },
      { id: 'C', text: '40' },
      { id: 'D', text: '25' }
    ],
    correctAnswer: 'B',
    points: 0.5,
    explanation: 'Số cần tìm là: 20 : (2/5) = 20 × (5/2) = 50.',
    topicHint: 'Tìm một số biết giá trị phân số'
  }
];

export const GRADE6_QUESTIONS_GEOMETRY: Question[] = [
  {
    id: 'g6_geo_1',
    order: 1,
    question: 'Hình tam giác đều có bao nhiêu trục đối xứng?',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '1' },
      { id: 'B', text: '2' },
      { id: 'C', text: '3' },
      { id: 'D', text: 'Không có' }
    ],
    correctAnswer: 'C',
    points: 1,
    explanation: 'Tam giác đều có 3 trục đối xứng đi qua mỗi đỉnh và trung điểm của cạnh đối diện.',
    topicHint: 'Hình học trực quan - Trục đối xứng'
  },
  {
    id: 'g6_geo_2',
    order: 2,
    question: 'Hình vuông cạnh 6 cm có chu vi và diện tích lần lượt là:',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '24 cm và 36 cm²' },
      { id: 'B', text: '12 cm và 36 cm²' },
      { id: 'C', text: '36 cm và 24 cm²' },
      { id: 'D', text: '24 cm và 24 cm²' }
    ],
    correctAnswer: 'A',
    points: 1,
    explanation: 'Chu vi = 4 × 6 = 24 cm. Diện tích = 6 × 6 = 36 cm².',
    topicHint: 'Chu vi và diện tích hình phẳng'
  },
  {
    id: 'g6_geo_3',
    order: 3,
    question: 'Nếu điểm M nằm giữa hai điểm A và B thì khẳng định nào sau đây đúng?',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: 'AM + MB = AB' },
      { id: 'B', text: 'AB + MB = AM' },
      { id: 'C', text: 'AM + AB = MB' },
      { id: 'D', text: 'AM = MB' }
    ],
    correctAnswer: 'A',
    points: 1,
    explanation: 'Khi điểm M nằm giữa A và B thì độ dài đoạn thẳng AM cộng MB bằng độ dài đoạn thẳng AB: AM + MB = AB.',
    topicHint: 'Điểm nằm giữa hai điểm'
  },
  {
    id: 'g6_geo_4',
    order: 4,
    question: 'Góc bẹt có số đo bằng bao nhiêu độ?',
    type: 'multiple_choice',
    options: [
      { id: 'A', text: '90°' },
      { id: 'B', text: '60°' },
      { id: 'C', text: '180°' },
      { id: 'D', text: '360°' }
    ],
    correctAnswer: 'C',
    points: 1,
    explanation: 'Góc bẹt là góc có hai cạnh là hai tia đối nhau, số đo bằng 180°.',
    topicHint: 'Góc và các loại góc'
  }
];

export const GRADE6_ASSIGNMENTS: Assignment[] = [
  {
    id: 'asg_toan6_phanso',
    title: 'Toán 6 – Phân số & Các phép tính',
    grade: '6',
    topic: 'Đại số: Phân số & Số thập phân',
    classId: 'class_6a1',
    className: '6A1',
    questions: GRADE6_QUESTIONS_FRACTIONS,
    durationMinutes: 30,
    deadline: '2026-09-30T23:59:59',
    allowViewResult: true,
    assignmentCode: 'TOAN6A1-8K4P',
    createdAt: '2026-08-20T08:00:00Z',
    isPublished: true
  },
  {
    id: 'asg_toan6_hinhhoc',
    title: 'Toán 6 – Hình học trực quan & Đo lường',
    grade: '6',
    topic: 'Hình học: Tam giác đều, Hình vuông & Góc',
    classId: 'class_6a1',
    className: '6A1',
    questions: GRADE6_QUESTIONS_GEOMETRY,
    durationMinutes: 20,
    deadline: '2026-09-30T23:59:59',
    allowViewResult: true,
    assignmentCode: 'TOAN6-HINH1',
    createdAt: '2026-08-21T09:00:00Z',
    isPublished: true
  }
];
