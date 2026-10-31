const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-source.cjs')

const { parseRequestHeaders, buildRequestHeaders } = load('src/shared/request-headers.ts')
const { countMeaningfulChars } = load('src/shared/conversation.ts')
const { docxHtmlToMarkdown, isWordXml, wordXmlToMarkdown } = load('src/main/docx-markdown.ts')

test('custom headers: one per line, bad lines reported by number', () => {
  const { headers, invalidLines } = parseRequestHeaders(
    'X-Title: 面试\n\nHTTP-Referer: https://example.com\nno colon\napi-key: abc'
  )
  assert.deepEqual(headers, { 'HTTP-Referer': 'https://example.com', 'api-key': 'abc' })
  // Line 1 is not Latin-1, which fetch would reject; blank lines are not counted as bad
  assert.deepEqual(invalidLines, [1, 4])
})

test('custom headers replace the Bearer key whatever their case', () => {
  assert.deepEqual(buildRequestHeaders('sk-1', 'authorization: Bearer gw'), {
    Authorization: 'Bearer gw'
  })
  assert.deepEqual(buildRequestHeaders('', undefined), {})
})

test('punctuation and spaces do not count towards the minimum sentence length', () => {
  assert.equal(countMeaningfulChars('嗯，好的。'), 3)
  assert.equal(countMeaningfulChars(' …？！ '), 0)
})

test('Word headings become # lines, which the 复盘库 search cuts by', () => {
  const md = docxHtmlToMarkdown(
    '<h2><strong>自我介绍</strong></h2><p>我是<strong>某某</strong></p>' +
      '<table><tr><td><p>问题？</p></td><td>回答</td></tr></table><img src="x">'
  )
  assert.match(md, /^## 自我介绍$/m)
  assert.match(md, /^我是\*\*某某\*\*$/m)
  assert.match(md, /^问题？ \| 回答$/m)
  assert.doesNotMatch(md, /img/)
})

test('a Word 2003 XML export is recognised and read without its photo', () => {
  const xml =
    '<?xml version="1.0"?><w:wordDocument xmlns:w="x"><w:body>' +
    '<w:p><w:r><w:t>姓名</w:t></w:r></w:p>' +
    '<w:binData>AAAA</w:binData>' +
    '</w:body></w:wordDocument>'
  assert.equal(isWordXml(xml), true)
  assert.equal(isWordXml('PK\u0003\u0004'), false)
  const text = wordXmlToMarkdown(xml)
  assert.match(text, /姓名/)
  assert.doesNotMatch(text, /AAAA/)
})
