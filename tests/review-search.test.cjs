const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-source.cjs')

const { parseReviewDoc, buildReviewIndex, lookupReview } = load('src/shared/review-search.ts')

const DOC = `# 某公司一面

## 自我介绍
我是某某大学自动化专业的硕士，做过两个机器人项目。

## 你为什么选择我们公司？
看重公司在工业机器人上的积累。

## SLAM 项目
### 激光 SLAM 的回环检测是怎么做的？
用 Scan Context 做候选，再用 ICP 校验。

Q1：你的项目里最大的困难是什么？
多传感器时间同步，最后用硬件触发解决。

## 反问
- 团队现在主要做什么方向

问题一？ | 不在标题里的表格答案
`

const index = buildReviewIndex(parseReviewDoc(DOC, '复盘.md'))
const lookup = (question, hint) => lookupReview(index, question, 4, hint)

test('headings, question lines and table rows each become an entry', () => {
  const titles = parseReviewDoc(DOC, '复盘.md').map((e) => e.title)
  for (const title of [
    '自我介绍',
    '你为什么选择我们公司？',
    '激光 SLAM 的回环检测是怎么做的？',
    '你的项目里最大的困难是什么？',
    '问题一？'
  ]) {
    assert.ok(titles.includes(title), title)
  }
  // A heading with no text of its own is a container, not an entry
  assert.ok(!titles.includes('某公司一面'))
})

test('the very question, padded the way it is spoken, gets the prepared answer as is', () => {
  const result = lookup('先简单做个自我介绍吧')
  assert.equal(result.tier, 'direct')
  assert.equal(result.matches[0].entry.title, '自我介绍')
  assert.match(result.matches[0].entry.body, /机器人项目/)
})

test('a question line inside a section is found by its own words', () => {
  const result = lookup('你项目里最大的困难是什么')
  assert.notEqual(result.tier, 'none')
  assert.equal(result.matches[0].entry.title, '你的项目里最大的困难是什么？')
})

test('反问 stands for the question that asks for it', () => {
  const result = lookup('你还有什么问题想问我吗')
  assert.notEqual(result.tier, 'none')
  assert.equal(result.matches[0].entry.title, '反问')
})

test('an unprepared question finds nothing to show, only related material', () => {
  const result = lookup('说说 TCP 三次握手')
  assert.equal(result.tier, 'none')
  assert.deepEqual(result.matches, [])
})

test('the note steers the related material, not the title match', () => {
  const result = lookup('这个怎么做的', 'SLAM 回环')
  assert.equal(result.tier, 'none')
  assert.equal(result.related[0].title, '激光 SLAM 的回环检测是怎么做的？')
})
