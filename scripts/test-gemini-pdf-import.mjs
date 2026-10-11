import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditNewMediaQuestions, findEmptyEssaySubparts, resolveGeminiEssayReference
} from '../src/utils/mediaImportGuard.ts';

const make = (order, type, question, correctAnswer, points) =>
  ({ order, type, question, correctAnswer, points, explanation: '', rubric: '' });

const choices = 'C B B D B A A B B C'.split(' ');
const mc = choices.map((answer, i) => make(i + 1, 'multiple_choice', 'Câu ' + (i + 1), answer, 0.3));
const essay = [
  make(11, 'essay', 'Bài 1. Tính:\na) 85-(85-24)\nb) (-142)+(142-59)\nc) 215-(-35+215)\nd) (48-72)-(48-72-100)', 'a) 24; b) -59; c) 35; d) 100', 2),
  make(12, 'essay', 'Bài 2. Tính hợp lí:\na) (245-99)-245\nb) (-85)-(15-85)\nc) 521-(21+150)\nd) (2024-187)-(2024+13)\ne) -(-25+43-17)-(25-43+17)', 'a) -99; b) -15; c) 350; d) -200; e) 0', 2),
  make(13, 'essay', 'Bài 3. Tìm x:\na) x-(12-7)=15\nb) 35-(x+5)=20\nc) (x-18)-(-30)=12\nd) 25-(25-x)=-44', 'a) 20; b) 10; c) 0; d) -44', 2),
  make(14, 'essay', 'Bài 4. Rút gọn:\na) (a+b)-(a-b)\nb) -(x-y+z)+(x-y-z)\nc) (m-n+p)-(m+n-p)\nd) Chứng minh P=Q', 'a) 2b; b) -2z; c) -2n+2p; d) P=Q', 1)
];

test('Đề PDF mẫu: 10 trắc nghiệm + 4 tự luận, tổng 10 điểm', () => {
  const all = [...mc, ...essay];
  assert.equal(all.length, 14);
  assert.equal(all.reduce((sum, q) => sum + q.points, 0), 10);
  assert.deepEqual(auditNewMediaQuestions(all, { expectedQuestionCount: 14, declaredTotalPoints: 10 }), []);
});

test('Bài 2 bị mất cả a)-e) phải chặn nhập', () => {
  const q = { ...essay[1], question: 'Tính hợp lí:\na)\nb)\nc)\nd)\ne)' };
  assert.deepEqual(findEmptyEssaySubparts(q.question), ['a)', 'b)', 'c)', 'd)', 'e)']);
  assert.ok(auditNewMediaQuestions([q]).some(issue => issue.level === 'error'));
});

test('Phát hiện chỉ một ý b) trống', () => {
  assert.deepEqual(findEmptyEssaySubparts('a) 2+3\nb) (TH)\nc) 3+5'), ['b)']);
});

test('Không báo sai khi mọi biểu thức đã đủ', () => {
  assert.deepEqual(findEmptyEssaySubparts('a) $\\frac{1}{2}$\nb) $-(-25+43-17)$\nc) 25-(25-x)'), []);
});

test('Giữ nguyên đáp án tự luận có sẵn', () => {
  const answer = 'a) -99; b) -15; c) 350; d) -200; e) 0';
  assert.equal(resolveGeminiEssayReference({correctAnswer: answer}), answer);
  assert.equal(resolveGeminiEssayReference({correctAnswer: '', explanation: 'a) 24; b) -59'}), 'a) 24; b) -59');
  assert.equal(resolveGeminiEssayReference({answer: '0'}), '0');
  assert.equal(resolveGeminiEssayReference({}), '');
});

test('Cảnh báo tự luận không có đáp án', () => {
  const q = { ...essay[1], correctAnswer: '', explanation: '', rubric: '' };
  assert.ok(auditNewMediaQuestions([q]).some(issue => issue.level === 'warning'));
});

test('Thiếu câu hoặc sai tổng điểm phải được báo', () => {
  const issues = auditNewMediaQuestions([...mc, ...essay.slice(0, 3)], { expectedQuestionCount: 14, declaredTotalPoints: 10 });
  assert.ok(issues.some(issue => issue.level === 'error' && issue.order === 0));
  assert.ok(issues.some(issue => issue.level === 'warning' && issue.order === 0));
});

test('Phát hiện câu trùng thứ tự', () => {
  const issues = auditNewMediaQuestions([mc[0], { ...mc[1], order: 1 }]);
  assert.ok(issues.some(issue => issue.level === 'error' && issue.order === 0));
});
