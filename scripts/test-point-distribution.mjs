// Offline smoke tests for decimal-point utilities, without AI calls or app dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const src = fs.readFileSync(new URL('../src/utils/questionUtils.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = {exports: {}};
new Function('module','exports','require',js)(m,m.exports,require);
const { parseDecimalPoint,formatDecimalPoint,distributePointsEvenly,calculateQuestionsTotalPoints } = m.exports;
assert.equal(parseDecimalPoint('0,3', NaN), 0.3);
assert.equal(parseDecimalPoint('0.25', NaN), 0.25);
assert.equal(parseDecimalPoint('1,2500', NaN), 1.25);
for (const invalid of ['0,3abc','0,3,4','-0.3','0.00001','1e5','Infinity','0..3','']) assert(Number.isNaN(parseDecimalPoint(invalid,NaN)),invalid);
assert.equal(formatDecimalPoint(.1255),'0.1255');
for (const [target,n] of [[10,16],[10,3],[10,40],[7.3,9],[.3,7],[5,2],[1.2345,13]]) {
  const points = distributePointsEvenly(target,n);
  assert(points.every(p=>p>0));
  assert.equal(calculateQuestionsTotalPoints(points.map(points=>({points}))),target);
}
assert.throws(()=>distributePointsEvenly(.0001,3));
assert.equal(calculateQuestionsTotalPoints([{points:.3},{points:.25},{points:.1255}]),.6755);
console.log('PASS: decimal parsing, rejection, precision, exact distribution, and total (18 cases)');

// Chấm thử bài thật qua GradingService, thay thế các dịch vụ lưu/cloud bằng mock,
// tuyệt đối không gọi API AI hay ghi dữ liệu người dùng.
const gradeSource = fs.readFileSync(new URL('../src/services/gradingService.ts', import.meta.url), 'utf8');
const gradeJs = ts.transpileModule(gradeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const gradeModule = { exports: {} };
const mockRequire = id => {
  if (id.includes('questionUtils')) return m.exports;
  if (id.includes('stepGradingService')) return {stepGradingService: {}};
  if (id.includes('storageService')) return {StorageService: {}};
  if (id.includes('firestoreService')) return {FirestoreService: {}};
  return {};
};
new Function('module','exports','require',gradeJs)(gradeModule,gradeModule.exports,mockRequire);
const { GradingService } = gradeModule.exports;
const a1 = {id:'1',type:'multiple_choice',question:'2+2?',options:[{id:'A',text:'4'},{id:'B',text:'5'}],correctAnswer:'A',points:0.3};
const a2 = {id:'2',type:'multiple_choice',question:'3+3?',options:[{id:'A',text:'6'},{id:'B',text:'7'}],correctAnswer:'A',points:0.75};
const runGrade = (totalPoints,answers) => GradingService.gradeSubmission({
  assignment:{id:'a',title:'test',questions:[a1,a2],totalPoints},
  studentAnswers:answers,studentName:'Test',classId:'c',className:'Lop',
  startedAt:'2026-01-01T10:00:00',submittedAt:'2026-01-01T10:05:00'
});
const customFull = runGrade(1.05,{'1':'A','2':'A'});
assert.equal(customFull.totalScore,1.05);
assert.equal(customFull.maxScore,1.05);
assert.equal(customFull.mcqScore,1.05);
const customPartial = runGrade(1.05,{'1':'A','2':'B'});
assert.equal(customPartial.totalScore,0.3);
assert.equal(customPartial.mcqPoints,0.3);
const legacy = runGrade(undefined,{'1':'A','2':'A'});
assert.equal(legacy.totalScore,10);
assert.equal(legacy.maxScore,10);
console.log('PASS: GradingService custom total, partial points, and legacy /10 (7 assertions)');
