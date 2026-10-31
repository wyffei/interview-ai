const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-source.cjs')

const { parseSummary, answerLabel, visibleLength, splitRecord, questionNumber, questionTitle } =
  load('src/shared/screenshot.ts')
const { formatScreenshotRecord } = load('src/main/save-screenshot.ts', {
  './save-conversation': { getSaveDir: () => '/tmp' }
})

test('the history uses the number on screen, else the place in the launch', () => {
  assert.equal(questionNumber('**第 37 题：答案 A**'), '37')
  assert.equal(questionNumber('第3-5题：1.B 2.C'), '3-5')
  assert.equal(questionNumber('答案 B', '12. 下列哪项属于优化器？'), '12')
  assert.equal(questionNumber('答案 B', '下列哪项属于优化器？'), '')
  assert.equal(questionTitle('37', 2), '第 37 题')
  assert.equal(questionTitle('', 2), '#2')
})

test('the record is read out of a fenced or chatty reply', () => {
  const reply =
    '好的：\n```json\n{"question": "下列哪项是激活函数？\nA. ReLU B. SGD", "answer": "A", "reason": "SGD 是优化器"}\n```'
  assert.deepEqual(parseSummary(reply), {
    number: '',
    question: '下列哪项是激活函数？\nA. ReLU B. SGD',
    answer: 'A',
    reason: 'SGD 是优化器'
  })
  assert.equal(parseSummary('抱歉，看不清截图'), null)
  assert.equal(parseSummary('{"note": 1}'), null)
})

test('a history row reads the answer off the text when there is no record', () => {
  assert.equal(answerLabel('**第 1 题：答案 B**\n- 理由：…'), 'B')
  assert.equal(answerLabel('答案：A、C、D\n因为…'), 'ACD')
  assert.equal(answerLabel('**答案 正确**'), '正确')
  assert.equal(answerLabel('## 思路\n用双指针，时间复杂度 O(n)'), '思路')
  assert.equal(
    answerLabel('这是一道非常长的题目解析第一行内容超过了二十四个字的限制'),
    '这是一道非常长的题目解析第一行内容超过了二十四个…'
  )
})

test('the file holds each question, answer and reason, or the whole answer without a record', () => {
  const content = formatScreenshotRecord(new Date(2026, 9, 31, 14, 5).getTime(), [
    {
      id: 1,
      summary: { number: '37', question: '题干\nA. x', answer: 'A', reason: '因为' },
      answer: '…'
    },
    { id: 2, summary: null, answer: '完整解答' }
  ])
  assert.equal(
    content,
    '# 截图答题 2026-10-31 14:05\n\n## 第 37 题\n\n**题目**\n\n> 题干\n> A. x\n\n**答案**：A\n\n**理由**：因为\n\n---\n\n## #2\n\n*（题目未能识别，下面是完整解答）*\n\n完整解答\n'
  )
})

test('the record the model appends never reaches the page, even split across chunks', () => {
  const full =
    '**答案 B**\n- 理由：Adam 是优化器\n\n<记录>{"question": "q", "answer": "B", "reason": "r"}</记录>'
  // Stream it a few characters at a time, showing what visibleLength allows
  let text = ''
  let shown = 0
  for (const chunk of full.match(/[\s\S]{1,3}/g)) {
    text += chunk
    shown = Math.max(shown, visibleLength(text))
    assert.ok(!text.slice(0, shown).includes('<记'), `shown too much at ${JSON.stringify(text)}`)
  }
  assert.equal(text.slice(0, shown).trim(), '**答案 B**\n- 理由：Adam 是优化器')

  assert.deepEqual(splitRecord(full), {
    answer: '**答案 B**\n- 理由：Adam 是优化器',
    record: '{"question": "q", "answer": "B", "reason": "r"}'
  })
})

test('an answer without a record is kept whole; a fence opened for the record is dropped', () => {
  assert.deepEqual(splitRecord('a < b 成立\n'), { answer: 'a < b 成立', record: null })
  assert.equal(visibleLength('a <'), 2)
  assert.equal(splitRecord('答案 C\n\n```json\n<记录>{"answer": "C"}').answer, '答案 C')
  assert.equal(splitRecord('答案 C\n\n```json\n<记录>{"answer": "C"}').record, '{"answer": "C"}')
})
