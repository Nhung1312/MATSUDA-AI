import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { aiService } from '../src/services/aiService';
import { verificationFingerprint } from '../src/services/verificationOptimizer';
import { hasVerificationReference } from '../src/utils/verificationUtils';
import { isEssayQuestion } from '../src/utils/questionUtils';
assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'));
const local = new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>local.get(k)??null,setItem:(k:string,v:string)=>local.set(k,v)}});
const text=fs.readFileSync(new URL('../src/components/AiSolveExamModal.tsx',import.meta.url),'utf8');
function bind(name:string,deps:Record<string,any>) {
 const ast=ts.createSourceFile('view.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found:ts.Node|undefined;
 const visit=(node:ts.Node)=>{
  if(name==='initialize'&&ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect')found=node.arguments[0];
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)found=node;
  ts.forEachChild(node,visit);
 };visit(ast);assert.ok(found,name);
 const code=name==='initialize'?`const initialize = ${found!.getText(ast)};`:`const ${found!.getText(ast)};`;
 const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(deps),js+`\nreturn ${name};`)(...Object.values(deps));
}
async function until(predicate:()=>boolean) { for (let i=0;i<1000;i++) { if(predicate())return; await new Promise(resolve=>setTimeout(resolve,1)); } throw Error('Fixture did not settle'); }
const q:any={id:'review-essay',order:1,question:'Giải phương trình x+1=2.',type:'essay',options:[],points:1,correctAnswer:'x=1',explanation:'x=2-1=1.',rubric:'Biến đổi và kết luận: 1 điểm.'};
const good=(id:string)=>({questionId:id,order:1,currentAnswer:'x=1',proposedAnswer:'x=1',matchesCurrentAnswer:true,confidence:'high',needsReview:false,reason:'Đúng.'});
function harness(questions:any[]) {
 const state:any={lock:{current:false},map:{},choices:Object.fromEntries(questions.map(q=>[q.id,q.correctAnswer||''])),decisions:{},stale:new Set(),calls:[],saved:null,alerts:[]};
 let provider:any=async(params:any)=>Promise.all(params.questions.map(async(q:any)=>({...good(q.id),inputFingerprint:await verificationFingerprint(q,'7','Toán')})));
 const deps=()=>({isOpen:true,isChecking:false,questions,grade:'7',topic:'Toán',verificationFingerprint,hasVerificationReference,isEssayQuestion,
 verificationBusy:false,verificationOperationLock:state.lock,verificationMap:state.map,userSelectedMap:state.choices,manualDecisionMap:state.decisions,
 staleQuestionIds:state.stale,quickPasteText:'1A 2B',
 aiService:{hasApiKey:()=>true,verifyExamQuestions:async(p:any)=>{state.calls.push(p);return provider(p);},verifySingleQuestion:async(p:any)=>provider({questions:[p.question]}).then((v:any)=>v[0])},
 setIsChecking:(v:any)=>{state.checking=v;},setHasApiKey:()=>{},setIsSolving:()=>{},setIsSaving:()=>{},setReverifyingId:()=>{},setProgress:()=>{},setFilterMode:()=>{},setShowQuickPaste:()=>{},setQuickPasteText:()=>{},
 setStaleQuestionIds:(v:any)=>{state.stale=v;},setVerificationMap:(v:any)=>{state.map=typeof v==='function'?v(state.map):v;},
 setUserSelectedMap:(v:any)=>{state.choices=typeof v==='function'?v(state.choices):v;},setManualDecisionMap:(v:any)=>{state.decisions=typeof v==='function'?v(state.decisions):v;},
 alert:(m:any)=>state.alerts.push(m),onApplyAnswers:async(v:any)=>{state.saved=v;},onClose:()=>{state.closed=true;}});
 return {state,setProvider:(p:any)=>{provider=p;},call:(name:string,...args:any[])=>bind(name,deps())(...args)};
}
const verified={...q,verificationStatus:'verified',teacherVerified:true,needsReview:false,verificationFingerprint:await verificationFingerprint(q,'7','Toán')};
const unchanged=harness([verified]);unchanged.call('initialize');await until(()=>unchanged.state.checking===false);
assert.equal(unchanged.state.decisions[q.id],'keep');assert.equal(unchanged.state.stale.size,0);
await unchanged.call('handleStartVerification');assert.equal(unchanged.state.calls.length,0);
const edited={...verified,correctAnswer:'x=3'};
const stale=harness([edited]);stale.call('initialize');await until(()=>stale.state.checking===false);
assert.equal(stale.state.decisions[q.id],undefined);assert.ok(stale.state.stale.has(q.id));
assert.equal(stale.state.map[q.id].needsReview,true);
await stale.call('handleConfirmApply');assert.equal(stale.state.saved[0].verificationStatus,'needs_review');
stale.call('handleKeepCurrent',edited);await stale.call('handleConfirmApply');assert.equal(stale.state.saved[0].verificationStatus,'verified');
assert.equal(stale.state.saved[0].teacherVerified,true);
assert.equal(stale.state.saved[0].verificationFingerprint,await verificationFingerprint(stale.state.saved[0],'7','Toán'));
console.log('PASS: unchanged teacher approvals reuse SHA fingerprints; changed source cannot silently inherit approval; explicit teacher review saves the current fingerprint');
const run=harness([q]);let release:any;run.setProvider((p:any)=>new Promise(resolve=>{release=()=>resolve(p.questions.map((q:any)=>good(q.id)));}));
const first=run.call('handleStartVerification',true);await until(()=>typeof release==='function');
await run.call('handleStartVerification',true);assert.equal(run.state.calls.length,1);assert.equal(run.state.calls[0].force,true);
release();await first;assert.equal(run.state.lock.current,false);
run.state.decisions[q.id]='keep';run.setProvider(async()=>[{...good(q.id),needsReview:true,confidence:'needs_review'}]);
await run.call('handleSolveSingle',q);assert.equal(run.state.decisions[q.id],undefined);
assert.equal(run.state.map[q.id].needsReview,true);
const blank={...q,id:'no-ref',correctAnswer:'',explanation:'',rubric:''};const missing=harness([blank]);
missing.call('handleKeepCurrent',blank);assert.equal(missing.state.decisions[blank.id],undefined);
await missing.call('handleConfirmApply');assert.equal(missing.state.saved[0].verificationStatus,'needs_review');
const mc={...q,id:'mc',order:1,type:'multiple_choice',correctAnswer:'A',options:[{id:'A',text:'1'},{id:'B',text:'2'}]};
const paste=harness([mc,{...q,order:2}]);paste.call('handleApplyQuickPaste');assert.equal(paste.state.choices[q.id],'x=1');
console.log('PASS: explicit force reaches the optimizer, rapid clicks are blocked, fresh analysis clears old manual decisions, blank references cannot be approved, quick-paste does not replace essay answers');
let calls=0;
(globalThis as any).__examOfflineFetch=async()=>{calls++;throw Error('No provider call allowed for a missing source');};
const missingResult=await aiService.verifyExamQuestions({questions:[blank,{...blank,id:'no-ref-2'}]});
assert.equal(calls,0);assert.ok(missingResult.every(r=>r.needsReview));
assert.ok(hasVerificationReference({...blank,rubric:'Kết luận x=1: 1 điểm.'}));
console.log('PASS: missing-reference verification returns teacher-review results with zero API calls, even without a key; existing rubric-only references remain eligible');
assert.ok(text.includes('max-w-6xl'));assert.ok(text.includes('min-h-0'));
console.log('VERIFICATION REVIEW: PASS (network blocked; synthetic data)');
