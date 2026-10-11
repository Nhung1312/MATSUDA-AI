const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname,'..');
const read = p=>fs.readFileSync(path.join(base,p),'utf8');
function loadTS(source,modImports={},filename='unit.ts'){
  const compiled=ts.transpileModule(source,{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
  const errs=(compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errs.length,0,errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
  const exports={};
  const sandbox={exports,require:n=>{if(!(n in modImports))throw Error('Unknown module '+n);return modImports[n]},console,Math,JSON,Number,String,Array,Set,Date,Error,Promise};
  vm.runInNewContext(compiled.outputText,sandbox,{filename});
  return exports;
}
const isEssayQuestion=q=>q.type==='essay'||(q.type!=='multiple_choice'&&(!q.options||q.options.length<2));
const utils=loadTS(read('src/utils/verificationUtils.ts'),{'./questionUtils':{isEssayQuestion}},'verificationUtils.ts');
const {hasVerificationReference,getQuestionVerificationFingerprint,isQuestionVerifiedCurrent,shouldVerifyQuestion}=utils;
function q(id,type,answer,explanation='',rubric=''){
 return {id,order:Number(id.replace(/\D/g,''))||1,question:'Tính giá trị và giải thích',type,correctAnswer:answer,options:type==='multiple_choice'?[{id:'A',text:'0'},{id:'B',text:'1'},{id:'C',text:'2'},{id:'D',text:'3'}]:[],explanation,rubric,points:1};
}
const passing=q('e1','essay','-1/2','Phân số này bằng -2/4.');
assert.equal(hasVerificationReference(passing),true);
assert.equal(shouldVerifyQuestion(passing),true);
passing.verificationStatus='verified';passing.verificationFingerprint=getQuestionVerificationFingerprint(passing);
assert.equal(isQuestionVerifiedCurrent(passing),true);
assert.equal(shouldVerifyQuestion(passing),false);
assert.equal(isQuestionVerifiedCurrent({...passing,correctAnswer:'2'}),false);
assert.equal(isQuestionVerifiedCurrent({...passing,explanation:'Giải khác'}),false);
assert.equal(isQuestionVerifiedCurrent({...passing,question:'Đề bài bị sửa'}),false);
assert.equal(isQuestionVerifiedCurrent({...passing,points:3}),true);
assert.equal(isQuestionVerifiedCurrent({...passing,needsReview:true}),false);
assert.equal(isQuestionVerifiedCurrent({...passing,verificationFingerprint:undefined}),true);
assert.equal(hasVerificationReference(q('e2','essay','','','Hướng dẫn chấm theo 4 ý')),true);
assert.equal(hasVerificationReference(q('e3','essay','')),false);
assert.equal(hasVerificationReference(q('m1','multiple_choice','')),false);

const code=read('src/services/aiService.ts');
const start=code.indexOf('  async verifyExamQuestions(params:');
const end=code.indexOf('\n  /**\n   * Thẩm định đơn lẻ',start);
assert.ok(start>=0&&end>start);
const method=code.slice(start,end);
function makeService(responses){
 const prompts=[];const modelNames=[];let cursor=0;
 function GoogleGenAI(){this.models={generateContent:async({contents,model})=>{
   prompts.push(contents[0].text);modelNames.push(model);
   const response=responses[cursor++];
   if(response instanceof Error)throw response;
   if(!response)throw Error('Missing mock '+cursor);
   return {text:JSON.stringify(response)};
 }}}
 const src=`class Stub { getApiKey(){return 'test-key';} ${method} }\nexports.Stub = Stub`;
 // The method's free identifiers are injected into its sandbox as required.
 const js=ts.transpileModule(src,{fileName:'service-test.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 const context={exports,GoogleGenAI,hasVerificationReference,isEssayQuestion,console,setTimeout:(fn,ms)=>setTimeout(fn,0),Math,JSON,Date,Promise};
 vm.runInNewContext(js,context);
 return {service:new exports.Stub(),prompts,modelNames};
}
const p1=(id,ans,match=true,conf='high')=>({questionId:id,proposedAnswer:ans,matchesCurrentAnswer:match,confidence:conf,needsReview:!match,reason:'Đã đối chiếu toán học'});
(async()=>{
 let passed=0;
 const check=(name,fn)=>{fn();passed++;console.log('PASS',name)};
 let x=makeService([[p1('e1','-2/4')]]);
 let r=await x.service.verifyExamQuestions({questions:[q('e1','essay','-1/2','Lời giải đầy đủ')]});
 check('Essay tương đương toán học, 1 lượt duy nhất',()=>{assert.equal(r[0].needsReview,false);assert.equal(r[0].matchesCurrentAnswer,true);assert.equal(x.prompts.length,1);assert.match(x.prompts[0],/tương đương về toán học/);});
 x=makeService([[p1('m1','B')]]);r=await x.service.verifyExamQuestions({questions:[q('m1','multiple_choice','B')]});
 check('MCQ giữ so sánh A B C D',()=>{assert.equal(r[0].needsReview,false);assert.equal(x.prompts.length,1)});
 x=makeService([[p1('e1','6',false,'needs_review')],{questionId:'e1',pass2Answer:'6',matchesCurrentAnswer:false,confidence:'high',reason:'Đề cho kết quả 5 là sai'}]);
 r=await x.service.verifyExamQuestions({questions:[q('e1','essay','5','Lời giải sai')]});
 check('Tự luận sai: 2 lượt, giữ nghi vấn',()=>{assert.equal(r[0].needsReview,true);assert.equal(x.prompts.length,2);assert.ok(x.prompts[1].includes('TỰ LUẬN'));assert.ok(x.prompts[1].includes('matchesCurrentAnswer'));});
 x=makeService([[p1('e1','-2/4')]]);r=await x.service.verifyExamQuestions({questions:[q('e0','essay',''),q('e1','essay','-1/2')]});
 check('Câu thiếu đáp án không tốn lượt Gemini',()=>{assert.equal(r.length,2);assert.equal(r[0].needsReview,true);assert.equal(r[1].needsReview,false);assert.equal(x.prompts.length,1);});
 x=makeService([]);r=await x.service.verifyExamQuestions({questions:[q('e0','essay',''),q('e3','essay','')]});
 check('Cả nhóm không có đáp án => zero lượt Gemini',()=>{assert.equal(r.length,2);assert.equal(x.prompts.length,0);});
 x=makeService([[p1('e2','x=3')]]);r=await x.service.verifyExamQuestions({questions:[q('e2','essay','','','Hướng dẫn giải: x=3')]});
 check('Tự luận có barem mà không có correctAnswer vẫn xét',()=>{assert.equal(r[0].needsReview,false);assert.equal(x.prompts.length,1);});
 x=makeService([[p1('e1','-2/4')]]);r=await x.service.verifyExamQuestions({questions:[q('e1','essay','-1/2')]});
 check('Giữ nguyên Gemini 3.8 Flash',()=>{assert.ok(x.modelNames.every(m=>m==='gemini-3.8-flash'))});
 const quotaError=new Error('RESOURCE_EXHAUSTED');quotaError.status=429;x=makeService([quotaError]);
 let threw=false;try{await x.service.verifyExamQuestions({questions:[q('e1','essay','5')]});}catch(err){threw=true;assert.equal(err.status,429)}
 check('429 dừng ngay, không retry',()=>{assert.equal(threw,true);assert.equal(x.prompts.length,1)});
 const files=['src/services/aiService.ts','src/components/AiSolveExamModal.tsx','src/components/AiBatchSolveModal.tsx','src/utils/verificationUtils.ts','src/types/index.ts'];
 for(const file of files){
   const sf=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
   const diagnostics=sf.parseDiagnostics;
   check('Cú pháp '+file,()=>assert.equal(diagnostics.length,0,diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n')));
 }
 check('UI không tự thẩm định toàn bộ khi nhấn nút mặc định',()=>{
    const ui=read('src/components/AiSolveExamModal.tsx');assert.ok(ui.includes('questions.filter(shouldVerifyQuestion)'));assert.ok(ui.includes('onClick={() => void handleStartVerification(false)}'));
 });

 check('Tương thích đề cũ thiếu type: trạng thái verified không tự mất khi lưu',()=>{
   const legacy={...q('e4','essay','x=2','x=2'),type:undefined};
   const savedType='essay';
   const source={...legacy,type:savedType,correctAnswer:legacy.correctAnswer,explanation:legacy.explanation||'',rubric:legacy.rubric||''};
   const stored={...source,verificationStatus:'verified',needsReview:false,verificationFingerprint:getQuestionVerificationFingerprint(source)};
   assert.equal(isQuestionVerifiedCurrent(stored),true);
   const ui=read('src/components/AiSolveExamModal.tsx');
   assert.match(ui,/const savedType = /);
   assert.match(ui,/type: savedType,/);
 });
 check('Sửa đề, đáp án hoặc barem buộc thẩm định lại; điểm không ảnh hưởng',()=>{
   const oldq=q('e5','essay','1','Đáp án gốc','Barem gốc');
   oldq.verificationStatus='verified';oldq.needsReview=false;oldq.verificationFingerprint=getQuestionVerificationFingerprint(oldq);
   assert.equal(isQuestionVerifiedCurrent({...oldq,question:'Đề mới'}),false);
   assert.equal(isQuestionVerifiedCurrent({...oldq,correctAnswer:'2'}),false);
   assert.equal(isQuestionVerifiedCurrent({...oldq,rubric:'Barem mới'}),false);
   assert.equal(isQuestionVerifiedCurrent({...oldq,points:2}),true);
 });
 check('BATCH bỏ qua câu đã verified, cập nhật fingerprint',()=>{
    const ui=read('src/components/AiBatchSolveModal.tsx');assert.ok(ui.includes('questions.filter(shouldVerifyQuestion)'));assert.ok(ui.includes('getQuestionVerificationFingerprint(q)'));
 });
 console.log(`ĐẠT ${passed} bài kiểm thử, không gọi API, không build.`);
})().catch(err=>{console.error(err);process.exitCode=1});
