/** Chạy bằng: npx tsx scripts/test-pdf-answer-sections.ts */
import assert from 'node:assert/strict';
import { FileParserService } from '../src/services/fileParserService';
import { separatePdfAnswerSections } from '../src/utils/pdfAnswerSection';

const choices = ['C','B','B','D','B','A','A','B','B','C'];
const questions = choices.map((_,i) => 'Câu '+(i+1)+'. Tính giá trị biểu thức '+(i+1)+'+1.\nA. 1 B. 2 C. 3 D. 4').join('\n');
const statements = [
  'Bài 1. (2,0 điểm) Tính:\na) 85-(85-24)\nb) -142+(142-59)',
  'Bài 2. (2,0 điểm) Tính hợp lí:\na) (245-99)-245\nb) (-85)-(15-85)\nc) 521-(21+150)\nd) (2024-187)-(2024+13)\ne) -(-25+43-17)-(25-43+17)',
  'Bài 3. (2,0 điểm) Tìm x:\na) x-(12-7)=15\nb) 35-(x+5)=20',
  'Bài 4. (1,0 điểm) Rút gọn:\na) (a+b)-(a-b)\nb) -(x-y+z)+(x-y-z)'
].join('\n');
const answers = 'ĐÁP ÁN VÀ HƯỚNG DẪN GIẢI\nPHẦN I. TRẮC NGHIỆM\n'
 + choices.map((letter,i)=>(i+1)+'.'+letter).join(' – ')
 + '\nPHẦN II. TỰ LUẬN\n'
 + 'Bài 1. a) =24; b) =-59.\nBài 2. a) =-99; b) =-15; c) =350; d) =-200; e) =0.\n'
 + 'Bài 3. a) x=20; b) x=10.\nBài 4. a) 2b; b) -2z.';
const fullText = 'PHẦN I. TRẮC NGHIỆM (3,0 ĐIỂM)\n'+questions
 + '\n1\nPHẦN II. TỰ LUẬN (7,0 ĐIỂM)\n'+statements+'\n2\n'+answers;
for (const source of [fullText, fullText.replace(/\n/g,' ')]) {
  const parts=separatePdfAnswerSections(source);
  assert.equal(Object.keys(parts.essaySolutions).length,4);
  const result=FileParserService.parseRawText(source,'test.pdf','pdf');
  assert.equal(result.totalFound,14,'Không được tính trang đáp án thành Câu 15–18');
  assert.equal(result.multipleChoiceCount,10);
  assert.equal(result.essayCount,4);
  assert.equal(Math.round(result.items.reduce((sum,q)=>sum+q.points,0)*100)/100,10);
  assert.deepEqual(result.items.slice(0,10).map(q=>q.correctAnswer),choices);
  assert.equal(result.items[9].points,0.3,'Câu 10 không được nhận 7 điểm');
  assert.ok(result.items.slice(10).every(q=>q.explanation && q.correctAnswer));
  assert.ok(!result.items[13].question.includes('ĐÁP ÁN VÀ'));
}
const word=FileParserService.parseRawText('Câu 1. 2+2=? A.1 B.2 C.4 D.5','test.docx','word');
assert.equal(word.totalFound,1);
console.log('PASS: PDF đủ 14 câu, không tính đáp án thành câu; điểm đúng và không ảnh hưởng Word.');
