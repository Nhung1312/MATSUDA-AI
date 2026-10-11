/** Run: node --experimental-strip-types scripts/test-gemini-pdf-reconcile.mjs */
import assert from 'node:assert/strict';
import { reconcileExtraGeminiPdfSolutions } from '../src/utils/reconcileGeminiPdf.ts';
const mcq = Array.from({length:10},(_,i)=>({id:'t'+i,order:i+1,type:'multiple_choice',question:'Câu '+(i+1),correctAnswer:'C',points:0.3,options:[{id:'A',text:'a'},{id:'C',text:'c'}]}));
const statements = [
'a) 85-(85-24) b) (-142)+(142-59)',
'a) (245-99)-245 b) (-85)-(15-85) c) 521-(21+150) d) (2024-187)-(2024+13) e) -(-25+43-17)-(25-43+17)',
'a) x-(12-7)=15 b) 35-(x+5)=20 c) (x-18)-(-30)=12',
'a) A=(a+b)-(a-b) b) B=-(x-y+z)+(x-y-z)'];
const solutions = [
'a) 85-(85-24)=85-85+24=24 b) (-142)+(142-59)=-142+142-59=-59',
'a) (245-99)-245=-99 b) (-85)-(15-85)=-15 c) 521-(21+150)=350 d) (2024-187)-(2024+13)=-200 e) -(-25+43-17)-(25-43+17)=0',
'a) x-(12-7)=15 => x=20 b) 35-(x+5)=20 => x=10 c) (x-18)-(-30)=12 => x=0',
'a) A=(a+b)-(a-b)=2b b) B=-(x-y+z)+(x-y-z)=-2z c) C=(m-n+p)-(m+n-p)=-2n+2p d) P=(a-b)+(c-d); Q=(a+c)-(b+d); P=Q'];
const essay=statements.map((question,i)=>({id:'e'+i,order:11+i,type:'essay',question,correctAnswer:'',points:[2,2,2,1][i],options:[]}));
const extras=solutions.map((question,i)=>({...essay[i],id:'answer'+i,order:15+i,question,points:1}));
const reference={totalFound:14,multipleChoiceCount:10,essayCount:4,items:[...mcq.map(()=>({category:'trac_nghiem'})),...solutions.map(explanation=>({category:'tu_luan',explanation}))]};
const raw=[...mcq,...essay,...extras];
const ok=reconcileExtraGeminiPdfSolutions(raw,reference);
assert.equal(ok.questions.length,14);
assert.equal(ok.recoveredCount,4);
assert.equal(ok.questions.reduce((n,q)=>n+q.points,0),10);
assert.ok(ok.questions.slice(10).every(q=>q.explanation));
assert.equal(reconcileExtraGeminiPdfSolutions(raw.slice(0,14),reference).recoveredCount,0);
const noEvidence={...reference,items:reference.items.map(x=>({...x,explanation:undefined}))};
assert.equal(reconcileExtraGeminiPdfSolutions(raw,noEvidence).questions.length,18);
const unrelated=raw.map((q,i)=>i===16?{...q,question:'Tính thể tích hình lập phương'}:q);
assert.equal(reconcileExtraGeminiPdfSolutions(unrelated,reference).questions.length,18);
const wrongType=raw.map((q,i)=>i===11?{...q,type:'multiple_choice'}:q);
assert.equal(reconcileExtraGeminiPdfSolutions(wrongType,reference).questions.length,18);
const wrongOrder=raw.map((q,i)=>i===12?{...q,order:99}:q);
assert.equal(reconcileExtraGeminiPdfSolutions(wrongOrder,reference).questions.length,18);
assert.equal(reconcileExtraGeminiPdfSolutions(raw,{...reference,totalFound:18}).questions.length,18);
assert.equal(reconcileExtraGeminiPdfSolutions(raw.slice(0,17),reference).questions.length,17);
console.log('PASS: 8 guarded reconciliation checks');