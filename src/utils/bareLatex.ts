// Display-only normalization. Never rewrite the question, key or imported data.
function escaped(text: string, i: number): boolean {
  let slashes = 0;
  while (i > 0 && text[--i] === '\\') slashes++;
  return slashes % 2 === 1;
}

function groupEnd(text: string, start: number, open = '{', close = '}'): number {
  if (text[start] !== open) return -1;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (escaped(text, i)) continue;
    if (text[i] === open) depth++;
    if (text[i] === close && --depth === 0) return i + 1;
  }
  return -1;
}

function bareEnd(text: string, start: number): number {
  if (text.startsWith('\\{', start)) {
    let depth = 1;
    for (let i = start + 2; i < text.length; i++) {
      if (text.startsWith('\\{', i)) { depth++; i++; }
      else if (text.startsWith('\\}', i)) { if (--depth === 0) return i + 2; i++; }
    }
    return -1;
  }
  const env = text.slice(start).match(/^\\begin\{(cases|aligned|align\*?|array|matrix|pmatrix|bmatrix)\}/);
  if (env) {
    const end = text.indexOf(`\\end{${env[1]}}`, start + env[0].length);
    return end < 0 ? -1 : end + `\\end{${env[1]}}`.length;
  }
  if (text.startsWith('\\left', start)) {
    const tokens = /\\(left|right)\b(?:\s*\\[a-zA-Z]+|\s*\\[{}|]|\s*[^\s])/g;
    tokens.lastIndex = start;
    let depth = 0, match: RegExpExecArray | null;
    while ((match = tokens.exec(text))) {
      depth += match[1] === 'left' ? 1 : -1;
      if (depth === 0) return tokens.lastIndex;
    }
    return -1;
  }
  const command = text.slice(start).match(/^\\([a-zA-Z]+|[%{}|])/);
  if (command) {
    const arity: Record<string, number> = { frac: 2, dfrac: 2, tfrac: 2, binom: 2,
      sqrt: 1, mathbb: 1, mathcal: 1, mathrm: 1, mathbf: 1, text: 1, operatorname: 1,
      overline: 1, underline: 1, widehat: 1, hat: 1, bar: 1, vec: 1, overrightarrow: 1, boxed: 1 };
    let end = start + command[0].length;
    if (command[1] === 'sqrt') {
      const next = end + (text.slice(end).match(/^\s*/)?.[0].length || 0);
      if (text[next] === '[') { end = groupEnd(text, next, '[', ']'); if (end < 0) return -1; }
    }
    if (arity[command[1]]) {
      for (let n = 0; n < arity[command[1]]; n++) {
        end += text.slice(end).match(/^\s*/)?.[0].length || 0;
        if (text[end] === '{') end = groupEnd(text, end);
        else if (text[end] === '\\') end = bareEnd(text, end);
        else end = /[A-Za-z0-9]/.test(text[end] || '') ? end + 1 : -1;
        if (end < 0) return -1;
      }
      return end;
    }
    if (/^(?:Delta|pi|theta|alpha|beta|gamma|infty|pm|mp|geq?|leq?|neq?|approx|equiv|times|div|cdot|colon|vdots|ldots|cdots|dots|setminus|smallsetminus|backslash|mid|nmid|lvert|rvert|neg|wedge|vee|land|lor|sim|cong|propto|to|mapsto|because|therefore|leqslant|geqslant|simeq|sin|cos|tan|cot|log|ln|subset(?:eq)?|supset(?:eq)?|in|notin|ni|cup|cap|emptyset|varnothing|forall|exists|Rightarrow|Leftrightarrow|rightarrow|leftarrow|perp|parallel|circ|angle|triangle|%)$/.test(command[1])) return end;
  }
  // Balanced powers/subscripts including nested fractions and radicals.
  const power = text.slice(start).match(/^(?:[A-Za-z]|\d+)(?:\^|_)/);
  if (power) {
    let end = start + power[0].length;
    if (text[end] === '{') return groupEnd(text, end);
    const atom = text.slice(end).match(/^(?:[+-]?\d+|[A-Za-z])/);
    return atom ? end + atom[0].length : -1;
  }
  return -1;
}

export function wrapBareLatex(text: string): string {
  let result = '';
  for (let i = 0; i < text.length;) {
    // Existing delimited formulas are opaque: no nesting or double wrapping.
    const opener = ['$$', '\\[', '\\(', '$'].find(token => text.startsWith(token, i) && !escaped(text, i));
    if (opener) {
      const closer = opener === '\\[' ? '\\]' : opener === '\\(' ? '\\)' : opener;
      let end = text.indexOf(closer, i + opener.length);
      while (end >= 0 && escaped(text, end)) end = text.indexOf(closer, end + closer.length);
      if (end >= 0) { result += text.slice(i, end + closer.length); i = end + closer.length; continue; }
    }
    const end = bareEnd(text, i);
    if (end > i) {
      const token = text.slice(i, end);
      const delimiter = token.includes('\n') ? '$$' : '$';
      result += delimiter + token + delimiter;
      i = end;
    } else result += text[i++];
  }
  return result;
}
