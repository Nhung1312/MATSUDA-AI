/**
 * Grading Service for TOÁN THCS
 * Cung cấp giải thuật tự động chấm điểm, tính phân tích phổ điểm, tỷ lệ đúng/sai từng câu.
 * Hỗ trợ cả câu trắc nghiệm, trả lời ngắn và câu tự luận có đính kèm ảnh bài làm học sinh.
 */

import { Assignment, Submission, StudentAnswer, AssignmentStats, QuestionAnalysis, ViolationEvent, Contest, ContestSubmission, Question } from '../types';
import { isEssayQuestion } from '../utils/questionUtils';

export class GradingService {
  /**
   * Kiểm tra tính đúng/sai của câu trắc nghiệm với cơ chế so khớp đa tầng thông minh
   * Đảm bảo không bị lệch do chữ hoa/thường, khoảng trắng, dấu chấm, đảo đề hoặc lưu text thay vì nhãn.
   */
  static evaluateMultipleChoiceAnswer(
    q: Question,
    selected: string
  ): { isCorrect: boolean; isUnanswered: boolean; selectedOptionText?: string; originalSelectedLabel?: string } {
    const rawSelected = (selected || '').trim();
    if (!rawSelected) {
      return { isCorrect: false, isUnanswered: true };
    }

    const cleanSelected = rawSelected.toUpperCase();
    const cleanCorrect = (q.correctAnswer || '').trim().toUpperCase();

    // 1. Tìm option mà học sinh đã chọn trong danh sách câu hỏi
    const matchedOption = q.options?.find(opt => {
      const optId = (opt.id || '').trim().toUpperCase();
      const optOriginalId = ((opt as any).originalId || '').trim().toUpperCase();
      const optText = (opt.text || '').trim().toUpperCase();
      return optId === cleanSelected || optOriginalId === cleanSelected || (optText && optText === cleanSelected);
    });

    const selectedOptionText = matchedOption ? matchedOption.text : undefined;
    const originalSelectedLabel = (matchedOption as any)?.originalId || matchedOption?.id || rawSelected;

    // 2. So khớp trực tiếp mã đáp án (vd: 'A' === 'A')
    if (cleanSelected === cleanCorrect) {
      return { isCorrect: true, isUnanswered: false, selectedOptionText, originalSelectedLabel };
    }

    // 3. Chuẩn hóa bỏ dấu chấm, ngoặc, khoảng trắng (vd: "A." so với "A")
    const strippedSelected = cleanSelected.replace(/[^A-Z0-9]/g, '');
    const strippedCorrect = cleanCorrect.replace(/[^A-Z0-9]/g, '');
    if (strippedSelected && strippedSelected === strippedCorrect) {
      return { isCorrect: true, isUnanswered: false, selectedOptionText, originalSelectedLabel };
    }

    // 4. Nếu q.correctAnswer là nhãn đề gốc (originalId), hoặc là text của phương án đúng
    if (matchedOption) {
      const optOriginalId = ((matchedOption as any).originalId || '').trim().toUpperCase();
      if (optOriginalId && optOriginalId === cleanCorrect) {
        return { isCorrect: true, isUnanswered: false, selectedOptionText, originalSelectedLabel };
      }

      const optText = (matchedOption.text || '').trim().toUpperCase();
      if (optText && optText === cleanCorrect) {
        return { isCorrect: true, isUnanswered: false, selectedOptionText, originalSelectedLabel };
      }
    }

    // 5. Kiểm tra nếu q.correctAnswer thực chất trỏ tới phương án mà học sinh vừa chọn
    const correctOption = q.options?.find(opt => {
      const optId = (opt.id || '').trim().toUpperCase();
      const optOriginalId = ((opt as any).originalId || '').trim().toUpperCase();
      const optText = (opt.text || '').trim().toUpperCase();
      return optId === cleanCorrect || optOriginalId === cleanCorrect || (optText && optText === cleanCorrect);
    });

    if (matchedOption && correctOption && matchedOption === correctOption) {
      return { isCorrect: true, isUnanswered: false, selectedOptionText, originalSelectedLabel };
    }

    // 6. Nếu cả 2 đều có nội dung text trùng nhau (không rỗng)
    if (
      matchedOption &&
      correctOption &&
      matchedOption.text.trim() &&
      matchedOption.text.trim().toLowerCase() === correctOption.text.trim().toLowerCase()
    ) {
      return { isCorrect: true, isUnanswered: false, selectedOptionText, originalSelectedLabel };
    }

    return { isCorrect: false, isUnanswered: false, selectedOptionText, originalSelectedLabel };
  }

  /**
   * Đánh giá câu trả lời ngắn / điền số với hỗ trợ dấu phẩy thập phân
   */
  static evaluateShortAnswer(
    q: Question,
    selected: string
  ): { isCorrect: boolean; isUnanswered: boolean } {
    const rawSelected = (selected || '').trim();
    if (!rawSelected) {
      return { isCorrect: false, isUnanswered: true };
    }

    const cleanSelected = rawSelected.replace(/\s+/g, '').toLowerCase();
    const cleanCorrect = (q.correctAnswer || '').replace(/\s+/g, '').toLowerCase();

    if (cleanSelected === cleanCorrect) {
      return { isCorrect: true, isUnanswered: false };
    }

    const numSelected = Number(cleanSelected.replace(',', '.'));
    const numCorrect = Number(cleanCorrect.replace(',', '.'));
    if (!isNaN(numSelected) && !isNaN(numCorrect) && Math.abs(numSelected - numCorrect) < 0.0001) {
      return { isCorrect: true, isUnanswered: false };
    }

    return { isCorrect: false, isUnanswered: false };
  }

  /**
   * Tự động chấm bài nộp Cuộc thi (Contest)
   */
  static gradeContestSubmission(params: {
    contest: Contest;
    studentAnswers: Record<string, string>;
    studentSolutions?: Record<string, string>;
    essayImagesByQuestion?: Record<string, string[]>;
    studentName: string;
    studentClass: string;
    studentId?: string;
    startedAt: string;
    submittedAt: string;
    tabSwitchCount?: number;
    violationEvents?: ViolationEvent[];
    isShuffled?: boolean;
    attemptNumber?: number;
    aiFeedbacks?: Record<string, { score?: number; feedback?: string; graded?: boolean }>;
  }): ContestSubmission {
    const {
      contest,
      studentAnswers,
      studentSolutions = {},
      essayImagesByQuestion = {},
      studentName,
      studentClass,
      studentId,
      startedAt,
      submittedAt,
      tabSwitchCount = 0,
      violationEvents = [],
      isShuffled = false,
      attemptNumber = 1,
      aiFeedbacks = {}
    } = params;

    let earnedMcqPoints = 0;
    let earnedEssayPoints = 0;
    let earnedTotalPoints = 0;
    let maxPointsTotal = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    let hasEssay = false;
    let isEssayGraded = true;

    const answers: StudentAnswer[] = contest.questions.map((q) => {
      const selected = (studentAnswers[q.id] || '').trim();
      const solutionText = (studentSolutions[q.id] || '').trim();
      const images = essayImagesByQuestion[q.id] || [];
      const aiEval = aiFeedbacks[q.id];
      const isEssay = isEssayQuestion(q);
      const questionPoints = q.points || 1.0;

      let isCorrect = false;
      let pointsEarned = 0;
      let isUnanswered = false;

      let selectedOptionText: string | undefined = undefined;
      let originalSelectedLabel: string | undefined = undefined;

      if (isEssay) {
        hasEssay = true;
        if (aiEval && typeof aiEval.score === 'number') {
          pointsEarned = Math.min(questionPoints, Math.max(0, aiEval.score));
          isCorrect = pointsEarned >= (questionPoints * 0.5);
          earnedEssayPoints += pointsEarned;
        } else {
          isEssayGraded = false;
          pointsEarned = 0;
          isCorrect = false;
        }
      } else if (q.type === 'short_answer') {
        const evalRes = GradingService.evaluateShortAnswer(q, selected);
        isUnanswered = evalRes.isUnanswered;
        isCorrect = evalRes.isCorrect;
        pointsEarned = isCorrect ? questionPoints : 0;
        earnedMcqPoints += pointsEarned;
      } else {
        // Multiple choice & True / False
        const evalRes = GradingService.evaluateMultipleChoiceAnswer(q, selected);
        isUnanswered = evalRes.isUnanswered;
        isCorrect = evalRes.isCorrect;
        selectedOptionText = evalRes.selectedOptionText;
        originalSelectedLabel = evalRes.originalSelectedLabel;
        pointsEarned = isCorrect ? questionPoints : 0;
        earnedMcqPoints += pointsEarned;
      }

      earnedTotalPoints += pointsEarned;
      maxPointsTotal += questionPoints;

      if (isUnanswered) {
        unansweredCount++;
      } else if (isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
      }

      return {
        questionId: q.id,
        selectedAnswer: selected,
        selectedOptionText,
        originalSelectedLabel,
        studentSolutionText: solutionText,
        essayImages: images,
        isCorrect,
        pointsEarned,
        maxPoints: questionPoints,
        aiFeedback: aiEval?.feedback,
        aiScore: aiEval?.score,
        aiGraded: aiEval?.graded
      };
    });

    // Thang điểm 10 chuẩn
    const rawScore = maxPointsTotal > 0 ? (earnedTotalPoints / maxPointsTotal) * 10 : 0;
    const finalScore = Math.round(rawScore * 10) / 10;

    const startTimeMs = new Date(startedAt).getTime();
    const endTimeMs = new Date(submittedAt).getTime();
    const timeSpentSeconds = Math.max(1, Math.round((endTimeMs - startTimeMs) / 1000));

    return {
      id: `csub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      contestId: contest.id,
      contestCode: contest.code,
      contestTitle: contest.title,
      studentName,
      studentClass,
      studentId: studentId || `student_${Date.now()}`,
      answers,
      totalScore: finalScore,
      maxScore: 10,
      mcqScore: Math.round(earnedMcqPoints * 10) / 10,
      essayScore: Math.round(earnedEssayPoints * 10) / 10,
      correctCount,
      wrongCount,
      unansweredCount,
      totalQuestions: contest.questions.length,
      startedAt,
      submittedAt,
      timeSpentSeconds,
      tabSwitchCount,
      violationEvents,
      attemptNumber,
      isShuffled,
      hasEssay,
      isEssayGraded
    };
  }

  /**
   * Tự động chấm bài làm của học sinh
   */
  static gradeSubmission(params: {
    assignment: Assignment;
    studentAnswers: Record<string, string>; // questionId -> selectedOption ('A' | 'B' | 'C' | 'D'...)
    studentSolutions?: Record<string, string>; // questionId -> text solution
    essayImagesByQuestion?: Record<string, string[]>; // questionId -> image base64 / urls
    generalEssayImages?: string[]; // exam level images
    studentName: string;
    studentId?: string;
    classId: string;
    className: string;
    startedAt: string;
    submittedAt: string;
    tabSwitchCount?: number;
    violationEvents?: ViolationEvent[];
    isShuffled?: boolean;
    aiFeedbacks?: Record<string, { score?: number; feedback?: string; graded?: boolean }>;
  }): Submission {
    const { 
      assignment, 
      studentAnswers, 
      studentSolutions = {},
      essayImagesByQuestion = {},
      generalEssayImages = [],
      studentName, 
      studentId, 
      classId, 
      className, 
      startedAt, 
      submittedAt,
      tabSwitchCount = 0,
      violationEvents = [],
      isShuffled = false,
      aiFeedbacks = {}
    } = params;

    let earnedPointsTotal = 0;
    let maxPointsTotal = 0;
    let earnedMcqPoints = 0;
    let maxMcqPoints = 0;
    let earnedEssayPoints = 0;
    let maxEssayPoints = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    const hasEssayQuestions = assignment.questions.some(q => isEssayQuestion(q));

    const answers: StudentAnswer[] = assignment.questions.map((q) => {
      const selected = (studentAnswers[q.id] || '').trim();
      const solutionText = (studentSolutions[q.id] || '').trim();
      const images = essayImagesByQuestion[q.id] || [];
      const aiEval = aiFeedbacks[q.id];

      const isEssay = isEssayQuestion(q);
      let isCorrect = false;
      let pointsEarned = 0;
      let isUnanswered = false;

      let selectedOptionText: string | undefined = undefined;
      let originalSelectedLabel: string | undefined = undefined;

      if (isEssay) {
        maxEssayPoints += q.points;
        // Với câu tự luận: nếu đã có điểm AI chấm
        if (aiEval && typeof aiEval.score === 'number') {
          pointsEarned = Math.min(q.points, Math.max(0, aiEval.score));
          isCorrect = pointsEarned >= (q.points * 0.5);
          earnedEssayPoints += pointsEarned;
        } else if (solutionText || images.length > 0 || selected) {
          // Đã có lời giải/ảnh nhưng chưa chấm
          pointsEarned = 0;
          isCorrect = false;
        } else {
          isUnanswered = true;
          pointsEarned = 0;
          isCorrect = false;
        }
      } else {
        maxMcqPoints += q.points;
        if (q.type === 'short_answer') {
          const evalRes = GradingService.evaluateShortAnswer(q, selected);
          isUnanswered = evalRes.isUnanswered;
          isCorrect = evalRes.isCorrect;
          pointsEarned = isCorrect ? q.points : 0;
        } else {
          // Trắc nghiệm & Đúng/Sai
          const evalRes = GradingService.evaluateMultipleChoiceAnswer(q, selected);
          isUnanswered = evalRes.isUnanswered;
          isCorrect = evalRes.isCorrect;
          selectedOptionText = evalRes.selectedOptionText;
          originalSelectedLabel = evalRes.originalSelectedLabel;
          pointsEarned = isCorrect ? q.points : 0;
        }
        earnedMcqPoints += pointsEarned;
      }

      earnedPointsTotal += pointsEarned;
      maxPointsTotal += q.points;

      if (isUnanswered) {
        unansweredCount++;
      } else if (isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
      }

      return {
        questionId: q.id,
        selectedAnswer: selected,
        selectedOptionText,
        originalSelectedLabel,
        studentSolutionText: solutionText,
        essayImages: images,
        isCorrect,
        pointsEarned,
        maxPoints: q.points,
        aiFeedback: aiEval?.feedback,
        aiScore: aiEval?.score,
        aiGraded: aiEval?.graded
      };
    });

    // Quy đổi điểm ra thang điểm 10 chuẩn
    const rawScore = maxPointsTotal > 0 ? (earnedPointsTotal / maxPointsTotal) * 10 : 0;
    const finalScore = Math.round(rawScore * 10) / 10; // làm tròn 1 chữ số thập phân
    const mcqScore = maxMcqPoints > 0 ? Math.round(((earnedMcqPoints / maxMcqPoints) * 10) * 10) / 10 : 0;

    const startTime = new Date(startedAt).getTime();
    const endTime = new Date(submittedAt).getTime();
    const timeSpentSeconds = Math.max(1, Math.round((endTime - startTime) / 1000));

    return {
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      classId,
      className,
      studentName,
      studentId,
      answers,
      totalScore: finalScore,
      maxScore: 10,
      hasEssayQuestions,
      gradingStatus: hasEssayQuestions ? 'pending_teacher_grading' : 'graded',
      mcqScore,
      mcqPoints: Math.round(earnedMcqPoints * 10) / 10,
      maxMcqPoints: Math.round(maxMcqPoints * 10) / 10,
      essayPoints: Math.round(earnedEssayPoints * 10) / 10,
      maxEssayPoints: Math.round(maxEssayPoints * 10) / 10,
      correctCount,
      wrongCount,
      unansweredCount,
      totalQuestions: assignment.questions.length,
      timeSpentSeconds,
      startedAt,
      submittedAt,
      essayImages: generalEssayImages,
      tabSwitchCount,
      violationEvents,
      isShuffled,
      shuffledQuestions: assignment.questions
    };
  }

  /**
   * Tính toán thống kê toàn diện cho giáo viên theo bài tập
   */
  static computeAssignmentStats(
    assignment: Assignment,
    totalClassStudents: number,
    submissions: Submission[]
  ): AssignmentStats {
    const submittedCount = submissions.length;
    const unsubmittedCount = Math.max(0, totalClassStudents - submittedCount);

    let sumScore = 0;
    let highestScore = 0;
    let lowestScore = submittedCount > 0 ? 10 : 0;

    submissions.forEach(sub => {
      sumScore += sub.totalScore;
      if (sub.totalScore > highestScore) highestScore = sub.totalScore;
      if (sub.totalScore < lowestScore) lowestScore = sub.totalScore;
    });

    const averageScore = submittedCount > 0 ? Math.round((sumScore / submittedCount) * 10) / 10 : 0;

    // Thống kê từng câu hỏi
    const questionAnalyses: QuestionAnalysis[] = assignment.questions.map((q) => {
      let correctCount = 0;
      let wrongCount = 0;
      const optionDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };

      submissions.forEach(sub => {
        const studentAns = sub.answers.find(a => a.questionId === q.id);
        if (studentAns) {
          if (studentAns.selectedAnswer) {
            const opt = studentAns.selectedAnswer.toUpperCase();
            optionDistribution[opt] = (optionDistribution[opt] || 0) + 1;
          }
          if (studentAns.isCorrect) {
            correctCount++;
          } else {
            wrongCount++;
          }
        } else {
          wrongCount++;
        }
      });

      const totalResponses = submissions.length;
      const accuracyRate = totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : 0;

      return {
        questionId: q.id,
        order: q.order,
        questionText: q.question,
        correctAnswer: q.correctAnswer,
        totalResponses,
        correctCount,
        wrongCount,
        accuracyRate,
        optionDistribution,
        topicHint: q.topicHint
      };
    });

    // Sắp xếp các câu học sinh sai nhiều nhất (accuracyRate thấp nhất)
    const mostMissedQuestions = [...questionAnalyses]
      .filter(q => q.accuracyRate < 65)
      .sort((a, b) => a.accuracyRate - b.accuracyRate);

    return {
      assignmentId: assignment.id,
      totalAssigned: totalClassStudents,
      submittedCount,
      unsubmittedCount,
      averageScore,
      highestScore,
      lowestScore,
      questionAnalyses,
      mostMissedQuestions
    };
  }

  static formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs} giây`;
    return `${mins} phút ${secs > 0 ? `${secs}s` : ''}`;
  }

  static formatTimeShort(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
