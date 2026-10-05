import { FileParserService, ParseResult } from '../src/services/fileParserService';

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
  ['Image AI normalization', checkImageAiNormalization]
] as const;

for (const [name, fn] of checks) {
  fn();
  console.log(`PASS: ${name}`);
}

console.log('8F IMPORT PARSER SELF-CHECK: PASS');
