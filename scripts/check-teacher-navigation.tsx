import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import { create, act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const surface = new EventTarget() as any;
surface.location = { pathname:'/teacher', search:'', hash:'' };
Object.defineProperty(globalThis,'window',{configurable:true,value:surface});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{throw Error('QuotaExceededError');}}});
const assignment={id:'a',assignmentCode:'ALIAS-A',title:'Synthetic exam',teacherId:'teacher-fixture',questions:[],grade:'7'};
const original={id:'s',assignmentId:'a',studentName:'Synthetic student',answers:[],totalScore:0,saveRevision:0};
const env:any={user:{uid:'teacher-fixture',email:'teacher@example.test'},mounts:0,unmounts:0,probes:[],nextRead:null};
env.storage={initDemoData(){},getClasses:()=>[],getAssignments:()=>[],getSubmissions:()=>[],setClasses(){},setAssignments(){},setSubmissions(){}};
env.firestore={
  getTeacherProfile:async()=>({classes:[{id:'c',students:[]}]}),
  getExams:async()=>[assignment],
  getAllResults:async()=> env.nextRead ? await env.nextRead : [original]
};
(globalThis as any).__navigationTest=env;
const router=`
import React from 'react';
export const BrowserRouter=({children})=>children;
export const Routes=({children})=>React.Children.toArray(children).find(e=>e.props.path==='/teacher/*').props.element;
export const Route=()=>null, Navigate=()=>null;
export const useNavigate=()=>()=>{};
export const useLocation=()=>({pathname:'/teacher'});
`;
const modules:Record<string,string>={
  AuthContext:`const e=globalThis.__navigationTest; export const useAuth=()=>({user:e.user,loading:false}); export const AuthProvider=({children})=>children;`,
  firebase:`export const auth={get currentUser(){return globalThis.__navigationTest.user;}};`,
  firestoreService:`export const FirestoreService=globalThis.__navigationTest.firestore;`,
  storageService:`export const StorageService=globalThis.__navigationTest.storage;`,
  cloudSessionCache:`export const CloudSessionCache={begin(){},set(){}};`,
  subscriptionService:`export const BILLING_ENABLED=false; export const SubscriptionService={getSubscription:async()=>null,isExpired:()=>false};`,
  useLearningProgressStore:`export const useLearningProgressStore={getState:()=>({setStudentName(){},recordSubmission(){},setProgressModalOpen(){}})};`,
  PrivateRoute:`export const PrivateRoute=({children})=>children;`,
  TeacherOverview:`import React from 'react'; export function TeacherOverview(p){return React.createElement('div',{},
    React.createElement('button',{'data-test':'exam-card',onClick:()=>p.onNavigate('results',{assignmentId:'a'})},'exam-card'),
    React.createElement('button',{'data-test':'pending-row',onClick:()=>p.onNavigate('results',{assignmentId:'a',submissionId:'s',pendingOnly:true})},'pending-row'));}`,
  TeacherResults:`import React from 'react'; const e=globalThis.__navigationTest; export function TeacherResults(p){
    const [draft,setDraft]=React.useState(''); const [selected]=React.useState(p.initialSubmissionId||'none');
    React.useEffect(()=>{e.mounts++;return()=>{e.unmounts++;}},[]);
    e.probes.push({assignment:p.initialAssignmentId,selected,draft,submissions:p.submissions});
    return React.createElement('section',{'data-test':'results'},
      React.createElement('input',{'data-test':'teacher-input',value:draft,onChange:event=>setDraft(event.target.value)}),
      React.createElement('span',{},selected)); }`
};
const compiled=await build({entryPoints:['src/App.tsx'],bundle:true,write:false,format:'esm',platform:'node',packages:'external',
  plugins:[{name:'navigation-isolation',setup(b){
    b.onResolve({filter:/react-router-dom/},()=>({path:'router',namespace:'navigation-mock'}));
    b.onResolve({filter:/^\./},args=>{
      const name=args.path.split('/').pop()!.replace(/\.(tsx?|jsx?)$/,'');
      if(modules[name])return {path:name,namespace:'navigation-mock'};
      if(name==='TeacherLayout'||name==='App')return;
      if(/components\/|pages\//.test(args.path)) {
        modules[name]='export const '+name+'=()=>null;';
        return {path:name,namespace:'navigation-mock'};
      }
    });
    b.onLoad({filter:/.*/,namespace:'navigation-mock'},args=>({contents:args.path==='router'?router:modules[args.path],loader:'js'}));
  }}]});
const {default:App}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
let renderer:ReactTestRenderer;
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
await act(async()=>{renderer=create(React.createElement(App));await tick();});
function label(node:ReactTestInstance):string{return node.children.map(c=>typeof c==='string'?c:label(c)).join('');}
function nav(text:string){return renderer!.root.findAll(n=>n.type==='button').find(n=>label(n)===text)!;}
function byTest(id:string){return renderer!.root.find(n=>n.props['data-test']===id);}
for(const [path,click] of [
  ['results-tab',()=>nav('Kết quả').props.onClick()],
  ['exam-card',()=>byTest('exam-card').props.onClick()],
  ['pending-row',()=>byTest('pending-row').props.onClick()]
] as const){
  let release!:(v:any)=>void;
  env.nextRead=new Promise(resolve=>{release=resolve;});
  await act(async()=>{click();await tick();});
  assert.ok(byTest('results'),path+' stays open during background sync');
  const mounts=env.mounts;
  await act(async()=>{byTest('teacher-input').props.onChange({target:{value:'unsaved teacher feedback'}});});
  if(path==='pending-row')assert.equal(env.probes.at(-1).selected,'s');
  if(path!=='results-tab')assert.equal(env.probes.at(-1).assignment,'a');
  const confirmed={...original,totalScore:7,saveRevision:1,saveBaseFingerprint:'confirmed-test'};
  await act(async()=>{
    surface.dispatchEvent(new CustomEvent('submissions-confirmed',{detail:{kind:'result',scope:'teacher-fixture',submission:confirmed}}));
    release([original]);await tick();
  });
  assert.equal(env.mounts,mounts,path+' must not remount TeacherLayout/Results');
  assert.equal(byTest('teacher-input').props.value,'unsaved teacher feedback');
  assert.equal(env.probes.at(-1).submissions[0].totalScore,7,'older in-flight refresh cannot overwrite confirmed save');
  env.nextRead=null;
  await act(async()=>{nav('Tổng quan').props.onClick();});
  console.log('PASS navigation '+path+': selected target/input retained; confirmed parent snapshot survives stale refresh');
}
await act(async()=>{renderer!.unmount();});
console.log('TEACHER NAVIGATION PASS — actual App and TeacherLayout, mocked pages/services, network blocked');
