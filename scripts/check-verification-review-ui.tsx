import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { create, act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { verificationFingerprint } from '../src/services/verificationOptimizer';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const alerts: string[] = [];
Object.defineProperty(globalThis, 'alert', { configurable: true, value: (s: string) => alerts.push(s) });
Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => false } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => { throw Error('QuotaExceededError'); } } });
const questions: any[] = [
  { id: 'empty_mc', order: 1, type: 'multiple_choice', question: 'Tính 2 + 3.', points: 0.3, options: ['A','B','C','D'].map((id,i) => ({ id, text: String(i+3) })) },
  { id: 'essay', order: 2, type: 'essay', question: 'a) Tìm m. b) Tìm M.', points: 1.7, options: [], correctAnswer: 'a) m=2; b) M=5', explanation: 'Lời giải gốc đầy đủ.', rubric: 'a) 0,7 điểm; b) 1 điểm.' },
  { id: 'short', order: 3, type: 'short_answer', question: 'Điền biểu thức theo m.', points: 0.1, options: [], correctAnswer: 'm+2' },
  { id: 'tf', order: 4, type: 'true_false', question: '2+3=5 đúng hay sai?', points: 0.2, options: [], correctAnswer: 'Đúng' }
];
const assignment: any = { id: 'fake_exam', assignmentCode: 'FAKE-VERIFY', title: 'Đề giả kiểm thử duyệt', grade: '7', topic: 'Toán THCS', classId: 'fake_class', className: 'Lớp giả', questions, durationMinutes: 45, createdAt: '2026-10-24' };
const original = structuredClone(assignment);
const env: any = { calls: 0, saves: [], order: [], failSave: true, refreshes: 0 };
env.save = async (a: any) => { env.order.push('cloud'); if (env.failSave) throw Error('Synthetic Cloud not acknowledged'); env.saved = structuredClone(a); env.saves.push(env.saved); };
env.cache = () => { env.order.push('cache'); throw Error('QuotaExceededError'); };
(globalThis as any).__verificationUI = env;
const mocks: Record<string,string> = {
  aiService: 'export const aiService={verifyExamQuestions:(...a)=>globalThis.__verificationUI.verify(...a),verifySingleQuestion:(...a)=>globalThis.__verificationUI.verifySingle(...a)};',
  firestoreService: 'export const FirestoreService={saveExam:(...a)=>globalThis.__verificationUI.save(...a)};',
  storageService: 'export const StorageService={saveAssignment:(...a)=>globalThis.__verificationUI.cache(...a)};',
  MathDisplay: 'import React from "react";export const MathDisplay=({math})=>React.createElement("span",{},math);',
  soundEffects: 'export const soundEffects={playSuccess(){}};',
};
const compiled = await build({ stdin: { contents: "export { TeacherAssignments } from './src/pages/teacher/TeacherAssignments'; export { AiSolveExamModal } from './src/components/AiSolveExamModal'; export { AiBatchSolveModal } from './src/components/AiBatchSolveModal';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external',
  plugins: [{ name: 'verification-ui-isolation', setup(b) {
    b.onResolve({ filter: /canvas-confetti/ }, () => ({ path: 'confetti', namespace: 'verification-mock' }));
    b.onResolve({ filter: /^\./ }, args => {
      const name = args.path.split('/').pop()!.replace(/\.(tsx?|jsx?)$/, '');
      if (mocks[name]) return { path: name, namespace: 'verification-mock' };
      if (/components\//.test(args.path) && !['AiSolveExamModal','AiBatchSolveModal'].includes(name)) {
        mocks[name] = 'export const '+name+'=()=>null;'; return { path: name, namespace: 'verification-mock' };
      }
    });
    b.onLoad({ filter: /.*/, namespace: 'verification-mock' }, args => ({ contents: args.path === 'confetti' ? 'export default ()=>{};' : mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
  }}] });
const path = resolve(mkdtempSync(resolve('.test-verification-review-')), 'review.mjs');
writeFileSync(path, compiled.outputFiles[0].text);
const { TeacherAssignments, AiSolveExamModal, AiBatchSolveModal } = await import(pathToFileURL(path).href);
let renderer: ReactTestRenderer;
const tick = () => new Promise<void>(r => setImmediate(r));
function label(n: ReactTestInstance): string { return n.children.map(c => typeof c === 'string' ? c : label(c)).join(''); }
function button(text: string) { return renderer.root.findAll(n => n.type === 'button' && label(n).includes(text))[0]; }
async function settle() { await act(async () => { for (let i=0;i<5;i++) await tick(); }); }
function Wrapper() {
  const [data,setData] = React.useState(original);
  return React.createElement(TeacherAssignments, { assignments: [data], classes: [], submissions: [], onNavigate() {}, onOpenShare() {}, onTestAssignment() {}, onRefresh() { env.refreshes++; if (env.saved) setData(env.saved); } });
}
await act(async () => { renderer = create(React.createElement(Wrapper)); });
await act(async () => { button('AI Thẩm định').props.onClick(); }); await settle();
assert.equal(renderer.root.findAll(n => n.type === 'input' && n.props.type === 'password').length, 0);
assert.ok(renderer.root.findAll(n => String(n.props.className).includes('max-w-[1440px]')).length);
const scroll = renderer.root.find(n => n.props['data-testid'] === 'verification-scroll');
assert.ok(scroll.findAll(n => n.type === 'button' && label(n).startsWith('Thẩm định')).length >= 2, 'Toolbar scrolls with results');
assert.ok(!scroll.findAll(n => n.type === 'button' && label(n).startsWith('Lưu kết quả')).length, 'Save stays outside the scrolling toolbar');
assert.ok(button('Thẩm định tự luận').props.disabled === false);
assert.ok(JSON.stringify(renderer.toJSON()).includes('Thiếu đáp án / hướng dẫn chấm'));

let release!: (v: any) => void;
env.verify = (p: any) => { env.calls++; assert.deepEqual(p.questions.map((q: any) => q.id), ['essay']); return new Promise(r => { release = r; }); };
await act(async () => { const start = button('Thẩm định tự luận'); start.props.onClick(); start.props.onClick(); await tick(); });
assert.equal(env.calls, 1); assert.ok(button('Thẩm định trắc nghiệm').props.disabled);
const proposed = 'a) m=3; b) M=5';
await act(async () => { release([{ questionId: 'essay', order: 2, currentAnswer: questions[1].correctAnswer, proposedAnswer: proposed,
  confidence: 'needs_review', needsReview: true, matchesCurrentAnswer: false, pass1Answer: proposed, pass2Answer: proposed,
  reason: 'Đáp án cần giáo viên đối chiếu.', reviewIssue: 'answer_mismatch', inputFingerprint: await verificationFingerprint(questions[1], '7', 'Toán THCS') }]); await tick(); });
assert.equal(renderer.root.findAll(n => n.type === 'input' && n.props.value === proposed).length, 0, 'AI never auto-selects the proposed answer');
await act(async () => { await button('Lưu kết quả thẩm định').props.onClick(); });
assert.ok(renderer.root.findAllByType(AiSolveExamModal).length, 'Failed Cloud acknowledgement keeps review open');
assert.deepEqual(env.order, ['cloud']); assert.equal(env.saves.length, 0);
assert.ok(!alerts.some(s => s.includes('Đã cập nhật')));
env.failSave = false;
await act(async () => { await button('Lưu kết quả thẩm định').props.onClick(); await tick(); });
assert.deepEqual(env.order, ['cloud','cloud','cache']);
assert.equal(env.saved.questions[0].correctAnswer, undefined, 'Saving essays must not invent A for untouched MC');
assert.equal(env.saved.questions[1].correctAnswer, original.questions[1].correctAnswer);
assert.equal(env.saved.questions[2].correctAnswer, 'm+2', 'Short-answer case/type unchanged');
assert.equal(env.saved.questions[2].type, 'short_answer');
assert.equal(env.saved.questions[3].correctAnswer, 'Đúng', 'True/false answer is never turned into A/B/C/D');
for (const q of env.saved.questions) for (const k of ['question','options','points','explanation','rubric','id','type'])
  assert.deepEqual(q[k], original.questions.find((x: any) => x.id === q.id)[k]);
console.log('PASS: no key form; wide scrollable UI; duplicate clicks blocked; failed Cloud is not success; full cache cannot block acknowledged save; no default A');

await act(async () => { button('Duyệt câu nghi vấn').props.onClick(); }); await settle();
await act(async () => { button('[Chấp nhận đáp án AI:').props.onClick(); });
assert.equal(renderer.root.findAll(n => n.type === 'input' && n.props.value === proposed).length, 1);
await act(async () => { await button('Lưu kết quả thẩm định').props.onClick(); await tick(); });
assert.equal(env.saved.questions[1].correctAnswer, proposed); assert.equal(env.saved.questions[1].teacherVerified, true);
assert.equal(env.saved.questions[0].correctAnswer, undefined);
await act(async () => { button('AI Thẩm định').props.onClick(); }); await settle();
assert.equal(renderer.root.findAll(n => n.type === 'input' && n.props.value === proposed).length, 1);
assert.equal(env.saved.questions[1].points, 1.7);
await act(async () => { renderer.unmount(); });
console.log('PASS: only explicit teacher acceptance changes an answer; save and reopen retain it and all point values');

// A blank source answer stays blank through AI analysis, teacher choice and failed Cloud acknowledgement.
const unansweredUI: any = { id:'unanswered_mc_ui', order:1, type:'multiple_choice', question:'Tính 1+1.', points:0.5,
  options:['A','B','C','D'].map((id,i)=>({id,text:String(i+1)})) };
const unreviewedSource=structuredClone(unansweredUI);
const unansweredAssignment={...original,id:'unanswered_exam_ui',title:'Đề giả chưa có đáp án',questions:[unansweredUI]};
env.saved=undefined;env.failSave=false;env.order=[];
env.verify=async (p:any)=>[{questionId:p.questions[0].id, order:1, proposedAnswer:'B',pass1Answer:'B',pass2Answer:'B',confidence:'medium',
  needsReview:true,matchesCurrentAnswer:false,reason:'Hai lượt AI thống nhất – chờ giáo viên xác nhận.',reviewIssue:'unverified',inputFingerprint:await verificationFingerprint(p.questions[0],'7','Toán THCS')}];
function SelfSolveWrapper() {
  const [data,setData]=React.useState(unansweredAssignment);
  return React.createElement(TeacherAssignments,{assignments:[data],classes:[],submissions:[],onNavigate(){},onOpenShare(){},onTestAssignment(){},
    onRefresh(){if(env.saved)setData(env.saved);}});
}
await act(async()=>{renderer=create(React.createElement(SelfSolveWrapper));});
await act(async()=>{button('AI Thẩm định').props.onClick();});await settle();
await act(async()=>{await button('Thẩm định trắc nghiệm').props.onClick();});
assert.deepEqual(unansweredUI,unreviewedSource);assert.equal(env.order.length,0,'AI analysis never saves an answer');
assert.ok(label(renderer.root).includes('AI đối soát đạt – chưa được giáo viên xác nhận'));
assert.ok(button('[Chấp nhận đáp án AI: B]'));
assert.ok(!label(renderer.root.find(n=>n.props.id==='q_item_unanswered_mc_ui')).includes('ĐÃ THẨM ĐỊNH ĐẠT CHUẨN'));
await act(async()=>{await button('Lưu kết quả thẩm định').props.onClick();await tick();});
assert.equal(env.saved.questions[0].correctAnswer,undefined,'Saving verification without approval keeps a blank source answer');
assert.equal(env.saved.questions[0].teacherVerified,false);assert.equal(env.saved.questions[0].verificationStatus,'needs_review');
await act(async()=>{button('Duyệt câu nghi vấn').props.onClick();});await settle();
await act(async()=>{button('[Chấp nhận đáp án AI: B]').props.onClick();});
assert.ok(label(renderer.root).includes('Giáo viên đã chọn – chờ lưu thành công'));
assert.equal(env.saved.questions[0].correctAnswer,undefined,'Choosing a proposal alone does not save it');
env.failSave=true;
await act(async()=>{await button('Lưu & Chuyển').props.onClick();});
assert.equal(env.saved.questions[0].correctAnswer,undefined);
assert.ok(renderer.root.findAllByType(AiSolveExamModal).length,'Cloud failure keeps the pending teacher decision visible');
env.failSave=false;
await act(async()=>{await button('Lưu & Chuyển').props.onClick();await tick();});
assert.equal(env.saved.questions[0].correctAnswer,'B');assert.equal(env.saved.questions[0].teacherVerified,true);
assert.equal(env.saved.questions[0].verificationStatus,'verified');assert.equal(env.saved.questions[0].points,0.5);
await act(async()=>{renderer.root.find(n=>n.type==='button'&&n.props.title==='Đề đã thẩm định - Bấm để xem lại chi tiết').props.onClick();});await settle();
assert.ok(label(renderer.root).includes('Đang chọn: B'));
assert.deepEqual(unansweredUI,unreviewedSource);
await act(async()=>{renderer.unmount();});
console.log('PASS: unanswered B proposal remains pending; no default A or auto-save; only teacher approval plus Cloud acknowledgement changes the key; reopen retains B');

const disagreeUI={...unansweredUI,id:'unanswered_disagreement_ui'};
let customSaved:any;
env.verify=async()=>[{questionId:disagreeUI.id,order:1,proposedAnswer:'',pass1Answer:'B',pass2Answer:'C',needsReview:true,matchesCurrentAnswer:false,
  confidence:'needs_review',reason:'Hai lượt AI chưa thống nhất – cần giáo viên xem lại.',reviewIssue:'unverified'}];
await act(async()=>{renderer=create(React.createElement(AiSolveExamModal,{isOpen:true,onClose(){},questions:[disagreeUI],examTitle:'Đề giả hai lượt khác nhau',onApplyAnswers(q:any){customSaved=q;}}));});await settle();
await act(async()=>{await button('Thẩm định trắc nghiệm').props.onClick();});
assert.ok(label(renderer.root).includes('Hai lượt chưa thống nhất'));
assert.equal(renderer.root.findAll(n=>n.type==='button'&&label(n).startsWith('[Chấp nhận đáp án AI:')).length,0);
assert.ok(label(renderer.root).includes('AI Lượt 1')&&label(renderer.root).includes('AI Lượt 2'));
assert.equal(disagreeUI.correctAnswer,undefined);
await act(async()=>{renderer.root.findAll(n=>n.type==='button'&&label(n)==='B')[0].props.onClick();});
await act(async()=>{await button('Lưu & Chuyển').props.onClick();});
assert.equal(customSaved[0].correctAnswer,'B');assert.equal(customSaved[0].teacherVerified,true);assert.equal(disagreeUI.correctAnswer,undefined);
await act(async()=>{renderer.unmount();});
console.log('PASS: conflicting passes show both answers without choosing one; the teacher can explicitly enter a custom answer');

// One bulk-review scenario: 17 unanswered questions, 15 qualified proposals, 2 suspects.
const bulk17: any[] = Array.from({length:17},(_,i)=>({
  id:`bulk_${i+1}`,order:i+1,type:i<10||i===15?'multiple_choice':'essay',points:0.5,
  question:i===16?'Theo hình bên, tính góc A.':i<10||i===15?'Tính 1+1.':'a) Tính 1+1. b) Tính 1+2.',
  options:i<10||i===15?['A','B','C','D'].map((id,j)=>({id,text:String(j+1)})):[],
  verificationStatus:'needs_review',needsReview:true,teacherVerified:false
}));
const bulkOriginal=structuredClone(bulk17);
const bulkAssignment={...original,id:'bulk_exam_17',title:'17 câu giả duyệt theo nhóm',questions:bulk17};
env.saved=undefined;env.saves=[];env.order=[];env.failSave=true;
let bulkAiCalls=0;
env.verify=async(p:any)=>{bulkAiCalls++;return Promise.all(p.questions.map(async(q:any)=>{
  const answer=q.type==='essay'?'a) 2; b) 3':'B';
  const passed=q.order<=15;
  return {questionId:q.id,order:q.order,proposedAnswer:passed?answer:'',pass1Answer:q.order===17?'':answer,
    pass2Answer:q.order===17?'':'C',confidence:passed?'medium':'needs_review',needsReview:true,matchesCurrentAnswer:false,
    reason:passed?'Hai lượt AI thống nhất – chờ giáo viên xác nhận.':q.order===16?'Hai lượt khác nhau: B và C.':'Thiếu hình nguồn, chưa đủ dữ kiện để giải.',
    reviewIssue:q.order===17?'missing_data':'unverified',inputFingerprint:await verificationFingerprint(q,'7','Toán THCS'),
    ...(passed?{pass2Answer:answer}:{})};
}));};
function BulkReviewWrapper(){
  const [data,setData]=React.useState(bulkAssignment);
  return React.createElement(TeacherAssignments,{assignments:[data],classes:[],submissions:[],onNavigate(){},onOpenShare(){},onTestAssignment(){},
    onRefresh(){if(env.saved)setData(env.saved);}});
}
async function waitForBulk(predicate:()=>boolean){
  for(let i=0;i<100&&!predicate();i++) await act(async()=>{await new Promise(r=>setTimeout(r,2));});
  assert.ok(predicate(),'Bulk UI settles after asynchronous fingerprint checks');
}
await act(async()=>{renderer=create(React.createElement(BulkReviewWrapper));});
await act(async()=>{button('AI Thẩm định').props.onClick();});await settle();
await waitForBulk(()=>button('Thẩm định trắc nghiệm')?.props.disabled===false);
await act(async()=>{await button('Thẩm định trắc nghiệm').props.onClick();});await settle();
await waitForBulk(()=>bulkAiCalls===1&&button('Thẩm định tự luận')?.props.disabled===false);
await act(async()=>{await button('Thẩm định tự luận').props.onClick();});await settle();
await waitForBulk(()=>!!button('AI đối soát đạt (15)'));
assert.equal(bulkAiCalls,2,'Mock each question family once; bulk approval must not call AI again');
assert.ok(button('AI đối soát đạt (15)'));
assert.ok(button('Chỉ hiện câu cần xem lại (2)'));
const questionRows=()=>renderer.root.findAll(n=>typeof n.props.id==='string'&&n.props.id.startsWith('q_item_')).map(n=>n.props.id);
assert.deepEqual(questionRows(),['q_item_bulk_16','q_item_bulk_17'],'Qualified proposals are excluded from individual suspect review');
assert.ok(label(renderer.root).includes('Hai lượt khác nhau: B và C.')&&label(renderer.root).includes('Thiếu hình nguồn'));
assert.deepEqual(bulk17,bulkOriginal);assert.equal(env.saves.length,0);
await act(async()=>{button('Xác nhận lưu các đáp án AI đã đối soát đạt (15)').props.onClick();});
const preview=renderer.root.find(n=>n.props['aria-label']==='Xem trước đáp án AI để xác nhận lưu');
assert.equal(preview.findAllByType('li').length,15);
assert.equal(preview.findAllByType('li').filter(n=>label(n).includes('Đáp án đề xuất: B')).length,10);
assert.equal(preview.findAllByType('li').filter(n=>label(n).includes('a) 2; b) 3')).length,5);
assert.equal(env.order.length,0,'Opening the preview is not confirmation and never writes');
await act(async()=>{await button('Xác nhận và lưu 15 đáp án').props.onClick();});
assert.equal(env.saves.length,0);assert.deepEqual(bulk17,bulkOriginal);
assert.ok(button('Xác nhận và lưu 15 đáp án'),'Failed Cloud acknowledgement keeps the preview available for safe retry');
assert.ok(label(renderer.root).includes('Đã được giáo viên xác nhận: 0'));
env.failSave=false;
const saveBeforeBulk=env.save;
let acknowledgeBulk!:()=>void;
let bulkWrites=0;
env.save=async(a:any)=>{bulkWrites++;await new Promise<void>(r=>{acknowledgeBulk=r;});await saveBeforeBulk(a);};
let bulkPending!:Promise<void>;
await act(async()=>{const confirm=button('Xác nhận và lưu 15 đáp án');bulkPending=confirm.props.onClick();confirm.props.onClick();await tick();});
assert.equal(bulkWrites,1,'Double confirmation shares the operation lock');
assert.equal(env.saved,undefined);assert.equal(env.saves.length,0);assert.deepEqual(bulk17,bulkOriginal);
assert.ok(label(renderer.root).includes('Đang chờ Cloud xác nhận...'));
await act(async()=>{acknowledgeBulk();await bulkPending;});await settle();
env.save=saveBeforeBulk;
assert.equal(env.saves.length,1,'Only one successful Cloud save confirms the group');
assert.equal(env.saved.questions.filter((q:any)=>q.teacherVerified===true).length,15);
for(let i=0;i<15;i++){
  assert.equal(env.saved.questions[i].correctAnswer,i<10?'B':'a) 2; b) 3');
  assert.equal(env.saved.questions[i].verificationStatus,'verified');assert.equal(env.saved.questions[i].points,0.5);
}
assert.deepEqual(env.saved.questions.slice(15),bulkOriginal.slice(15),'Both suspect questions remain completely untouched by bulk save');
assert.notEqual(env.saved.verificationStatus,'verified','Partial approval never verifies the whole exam');
assert.ok(renderer.root.findAllByType(AiSolveExamModal).length,'Stay open to review the remaining suspects');
assert.deepEqual(questionRows(),['q_item_bulk_16','q_item_bulk_17']);
assert.ok(label(renderer.root).includes('Hai lượt khác nhau: B và C.')&&label(renderer.root).includes('Thiếu hình nguồn'),'Keep both suspect analyses visible after partial Cloud save');
assert.ok(label(renderer.root).includes('Đã được giáo viên xác nhận: 15'));
assert.equal(bulkAiCalls,2);assert.deepEqual(bulk17,bulkOriginal);
await act(async()=>{button('Tất cả (17)').props.onClick();});
assert.ok(label(renderer.root.find(n=>n.props.id==='q_item_bulk_1')).includes('Đã được giáo viên xác nhận'));
await act(async()=>{renderer.unmount();});
console.log('PASS: 17 unanswered questions -> 15 AI-qualified proposals previewed and Cloud-confirmed in one group; 2 suspects untouched and still open; no teacherVerified before acknowledgement, duplicate writes or extra AI calls');

// The old list can contain 17 needs_review flags; display causes without asserting 17 math errors.
const legacy17 = Array.from({ length: 17 }, (_, i) => ({ ...questions[1], id: 'legacy_'+i, order: i+1,
  correctAnswer: i<6 ? '' : questions[1].correctAnswer, explanation: i<6 ? '' : questions[1].explanation, rubric: i<6 ? '' : questions[1].rubric,
  question: i>=6 && i<9 ? 'Theo hình bên, tính góc A.' : 'Tìm m.', verificationStatus: 'needs_review', needsReview: true }));
await act(async () => { renderer = create(React.createElement(AiSolveExamModal, { isOpen: true, onClose() {}, examTitle: '17 câu giả', questions: legacy17, onApplyAnswers() {} })); }); await settle();
const rendered = label(renderer.root);
assert.ok(rendered.includes('Thiếu đáp án / hướng dẫn chấm: 6'));
assert.ok(rendered.includes('Thiếu hoặc chưa đọc được dữ kiện: 3'));
assert.ok(rendered.includes('AI chưa xác minh được: 8'));
await act(async () => { renderer.root.find(n => n.props.id === 'q_item_legacy_9').findByType('input').props.onChange({target:{value:'Giáo viên đang sửa'}}); });
assert.ok(label(renderer.root).includes('Đã chọn: Giáo viên đang sửa'));
env.verify = async () => { throw Object.assign(Error('Synthetic Gemini 500: AI chưa xác minh được'), { status: 500 }); };
await act(async () => { await button('Thẩm định tự luận').props.onClick(); });
assert.ok(renderer.root.findAll(n => n.props.role === 'alert').some(n => label(n).includes('AI chưa xác minh được')));
assert.deepEqual(questions, original.questions);
assert.ok(label(renderer.root).includes('Đã chọn: Giáo viên đang sửa'), 'AI failure must keep unsaved teacher decisions');
await act(async () => { renderer.unmount(); });

const batchSource = { ...original, questions: [{...questions[0], verificationStatus:'verified'}] };
env.verify = async (p: any) => { assert.equal(p.questions.length, 1, 'Legacy verified flag without an answer is not skipped'); return [{ questionId:'empty_mc', proposedAnswer:'', needsReview:true, confidence:'needs_review', matchesCurrentAnswer:false, reviewIssue:'missing_answer' }]; };
env.order=[]; env.failSave=true;
await act(async () => { renderer=create(React.createElement(AiBatchSolveModal,{isOpen:true,selectedAssignments:[batchSource],onClose(){},onFinished(){}})); });
await act(async () => { await button('Bắt đầu thẩm định').props.onClick(); });
assert.deepEqual(env.order,['cloud']);
assert.ok(label(renderer.root).includes('Synthetic Cloud not acknowledged'));
env.failSave=false;
await act(async () => { await button('Bắt đầu thẩm định').props.onClick(); });
assert.deepEqual(env.order,['cloud','cloud','cache']);
assert.equal(env.saved.questions[0].correctAnswer,undefined);
assert.equal(env.saved.verificationStatus,'needs_review');
assert.equal(env.saved.eligibleForSampleBank,false);
await act(async () => { renderer.unmount(); });
console.log('PASS: batch never skips missing answer, never fills A, acknowledges Cloud before cache and reports failed saves');
console.log('VERIFICATION REVIEW UI: PASS (real components/handlers; synthetic data; no network or Firebase writes)');
