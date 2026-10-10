/**
 * mammoth's HTML for a .docx, as Markdown-ish text: Word's heading styles
 * become `#` lines (the 复盘库 search cuts material into entries by them, and a
 * model reads the structure better too), bold stays `**bold**`, list items get
 * a `- `, table rows become `a | b`. Images are dropped. No imports, so it can
 * be run on its own.
 */
export function docxHtmlToMarkdown(html: string): string {
  return decodeEntities(
    html
      .replace(/<img\b[^>]*>/gi, '')
      // A cell's own paragraphs would break its row across lines
      .replace(/<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi, (_m, _kind: string, cell: string) =>
        `${cell.replace(/<\/?p\b[^>]*>|<br\s*\/?>/gi, ' ').trim()}</td>`
      )
      .replace(/<h([1-6])\b[^>]*>/gi, (_m, level: string) => `\n\n${'#'.repeat(Number(level))} `)
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<(strong|b)\b[^>]*>\s*<\/\1>/gi, '')
      .replace(/<\/?(?:strong|b)\b[^>]*>/gi, '**')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<tr\b[^>]*>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<\/?(?:p|div|ul|ol|table|thead|tbody|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((line) =>
      line
        // A table row's trailing separator, and cells that were only paragraphs
        .replace(/(?:\s*\|\s*)+$/, '')
        .replace(/^\s*\|\s*/, '')
        // `**标题**` split by mammoth into adjacent runs: `****` joins them back
        .replace(/\*\*\*\*/g, '')
        .trimEnd()
    )
    .join('\n')
    .replace(/^(#{1,6}) +\*\*(.*)\*\*$/gm, '$1 $2')
    .replace(/^#{1,6}\s*$/gm, '')
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, code: string) => {
    const c = code.toLowerCase()
    if (c === 'amp') return '&'
    if (c === 'lt') return '<'
    if (c === 'gt') return '>'
    if (c === 'quot') return '"'
    if (c === 'apos') return "'"
    if (c === 'nbsp') return ' '
    const n = c.startsWith('#x') ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)
    return Number.isFinite(n) ? String.fromCodePoint(n) : m
  })
}
