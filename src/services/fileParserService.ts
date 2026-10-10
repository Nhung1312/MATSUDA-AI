import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { Question, QuestionOption, QuestionType } from '../types';
import { formatQuestionSubItems } from '../utils/questionUtils';

// Set up pdfjs worker
try {
  // Use unpkg or cdnjs worker or inline fallback
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
} catch (e) {
  // worker fallback
}

export interface ParsedItem {
  id: string;
  order: number;
  question: string;
  type: QuestionType; // 'multiple_choice' | 'essay' | 'short_answer'
  options: QuestionOption[];
  correctAnswer: string;
  points: number;
  explanation?: string;
  rubric?: string;
  topicHint?: string;
  rawText?: string;
  category: 'trac_nghiem' | 'tu_luan';
  selected?: boolean;
}

export interface ParseResult {
  fileName: string;
  fileType: 'excel' | 'word' | 'pdf' | 'text';
  totalFound: number;
  multipleChoiceCount: number;
  essayCount: number;
  items: ParsedItem[];
}

export class FileParserService {
  /**
   * Chuẩn hóa kết quả import trước khi đưa vào editor:
   * - đánh số lại liên tục 1..n;
   * - chuẩn hóa ID phương án theo A/B/C/D nhưng giữ đúng đáp án tương ứng;
   * - làm sạch khoảng trắng cơ bản;
   * - không tự bịa đáp án mới nếu nguồn không có.
   */
  static normalizeParseResult(result: ParseResult): ParseResult {
    const normalizedItems = (Array.isArray(result.items) ? result.items : [])
      .filter(item => !!item && typeof item.question === 'string' && item.question.trim().length > 0)
      .map((item, idx) => {
        const isEssay = item.category === 'tu_luan' || item.type === 'essay' || item.type === 'short_answer';
        const originalOptions = Array.isArray(item.options) ? item.options : [];
        const originalCorrect = String(item.correctAnswer || '').trim().toUpperCase();

        let normalizedCorrect = originalCorrect;
        let options: QuestionOption[] = [];

        if (!isEssay) {
          options = originalOptions.map((opt, optIdx) => ({
            id: String.fromCharCode(65 + optIdx),
            text: String(opt?.text || '').trim()
          }));

          const originalCorrectIndex = originalOptions.findIndex(
            opt => String(opt?.id || '').trim().toUpperCase() === originalCorrect
          );
          if (originalCorrectIndex >= 0) {
            normalizedCorrect = String.fromCharCode(65 + originalCorrectIndex);
          } else if (!['A', 'B', 'C', 'D'].includes(normalizedCorrect)) {
            normalizedCorrect = '';
          }
        }

        return {
          ...item,
          order: idx + 1,
          question: formatQuestionSubItems(item.question.trim()),
          options: isEssay ? [] : options,
          correctAnswer: isEssay ? String(item.correctAnswer || '').trim() : normalizedCorrect
        };
      });

    return {
      ...result,
      totalFound: normalizedItems.length,
      multipleChoiceCount: normalizedItems.filter(i => i.category === 'trac_nghiem').length,
      essayCount: normalizedItems.filter(i => i.category === 'tu_luan').length,
      items: normalizedItems
    };
  }

  /**
   * Main entry point to parse any supported file
   */
  static async parseFile(file: File): Promise<ParseResult> {
    const fileName = file.name;
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
      return this.parseExcelFile(file);
    } else if (lowerName.endsWith('.json')) {
      return this.parseJsonFile(file);
    } else if (lowerName.endsWith('.docx')) {
      return this.parseDocxFile(file);
    } else if (lowerName.endsWith('.pdf')) {
      return this.parsePdfFile(file);
    } else if (lowerName.endsWith('.tex')) {
      return this.parseLatexFile(file);
    } else {
      // Text fallback (.txt, .md, etc.)
      const text = await file.text();
      return this.parseRawText(text, fileName, 'text');
    }
  }

  /**
   * Parse LaTeX (.tex) đề Toán.
   * Hỗ trợ tốt cấu trúc phổ biến: \\begin{ex}...\\end{ex}, \\choice{A}{B}{C}{D},
   * phương án đúng đánh dấu \\True và lời giải \\loigiai{...}.
   * Nếu file không theo cấu trúc này, hệ thống vẫn đưa về parser văn bản chung.
   */
  static async parseLatexFile(file: File): Promise<ParseResult> {
    const raw = await file.text();
    return this.parseLatexText(raw, file.name);
  }

  static parseLatexText(raw: string, fileName: string = 'de-thi.tex'): ParseResult {
    const normalized = this.normalizeLatexExamText(raw);
    return this.normalizeParseResult(this.parseRawText(normalized, fileName, 'text'));
  }

  private static normalizeLatexExamText(raw: string): string {
    if (!raw || !raw.trim()) return '';

    // Bỏ comment LaTeX (trừ \% đã escape) và phần khai báo thường không phải nội dung đề.
    let text = raw
      .split(/\r?\n/)
      .map(line => line.replace(/(^|[^\\])%.*$/, '$1'))
      .join('\n')
      .replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/g, '')
      .replace(/\\usepackage(?:\[[^\]]*\])?\{[^}]+\}/g, '')
      .replace(/\\begin\{document\}|\\end\{document\}/g, '');

    const blocks: string[] = [];
    const envRegex = /\\begin\{(ex|bt|vd)\}([\s\S]*?)\\end\{\1\}/gi;
    let match: RegExpExecArray | null;
    let order = 1;

    while ((match = envRegex.exec(text)) !== null) {
      const body = this.normalizeSingleLatexExercise(match[2], order);
      if (body.trim()) {
        blocks.push(body);
        order++;
      }
    }

    // Nếu không có môi trường ex/bt/vd, vẫn cố chuẩn hóa các macro phổ biến rồi dùng parser chung.
    if (blocks.length === 0) {
      text = this.replaceLatexChoices(text);
      text = this.replaceLatexSolution(text);
      text = text
        .replace(/\\(?:textbf|textit|emph)\{([^{}]*)\}/g, '$1')
        .replace(/\\(?:begin|end)\{(?:center|flushleft|flushright|enumerate|itemize)\}/g, '\n')
        .replace(/\\item\s*/g, '\n')
        .trim();
      return text;
    }

    return blocks.join('\n\n');
  }

  private static normalizeSingleLatexExercise(body: string, order: number): string {
    let content = body.trim();
    let solution = '';

    // Tách lời giải dạng \\loigiai{...}
    const loiIdx = content.search(/\\loigiai\s*\{/i);
    if (loiIdx !== -1) {
      const braceStart = content.indexOf('{', loiIdx);
      if (braceStart !== -1) {
        const group = this.readBalancedGroup(content, braceStart);
        if (group) {
          solution = group.value.trim();
          content = (content.slice(0, loiIdx) + content.slice(group.endIndex + 1)).trim();
        }
      }
    }

    // Tách lời giải dạng môi trường
    const envSolution = content.match(/\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/i);
    if (envSolution) {
      solution = envSolution[1].trim();
      content = content.replace(envSolution[0], '').trim();
    }

    content = this.replaceLatexChoices(content)
      .replace(/\\(?:textbf|textit|emph)\{([^{}]*)\}/g, '$1')
      .replace(/\\(?:begin|end)\{(?:center|flushleft|flushright|enumerate|itemize)\}/g, '\n')
      .replace(/\\item\s*/g, '\n')
      .trim();

    if (solution) {
      solution = solution
        .replace(/\\(?:textbf|textit|emph)\{([^{}]*)\}/g, '$1')
        .trim();
    }

    return `Câu ${order}. ${content}${solution ? `\nLời giải: ${solution}` : ''}`;
  }

  private static replaceLatexSolution(text: string): string {
    let out = text;
    const regex = /\\loigiai\s*\{/gi;
    let guard = 0;
    while (guard++ < 100) {
      regex.lastIndex = 0;
      const m = regex.exec(out);
      if (!m) break;
      const braceStart = out.indexOf('{', m.index);
      if (braceStart === -1) break;
      const group = this.readBalancedGroup(out, braceStart);
      if (!group) break;
      out = out.slice(0, m.index) + `\nLời giải: ${group.value}\n` + out.slice(group.endIndex + 1);
    }
    return out;
  }

  private static replaceLatexChoices(text: string): string {
    let out = text;
    const macroRegex = /\\choice(?:TF)?\s*/gi;
    let guard = 0;

    while (guard++ < 100) {
      macroRegex.lastIndex = 0;
      const m = macroRegex.exec(out);
      if (!m) break;

      let cursor = m.index + m[0].length;
      const groups: Array<{ value: string; endIndex: number }> = [];

      for (let i = 0; i < 4; i++) {
        while (cursor < out.length && /\s/.test(out[cursor])) cursor++;
        if (out[cursor] !== '{') break;
        const group = this.readBalancedGroup(out, cursor);
        if (!group) break;
        groups.push(group);
        cursor = group.endIndex + 1;
      }

      if (groups.length < 2) {
        // Tránh vòng lặp vô hạn với macro không đúng cấu trúc.
        out = out.slice(0, m.index) + ' ' + out.slice(m.index + m[0].length);
        continue;
      }

      const letters = ['A', 'B', 'C', 'D'];
      const options = groups.map((g, i) => {
        const rawValue = g.value.trim();
        const isTrue = /\\True\b/i.test(rawValue);
        const clean = rawValue.replace(/\\True\b/gi, '').trim();
        return `${letters[i]}. ${isTrue ? '\\True ' : ''}${clean}`;
      }).join('\n');

      out = out.slice(0, m.index) + '\n' + options + '\n' + out.slice(cursor);
    }

    return out;
  }

  private static readBalancedGroup(source: string, startIndex: number): { value: string; endIndex: number } | null {
    if (source[startIndex] !== '{') return null;
    let depth = 0;

    for (let i = startIndex; i < source.length; i++) {
      const ch = source[i];
      const escaped = i > 0 && source[i - 1] === '\\';
      if (escaped) continue;

      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return {
            value: source.slice(startIndex + 1, i),
            endIndex: i
          };
        }
      }
    }

    return null;
  }

  /**
   * Parse JSON (.json) files
   */
  static async parseJsonFile(file: File): Promise<ParseResult> {
    const text = await file.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (e: any) {
      throw new Error('Tệp JSON không hợp lệ: ' + e.message);
    }

    let questionsArray: any[] = [];
    if (Array.isArray(data)) {
      questionsArray = data;
    } else if (data && Array.isArray(data.questions)) {
      questionsArray = data.questions;
    } else if (data && Array.isArray(data.data)) {
      questionsArray = data.data;
    } else {
      throw new Error('Cấu trúc JSON không chứa danh sách câu hỏi hợp lệ.');
    }

    const items: ParsedItem[] = [];
    let mcCount = 0;
    let essayCount = 0;

    questionsArray.forEach((q: any, index: number) => {
      const questionText = q.question || q.questionText || q.content || q.title || `Câu hỏi ${index + 1}`;
      let options: QuestionOption[] = [];
      let correctAnswer = (q.correctAnswer || q.answer || 'A').toString().toUpperCase().trim();

      if (Array.isArray(q.options)) {
        if (typeof q.options[0] === 'string') {
          const ids = ['A', 'B', 'C', 'D'];
          options = q.options.map((opt: string, optIdx: number) => ({
            id: ids[optIdx] || String.fromCharCode(65 + optIdx),
            text: opt
          }));
        } else {
          options = q.options.map((opt: any, optIdx: number) => ({
            id: opt.id || String.fromCharCode(65 + optIdx),
            text: opt.text || opt.content || ''
          }));
        }
      } else if (q.options && typeof q.options === 'object') {
        options = Object.keys(q.options).map(key => ({
          id: key.toUpperCase(),
          text: String(q.options[key])
        }));
      }

      // Check if options exist
      const isMc = options.length >= 2 || q.type === 'multiple_choice';
      if (isMc) {
        mcCount++;
      } else {
        essayCount++;
      }

      items.push({
        id: `q_json_${Date.now()}_${index + 1}`,
        order: index + 1,
        question: questionText,
        type: isMc ? 'multiple_choice' : (q.type || 'short_answer'),
        category: isMc ? 'trac_nghiem' : 'tu_luan',
        options: isMc ? options : [
          { id: 'A', text: '' },
          { id: 'B', text: '' },
          { id: 'C', text: '' },
          { id: 'D', text: '' }
        ],
        correctAnswer: isMc ? (correctAnswer || 'A') : '',
        points: typeof q.points === 'number' ? q.points : (isMc ? 0.5 : 1.0),
        explanation: q.explanation || q.solution || '',
        topicHint: q.topicHint || q.topic || 'Toán THCS',
        selected: true
      });
    });

    return {
      fileName: file.name,
      fileType: 'text',
      totalFound: items.length,
      multipleChoiceCount: mcCount,
      essayCount: essayCount,
      items
    };
  }

  /**
   * Download sample Excel template for teachers
   */
  static downloadSampleExcelTemplate() {
    const data = [
      {
        'STT': 1,
        'Câu hỏi': 'Tập hợp các số hữu tỉ được kí hiệu bằng chữ cái nào sau đây?',
        'Phương án A': 'N',
        'Phương án B': 'Z',
        'Phương án C': 'Q',
        'Phương án D': 'R',
        'Đáp án đúng': 'C',
        'Điểm': 0.5,
        'Lời giải chi tiết': 'Tập hợp các số hữu tỉ được kí hiệu là Q theo định nghĩa SGK Toán 7.',
        'Chủ đề': 'Số hữu tỉ'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DeThiMau');
    XLSX.writeFile(workbook, 'Mau_De_Kiem_Tra_Toan_THCS.xlsx');
  }

  /**
   * Download sample JSON template for teachers
   */
  static downloadSampleJsonTemplate() {
    // Keep it minimal for file size
  }

  /**
   * Parse Excel (.xlsx, .xls)
   */
  static async parseExcelFile(file: File): Promise<ParseResult> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Get raw json rows
    const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (!rows || rows.length === 0) {
      return { fileName: file.name, fileType: 'excel', totalFound: 0, multipleChoiceCount: 0, essayCount: 0, items: [] };
    }

    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const rowStr = rows[r].map((c: any) => String(c).toLowerCase()).join(' ');
      if (rowStr.includes('câu') || rowStr.includes('đáp án') || rowStr.includes('phương án')) {
        headerRowIdx = r;
        break;
      }
    }

    const items: ParsedItem[] = [];
    if (headerRowIdx !== -1) {
      const headers = rows[headerRowIdx].map((h: any) => String(h).trim().toLowerCase());
      const colQ = headers.findIndex(h => h.includes('câu hỏi') || h === 'câu' || h.includes('nội dung'));
      const colA = headers.findIndex(h => h === 'a' || h.includes('phương án a'));
      const colB = headers.findIndex(h => h === 'b' || h.includes('phương án b'));
      const colC = headers.findIndex(h => h === 'c' || h.includes('phương án c'));
      const colD = headers.findIndex(h => h === 'd' || h.includes('phương án d'));
      const colAns = headers.findIndex(h => h.includes('đáp án đúng') || h === 'đáp án');
      const colPoints = headers.findIndex(h => h.includes('điểm'));

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        const questionText = colQ !== -1 ? String(row[colQ] || '').trim() : String(row[0] || '').trim();
        if (!questionText) continue;

        const optA = colA !== -1 ? String(row[colA] || '').trim() : '';
        const optB = colB !== -1 ? String(row[colB] || '').trim() : '';
        const isEssay = (!optA && !optB);

        items.push({
          id: `item_${Date.now()}_${items.length + 1}`,
          order: items.length + 1,
          question: questionText,
          type: isEssay ? 'short_answer' : 'multiple_choice',
          category: isEssay ? 'tu_luan' : 'trac_nghiem',
          options: [
            { id: 'A', text: optA },
            { id: 'B', text: optB },
            { id: 'C', text: colC !== -1 ? String(row[colC] || '').trim() : '' },
            { id: 'D', text: colD !== -1 ? String(row[colD] || '').trim() : '' }
          ],
          correctAnswer: colAns !== -1 ? String(row[colAns] || '').trim().toUpperCase() : 'A',
          points: colPoints !== -1 && !isNaN(Number(row[colPoints])) ? Number(row[colPoints]) : (isEssay ? 1.0 : 0.5),
          selected: true
        });
      }
    }

    if (items.length === 0) {
      const fullText = rows.map(r => r.join(' ')).join('\n');
      return this.parseRawText(fullText, file.name, 'excel');
    }

    return {
      fileName: file.name, fileType: 'excel', totalFound: items.length,
      multipleChoiceCount: items.filter(i => i.category === 'trac_nghiem').length,
      essayCount: items.filter(i => i.category === 'tu_luan').length,
      items
    };
  }

  /**
   * Parse Docx (.docx) via mammoth
   */
  static async parseDocxFile(file: File): Promise<ParseResult> {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return this.parseRawText(result.value || '', file.name, 'word');
  }

  /**
   * Parse PDF (.pdf) via pdfjs-dist
   */
  static async parsePdfFile(file: File): Promise<ParseResult> {
    try {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loadingTask.promise;
      let fullText = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `\n` + pageText;
      }

      return this.parseRawText(fullText, file.name, 'pdf');
    } catch (err) {
      console.error('PDF Parse Error:', err);
      return { fileName: file.name, fileType: 'pdf', totalFound: 0, multipleChoiceCount: 0, essayCount: 0, items: [] };
    }
  }

  /**
   * Bóc tách bảng đáp án tổng (nếu có trong đề dạng "Bảng đáp án: 1A 2B 3C..." hoặc "1.A 2.B" hoặc bảng ở cuối file)
   */
  private static extractAnswerKeyMap(text: string): Record<number, string> {
    const map: Record<number, string> = {};
    if (!text) return map;

    // 1. Tìm khu vực có chữ "Bảng đáp án", "Đáp án trắc nghiệm", "Đáp án tham khảo", "Key:"
    const tableHeaderMatch = text.match(/(?:bảng\s*đáp\s*án|đáp\s*án\s*trắc\s*nghiệm|đáp\s*án\s*chi\s*tiết|đáp\s*án|phiếu\s*trả\s*lời|hướng\s*dẫn\s*chấm|key)[\s\:\-]+([\s\S]+)$/i);
    const searchArea = tableHeaderMatch ? tableHeaderMatch[1] : text;

    // Quét các cặp số + ký tự A-D: "1A", "1.A", "1:A", "1-A", "Câu 1: A", "Câu 1. A"
    const pairRegex = /(?:Câu|Bài)?\s*(\d+)[\.\:\-\s]+([A-D])\b/gi;
    let match;
    while ((match = pairRegex.exec(searchArea)) !== null) {
      const qNum = parseInt(match[1], 10);
      const ansLetter = match[2].toUpperCase();
      if (!isNaN(qNum) && ['A', 'B', 'C', 'D'].includes(ansLetter)) {
        map[qNum] = ansLetter;
      }
    }

    // Nếu dạng chuỗi ngắn gọn "1A 2B 3C 4D..."
    if (Object.keys(map).length === 0) {
      const tightRegex = /\b(\d+)([A-D])\b/g;
      while ((match = tightRegex.exec(searchArea)) !== null) {
        const qNum = parseInt(match[1], 10);
        const ansLetter = match[2].toUpperCase();
        if (!isNaN(qNum) && qNum <= 100) {
          map[qNum] = ansLetter;
        }
      }
    }

    return map;
  }

  /**
   * Thông minh: Cắt chuỗi và tự động phân biệt Trắc nghiệm / Tự luận, tự động bắt đáp án và ngắt ý a), b), c)
   */
  static parseRawText(rawText: string, fileName: string = 'Đề thi', fileType: 'excel' | 'word' | 'pdf' | 'text' = 'text'): ParseResult {
    if (!rawText || !rawText.trim()) {
      return { fileName, fileType, totalFound: 0, multipleChoiceCount: 0, essayCount: 0, items: [] };
    }

    // Bóc tách bảng đáp án tổng nếu có ở cuối hoặc đầu đề
    const globalAnswerMap = this.extractAnswerKeyMap(rawText);

    // Cắt bỏ phần Bảng đáp án ở cuối đề (nếu có) để tránh nhận diện nhầm thành một câu hỏi độc lập
    let processedText = rawText;
    const tableHeaderIdx = rawText.search(/\n\s*(?:bảng\s*đáp\s*án|đáp\s*án\s*trắc\s*nghiệm)[\s\:\-]/i);
    if (tableHeaderIdx !== -1) {
      processedText = rawText.substring(0, tableHeaderIdx);
    }

    // Nhận diện phân vùng: "PHẦN I. TRẮC NGHIỆM" và "PHẦN II. TỰ LUẬN"
    const essaySectionIdx = processedText.search(/(?:\n|\s+)(?:phần\s*(?:ii|2|b)|ii\.|phần\s*tự\s*luận|b\.\s*tự\s*luận)\s*[\.\:\-]?\s*(?:tự\s*luận)?/i);

    // Nhận diện điểm tổng các phân vùng: "PHẦN I. TRẮC NGHIỆM (3,0 ĐIỂM)" và "PHẦN II. TỰ LUẬN (7,0 ĐIỂM)"
    const mcSectionPointsMatch = processedText.match(/(?:phần\s*(?:i|1|a)|i\.)?[\s\.\:\-]*trắc\s*nghiệm\s*\(\s*([0-9]+(?:[\.\,][0-9]+)?)\s*(?:điểm|đ)\s*\)/i)
      || processedText.match(/trắc\s*nghiệm\s*\(\s*([0-9]+(?:[\.\,][0-9]+)?)\s*(?:điểm|đ)\s*\)/i);
    const mcTotalPoints = mcSectionPointsMatch ? parseFloat(mcSectionPointsMatch[1].replace(',', '.')) : null;

    const essaySectionPointsMatch = processedText.match(/(?:phần\s*(?:ii|2|b)|ii\.)?[\s\.\:\-]*tự\s*luận\s*\(\s*([0-9]+(?:[\.\,][0-9]+)?)\s*(?:điểm|đ)\s*\)/i)
      || processedText.match(/tự\s*luận\s*\(\s*([0-9]+(?:[\.\,][0-9]+)?)\s*(?:điểm|đ)\s*\)/i);
    const essayTotalPoints = essaySectionPointsMatch ? parseFloat(essaySectionPointsMatch[1].replace(',', '.')) : null;

    const items: ParsedItem[] = [];

    // Tăng cường Regex: Nhận diện cả "Câu", "Bài", "Question", có hoặc không có dấu hai chấm/chấm.
    // ĐẶC BIỆT: (?:\s*\([^\)]+\))? -> cho phép bỏ qua các cụm ghi chú điểm số như "(1,5 điểm)" hay "(2.0 đ)"
    const splitRegex = /(?:^|\n|\s)(?:Câu|Bài|Question)\s*(\d+)(?:\s*\([^\)]+\))?[\.\:\s]*/gi;

    const matches: { index: number; num: number; matchStr: string }[] = [];
    let match;
    while ((match = splitRegex.exec(processedText)) !== null) {
      matches.push({
        index: match.index,
        num: parseInt(match[1], 10),
        matchStr: match[0]
      });
    }

    if (matches.length === 0) {
      // Nếu không tìm thấy chữ "Câu X" hay "Bài X", xử lý toàn bộ như 1 câu tự luận
      items.push(this.buildFallbackItem(processedText, 1));
    } else {
      for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const nextIndex = i + 1 < matches.length ? matches[i + 1].index : processedText.length;
        
        // Cắt lấy toàn bộ nội dung của câu hỏi này
        let blockText = processedText.substring(current.index, nextIndex).trim();
        blockText = blockText.replace(/--- Trang \d+ ---/g, '').trim(); // Xóa số trang nếu có

        // Kiểm tra xem câu này có nằm sau tiêu đề Phần Tự Luận không
        const isExplicitEssaySection = essaySectionIdx !== -1 && current.index >= essaySectionIdx;
        const assignedAnswerLetter = globalAnswerMap[current.num] || globalAnswerMap[i + 1];

        // Phân tích Trắc nghiệm / Tự luận cho riêng câu này
        const parsedItem = this.extractSingleQuestionInfo(blockText, i + 1, isExplicitEssaySection, assignedAnswerLetter);
        items.push(parsedItem);
      }
    }

    const mcCount = items.filter(i => i.category === 'trac_nghiem').length;
    const essayCount = items.filter(i => i.category === 'tu_luan').length;

    // Tự động phân bổ điểm trắc nghiệm theo điểm phần (ví dụ: PHẦN I. TRẮC NGHIỆM (3,0 ĐIỂM) / 10 câu = 0.3đ/câu)
    if (typeof mcTotalPoints === 'number' && mcTotalPoints > 0 && mcCount > 0) {
      const perMc = Math.round((mcTotalPoints / mcCount) * 100) / 100;
      items.forEach(it => {
        if (it.category === 'trac_nghiem' && (!it.points || it.points === 0.5)) {
          it.points = perMc;
        }
      });
    }

    // Tự động phân bổ điểm tự luận theo điểm phần nếu các câu tự luận chưa có điểm riêng
    if (typeof essayTotalPoints === 'number' && essayTotalPoints > 0 && essayCount > 0) {
      const hasCustomEssayPoints = items.some(it => it.category === 'tu_luan' && it.points && it.points !== 1.0 && it.points !== 1.5);
      if (!hasCustomEssayPoints) {
        const perEssay = Math.round((essayTotalPoints / essayCount) * 100) / 100;
        items.forEach(it => {
          if (it.category === 'tu_luan') {
            it.points = perEssay;
          }
        });
      }
    }

    return {
      fileName,
      fileType,
      totalFound: items.length,
      multipleChoiceCount: mcCount,
      essayCount: essayCount,
      items
    };
  }

  /**
   * Trích xuất thông tin một khối câu hỏi (Tự tìm A, B, C, D, bóc tách đáp án và format ngắt ý tự luận)
   */
  private static extractSingleQuestionInfo(
    blockText: string, 
    order: number, 
    isExplicitEssaySection: boolean = false,
    globalAnswerLetter?: string
  ): ParsedItem {
    // Regex tìm 4 phương án A, B, C, D
    const aRegex = /(?:^|\n|\s)(?:\*|\\True\s*)?A[\.\:\)]\s+/i;
    const bRegex = /(?:^|\n|\s)(?:\*|\\True\s*)?B[\.\:\)]\s+/i;
    const cRegex = /(?:^|\n|\s)(?:\*|\\True\s*)?C[\.\:\)]\s+/i;
    const dRegex = /(?:^|\n|\s)(?:\*|\\True\s*)?D[\.\:\)]\s+/i;

    // Dấu hiệu nhận biết câu tự luận: có các ý con a), b), c) hoặc từ khóa bài toán chứng minh
    const hasSubParts = /(?:^|\n|\s)(?:[a-d]\)|[1-4]\))\s+/i.test(blockText);
    const hasProofKeywords = /\b(chứng minh|chứng tỏ|cmr|rút gọn|tính giá trị|tìm x|giải phương trình|vẽ hình|thực hiện phép tính)\b/i.test(blockText);

    const aMatch = blockText.match(aRegex);
    const bMatch = blockText.match(bRegex);
    const cMatch = blockText.match(cRegex);
    const dMatch = blockText.match(dRegex);

    // Xác định Trắc nghiệm:
    // Nếu nằm trong phần Tự luận rõ ràng -> là Tự luận
    // Nếu có ít nhất A và B, và không nằm trong khu vực tự luận -> Trắc nghiệm
    const isMultipleChoice = !isExplicitEssaySection && (aMatch !== null && bMatch !== null) && !(hasSubParts && !cMatch && !dMatch);

    let questionContent = blockText;
    let optA = '', optB = '', optC = '', optD = '';
    let detectedCorrectLetter: string | null = globalAnswerLetter || null;
    let solutionText = '';
    let rubricText = '';

    if (isMultipleChoice) {
      const aIdx = blockText.search(aRegex);
      const bIdx = blockText.search(bRegex);
      const cIdx = blockText.search(cRegex);
      const dIdx = blockText.search(dRegex);

      // Lấy phần đề bài (từ đầu cho tới trước chữ A.)
      questionContent = blockText.substring(0, aIdx).trim();

      // Cắt lấy từng đáp án
      if (aIdx !== -1 && bIdx !== -1) {
        if (cIdx !== -1 && dIdx !== -1) {
          optA = blockText.substring(aIdx + aMatch![0].length, bIdx).trim();
          optB = blockText.substring(bIdx + bMatch![0].length, cIdx).trim();
          optC = blockText.substring(cIdx + cMatch![0].length, dIdx).trim();
          optD = blockText.substring(dIdx + dMatch![0].length).trim();
        } else if (cIdx !== -1) {
          optA = blockText.substring(aIdx + aMatch![0].length, bIdx).trim();
          optB = blockText.substring(bIdx + bMatch![0].length, cIdx).trim();
          optC = blockText.substring(cIdx + cMatch![0].length).trim();
        } else {
          optA = blockText.substring(aIdx + aMatch![0].length, bIdx).trim();
          optB = blockText.substring(bIdx + bMatch![0].length, dIdx !== -1 ? dIdx : undefined).trim();
        }
      }

      // Phát hiện đáp án đúng được đánh dấu trong chính các phương án (VD: \True, *, [A]...)
      const checkOptionMark = (text: string, letter: string): string => {
        if (/\\True|\*|^\[[A-D]\]/i.test(text)) {
          detectedCorrectLetter = letter;
          return text.replace(/\\True/gi, '').replace(/\*/g, '').replace(/^\[[A-D]\][\.\:\s]*/i, '').trim();
        }
        return text;
      };

      optA = checkOptionMark(optA, 'A');
      optB = checkOptionMark(optB, 'B');
      optC = checkOptionMark(optC, 'C');
      optD = checkOptionMark(optD, 'D');

      // Kiểm tra dòng đáp án ngay sau câu (VD: "Đáp án: B" hoặc "Chọn C")
      const inlineAnswerMatch = optD.match(/(?:\n|\s+)(?:Đáp\s*án|Chọn|Key)[\s\:\-]+([A-D])\b/i)
        || blockText.match(/(?:^|\n|\s)(?:Đáp\s*án|Chọn|Key)[\s\:\-]+([A-D])\b/i);
      if (inlineAnswerMatch) {
        detectedCorrectLetter = inlineAnswerMatch[1].toUpperCase();
        // Cắt bỏ dòng "Đáp án: X" khỏi phương án D nếu bị dính
        optD = optD.replace(/(?:\n|\s+)(?:Đáp\s*án|Chọn|Key)[\s\:\-]+([A-D])\b/i, '').trim();
      }

      // Tách lời giải nếu có kèm sau câu trắc nghiệm
      const mcSolutionMatch = optD.match(/(?:\n|\s+)(?:Lời\s*giải|Giải\s*thích|HD)[\s\:\-]+([\s\S]+)$/i);
      if (mcSolutionMatch) {
        solutionText = mcSolutionMatch[1].trim();
        optD = optD.substring(0, mcSolutionMatch.index).trim();
      }

    } else {
      // XỬ LÝ CÂU HỎI TỰ LUẬN
      // 1. Tách phần Lời giải / Hướng dẫn chấm / Đáp số nếu có
      const essaySolutionMatch = blockText.match(/(?:\n|\s+)(?:Lời\s*giải\s*chi\s*tiết|Lời\s*giải|Hướng\s*dẫn\s*chấm|Hướng\s*dẫn\s*giải|Đáp\s*số)[\s\:\-]+([\s\S]+)$/i);
      if (essaySolutionMatch) {
        solutionText = essaySolutionMatch[1].trim();
        questionContent = blockText.substring(0, essaySolutionMatch.index).trim();
      } else {
        questionContent = blockText;
      }

      // 2. Tự động ngắt dòng và thụt lề định dạng đẹp mắt cho các ý con a), b), c)... hoặc 1), 2), 3)...
      questionContent = formatQuestionSubItems(questionContent);

      // Nếu có biểu điểm trong lời giải
      if (solutionText.includes('+0.') || solutionText.includes('điểm') || solutionText.includes('Rubric')) {
        rubricText = solutionText;
      }
    }

    // Trích xuất điểm số riêng của câu nếu có ghi chú dạng "(2,0 điểm)", "(1,0 điểm)", "(0,5 điểm)", "(0.25đ)", "(0,3 điểm)", "[0.75đ]"
    let detectedPoints: number | undefined = undefined;
    const pointMatch = blockText.match(/(?:^|\n|[\.\:\s])(?:Câu|Bài|Question)?\s*\d*\s*[\.\:\s]*\(\s*([0-9]+(?:[\.\,][0-9]+)?)\s*(?:điểm|đ|pts?)\s*\)/i)
      || blockText.match(/\(\s*([0-9]+(?:[\.\,][0-9]+)?)\s*(?:điểm|đ|pts?)\s*\)/i)
      || blockText.match(/\[\s*([0-9]+(?:[\.\,][0-9]+)?)\s*(?:điểm|đ|pts?)\s*\]/i);
    if (pointMatch) {
      const p = parseFloat(pointMatch[1].replace(',', '.'));
      if (!isNaN(p) && p > 0 && p <= 100) {
        detectedPoints = Math.round(p * 100) / 100;
      }
    }

    // Làm sạch tiêu đề "Câu 1:" hay "Bài 1:" và cụm điểm "(1,5 điểm)" ở đầu đề bài
    questionContent = questionContent.replace(/^(?:Chủ\s*đề[^\n]+\n+)?(?:Câu|Bài|Question)\s*\d+(?:\s*\([^\)]+\)|\s*\[[^\]]+\])?[\.\:\s]*/i, '').trim();
    // Làm sạch thêm nếu cụm (X điểm) hoặc [X điểm] vẫn còn sót lại ở đầu câu
    questionContent = questionContent.replace(/^[\(\[]\s*[0-9]+(?:[\.\,][0-9]+)?\s*(?:điểm|đ|pts?)\s*[\)\]][\.\:\s]*/i, '').trim();

    const finalPoints = typeof detectedPoints === 'number'
      ? detectedPoints
      : (isMultipleChoice ? 0.5 : (hasProofKeywords ? 1.5 : 1.0));

    return {
      id: `q_parsed_${Date.now()}_${order}`,
      order: order,
      question: questionContent || blockText,
      type: isMultipleChoice ? 'multiple_choice' : 'essay',
      category: isMultipleChoice ? 'trac_nghiem' : 'tu_luan',
      options: isMultipleChoice
        ? [
            { id: 'A', text: optA || 'Phương án A' },
            { id: 'B', text: optB || 'Phương án B' },
            { id: 'C', text: optC || 'Phương án C' },
            { id: 'D', text: optD || 'Phương án D' }
          ]
        : [],
      correctAnswer: isMultipleChoice ? (detectedCorrectLetter || 'A') : (solutionText ? 'Xem lời giải chi tiết' : ''),
      points: finalPoints,
      explanation: solutionText,
      rubric: rubricText,
      topicHint: 'Toán THCS',
      rawText: blockText,
      selected: true
    };
  }

  private static buildFallbackItem(text: string, order: number): ParsedItem {
    // Format ngắt ý con a), b), c)... hoặc 1), 2), 3)... cho văn bản fallback
    const formatted = formatQuestionSubItems(text.trim());
    return {
      id: `q_parsed_${Date.now()}_${order}`,
      order: order,
      question: formatted,
      type: 'essay',
      category: 'tu_luan',
      options: [],
      correctAnswer: '',
      points: 1.0,
      topicHint: 'Toán THCS',
      selected: true
    };
  }

  /**
   * Convert parsed items to app Question model
   */
  static convertToQuestions(items: ParsedItem[]): Question[] {
    return items.map((item, idx) => {
      const isEssay = item.type === 'essay' || item.category === 'tu_luan' || !item.options || item.options.length < 2 || item.options.every(o => !o.text || !o.text.trim());
      return {
        id: `q_import_${Date.now()}_${idx + 1}`,
        order: idx + 1,
        question: item.question,
        type: isEssay ? 'essay' : 'multiple_choice',
        options: isEssay ? [] : item.options,
        correctAnswer: item.correctAnswer || (isEssay ? '' : 'A'),
        points: item.points || (isEssay ? 1.0 : 0.5),
        explanation: item.explanation || '',
        rubric: item.rubric || '',
        topicHint: item.topicHint || 'Toán THCS'
      };
    });
  }
}
