import assert from 'node:assert/strict';
import { getPrintableQuestionText } from '../src/utils/printExamUtils';

const samples: Array<[string, string]> = [
  ['Câu 16', ''],
  ['Câu 16. a) Nhiệt độ lúc 20 giờ là 2°C.', 'a) Nhiệt độ lúc 20 giờ là 2°C.'],
  ['Câu 16: a) Vào một buổi tối...\\nb) Tính chênh lệch.', 'a) Vào một buổi tối...\\nb) Tính chênh lệch.'],
  ['**Câu 4.** Tính \\(x+2\\).', 'Tính \\(x+2\\).'],
  ['Câu 5. (1 điểm): Tính x+2.', 'Tính x+2.'],
  ['a) x+12=-5\\nc) x-(-8)=4\\nh) 20-x=-12', 'a) x+12=-5\\nc) x-(-8)=4\\nh) 20-x=-12'],
  ['Tính nhiệt độ lúc 24 giờ.', 'Tính nhiệt độ lúc 24 giờ.']
];
for (const [source, expected] of samples) {
  assert.equal(getPrintableQuestionText(source), expected, source);
}
console.log('Print exam text normalization: 7 cases OK');
