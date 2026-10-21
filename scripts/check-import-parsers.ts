import { FileParserService, ParseResult } from '../src/services/fileParserService';
import fs from 'node:fs';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function checkPdfTextLayer() {
  const source = `
Câu 1. Giá trị của 2 + 3 là:
A. 4
B. 5
C. 6
D. 7
Câu 2. Giải phương trình x + 2 = 5.
`;
  const result = FileParserService.normalizeParseResult(
    FileParserService.parseRawText(source, 'fixture.pdf', 'pdf')
  );

  assert(result.totalFound === 2, 'PDF: phải tách được 2 câu');
  assert(result.items[0].order === 1 && result.items[1].order === 2, 'PDF: thứ tự câu phải liên tục');
  assert(result.items[0].category === 'trac_nghiem', 'PDF: câu 1 phải là trắc nghiệm');
  assert(result.items[1].category === 'tu_luan', 'PDF: câu 2 phải là tự luận');
}

function checkWordTextLayer() {
  const source = `
Câu 1. Nghiệm của phương trình x - 1 = 0 là:
A. 0
B. 1
C. 2
D. -1

Bảng đáp án: 1B
`;
  const result = FileParserService.normalizeParseResult(
    FileParserService.parseRawText(source, 'fixture.docx', 'word')
  );

  assert(result.totalFound === 1, 'Word: phải tách được 1 câu');
  assert(result.items[0].correctAnswer === 'B', 'Word: phải giữ đúng đáp án từ bảng đáp án');
}

function checkLatexLayer() {
  const source = String.raw`
\documentclass{article}
\begin{document}
\begin{ex}
Nghiệm của phương trình $x-1=0$ là
\choice
{$0$}
{\True $1$}
{$2$}
{$-1$}
\loigiai{$x=1$.}
\end{ex}

\begin{ex}
Giải phương trình $2x+1=7$.
\loigiai{$2x=6\Rightarrow x=3$.}
\end{ex}
\end{document}
`;

  const result = FileParserService.parseLatexText(source, 'fixture.tex');

  assert(result.totalFound === 2, 'LaTeX: phải tách được 2 câu');
  assert(result.items[0].category === 'trac_nghiem', 'LaTeX: câu 1 phải là trắc nghiệm');
  assert(result.items[0].correctAnswer === 'B', 'LaTeX: phải giữ đúng \\True ở phương án B');
  assert(result.items[0].options.length === 4, 'LaTeX: phải có đủ 4 phương án');
  assert(result.items[1].category === 'tu_luan', 'LaTeX: câu 2 phải là tự luận');
}


function checkPastedLatex20Questions() {
  // Real source format supplied by teacher: THCS class 6, 20 ex/choice items.
  // No Gemini calls. Marked answer key is compared with source solution labels.
  const samples: Array<{q: string; o: string[]; k: string}> = [
  {
    "q": "Cho tập hợp $A=\\{x\\in\\mathbb{N}|4<x\\le9\\}$. Tập hợp A viết dưới dạng liệt kê là:",
    "o": [
      "\\{4; 5; 6; 7; 8; 9\\}",
      "\\{4; 5; 6; 7; 8\\}",
      "\\{5; 6; 7; 8\\}",
      "\\{5; 6; 7; 8; 9\\}"
    ],
    "k": "D"
  },
  {
    "q": "Số tự nhiên $x$ thỏa mãn $(x-29)-11=0$ là:",
    "o": [
      "30",
      "39",
      "40",
      "41"
    ],
    "k": "C"
  },
  {
    "q": "Kết quả phép tính $312 - 97$ bằng:",
    "o": [
      "212",
      "215",
      "225",
      "409"
    ],
    "k": "B"
  },
  {
    "q": "Tích $2525:25.5-5$ là:",
    "o": [
      "50",
      "0",
      "500",
      "Kết quả khác"
    ],
    "k": "C"
  },
  {
    "q": "Thứ tự thực hiện các phép tính đối với biểu thức không có dấu ngoặc là:",
    "o": [
      "Nhân và chia $\\rightarrow$ Lũy thừa $\\rightarrow$ Cộng và trừ",
      "Lũy thừa $\\rightarrow$ Nhân và chia $\\rightarrow$ Cộng và trừ",
      "Cộng và trừ $\\rightarrow$ Nhân và chia $\\rightarrow$ Lũy thừa",
      "Lũy thừa $\\rightarrow$ Cộng và trừ $\\rightarrow$ Nhân và chia"
    ],
    "k": "B"
  },
  {
    "q": "Tính giá trị của lũy thừa $2^{6}$ ta được kết quả là:",
    "o": [
      "16",
      "32",
      "64",
      "12"
    ],
    "k": "C"
  },
  {
    "q": "Kết quả phép tính $5^{9} \\cdot 5^{5}$ bằng:",
    "o": [
      "$5^{45}$",
      "$5^{14}$",
      "$25^{14}$",
      "$10^{14}$"
    ],
    "k": "B"
  },
  {
    "q": "Tìm số tự nhiên $x$, biết: $(x - 25) \\cdot 2021=0$ ta được kết quả $x$ bằng:",
    "o": [
      "0",
      "45",
      "25",
      "26"
    ],
    "k": "C"
  },
  {
    "q": "Thương $q$ và số dư $r$ trong phép chia $a=713$ cho $b=51$ là:",
    "o": [
      "$q=14; r=0$",
      "$q=13; r=50$",
      "$q=50; r=13$",
      "$q=14; r=1$"
    ],
    "k": "B"
  },
  {
    "q": "Dạng tổng quát của số tự nhiên chia hết cho 3 là?",
    "o": [
      "$3k (k\\in\\mathbb{N})$",
      "$5k+3 (k\\in\\mathbb{N})$",
      "$3k+1 (k\\in\\mathbb{N})$",
      "$3k+2 (k\\in\\mathbb{N})$"
    ],
    "k": "A"
  },
  {
    "q": "Một tàu cần chở 1200 hành khách. Mỗi toa có 12 khoang, mỗi khoang có 8 chỗ ngồi. Hỏi tàu hỏa cần ít nhất bao nhiêu toa để chở hết chỗ hành khách đó?",
    "o": [
      "12",
      "13",
      "11",
      "14"
    ],
    "k": "B"
  },
  {
    "q": "Trong các số sau, số nào là ước của 10?",
    "o": [
      "10",
      "0",
      "3",
      "9"
    ],
    "k": "A"
  },
  {
    "q": "Tổng tất cả các số tự nhiên $x$ thỏa mãn $15 \\vdots (2x+1)$ là:",
    "o": [
      "10",
      "4",
      "7",
      "6"
    ],
    "k": "A"
  },
  {
    "q": "Tổng (hoặc hiệu) nào dưới đây chia hết cho 7?",
    "o": [
      "$147+21$",
      "$28+16$",
      "$49-24$",
      "$35-12$"
    ],
    "k": "A"
  },
  {
    "q": "Giá trị tương ứng trong hệ thập phân của số La Mã XXIV là:",
    "o": [
      "101015",
      "10104",
      "24",
      "26"
    ],
    "k": "C"
  },
  {
    "q": "Tìm tập hợp các chữ số điền vào dấu * để được số $\\overline{14*}$ chia hết cho 2:",
    "o": [
      "$\\{0;2;4;6;8\\}$",
      "$\\{2;4;6;8\\}$",
      "$\\{2\\}$",
      "$\\{0;2;4;6;8;10...\\}$"
    ],
    "k": "A"
  },
  {
    "q": "Tất cả các số nguyên tố có một chữ số là:",
    "o": [
      "1; 3; 5; 7",
      "3; 5; 7",
      "2; 3; 5; 9",
      "2; 3; 5; 7"
    ],
    "k": "D"
  },
  {
    "q": "Có bao nhiêu số tự nhiên $x$ để $\\overline{3x}$ là hợp số?",
    "o": [
      "2",
      "8",
      "7",
      "9"
    ],
    "k": "B"
  },
  {
    "q": "Phân tích số 18 ra thừa số nguyên tố. Cách viết nào sau đây là đúng?",
    "o": [
      "$18=18.1$",
      "$18=10+8$",
      "$18=2.3^{2}$",
      "$18=6+6+6$"
    ],
    "k": "C"
  },
  {
    "q": "Số $126=2.3^{2}.7$ có bao nhiêu ước nguyên tố?",
    "o": [
      "3",
      "4",
      "10",
      "12"
    ],
    "k": "A"
  }
];
  const latex = samples.map((item) => [
    '\\begin{ex}', item.q, '\\choice',
    ...item.o.map((option, index) => '{' + (String.fromCharCode(65 + index) === item.k ? '\\True ' : '') + option + '}'),
    '\\loigiai{', 'Đáp án đúng: ' + item.k, '}', '\\end{ex}'
  ].join('\n')).join('\n\n');
  const result = FileParserService.normalizeParseResult(
    FileParserService.parseRawText(latex, 'de-dan-truc-tiep.txt', 'text')
  );
  assert(result.totalFound === 20, 'Dán LaTeX: phải có đủ 20 câu, không được thiếu');
  assert(result.multipleChoiceCount === 20 && result.essayCount === 0, 'Dán LaTeX: đúng 20 TN và 0 TL');
  for (const [index, item] of result.items.entries()) {
    assert(item.order === index + 1, 'Dán LaTeX: thứ tự câu phải giữ nguyên');
    assert(item.type === 'multiple_choice' && item.options.length === 4, 'Dán LaTeX: đủ 4 phương án mỗi câu');
    assert(item.correctAnswer === samples[index].k, 'Dán LaTeX: sai đánh dấu True câu ' + (index + 1));
    assert(item.options.every(opt => !opt.text.includes('\\True') && !opt.text.includes('\\loigiai')), 'Không để lọt macro trong phương án');
    assert(item.question.includes(samples[index].q), 'Dán LaTeX: giữ nguyên nội dung câu ' + (index + 1));
    assert(item.explanation?.includes('Đáp án đúng: ' + item.correctAnswer), 'Phải giữ lời giải nguồn');
  }
  const separateFile = FileParserService.parseLatexText(latex, 'de-kiem-tra.tex');
  assert(separateFile.totalFound === 20, 'Tệp .tex phải có kết quả giống dán văn bản');
  const incomplete = latex.replace(/\\end\{ex\}\s*$/, '');
  let partialRejected = false;
  try { FileParserService.parseRawText(incomplete, 'broken.txt', 'text'); }
  catch { partialRejected = true; }
  assert(partialRejected, 'Đề LaTeX thiếu end không được tự nhập 19/20');
  const conflicting = latex.replace('\\loigiai{\nĐáp án đúng: D', '\\loigiai{\nĐáp án đúng: A');
  let mismatchRejected = false;
  try { FileParserService.parseRawText(conflicting, 'conflict.txt', 'text'); }
  catch { mismatchRejected = true; }
  assert(mismatchRejected, 'Đáp án trong lời giải mâu thuẫn với True phải báo lỗi');
  const importUi = fs.readFileSync(new URL('../src/components/FileUploadModal.tsx', import.meta.url), 'utf8');
  assert(importUi.includes("setActiveTab('text')") && importUi.includes('handleProcessPastedText') &&
    importUi.includes('FileParserService.parseRawText'), 'Giao diện phải có đường dán văn bản trực tiếp');
}

function checkPaidApiKeySafety() {
  const firestore = fs.readFileSync(new URL('../src/services/firestoreService.ts', import.meta.url), 'utf8');
  const settings = fs.readFileSync(new URL('../src/pages/teacher/TeacherSettings.tsx', import.meta.url), 'utf8');
  assert(firestore.includes('delete payload.geminiApiKey'), 'Paid Gemini key must never be written to teacher profiles');
  assert(firestore.includes('deleteField()'), 'Legacy key cleanup must use Firestore field removal');
  assert(!settings.includes('geminiApiKey: apiKeyInput'), 'Settings must not sync browser API secrets to cloud');
  assert(!settings.includes('profile?.geminiApiKey'), 'Settings must not restore insecure old keys from cloud');
  assert(settings.includes('removeLegacyTeacherGeminiApiKey'), 'Existing cloud keys should be cleared after teacher sign-in');
  assert(settings.includes('Gemini 3.8 Flash'), 'Verification uses an explicit model: show it when testing a paid key');
}

function checkImageAiNormalization() {
  const raw: ParseResult = {
    fileName: '2 trang ảnh',
    fileType: 'text',
    totalFound: 2,
    multipleChoiceCount: 2,
    essayCount: 0,
    items: [
      {
        id: 'img_q9',
        order: 9,
        question: 'Câu ảnh thứ nhất',
        type: 'multiple_choice',
        category: 'trac_nghiem',
        options: [
          { id: 'x', text: '10' },
          { id: 'y', text: '20' },
          { id: 'z', text: '30' },
          { id: 't', text: '40' }
        ],
        correctAnswer: 'y',
        points: 0.5
      },
      {
        id: 'img_q3',
        order: 3,
        question: 'Câu ảnh thứ hai',
        type: 'multiple_choice',
        category: 'trac_nghiem',
        options: [
          { id: 'A', text: '1' },
          { id: 'B', text: '2' },
          { id: 'C', text: '3' },
          { id: 'D', text: '4' }
        ],
        correctAnswer: 'C',
        points: 0.5
      }
    ]
  };

  const result = FileParserService.normalizeParseResult(raw);
  assert(result.items[0].order === 1 && result.items[1].order === 2, 'Ảnh: phải đánh số lại liên tục');
  assert(result.items[0].options.map(o => o.id).join('') === 'ABCD', 'Ảnh: phải chuẩn hóa ID phương án A-D');
  assert(result.items[0].correctAnswer === 'B', 'Ảnh: phải ánh xạ đáp án cũ sang ID mới đúng');
}

const checks = [
  ['PDF text layer', checkPdfTextLayer],
  ['Word text layer', checkWordTextLayer],
  ['LaTeX parser', checkLatexLayer],
  ['Dán đề 20 câu LaTeX ex', checkPastedLatex20Questions],
  ['Bảo vệ API Key trả phí', checkPaidApiKeySafety],
  ['Image AI normalization', checkImageAiNormalization]
] as const;

for (const [name, fn] of checks) {
  fn();
  console.log(`PASS: ${name}`);
}

console.log('8F IMPORT PARSER SELF-CHECK: PASS');
