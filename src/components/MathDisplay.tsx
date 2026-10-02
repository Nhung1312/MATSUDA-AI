import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathDisplayProps {
  text?: string | null;
  content?: string | null;
  math?: string | null;
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
}

/**
 * Intelligent LaTeX & KaTeX parser for Vietnamese Secondary School Mathematics (Toán THCS Lớp 6 - 9)
 * Supports:
 * - Standard LaTeX Block formulas: `$$...$$` or `\[...\]`
 * - Standard LaTeX Inline formulas: `$...$` or `\(...\)`
 * - Vietnamese Math notations: fractions (e.g. 2/5, -3/7), square roots (√2x-6), powers (x^2, x²), subscripts (x₁), angles (\widehat{ABC}, \angle A), degrees (90°), vectors (\vec{AB}).
 * - Safe rendering: will not crash on malformed inputs.
 */
export const MathDisplay: React.FC<MathDisplayProps> = ({ 
  text, 
  content,
  math,
  children,
  className = '',
  inline = false 
}) => {
  const rawText = text ?? content ?? math ?? (typeof children === 'string' ? children : '');
  if (!rawText || typeof rawText !== 'string') return null;

  if (inline) {
    return (
      <span className={`inline-math-container text-inherit font-normal ${className}`}>
        {renderInlineContent(rawText)}
      </span>
    );
  }

  // Split lines
  const lines = rawText.split(/\r?\n/);

  return (
    <div className={`math-display-container text-inherit leading-relaxed break-words ${className}`}>
      {lines.map((line, lIdx) => {
        if (!line.trim()) {
          return <div key={lIdx} className="h-2" />;
        }

        return (
          <div key={lIdx} className={lIdx > 0 ? 'mt-2' : ''}>
            {renderLineContent(line)}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Pre-processes and normalizes raw math symbols into clean LaTeX strings
 */
function normalizeToLatex(formula: string): string {
  return formula.trim()
    // Unicode superscripts & subscripts
    .replace(/⁰/g, '^0')
    .replace(/¹/g, '^1')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/⁵/g, '^5')
    .replace(/⁶/g, '^6')
    .replace(/⁷/g, '^7')
    .replace(/⁸/g, '^8')
    .replace(/⁹/g, '^9')
    .replace(/₀/g, '_0')
    .replace(/₁/g, '_1')
    .replace(/₂/g, '_2')
    .replace(/₃/g, '_3')
    .replace(/₄/g, '_4')
    .replace(/₅/g, '_5')
    // Degree symbol: 90° -> 90^\circ
    .replace(/(\d+)\s*°/g, '$1^\\circ')
    .replace(/°/g, '^\\circ')
    // Multiplication and division
    .replace(/·/g, ' \\cdot ')
    .replace(/×/g, ' \\times ')
    .replace(/÷/g, ' \\div ')
    // Plus-minus
    .replace(/±/g, ' \\pm ')
    // Comparison and logic symbols
    .replace(/≥/g, ' \\ge ')
    .replace(/≤/g, ' \\le ')
    .replace(/≠/g, ' \\neq ')
    .replace(/≈/g, ' \\approx ')
    .replace(/<=>/g, ' \\Leftrightarrow ')
    .replace(/=>/g, ' \\Rightarrow ')
    .replace(/->/g, ' \\rightarrow ')
    .replace(/Δ/g, ' \\Delta ')
    .replace(/π/g, ' \\pi ')
    // Geometry angle representations: \hat{ABC} -> \widehat{ABC}
    .replace(/\\hat\{([a-zA-Z0-9]+)\}/g, '\\widehat{$1}')
    // Unicode square root: √A or √(2x-6) -> \sqrt{A} or \sqrt{2x-6}
    .replace(/√\(([^)]+)\)/g, '\\sqrt{$1}')
    .replace(/√([0-9a-zA-Z]+)/g, '\\sqrt{$1}');
}

/**
 * Renders a KaTeX formula to HTML string safely.
 * Uses output: 'html' so that printing/copying doesn't duplicate invisible MathML text!
 */
function renderKaTeX(formula: string, isBlock: boolean): string {
  try {
    const cleanFormula = normalizeToLatex(formula);
    return katex.renderToString(cleanFormula, {
      displayMode: isBlock,
      throwOnError: false,
      output: 'html',
      strict: false,
      trust: true
    });
  } catch {
    return `<span class="font-mono text-indigo-600">${escapeHtml(formula)}</span>`;
  }
}

/**
 * Parses and renders a line with block equations ($$...$$ or \[...\]) and inline content
 */
function renderLineContent(line: string): React.ReactNode {
  // Regex to split block math
  const blockRegex = /(\$\$.*?\$\$|\\\[.*?\\\])/gs;
  const segments = line.split(blockRegex);

  return segments.map((seg, idx) => {
    if (!seg) return null;

    // $$...$$
    if (seg.startsWith('$$') && seg.endsWith('$$') && seg.length >= 4) {
      const formula = seg.slice(2, -2);
      const html = renderKaTeX(formula, true);
      return (
        <div
          key={idx}
          className="my-3 overflow-x-auto py-1 text-center font-serif text-inherit katex-block-wrapper"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    // \[...\]
    if (seg.startsWith('\\[') && seg.endsWith('\\]') && seg.length >= 4) {
      const formula = seg.slice(2, -2);
      const html = renderKaTeX(formula, true);
      return (
        <div
          key={idx}
          className="my-3 overflow-x-auto py-1 text-center font-serif text-inherit katex-block-wrapper"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    return <span key={idx} className="text-inherit">{renderInlineContent(seg)}</span>;
  });
}

/**
 * Parses inline math ($...$ or \(...\)), bolding (**...**), and auto-detects un-wrapped fractions / exponents / symbols
 */
function renderInlineContent(text: string): React.ReactNode {
  // Regex to split standard LaTeX inline math and bold markers
  const inlineRegex = /(\$(?!\$).*?\$|\\\(.*?\\\)|(?:\*\*.*?\*\*))/g;
  const parts = text.split(inlineRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Inline math $...$
    if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
      const formula = part.slice(1, -1);
      const html = renderKaTeX(formula, false);
      return (
        <span
          key={index}
          className="inline-block align-baseline mx-0.5 text-inherit"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    // Inline math \(...\)
    if (part.startsWith('\\(') && part.endsWith('\\)') && part.length >= 4) {
      const formula = part.slice(2, -2);
      const html = renderKaTeX(formula, false);
      return (
        <span
          key={index}
          className="inline-block align-baseline mx-0.5 text-inherit"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    // Markdown bold **bold**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={index} className="font-bold text-inherit">
          {renderInlineContent(part.slice(2, -2))}
        </strong>
      );
    }

    // Plain text: auto-detect math expressions like 1/2, x^2, √5, 45°
    return <span key={index} className="text-inherit">{renderSmartMathText(part)}</span>;
  });
}

/**
 * Helper to extract balanced curly braces { ... } supporting arbitrary nesting
 */
function extractBalancedBraces(str: string, startIndex: number): { content: string; endIndex: number } | null {
  if (str[startIndex] !== '{') return null;
  let depth = 0;
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) {
        return { content: str.substring(startIndex + 1, i), endIndex: i };
      }
    }
  }
  return null;
}

/**
 * Smart detection for raw math expressions in plain text:
 * - Nested LaTeX fractions: \frac{...}{...}
 * - Nested LaTeX square roots: \sqrt{...} or \sqrt[n]{...}
 * - LaTeX environments: \begin{cases}...\end{cases}
 * - Geometry notations: \widehat{ABC}, \triangle ABC, \angle A, \vec{AB}
 * - Powers & superscripts: x^2, x², (x+1)², 10^5
 * - Subscripts: x_1, x₁, x_2, y_0
 * - LaTeX math symbols without $: \Delta, \pm, \ge, \le, \neq, \approx, \pi, \cdot, \times
 * - Standalone numeric fractions: 1/2, -3/7
 * - Degrees: 90°, 45°
 */
function renderSmartMathText(str: string): React.ReactNode {
  if (!str) return null;

  // Quick check if string contains anything mathematical
  const hasMathHint = /[\\^_{}√°²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅Δπ±≤≥≠≈×÷·]|\d+\/\d+|\b(frac|sqrt|Delta|begin)\b/.test(str);
  if (!hasMathHint) {
    return str;
  }

  const nodes: React.ReactNode[] = [];
  let i = 0;
  const len = str.length;

  while (i < len) {
    // 1. Check for \begin{cases}...\end{cases}
    if (str.startsWith('\\begin{cases}', i)) {
      const endCases = str.indexOf('\\end{cases}', i);
      if (endCases !== -1) {
        const fullFormula = str.substring(i, endCases + 11);
        const html = renderKaTeX(fullFormula, false);
        nodes.push(
          <span
            key={`cases-${i}`}
            className="inline-block align-middle mx-1 text-inherit"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
        i = endCases + 11;
        continue;
      }
    }

    // 2. Check for \frac{numerator}{denominator} with balanced braces
    if (str.startsWith('\\frac{', i)) {
      const numMatch = extractBalancedBraces(str, i + 5);
      if (numMatch && str[numMatch.endIndex + 1] === '{') {
        const denMatch = extractBalancedBraces(str, numMatch.endIndex + 1);
        if (denMatch) {
          const fullFrac = `\\frac{${numMatch.content}}{${denMatch.content}}`;
          const html = renderKaTeX(fullFrac, false);
          nodes.push(
            <span
              key={`frac-${i}`}
              className="inline-block align-middle mx-0.5 text-inherit"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
          i = denMatch.endIndex + 1;
          continue;
        }
      }
    }

    // 3. Check for \sqrt{...} with balanced braces
    if (str.startsWith('\\sqrt{', i)) {
      const match = extractBalancedBraces(str, i + 5);
      if (match) {
        const fullSqrt = `\\sqrt{${match.content}}`;
        const html = renderKaTeX(fullSqrt, false);
        nodes.push(
          <span
            key={`sqrt-${i}`}
            className="inline-block align-baseline mx-0.5 text-inherit"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
        i = match.endIndex + 1;
        continue;
      }
    }

    // 4. Token-based matching for other common math elements
    const subStr = str.substring(i);

    // Common LaTeX commands & geometry without $: \widehat{ABC}, \triangle ABC, \Delta, \pm, \ge, \le, \neq, etc.
    const latexTokenMatch = subStr.match(/^(\\widehat\{[a-zA-Z0-9]+\}|\\angle\s+[A-Za-z0-9]+|\\triangle\s+[A-Za-z0-9]+|\\vec\{[a-zA-Z0-9]+\}|\\overrightarrow\{[a-zA-Z0-9]+\}|\\overline\{[a-zA-Z0-9]+\}|\\(Delta|pi|pm|ge|le|neq|approx|times|div|cdot|subset|in|notin)\b)/);
    if (latexTokenMatch) {
      const token = latexTokenMatch[1];
      const html = renderKaTeX(token, false);
      nodes.push(
        <span
          key={`token-${i}`}
          className="inline-block align-baseline mx-0.5 text-inherit"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
      i += token.length;
      continue;
    }

    // Exponents with powers or unicode: x^2, (x+1)^2, x², y³, a⁴, 10^5
    const expMatch = subStr.match(/^([a-zA-Z0-9()]+\^[0-9a-zA-Z+-]+|[a-zA-Z0-9()]+[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/);
    if (expMatch) {
      const token = expMatch[1];
      const html = renderKaTeX(token, false);
      nodes.push(
        <span
          key={`exp-${i}`}
          className="inline-block align-baseline mx-0.5 text-inherit"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
      i += token.length;
      continue;
    }

    // Subscripts: x_1, x_2, x₁, y₂
    const subMatch = subStr.match(/^([a-zA-Z]_[0-9a-zA-Z]+|[a-zA-Z][₀₁₂₃₄₅₆₇₈₉]+)/);
    if (subMatch) {
      const token = subMatch[1];
      const html = renderKaTeX(token, false);
      nodes.push(
        <span
          key={`sub-${i}`}
          className="inline-block align-baseline mx-0.5 text-inherit"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
      i += token.length;
      continue;
    }

    // Unicode square roots: √(2x-6) or √25
    const rootMatch = subStr.match(/^(√\([^)]+\)|√\s*[0-9a-zA-Z]+)/);
    if (rootMatch) {
      const token = rootMatch[1];
      const html = renderKaTeX(token, false);
      nodes.push(
        <span
          key={`root-${i}`}
          className="inline-block align-baseline mx-0.5 text-inherit"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
      i += token.length;
      continue;
    }

    // Degree: 90°, 45°
    const degMatch = subStr.match(/^(\d+)°/);
    if (degMatch) {
      const num = degMatch[1];
      const html = renderKaTeX(`${num}^\\circ`, false);
      nodes.push(
        <span
          key={`deg-${i}`}
          className="inline-block align-baseline mx-0.5 text-inherit"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
      i += degMatch[0].length;
      continue;
    }

    // Standalone numeric fractions: 1/2 or -3/7
    const fracMatch = subStr.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/);
    if (fracMatch) {
      const fullMatch = fracMatch[0];
      const html = renderKaTeX(`\\frac{${fracMatch[1]}}{${fracMatch[2]}}`, false);
      nodes.push(
        <span
          key={`numfrac-${i}`}
          className="inline-block align-middle mx-0.5 text-inherit"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
      i += fullMatch.length;
      continue;
    }

    // Regular character
    nodes.push(str[i]);
    i++;
  }

  // Combine adjacent string nodes for cleaner React tree
  const mergedNodes: React.ReactNode[] = [];
  let currentString = '';

  nodes.forEach((node, idx) => {
    if (typeof node === 'string') {
      currentString += node;
    } else {
      if (currentString) {
        mergedNodes.push(currentString);
        currentString = '';
      }
      mergedNodes.push(node);
    }
  });

  if (currentString) {
    mergedNodes.push(currentString);
  }

  return mergedNodes;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
