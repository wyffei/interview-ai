const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-source.cjs')

const { createThinkingFetch, thinkingOnFields } = load('src/main/thinking.ts')
const { thinkingModeOf } = load('src/shared/api-profile.ts')

const DASHSCOPE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

/** Stand in for the global fetch, recording each body sent */
function fakeFetch(answer) {
  const bodies = []
  const original = global.fetch
  global.fetch = async (_input, init) => {
    bodies.push(JSON.parse(init.body))
    return answer(bodies.length)
  }
  return { bodies, restore: () => (global.fetch = original) }
}

test('a profile with neither switch is left to the platform', () => {
  assert.equal(thinkingModeOf({ disableThinking: false, enableThinking: false }), 'default')
  assert.equal(thinkingModeOf({ disableThinking: false, enableThinking: true }), 'on')
  assert.equal(thinkingModeOf({ disableThinking: true, enableThinking: false }), 'off')
  // Profiles saved before 开启思考 existed carry no field at all
  assert.equal(thinkingModeOf({ disableThinking: false }), 'default')
})

test('开启思考 asks each platform in its own spelling', () => {
  assert.deepEqual(thinkingOnFields(DASHSCOPE, 'qwen3-vl-plus'), {
    thinking: { type: 'enabled' },
    enable_thinking: true
  })
  assert.deepEqual(thinkingOnFields('https://openrouter.ai/api/v1', 'qwen/qwen3-vl'), {
    reasoning: { enabled: true }
  })
  assert.deepEqual(thinkingOnFields('', 'gpt-5-mini'), { reasoning_effort: 'medium' })
})

test('开启思考 goes into the request body', async () => {
  const fake = fakeFetch(() => new Response('{}', { status: 200 }))
  try {
    const send = createThinkingFetch('on', DASHSCOPE, () => assert.fail('not refused'))
    await send('x', { body: JSON.stringify({ model: 'qwen3-vl-plus', stream: true }) })
    assert.equal(fake.bodies[0].enable_thinking, true)
    assert.equal(fake.bodies[0].stream, true)
  } finally {
    fake.restore()
  }
})

test('a model that cannot think gets the plain request, once reported', async () => {
  const fake = fakeFetch((n) =>
    n === 1
      ? new Response('{"error":"enable_thinking is not supported"}', { status: 400 })
      : new Response('{}', { status: 200 })
  )
  const reported = []
  try {
    const send = createThinkingFetch('on', DASHSCOPE, (model, mode) => reported.push([model, mode]))
    const body = JSON.stringify({ model: 'qwen-vl-max-refuses' })
    const response = await send('x', { body })
    assert.equal(response.status, 200)
    assert.equal(fake.bodies[1].enable_thinking, undefined)
    // Remembered: the next request goes plain straight away
    await send('x', { body })
    assert.equal(fake.bodies.length, 3)
    assert.equal(fake.bodies[2].enable_thinking, undefined)
    assert.deepEqual(reported, [['qwen-vl-max-refuses', 'on']])
  } finally {
    fake.restore()
  }
})
