/**
 * Competency Analysis Utility for TOÁN THCS
 * Phân tích ma trận năng lực học sinh theo 4 cấp độ tư duy chuẩn Bộ GD&ĐT:
 * 1. Nhận biết (Recognition)
 * 2. Thông hiểu (Comprehension)
 * 3. Vận dụng (Application)
 * 4. Vận dụng cao (Advanced Application)
 * Và bản đồ năng lực theo từng Chuyên đề Toán học (Đại số, Hình học, Thống kê).
 */

import { Assignment, Question, Submission } from '../types';

export type CognitiveLevel = 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';

export interface TopicCompetency {
  topic: string;
  category: 'algebra' | 'geometry' | 'statistics' | 'general';
  totalQuestions: number;
  questionIds: string[];
  averageAccuracy: number; // 0 - 100%
  status: 'mastered' | 'developing' | 'struggling'; // >= 80%: mastered (xanh), 50-79%: developing (vàng), < 50%: struggling (đỏ)
  strugglingStudents: { name: string; incorrectCount: number }[];
  passedStudentsCount: number;
}

export interface CognitiveCompetency {
  level: CognitiveLevel;
  description: string;
  questionCount: number;
  averageAccuracy: number; // 0 - 100%
  passedStudentsCount: number; // Số học sinh đạt chuẩn ở cấp độ này (đúng >= 70%)
}

export interface ClassCompetencyReport {
  assignmentId: string;
  assignmentTitle: string;
  className: string;
  totalStudents: number;
  submittedCount: number;
  overallAccuracy: number;
  cognitiveCompetencies: CognitiveCompetency[];
  topicCompetencies: TopicCompetency[];
  strugglingStudentsSummary: {
    studentName: string;
    weakTopics: string[];
    score: number;
  }[];
}

/**
 * Nhận diện cấp độ nhận thức của câu hỏi dựa trên từ khóa, gợi ý chuyên đề và thang điểm
 */
export function detectCognitiveLevel(q: Question): CognitiveLevel {
  const text = (q.question + ' ' + (q.topicHint || '') + ' ' + (q.explanation || '')).toLowerCase();

  // 1. Vận dụng cao: Điểm cao hoặc bài toán cực trị, min/max, bất đẳng thức, tham số m
  if (
    q.points >= 2 ||
    text.includes('giá trị nhỏ nhất') ||
    text.includes('giá trị lớn nhất') ||
    text.includes('bất đẳng thức') ||
    text.includes('với mọi m') ||
    text.includes('vận dụng cao') ||
    text.includes('min') ||
    text.includes('max')
  ) {
    return 'Vận dụng cao';
  }

  // 2. Vận dụng: Lập phương trình, bài toán thực tế, chứng minh hình học nhiều bước
  if (
    q.points > 1 ||
    text.includes('bài toán thực tế') ||
    text.includes('lập phương trình') ||
    text.includes('lập hệ phương trình') ||
    text.includes('chứng minh rằng') ||
    text.includes('vận dụng') ||
    text.includes('diện tích tam giác') ||
    text.includes('khoảng cách')
  ) {
    return 'Vận dụng';
  }

  // 3. Nhận biết: Nhận diện định nghĩa, phân số, kí hiệu, tập hợp, tính chất cơ bản
  if (
    text.includes('nhận biết') ||
    text.includes('phân số nào') ||
    text.includes('số nào sau đây') ||
    text.includes('kí hiệu nào') ||
    text.includes('căn bậc hai số học của') ||
    text.includes('đối đỉnh') ||
    text.includes('khẳng định nào sau đây đúng') ||
    text.includes('tập hợp các số') ||
    text.includes('bậc của đa thức') ||
    text.includes('hệ số của')
  ) {
    return 'Nhận biết';
  }

  // 4. Mặc định là Thông hiểu (áp dụng công thức tính toán đơn giản, tìm x, rút gọn)
  return 'Thông hiểu';
}

/**
 * Phân loại chuyên đề vào nhóm Đại số, Hình học, Xác suất thống kê
 */
export function categorizeTopic(topic: string): 'algebra' | 'geometry' | 'statistics' | 'general' {
  const t = (topic || '').toLowerCase();
  if (
    t.includes('hình') || 
    t.includes('góc') || 
    t.includes('tam giác') || 
    t.includes('đường tròn') || 
    t.includes('tứ giác') || 
    t.includes('pythagore') || 
    t.includes('lượng giác') ||
    t.includes('hình chóp') ||
    t.includes('lăng trụ')
  ) {
    return 'geometry';
  }
  if (
    t.includes('thống kê') || 
    t.includes('xác suất') || 
    t.includes('biểu đồ') || 
    t.includes('dữ liệu')
  ) {
    return 'statistics';
  }
  if (
    t.includes('số') || 
    t.includes('đại số') || 
    t.includes('phân số') || 
    t.includes('căn bậc hai') || 
    t.includes('hàm số') || 
    t.includes('phương trình') || 
    t.includes('hệ phương trình') || 
    t.includes('đa thức')
  ) {
    return 'algebra';
  }
  return 'general';
}

/**
 * Tính toán báo cáo năng lực toàn diện của lớp học
 */
export function computeClassCompetencyReport(
  assignment: Assignment,
  submissions: Submission[]
): ClassCompetencyReport {
  const submittedCount = submissions.length;
  const questions = assignment.questions;

  // Bản đồ câu hỏi theo cấp độ nhận thức
  const cognitiveMap: Record<CognitiveLevel, Question[]> = {
    'Nhận biết': [],
    'Thông hiểu': [],
    'Vận dụng': [],
    'Vận dụng cao': []
  };

  questions.forEach(q => {
    const level = detectCognitiveLevel(q);
    cognitiveMap[level].push(q);
  });

  const levelDescriptions: Record<CognitiveLevel, string> = {
    'Nhận biết': 'Ghi nhớ định nghĩa, công thức toán học và nhận diện dạng bài cơ bản.',
    'Thông hiểu': 'Hiểu bản chất và vận dụng công thức tính toán cơ bản, tìm x, rút gọn biểu thức.',
    'Vận dụng': 'Giải bài toán tổng hợp, toán đố thực tế và chứng minh hình học nhiều bước.',
    'Vận dụng cao': 'Tư duy logic nâng cao, bài toán cực trị, bất đẳng thức và phân hóa học sinh giỏi.'
  };

  const cognitiveCompetencies: CognitiveCompetency[] = (
    ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'] as CognitiveLevel[]
  ).map(level => {
    const levelQuestions = cognitiveMap[level];
    const qIds = new Set(levelQuestions.map(q => q.id));

    if (levelQuestions.length === 0 || submittedCount === 0) {
      return {
        level,
        description: levelDescriptions[level],
        questionCount: levelQuestions.length,
        averageAccuracy: 0,
        passedStudentsCount: 0
      };
    }

    let totalCorrectInLevel = 0;
    let passedCount = 0;

    submissions.forEach(sub => {
      let subCorrect = 0;
      sub.answers.forEach(ans => {
        if (qIds.has(ans.questionId) && ans.isCorrect) {
          subCorrect++;
          totalCorrectInLevel++;
        }
      });
      if (subCorrect / levelQuestions.length >= 0.7) {
        passedCount++;
      }
    });

    const averageAccuracy = Math.round(
      (totalCorrectInLevel / (submittedCount * levelQuestions.length)) * 100
    );

    return {
      level,
      description: levelDescriptions[level],
      questionCount: levelQuestions.length,
      averageAccuracy,
      passedStudentsCount: passedCount
    };
  });

  // Gom nhóm theo Chuyên đề (Topic Hint)
  const topicMap: Record<string, Question[]> = {};
  questions.forEach((q, idx) => {
    const topicKey = (q.topicHint || assignment.topic || `Chuyên đề ${idx + 1}`).trim();
    if (!topicMap[topicKey]) {
      topicMap[topicKey] = [];
    }
    topicMap[topicKey].push(q);
  });

  const topicCompetencies: TopicCompetency[] = Object.entries(topicMap).map(([topic, tQuestions]) => {
    const qIds = new Set(tQuestions.map(q => q.id));
    let totalCorrect = 0;
    const studentWrongCount: Record<string, number> = {};
    let passedCount = 0;

    submissions.forEach(sub => {
      let correctForStudent = 0;
      sub.answers.forEach(ans => {
        if (qIds.has(ans.questionId)) {
          if (ans.isCorrect) {
            correctForStudent++;
            totalCorrect++;
          } else {
            studentWrongCount[sub.studentName] = (studentWrongCount[sub.studentName] || 0) + 1;
          }
        }
      });
      if (correctForStudent / tQuestions.length >= 0.7) {
        passedCount++;
      }
    });

    const averageAccuracy = submittedCount > 0
      ? Math.round((totalCorrect / (submittedCount * tQuestions.length)) * 100)
      : 0;

    let status: 'mastered' | 'developing' | 'struggling' = 'developing';
    if (averageAccuracy >= 80) status = 'mastered';
    else if (averageAccuracy < 50) status = 'struggling';

    const strugglingStudents = Object.entries(studentWrongCount)
      .map(([name, count]) => ({ name, incorrectCount: count }))
      .sort((a, b) => b.incorrectCount - a.incorrectCount);

    return {
      topic,
      category: categorizeTopic(topic),
      totalQuestions: tQuestions.length,
      questionIds: tQuestions.map(q => q.id),
      averageAccuracy,
      status,
      strugglingStudents,
      passedStudentsCount: passedCount
    };
  });

  // Tỉ lệ chính xác toàn bài
  let grandTotalCorrect = 0;
  submissions.forEach(s => {
    grandTotalCorrect += s.correctCount;
  });
  const overallAccuracy = submittedCount > 0 && questions.length > 0
    ? Math.round((grandTotalCorrect / (submittedCount * questions.length)) * 100)
    : 0;

  // Tổng hợp học sinh cần phụ đạo & các chuyên đề yếu tương ứng
  const strugglingStudentsSummary = submissions
    .filter(s => s.totalScore < 6.5)
    .map(s => {
      const weakTopics: string[] = [];
      topicCompetencies.forEach(tc => {
        const found = tc.strugglingStudents.find(st => st.name === s.studentName);
        if (found && found.incorrectCount > 0) {
          weakTopics.push(tc.topic);
        }
      });
      return {
        studentName: s.studentName,
        weakTopics,
        score: s.totalScore
      };
    })
    .sort((a, b) => a.score - b.score);

  return {
    assignmentId: assignment.id,
    assignmentTitle: assignment.title,
    className: assignment.className || 'Lớp học',
    totalStudents: submittedCount,
    submittedCount,
    overallAccuracy,
    cognitiveCompetencies,
    topicCompetencies,
    strugglingStudentsSummary
  };
}
