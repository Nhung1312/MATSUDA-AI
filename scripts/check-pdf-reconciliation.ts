import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { aiService } from '../src/services/aiService';
import { FileParserService } from '../src/services/fileParserService';
import { normalizeMediaExamQuestions, ExamImportError } from '../src/utils/examImportUtils';
import { auditNewMediaQuestions } from '../src/utils/mediaImportGuard';
assert.ok(String(globalThis.fetch).includes('__examOfflineFetch'));
const local=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>local.get(k)??null,setItem:(k:string,v:string)=>local.set(k,v)}});
const clone=(value:any)=>JSON.parse(JSON.stringify(value));
const mc:any={id:'mc',order:1,question:'Tính 1+1.',type:'multiple_choice',options:[{id:'A',text:'1'},{id:'B',text:'2'}],correctAnswer:'B',points:.25};
const essay:any={id:'essay',order:2,question:'Tìm x trong x+1=2.',type:'essay',options:[],correctAnswer:'',explanation:'',rubric:'',points:.75};
const solution='x=2-1=1.';
const extra={...essay,id:'extra',order:3,question:solution,points:1};
const reference:any={fileName:'synthetic.pdf',fileType:'pdf',totalFound:2,multipleChoiceCount:1,essayCount:1,
  items:[{...mc,category:'trac_nghiem'},{...essay,category:'tu_luan',explanation:solution}],privateMarker:'local-reference-not-sent'};
const raw:any={sourceCounts:{questionCount:2,multipleChoiceCount:1,essayCount:1},declaredTotalPoints:1,questions:[mc,essay,extra]};
const before=JSON.stringify({raw,reference});
assert.throws(()=>normalizeMediaExamQuestions(raw),ExamImportError);
const repaired=normalizeMediaExamQuestions(raw,reference);
assert.equal(repaired.length,2);assert.equal(repaired[1].explanation,solution);
assert.equal(repaired[1].correctAnswer,'');assert.equal(repaired[1].points,.75);
assert.equal(JSON.stringify({raw,reference}),before);
let payload=raw,providerCalls=0;
(globalThis as any).__examOfflineFetch=async(_url:unknown,init:RequestInit)=>{
 providerCalls++;
 assert.ok(!String(init.body).includes(reference.privateMarker),'Independent PDF evidence must not become an extra AI payload');
 return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(payload)}]}}]}),{headers:{'content-type':'application/json'}});
};
const text=fs.readFileSync(new URL('../src/components/FileUploadModal.tsx',import.meta.url),'utf8');
function bind(name:string,deps:Record<string,any>) {
 const ast=ts.createSourceFile('view.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found:ts.VariableDeclaration|undefined;
 const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)found=node;ts.forEachChild(node,visit);};visit(ast);assert.ok(found,name);
 const js=ts.transpileModule(`const ${found!.getText(ast)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(deps),js+`\nreturn ${name};`)(...Object.values(deps));
}
function harness(ref:any=reference,service:any=aiService) {
 const state:any={parse:null,issues:[],error:null,imports:[]};
 const deps=()=>({apiKeyInput:'synthetic-key-only',selectedGrade:'7',aiService:service,
  fileToBase64:async()=> 'data:application/pdf;base64,JVBERg==',setShowKeyInput:()=>{},setIsLoading:()=>{},setAiProgressStatus:()=>{},
  setParseResult:(value:any)=>{state.parse=value;},setAiPdfIssues:(value:any)=>{state.issues=value;},setErrorMsg:(value:any)=>{state.error=value;},
  FileParserService:{parsePdfFile:async()=>ref,normalizeParseResult:FileParserService.normalizeParseResult,convertToQuestions:FileParserService.convertToQuestions},
  auditNewMediaQuestions,toFriendlyAiError:(error:any)=>error.message,parseResult:state.parse,aiPdfIssues:state.issues,
  onImportQuestions:(questions:any)=>state.imports.push(questions),onClose:()=>{},window:{confirm:()=>true}});
 return {state,process:()=>bind('handleProcessPdfWithAI',deps())({name:'synthetic.pdf'}),confirm:()=>bind('handleConfirmImport',deps())()};
}
const good=harness();let count=providerCalls;await good.process();
assert.equal(providerCalls-count,1,'Reconciliation must not trigger another extraction request');
assert.equal(good.state.error,null);assert.equal(good.state.parse.totalFound,2);
assert.ok(good.state.issues.some((issue:any)=>issue.level==='warning'&&/ghép/.test(issue.message)));
assert.ok(!good.state.issues.some((issue:any)=>issue.level==='error'));good.confirm();
assert.equal(good.state.imports[0].length,2);assert.equal(good.state.imports[0][1].explanation,solution);
assert.equal(good.state.imports[0][1].points,.75);
const uncertain=clone(raw);delete uncertain.sourceCounts;uncertain.questions[2].question='Tìm một kết quả khác: y+5=8.';
payload=uncertain;const blocked=harness();count=providerCalls;await blocked.process();
assert.equal(providerCalls-count,1);assert.equal(blocked.state.parse.totalFound,3,'Unproven extra question must stay visible');
assert.ok(blocked.state.issues.some((issue:any)=>issue.level==='error'&&issue.order===0));
blocked.confirm();assert.equal(blocked.state.imports.length,0);assert.match(blocked.state.error,/Chưa nhập đề/);
const scan=harness({...reference,totalFound:0,multipleChoiceCount:0,essayCount:0,items:[]});
count=providerCalls;await scan.process();assert.equal(providerCalls-count,1);assert.equal(scan.state.parse.totalFound,3,'Scans without independent evidence are never auto-collapsed');
const empty=harness(reference,{extractQuestionsFromMedia:async()=>({questions:[mc,{...essay,question:''}]})});
await empty.process();assert.equal(empty.state.parse.totalFound,1);
assert.ok(empty.state.issues.some((issue:any)=>issue.level==='error'&&issue.order===0));
empty.confirm();assert.equal(empty.state.imports.length,0,'Normalization dropping a blank row must not hide the import error');
assert.equal(JSON.stringify({raw,reference}),before);
payload=raw;count=providerCalls;
await assert.rejects(()=>aiService.extractQuestionsFromMedia({apiKey:'synthetic-only',media:[{mimeType:'image/png',base64Data:'synthetic'}],pdfReference:reference}),ExamImportError);
assert.equal(providerCalls-count,1,'Image import retains strict count validation and never applies the PDF-only recovery');
console.log('PASS: actual PDF service and UI reconcile before count validation using local source evidence; exactly one mocked extraction call, unchanged source/points, visible unproven extras, blocked unsafe imports, no scan auto-deletion');
console.log('PDF RECONCILIATION: PASS (offline synthetic fixtures; no student/cloud writes)');
