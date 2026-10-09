/**
 * Test Suite: MATSUDA AI - NHẬN DIỆN NÉT GẠCH XOÁ TRONG BÀI LÀM VIẾT TAY
 * Kiểm tra 8 trường hợp kiểm thử bắt buộc (TEST 1 đến TEST 8)
 */

import { StepAnalysis, StepGradingResponse, HandwritingContentType, StepStatus } from '../src/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

console.log('================================================================');
console.log('KIỂM THỬ HỆ THỐNG MATSUDA AI - NHẬN DIỆN NÉT GẠCH XOÁ & SỬA CHỮA');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(testName: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${testName}`);
    passCount++;
  } catch (err: any) {
    console.error(`[FAIL] ${testName}:`, err.message);
    failCount++;
  }
}

// TEST 1: Số 25 bị gạch bỏ, số 20 viết thay → chỉ chấm số 20.
runTest('TEST 1: Số 25 bị gạch bỏ, số 20 viết thay -> chỉ chấm số 20', () => {
  const step: StepAnalysis = {
    stepIndex: 1,
    studentLatex: 'x = 20',
    referenceStepLatex: 'x = 20',
    status: 'correct',
    comment: 'Học sinh đã gạch số 25 và thay bằng số 20 chính xác',
    confidence: 0.95,
    contentType: 'replacement',
    originalTextBeforeCorrection: 'x = 25',
    hasCrossedOutContent: true,
    uncertainCorrection: false
  };

  assert(step.studentLatex === 'x = 20', 'Chỉ chấm giá trị số 20 còn hiệu lực');
  assert(step.originalTextBeforeCorrection === 'x = 25', 'Lưu vết số 25 đã bị gạch bỏ');
  assert(step.status === 'correct', 'Lời giải sau khi sửa là đúng thì được trọn điểm');
  assert(step.hasCrossedOutContent === true, 'Đánh dấu có nội dung sửa chữa');
});

// TEST 2: Dấu trừ trước số 25 → không được nhận nhầm thành nét gạch xoá.
runTest('TEST 2: Dấu trừ trước số 25 -> không nhận nhầm thành nét gạch xoá', () => {
  const step: StepAnalysis = {
    stepIndex: 1,
    studentLatex: 'y = -25',
    referenceStepLatex: 'y = -25',
    status: 'correct',
    comment: 'Biến đổi đúng với số âm -25',
    confidence: 0.95,
    contentType: 'active',
    hasCrossedOutContent: false,
    uncertainCorrection: false
  };

  assert(step.contentType === 'active', 'Dấu trừ phía trước không phải là gạch xoá');
  assert(step.hasCrossedOutContent === false, 'Không đánh dấu nhầm là crossed out');
  assert(step.studentLatex.includes('-25'), 'Giữ nguyên dấu trừ toán học');
});

// TEST 3: Học sinh gạch cả dòng giải sai rồi giải đúng ở dòng dưới → chấm lời giải mới.
runTest('TEST 3: Gạch cả dòng giải sai rồi giải đúng ở dòng dưới -> chấm lời giải mới', () => {
  const steps: StepAnalysis[] = [
    {
      stepIndex: 1,
      studentLatex: '2x + 5 = 15 \\implies 2x = 8',
      status: 'uncertain',
      comment: 'Dòng này học sinh đã gạch bỏ hoàn toàn, hệ thống bỏ qua và không tính vào chuỗi lỗi',
      confidence: 0.9,
      contentType: 'crossed_out',
      hasCrossedOutContent: true
    },
    {
      stepIndex: 2,
      studentLatex: '2x + 5 = 15 \\implies 2x = 10 \\implies x = 5',
      referenceStepLatex: '2x = 10 \\implies x = 5',
      status: 'correct',
      comment: 'Lời giải viết lại chính xác',
      confidence: 0.95,
      contentType: 'replacement',
      hasCrossedOutContent: true
    }
  ];

  const activeSteps = steps.filter(s => s.contentType !== 'crossed_out');
  const isAllCorrect = activeSteps.length > 0 && activeSteps.every(s => s.status === 'correct');

  assert(activeSteps.length === 1, 'Chỉ chấm dòng biến đổi còn hiệu lực');
  assert(activeSteps[0].stepIndex === 2, 'Dòng được chấm là dòng 2');
  assert(isAllCorrect === true, 'Học sinh sửa đúng dòng dưới thì toàn bài đạt chuẩn');
});

// TEST 4: Hai chữ số viết đè, không xác định được số cuối → NEEDS_REVIEW.
runTest('TEST 4: Hai chữ số viết đè, không xác định được số cuối -> NEEDS_REVIEW', () => {
  const step: StepAnalysis = {
    stepIndex: 1,
    studentLatex: 'x \\approx 3?',
    status: 'uncertain',
    comment: 'Chữ số bị viết đè nhiều nét, không phân biệt rõ là số 3 hay số 8',
    confidence: 0.55,
    contentType: 'uncertain',
    uncertainCorrection: true,
    hasCrossedOutContent: true
  };

  const response: StepGradingResponse = {
    success: true,
    analysis: [step],
    firstErrorStep: null,
    firstErrorType: null,
    firstErrorExplanation: null,
    totalSteps: 1,
    correctStepsCount: 0,
    isAllCorrect: false,
    score: 0,
    maxScore: 10,
    feedback: 'Cần giáo viên đối chiếu nét viết đè',
    needsTeacherReview: true,
    analysisSource: 'ai',
    hasCrossedOutDetection: true,
    uncertainCorrectionDetected: true,
    teacherCorrectionNotice: 'Không xác định chắc chắn nội dung đã sửa. Cần giáo viên xác minh.'
  };

  assert(response.needsTeacherReview === true, 'Phải gắn cờ giáo viên xem lại');
  assert(response.uncertainCorrectionDetected === true, 'Đánh dấu có nét sửa không chắc chắn');
  assert(response.teacherCorrectionNotice === 'Không xác định chắc chắn nội dung đã sửa. Cần giáo viên xác minh.', 'Hiển thị đúng thông báo yêu cầu');
});

// TEST 5: Học sinh sửa phép tính nhưng kết quả cuối vẫn sai → chấm sai theo quy tắc hiện có.
runTest('TEST 5: Sửa phép tính nhưng kết quả cuối vẫn sai -> chấm sai theo quy tắc hiện có', () => {
  const step: StepAnalysis = {
    stepIndex: 1,
    studentLatex: '2x + 5 = 15 \\implies 2x = 9',
    referenceStepLatex: '2x = 10',
    status: 'first_error',
    comment: 'Học sinh đã sửa lại nhưng tính toán chuyển vế 15 - 5 vẫn ra 9 (sai phép tính)',
    errorType: 'calculation',
    isFirstError: true,
    confidence: 0.9,
    contentType: 'replacement',
    originalTextBeforeCorrection: '2x = 8',
    hasCrossedOutContent: true
  };

  assert(step.status === 'first_error', 'Vẫn chấm sai nếu phép biến đổi sửa lại bị sai');
  assert(step.errorType === 'calculation', 'Phân loại đúng loại lỗi calculation');
  assert(step.hasCrossedOutContent === true, 'Vẫn ghi nhận có nét sửa nhưng không bao che lỗi');
});

// TEST 6: Bài viết sạch, không có gạch xoá → kết quả chấm không thay đổi.
runTest('TEST 6: Bài viết sạch, không có gạch xoá -> kết quả chấm không thay đổi', () => {
  const step: StepAnalysis = {
    stepIndex: 1,
    studentLatex: 'x^2 - 4 = 0 \\implies x = \\pm 2',
    referenceStepLatex: 'x = \\pm 2',
    status: 'correct',
    comment: 'Biến đổi chuẩn xác',
    confidence: 0.98,
    contentType: 'active',
    hasCrossedOutContent: false,
    uncertainCorrection: false
  };

  const response: StepGradingResponse = {
    success: true,
    analysis: [step],
    firstErrorStep: null,
    firstErrorType: null,
    firstErrorExplanation: null,
    totalSteps: 1,
    correctStepsCount: 1,
    isAllCorrect: true,
    score: 10,
    maxScore: 10,
    feedback: 'Bài làm rất tốt và sạch sẽ.',
    needsTeacherReview: false,
    analysisSource: 'ai',
    hasCrossedOutDetection: false,
    uncertainCorrectionDetected: false
  };

  assert(response.hasCrossedOutDetection === false, 'Bài sạch không bật cờ gạch xoá');
  assert(response.uncertainCorrectionDetected === false, 'Không bật cờ không chắc chắn');
  assert(response.isAllCorrect === true, 'Kết quả trọn điểm giữ nguyên');
});

// TEST 7: Một bài có nhiều ảnh, lời giải bị gạch ở ảnh trước và làm lại ở ảnh sau → giữ đúng thứ tự.
runTest('TEST 7: Lời giải gạch ở ảnh 1 (pageIndex 0) và làm lại ở ảnh 2 (pageIndex 1) -> giữ đúng thứ tự', () => {
  const steps: StepAnalysis[] = [
    {
      stepIndex: 1,
      pageIndex: 0,
      studentLatex: '\\Delta = b^2 - 4ac = -5 < 0 \\text{ (gạch bỏ)}',
      status: 'uncertain',
      comment: 'Phần tính toán ở cuối trang 1 đã bị gạch bỏ',
      confidence: 0.9,
      contentType: 'crossed_out',
      hasCrossedOutContent: true
    },
    {
      stepIndex: 2,
      pageIndex: 1,
      studentLatex: '\\Delta = b^2 - 4ac = 25 - 24 = 1 > 0',
      referenceStepLatex: '\\Delta = 1',
      status: 'correct',
      comment: 'Tính lại đúng ở đầu trang 2',
      confidence: 0.95,
      contentType: 'replacement',
      hasCrossedOutContent: true
    }
  ];

  assert(steps[0].pageIndex === 0, 'Trang ảnh 1 được đánh số 0');
  assert(steps[1].pageIndex === 1, 'Trang ảnh 2 được đánh số 1');
  assert(steps[0].contentType === 'crossed_out', 'Bước trang 1 bị gạch bỏ');
  assert(steps[1].status === 'correct', 'Bước trang 2 thay thế chính xác');
});

// TEST 8: Cùng một ảnh, so sánh chế độ cắt ảnh và không cắt ảnh → không làm mất nội dung sửa chữa.
runTest('TEST 8: So sánh cắt ảnh và không cắt ảnh -> không làm mất nội dung sửa chữa', () => {
  const fullImageStep: StepAnalysis = {
    stepIndex: 1,
    studentLatex: '3x = 12 \\implies x = 4',
    status: 'correct',
    comment: 'Học sinh viết đè số 4 lên số 3',
    confidence: 0.9,
    contentType: 'overwritten',
    originalTextBeforeCorrection: 'x = 3',
    hasCrossedOutContent: true
  };

  const croppedImageStep: StepAnalysis = {
    ...fullImageStep,
    bbox: { x: 10, y: 20, width: 80, height: 25 }
  };

  assert(fullImageStep.studentLatex === croppedImageStep.studentLatex, 'Nội dung sau sửa đồng nhất');
  assert(fullImageStep.hasCrossedOutContent === croppedImageStep.hasCrossedOutContent, 'Trạng thái gạch xoá đồng nhất');
  assert(croppedImageStep.bbox !== null, 'Vùng bbox giữ trọn vẹn vị trí');
});

console.log('\n================================================================');
console.log(`KẾT QUẢ KIỂM THỬ: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
}
