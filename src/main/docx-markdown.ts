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
      .replace(
        /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi,
        (_m, _kind: string, cell: string) =>
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

/** Whether `text` is a Word 2003 XML document (WordprocessingML) rather than anything else */
export function isWordXml(text: string): boolean {
  return /^\s*<\?xml[^>]*>[\s\S]{0,500}<w:wordDocument\b/.test(text.slice(0, 2000))
}

/**
 * A Word 2003 XML document as text, in the same shape as `docxHtmlToMarkdown`:
 * one line per paragraph, table rows as `a | b`. Recruitment systems export
 * their forms (应聘简历表) this way under a `.docx` or `.doc` name; Word and WPS
 * open it, but it is plain XML, not the zip a real .docx is. The photo
 * (`w:binData`, base64) is dropped.
 */
export function wordXmlToMarkdown(xml: string): string {
  const body = xml
    .replace(/<w:binData\b[\s\S]*?<\/w:binData>/g, '')
    .replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/g, '')
  const lines: string[] = []
  for (const [block] of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    if (!block.startsWith('<w:tbl>')) {
      lines.push(paragraphText(block))
      continue
    }
    for (const [row] of block.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)) {
      const cells = [...row.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)]
        // A cell's own paragraphs would break its row across lines
        .map(([cell]) =>
          [...cell.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)]
            .map(([p]) => paragraphText(p).replace(/\n/g, ' '))
            .join(' ')
            .trim()
        )
        .filter(Boolean)
      if (cells.length > 0) lines.push(cells.join(' | '))
    }
  }
  return lines
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/** A paragraph's runs joined: 「姓」「名」 split into runs for spacing read as 「姓名」 */
function paragraphText(paragraph: string): string {
  return decodeEntities(
    paragraph
      // A run's tab, not the tab stops under <w:tabs> (those carry attributes)
      .replace(/<w:tab\/>/g, '<w:t> </w:t>')
      .replace(/<w:br\b[^>]*\/>/g, '<w:t>\n</w:t>')
      .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, '\u0000$1\u0000')
      .split('\u0000')
      .filter((_part, i) => i % 2 === 1)
      .join('')
  )
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
