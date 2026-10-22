import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { create, act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { prepareResultWrite, versionResult } from '../src/services/resultPersistence';
import type { Submission } from '../src/types';
assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()});
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{throw Error('QuotaExceededError');}}});
const questions=[1,2].map(i=>({id:'q'+i,order:i,question:'Original essay '+i,type:'essay',points:1,options:[],correctAnswer:'x='+i,rubric:'Original rubric '+i}));
const exam:any={id:'a',assignmentCode:'ALIAS-A',title:'UI fixture',questions,grade:'7',classId:'c',durationMinutes:30};
let latest:any={id:'s',assignmentId:' alias-a ',assignmentTitle:exam.title,studentName:'Synthetic student',classId:'c',className:'C',
  answers:questions.map((q,i)=>({questionId:q.id,selectedAnswer:'x='+i,studentSolutionText:'Original student solution '+i,pointsEarned:0,maxPoints:1,isCorrect:false,
    needsTeacherReview:true,essayImages:['data:image/png;base64,ORIGINAL_'+i],
    stepAnalysis:[{stepIndex:1,studentLatex:'x='+i,status:'correct',confidence:.99,comment:'Original step comment '+i}]})),
  totalScore:0,maxScore:2,totalQuestions:2,correctCount:0,wrongCount:0,unansweredCount:0,timeSpentSeconds:25,startedAt:'2026-01-01',
  submittedAt:'2026-01-01',hasEssayQuestions:true,gradingStatus:'needs_review',needsTeacherReview:true,shuffledQuestions:questions};
const original=structuredClone(latest);
const env:any={records:[],saveCalls:0};
env.save=async(submission:Submission)=>{
  if(env.deferNext){
    env.deferNext=false;env.saveCalls++;env.pending={...submission,saveAttemptId:'late-op'};
    return {localSaved:true,cloudSaved:false,pendingSubmission:env.pending,error:'Fixture awaiting acknowledgement'};
  }
  const next=await prepareResultWrite(latest,submission,{intent:'teacher',operationId:crypto.randomUUID()});
  latest=next.record; const confirmed=await versionResult(latest);env.saveCalls++;
  window.dispatchEvent(new CustomEvent('submissions-confirmed',{detail:{kind:'result',scope:'teacher-fixture',submission:confirmed}}));
  return {localSaved:false,cloudSaved:true,submission:confirmed};
};
env.read=async()=>versionResult(latest);
(globalThis as any).__reviewUITest=env;
const mocks:Record<string,string>={
  submissionSaveService:`const e=globalThis.__reviewUITest;export const saveSubmissionConfirmed=e.save,listPendingResultSaves=async()=>[];`,
  firestoreService:`export const FirestoreService={getResultById:globalThis.__reviewUITest.read};`,
  storageService:`export const StorageService={};`,
  aiService:`export const aiService={analyzeClassMistakes:async()=>{throw Error('Unexpected AI request');}};`,
  stepGradingService:`export const stepGradingService={analyzeStepByStep:async()=>{throw Error('Unexpected AI grading');}};`,
  submissionExportService:`export const downloadSubmissionExport=async()=>{throw Error('Unexpected export');};`,
  MathDisplay:`import React from 'react';export const MathDisplay=({text})=>React.createElement('span',{},text);`,
  StepGradingBreakdown:`import React from 'react';export const StepGradingBreakdown=({result})=>React.createElement('pre',{},JSON.stringify(result));`
};
const compiled=await build({entryPoints:['src/pages/teacher/TeacherResults.tsx'],bundle:true,write:false,platform:'node',format:'esm',packages:'external',
  plugins:[{name:'review-ui-isolation',setup(b){
    b.onResolve({filter:/^\./},args=>{
      const name=args.path.split('/').pop()!.replace(/\.(tsx?|jsx?)$/,'');
      if(mocks[name])return {path:name,namespace:'review-ui-mock'};
      if(/components\//.test(args.path)){
        mocks[name]='export const '+name+'=()=>null;';return {path:name,namespace:'review-ui-mock'};
      }
    });
    b.onLoad({filter:/.*/,namespace:'review-ui-mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:process.cwd()}));
  }}]});
const moduleFile=resolve(mkdtempSync(resolve('.test-review-ui-')),'review.mjs');
writeFileSync(moduleFile,compiled.outputFiles[0].text);
const {TeacherResults}=await import(pathToFileURL(moduleFile).href);
let renderer:ReactTestRenderer;
function label(node:ReactTestInstance):string{return node.children.map(c=>typeof c==='string'?c:label(c)).join('');}
const buttons=(text:string)=>renderer!.root.findAll(n=>n.type==='button'&&label(n)===text);
function Wrapper({loaded}:{loaded:boolean}){
  const [submissions,setSubmissions]=React.useState<any[]>([]);
  React.useEffect(()=>{
    const listener=(event:any)=>setSubmissions([event.detail.submission]);
    window.addEventListener('submissions-confirmed',listener);
    return()=>window.removeEventListener('submissions-confirmed',listener);
  },[]);
  React.useEffect(()=>{if(loaded)env.initialLoad=versionResult(latest).then(s=>setSubmissions([s]));},[loaded]);
  return React.createElement(TeacherResults,{assignments:loaded?[exam]:[],classes:[],submissions,
    initialAssignmentId:'ALIAS-A',initialSubmissionId:'s',initialPendingOnly:true,onOpenShare:()=>{}});
}
await act(async()=>{renderer=create(React.createElement(Wrapper,{loaded:false}));});
await act(async()=>{renderer!.update(React.createElement(Wrapper,{loaded:true}));await new Promise<void>(resolve=>setImmediate(resolve));});
await act(async()=>{await env.initialLoad;});
assert.ok(renderer!.root.findAllByType('select').some(node=>node.props.value==='a'),'Alias resolves after the Cloud list arrives');
for(const i of [0,1])assert.ok(renderer!.root.findAllByType('img').some(n=>n.props.src==='data:image/png;base64,ORIGINAL_'+i));
assert.ok(JSON.stringify(renderer!.toJSON()).includes('Original step comment 0'));
assert.ok(JSON.stringify(renderer!.toJSON()).includes('Original student solution 0'));
let scoreInputs=renderer!.root.findAll(n=>n.type==='input'&&n.props.type==='number');
assert.equal(scoreInputs.length,2);
await act(async()=>{scoreInputs[0].props.onChange({target:{value:'0.75'}});});
await act(async()=>{await buttons('Lưu')[0].props.onClick();await new Promise<void>(resolve=>setImmediate(resolve));});
assert.equal(latest.answers[0].teacherScore,.75);assert.equal(env.saveCalls,1);
await act(async()=>{buttons('✕')[0].props.onClick();});
await act(async()=>{buttons('Xem bài')[0].props.onClick();});
scoreInputs=renderer!.root.findAll(n=>n.type==='input'&&n.props.type==='number');
assert.equal(scoreInputs[0].props.value,.75);
await act(async()=>{scoreInputs[1].props.onChange({target:{value:'0.5'}});});
await act(async()=>{await buttons('Lưu').at(-1)!.props.onClick();await new Promise<void>(resolve=>setImmediate(resolve));});
assert.equal(latest.answers[0].teacherScore,.75);assert.equal(latest.answers[1].teacherScore,.5);
assert.deepEqual(latest.shuffledQuestions,original.shuffledQuestions);
assert.deepEqual(latest.answers[0].essayImages,original.answers[0].essayImages);
assert.deepEqual(latest.answers[0].stepAnalysis,original.answers[0].stepAnalysis);
assert.equal(env.saveCalls,2);
const questionTwo=()=>renderer!.root.find(node=>node.props.id==='teacher-review-q2');
const saveQuestionTwo=()=>questionTwo().findAll(node=>node.type==='button'&&['Lưu','Đã lưu'].includes(label(node)))[0].props.onClick();
env.deferNext=true;
await act(async()=>{questionTwo().findAll(node=>node.type==='input'&&node.props.type==='number')[0].props.onChange({target:{value:'0.6'}});});
await act(async()=>{await saveQuestionTwo();await new Promise<void>(resolve=>setImmediate(resolve));});
assert.ok(JSON.stringify(renderer!.toJSON()).includes('Fixture awaiting acknowledgement'));
const late=await prepareResultWrite(latest,env.pending,{intent:'teacher',operationId:'late-op'});
latest=late.record;
await act(async()=>{
  window.dispatchEvent(new CustomEvent('submissions-confirmed',{detail:{kind:'result',scope:'teacher-fixture',submission:await versionResult(latest)}}));
  await new Promise<void>(resolve=>setImmediate(resolve));
});
assert.ok(JSON.stringify(renderer!.toJSON()).includes('Firebase đã xác nhận bản gửi trước đó'));
await act(async()=>{questionTwo().findAll(node=>node.type==='input'&&node.props.type==='number')[0].props.onChange({target:{value:'0.7'}});});
await act(async()=>{saveQuestionTwo();await new Promise<void>(resolve=>setImmediate(resolve));});
assert.equal(latest.answers[0].teacherScore,.75);assert.equal(latest.answers[1].teacherScore,.7);
assert.equal(env.saveCalls,4,'A late acknowledgement releases the pending edit without another AI call');
await act(async()=>{renderer!.unmount();});
console.log('PASS actual TeacherResults: delayed Cloud list/alias opens exact pending ID, old essay image/solution/analysis render, q1-close-reopen-q2 retains q1 without any AI request');
