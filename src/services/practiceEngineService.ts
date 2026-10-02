/**
 * Practice Engine Service - TOÁN THCS
 * Hệ sinh thái Tự Luyện 3 Tầng thông minh dành cho Học sinh:
 * - Tầng 1: Khai thác Ngân hàng câu hỏi thực tế từ hơn 100 đề của Thầy/Cô
 * - Tầng 2: Biến hóa hoán vị phương án A, B, C, D & thay đổi số liệu ngẫu nhiên chống học vẹt
 * - Tầng 3: AI Gemini tự động bù đắp câu hỏi còn thiếu theo đúng chuẩn SGK Kết nối tri thức
 */

import { Assignment, Question, GradeLevel } from '../types';
import { StorageService } from './storageService';
import { FirestoreService } from './firestoreService';
import { aiService } from './aiService';
import { ExamGeneratorService } from './examGeneratorService';

export type PracticeScope = 'topic' | 'gk1' | 'hk1' | 'gk2' | 'hk2';

export interface AssemblePracticeOptions {
  grade: GradeLevel;
  topic: string;
  scope: PracticeScope;
  targetCount: number;
  difficulty: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao' | 'Hỗn hợp';
  onStepProgress?: (stepText: string) => void;
}

export interface AssemblePracticeResult {
  questions: Question[];
  fromTeacherCount: number;
  fromAiCount: number;
  sourceSummary: string;
  sourceExamTitles: string[];
}

// Bảng từ khóa nhận diện chuyên đề chuẩn SGK Kết nối tri thức
const TOPIC_KEYWORD_MAP: Record<string, string[]> = {
  // Lớp 6
  'số tự nhiên': ['tự nhiên', 'chia hết', 'ước', 'bội', 'nguyên tố', 'lũy thừa', 'tập hợp'],
  'số nguyên': ['số nguyên', 'nguyên âm', 'nguyên dương', 'âm', 'dương', 'bội của', 'ước của'],
  'phân số': ['phân số', 'rút gọn', 'quy đồng', 'tử số', 'mẫu số', 'hỗn số'],
  'số thập phân': ['thập phân', 'tỉ số', 'phần trăm', '%', 'làm tròn'],
  'hình phẳng': ['tam giác đều', 'hình vuông', 'lục giác', 'hình thoi', 'hình thang', 'bình hành', 'chu vi', 'diện tích'],
  'đối xứng': ['trục đối xứng', 'tâm đối xứng', 'đối xứng'],
  'thống kê': ['biểu đồ', 'dữ liệu', 'bảng số liệu', 'xác suất', 'thực nghiệm'],

  // Lớp 7
  'số hữu tỉ': ['hữu tỉ', 'phân số', 'số thập phân', 'lũy thừa', 'tỉ lệ'],
  'số thực': ['số thực', 'căn bậc hai', 'vô tỉ', 'số vô tỉ', 'làm tròn'],
  'tỉ lệ thức': ['tỉ lệ thức', 'dãy tỉ số', 'tỉ lệ thuận', 'tỉ lệ nghịch', 'đại lượng'],
  'biểu thức': ['biểu thức đại số', 'đa thức một biến', 'nghiệm', 'bậc của đa thức', 'hệ số'],
  'góc': ['đối đỉnh', 'so le trong', 'đồng vị', 'song song', 'định lý'],
  'tam giác': ['tam giác bằng nhau', 'c-c-c', 'c-g-c', 'g-c-g', 'tam giác cân', 'tam giác vuông', 'pythagore', 'đường trung trực'],

  // Lớp 8
  'đa thức': ['đa thức', 'đơn thức', 'bậc của', 'thu gọn', 'hệ số', 'cộng trừ đa thức', 'nhân đơn thức'],
  'hằng đẳng thức': ['hằng đẳng thức', 'bình phương', 'lập phương', 'hiệu hai bình phương', 'khai triển'],
  'nhân tử': ['nhân tử', 'phân tích đa thức', 'đặt nhân tử chung', 'nhóm hạng tử'],
  'phân thức': ['phân thức', 'rút gọn phân thức', 'mẫu thức', 'quy đồng'],
  'phương trình': ['phương trình bậc nhất', 'giải phương trình', 'tập nghiệm', 'nghiệm của'],
  'hàm số': ['hàm số', 'y = ax', 'đồ thị', 'hệ số góc', 'cắt trục'],
  'tứ giác': ['tứ giác', 'hình thang', 'thang cân', 'bình hành', 'chữ nhật', 'hình thoi', 'hình vuông'],
  'thalès': ['thalès', 'thales', 'định lý thales', 'đường trung bình', 'tỉ số đoạn thẳng'],
  'đồng dạng': ['đồng dạng', 'tam giác đồng dạng', 'tỉ số đồng dạng'],

  // Lớp 9
  'hệ phương trình': ['hệ phương trình', 'bậc nhất hai ẩn', 'phương pháp thế', 'phương pháp cộng'],
  'phương trình bậc hai': ['bậc hai', 'vi-ét', 'viète', 'viet', 'delta', 'biệt thức', 'nghiệm'],
  'căn thức': ['căn bậc hai', 'căn thức', 'trục căn thức', 'khử mẫu', 'rút gọn căn'],
  'hệ thức lượng': ['hệ thức lượng', 'tam giác vuông', 'sin', 'cos', 'tan', 'cot', 'tỉ số lượng giác'],
  'đường tròn': ['đường tròn', 'dây cung', 'tiếp tuyến', 'bán kính', 'đường kính', 'vị trí tương đối'],
  'tứ giác nội tiếp': ['nội tiếp', 'tứ giác nội tiếp', 'góc nội tiếp', 'góc ở tâm', 'cung'],
  'bất đẳng thức': ['bất đẳng thức', 'gtln', 'gtnn', 'cauchy', 'cực trị', 'lớn nhất', 'nhỏ nhất']
};

export class PracticeEngineService {
  /**
   * Tải toàn bộ danh sách đề thi hiện có (từ LocalStorage + Firestore)
   */
  static async loadAllAssignments(): Promise<Assignment[]> {
    const local = StorageService.getAssignments() || [];
    let cloud: Assignment[] = [];

    try {
      cloud = await FirestoreService.getExams();
    } catch (err) {
      console.warn('[PracticeEngine] Dùng kho đề Local (Cloud offline):', err);
    }

    // Gộp và loại trừ trùng lặp
    const map = new Map<string, Assignment>();
    local.forEach(a => {
      if (a && a.id) map.set(a.id, a);
    });
    cloud.forEach(a => {
      if (a && a.id && !map.has(a.id)) map.set(a.id, a);
    });

    return Array.from(map.values());
  }

  /**
   * Lọc kho câu hỏi của Thầy/Cô phù hợp với chuyên đề hoặc kỳ thi (GK/HK)
   */
  static filterTeacherQuestions(
    assignments: Assignment[],
    options: {
      grade: GradeLevel;
      topic: string;
      scope: PracticeScope;
    }
  ): { questions: Question[]; sourceExamTitles: string[] } {
    const { grade, topic, scope } = options;

    // Chỉ lấy đề thi thuộc đúng khối lớp
    const gradeAssignments = assignments.filter(a => String(a.grade) === String(grade));
    const matchedQuestions: Question[] = [];
    const sourceTitlesSet = new Set<string>();

    const cleanTopicLower = topic.toLowerCase();

    // Xác định bộ từ khóa tìm kiếm và từ khóa loại trừ (tránh nhận nhầm dạng bài đối nghịch)
    let searchKeywords: string[] = [];
    let excludeKeywords: string[] = [];

    // Xử lý các chuyên đề nhạy cảm dễ nhầm lẫn
    if (cleanTopicLower.includes('phân tích') || cleanTopicLower.includes('nhân tử')) {
      // Chủ đề PHÂN TÍCH ĐA THỨC THÀNH NHÂN TỬ:
      // Chỉ lấy các câu hỏi yêu cầu phân tích thành nhân tử / đặt nhân tử chung
      // Tuyệt đối loại bỏ các câu hỏi về phép nhân đa thức / khai triển tích
      searchKeywords = ['phân tích', 'thành nhân tử', 'nhân tử chung', 'nhóm hạng tử', 'thành tích'];
      excludeKeywords = ['kết quả của phép nhân', 'tích của đơn thức', 'tích của đa thức', 'thực hiện phép nhân', 'nhân đơn thức', 'nhân đa thức', 'khai triển tích'];
    } else if (cleanTopicLower.includes('nhân đơn thức') || cleanTopicLower.includes('nhân đa thức') || cleanTopicLower.includes('phép nhân')) {
      searchKeywords = ['nhân đơn thức', 'nhân đa thức', 'phép nhân', 'tích của'];
      excludeKeywords = ['phân tích đa thức thành nhân tử', 'thành nhân tử'];
    } else {
      searchKeywords = [cleanTopicLower];
      Object.entries(TOPIC_KEYWORD_MAP).forEach(([key, words]) => {
        if (cleanTopicLower.includes(key)) {
          searchKeywords.push(...words);
        }
      });
    }

    // Nếu là chế độ Giữa kỳ / Cuối kỳ:
    const isGK1 = scope === 'gk1';
    const isHK1 = scope === 'hk1';
    const isGK2 = scope === 'gk2';
    const isHK2 = scope === 'hk2';

    gradeAssignments.forEach(asg => {
      const asgTitle = (asg.title || '').toLowerCase();
      const asgTopic = (asg.topic || '').toLowerCase();

      // Kiểm tra đề có thuộc phạm vi ôn tập
      let isRelevantExam = false;

      if (scope === 'topic') {
        // Tìm theo chuyên đề: đề thi phải liên quan đến chuyên đề hoặc chứa câu hỏi thuộc chuyên đề
        isRelevantExam = searchKeywords.some(kw => asgTitle.includes(kw) || asgTopic.includes(kw));
      } else if (isGK1) {
        isRelevantExam = asgTitle.includes('giữa kì 1') || asgTitle.includes('giữa kỳ 1') || asgTitle.includes('gk1') ||
                         searchKeywords.some(kw => asgTitle.includes(kw) || asgTopic.includes(kw));
      } else if (isHK1) {
        isRelevantExam = asgTitle.includes('kì 1') || asgTitle.includes('kỳ 1') || asgTitle.includes('hk1');
      } else if (isGK2) {
        isRelevantExam = asgTitle.includes('giữa kì 2') || asgTitle.includes('giữa kỳ 2') || asgTitle.includes('gk2');
      } else if (isHK2) {
        isRelevantExam = asgTitle.includes('kì 2') || asgTitle.includes('kỳ 2') || asgTitle.includes('hk2');
      } else {
        isRelevantExam = true;
      }

      if (isRelevantExam && asg.questions && asg.questions.length > 0) {
        asg.questions.forEach(q => {
          // Chỉ lấy câu trắc nghiệm có từ 2 phương án trở lên
          if (q.type === 'multiple_choice' || (q.options && q.options.length >= 2)) {
            const qText = (q.question || '').toLowerCase();
            const qHint = (q.topicHint || '').toLowerCase();

            // Nếu câu chứa từ khóa loại trừ của chủ đề hiện tại -> Bỏ qua ngay
            if (excludeKeywords.length > 0 && excludeKeywords.some(ex => qText.includes(ex) || qHint.includes(ex))) {
              return;
            }

            let isMatch = false;
            if (scope === 'topic') {
              // Đối soát trực tiếp vào nội dung câu hỏi hoặc gợi ý chủ đề của câu (không chỉ dựa vào tiêu đề đề thi chung)
              isMatch = searchKeywords.some(kw => qText.includes(kw) || qHint.includes(kw));
            } else {
              isMatch = true;
            }

            if (isMatch) {
              matchedQuestions.push({
                ...q,
                topicHint: q.topicHint || asg.topic || topic
              });
              if (asg.title) sourceTitlesSet.add(asg.title);
            }
          }
        });
      }
    });

    // Loại trừ câu hỏi trùng lặp theo nội dung câu hỏi
    const uniqueQuestions: Question[] = [];
    const seenTexts = new Set<string>();

    matchedQuestions.forEach(q => {
      const normalizedText = q.question.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!seenTexts.has(normalizedText) && normalizedText.length > 10) {
        seenTexts.add(normalizedText);
        uniqueQuestions.push(q);
      }
    });

    return {
      questions: uniqueQuestions,
      sourceExamTitles: Array.from(sourceTitlesSet).slice(0, 5)
    };
  }

  /**
   * Lắp ráp Đề Tự Luyện 3 Tầng:
   * 1. Bốc câu hỏi từ Kho đề Thầy/Cô
   * 2. Hoán vị phương án A, B, C, D & xáo trộn thứ tự
   * 3. Gọi AI bù đắp nếu kho chưa đủ số lượng câu yêu cầu
   */
  static async assemble3LayerPracticeExam(
    options: AssemblePracticeOptions
  ): Promise<AssemblePracticeResult> {
    const { grade, topic, scope, targetCount, difficulty, onStepProgress } = options;

    if (onStepProgress) {
      onStepProgress('Đang quét kho đề thi của Thầy/Cô để tìm câu hỏi phù hợp...');
    }

    // TẦNG 1: RÚT TRÍCH TỪ KHO ĐỀ CỦA THẦY/CÔ
    const allAssignments = await this.loadAllAssignments();
    const { questions: teacherPool, sourceExamTitles } = this.filterTeacherQuestions(allAssignments, {
      grade,
      topic,
      scope
    });

    // Chọn ngẫu nhiên tối đa targetCount câu từ kho Thầy/Cô
    const shuffledTeacherPool = [...teacherPool].sort(() => Math.random() - 0.5);
    const selectedTeacherQuestions = shuffledTeacherPool.slice(0, targetCount);

    // TẦNG 2: BIẾN HÓA HOÁN VỊ PHƯƠNG ÁN A, B, C, D
    const transformedTeacherQuestions: Question[] = selectedTeacherQuestions.map((q, idx) => {
      // Đảo ngẫu nhiên A, B, C, D để mỗi lần làm bài là một biến thể mới
      const shuffled = ExamGeneratorService.shuffleQuestionOptions(q);
      return {
        ...shuffled,
        id: `q_prac_t1_${Date.now()}_${idx + 1}`,
        order: idx + 1,
        topicHint: q.topicHint || topic
      };
    });

    const teacherCount = transformedTeacherQuestions.length;
    let finalQuestions: Question[] = [...transformedTeacherQuestions];
    let aiCount = 0;

    // TẦNG 3: AI GEMINI BÙ ĐẮP NẾU CÒN THIẾU CÂU
    const missingCount = targetCount - teacherCount;

    if (missingCount > 0) {
      if (onStepProgress) {
        onStepProgress(
          teacherCount > 0
            ? `Đã lấy ${teacherCount} câu từ kho đề Thầy/Cô. Đang nhờ AI biên soạn bổ sung ${missingCount} câu còn thiếu...`
            : `Đang nhờ AI biên soạn ${missingCount} câu hỏi chuẩn SGK Kết nối tri thức...`
        );
      }

      // Gọi AI Service để biên soạn câu hỏi (sử dụng Gemini AI nếu có key, hoặc Smart Engine chuẩn SGK nếu chưa có key)
      try {
        const aiGenerated = await aiService.generateQuestions({
          grade,
          topic,
          count: missingCount,
          difficulty
        });

        if (aiGenerated && aiGenerated.length > 0) {
          aiGenerated.forEach((aiQ, idx) => {
            finalQuestions.push({
              ...aiQ,
              id: `q_prac_ai_${Date.now()}_${idx + 1}`,
              order: finalQuestions.length + 1,
              topicHint: topic
            });
          });
          aiCount = aiGenerated.length;
        }
      } catch (aiErr) {
        console.warn('[PracticeEngine] AI không thể bù đắp lúc này, dùng cơ chế hoán vị nhân bản:', aiErr);
      }

      // Nếu vẫn còn thiếu câu và trong kho đề có câu hỏi đúng chuyên đề:
      // Nhân bản thêm từ kho sẵn có với hoán vị phương án để đủ đúng targetCount
      if (finalQuestions.length < targetCount && teacherPool.length > 0) {
        let loopIdx = 0;
        while (finalQuestions.length < targetCount) {
          const baseQ = teacherPool[loopIdx % teacherPool.length];
          const cloned = ExamGeneratorService.shuffleQuestionOptions(baseQ);
          finalQuestions.push({
            ...cloned,
            id: `q_prac_clone_${Date.now()}_${finalQuestions.length + 1}`,
            order: finalQuestions.length + 1
          });
          loopIdx++;
        }
      }
    }

    // Đánh số lại thứ tự 1..N và xáo trộn tổng thể
    finalQuestions = finalQuestions.map((q, idx) => ({
      ...q,
      order: idx + 1
    }));

    // Tóm tắt nguồn gốc đề thi
    let sourceSummary = '';
    if (teacherCount > 0 && aiCount > 0) {
      sourceSummary = `Đề thi tích hợp: ${teacherCount} câu từ Ngân hàng đề Thầy/Cô + ${aiCount} câu do AI bổ sung.`;
    } else if (teacherCount > 0) {
      sourceSummary = `Đề thi trích xuất 100% (${teacherCount} câu) từ Ngân hàng đề của Thầy/Cô.`;
    } else {
      sourceSummary = `Đề thi được biên soạn 100% bởi Trợ lý AI theo chuẩn SGK Kết nối tri thức.`;
    }

    return {
      questions: finalQuestions,
      fromTeacherCount: teacherCount,
      fromAiCount: aiCount,
      sourceSummary,
      sourceExamTitles
    };
  }
}
