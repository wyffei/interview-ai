---
name: run-interview-coder-cn
description: Build, run, and drive the 语音面试助手 Electron app (repo interview-coder-cn). Use when asked to start or run the app, take a screenshot of it, test or verify a change in the real app (hint cards, 思考过程, 复盘库 lookups, settings), or click around its UI with a real AI model.
---

语音面试助手 is an Electron overlay app. Agents drive the **built** app with
`.claude/skills/run-interview-coder-cn/driver.mjs`: a Playwright `_electron` driver that listens
for commands on `localhost:47123` (`curl`), takes screenshots, and talks to the real AI platform
configured in `.env`. Each launch gets a throwaway userData dir, so your own settings are never
touched.

All paths are relative to the repo root. Verified on macOS (the app targets macOS and Windows
only; Windows not tried).

## Prerequisites

- macOS with Node 24 (`node -v`), `curl`, and `say` to speak questions.
- Screen Recording permission for `node_modules/electron/dist/Electron.app` (system audio is
  captured through `getDisplayMedia`) - it was already granted on the machine this was verified on.
- `.env` at the repo root with an API key and a `DASHSCOPE_API_KEY` line (commented is fine). The
  driver can pick a commented-out block from it (see `launch` below).

## Setup

```bash
npm install
npm i --no-save playwright-core
```

`npm install` removes `playwright-core` again (it is not in `package.json`), so rerun the second
line after every `npm install`.

## Build

The driver launches `out/` (`package.json` `main`), not `src/`. Rebuild after every change -
`launch` prints a WARNING when `src/` is newer than `out/`:

```bash
npx electron-vite build
```

## Run (agent path)

Start the driver in the background, wait for it, launch the app. `MODEL` / `API_BASE_URL` /
`API_KEY` in the driver's environment beat `.env`; `launch?a=openrouter` takes the `.env`
`API_BASE_URL` line containing `openrouter` (commented or not) plus the `API_KEY` line after it:

```bash
MODEL=openai/gpt-6-sol node .claude/skills/run-interview-coder-cn/driver.mjs > /tmp/run-interview-coder-cn-driver.log 2>&1 &
until curl -s localhost:47123/ping >/dev/null; do sleep 0.3; done
curl -s 'localhost:47123/launch?a=openrouter'
```

`launch` answers with the header (`语音面试助手 … 技术面试 · openai/gpt-6-sol …`) - check the
model there.

Set the DashScope key, listen, speak a question through the speakers (audible), wait for the hint
card:

```bash
curl -s localhost:47123/dashscope
curl -s localhost:47123/click-text --get --data-urlencode 'a=开始监听'
sleep 3
curl -s localhost:47123/say --get --data-urlencode 'a=请你讲一下，TCP 三次握手为什么不能是两次？'
curl -s 'localhost:47123/waithints?a=60'
curl -s 'localhost:47123/ss?a=hint'
curl -s localhost:47123/click-text --get --data-urlencode 'a=停止监听'
```

**Stop** - always through the driver: `quit` deletes the userData dir, which holds the API keys in
plain text:

```bash
curl -s localhost:47123/quit
```

Screenshots land in `$TMPDIR/run-interview-coder-cn/shots/` (`SCREENSHOT_DIR` overrides); the
app's stdout/stderr in `$TMPDIR/run-interview-coder-cn/app.log`. Open the screenshots and look.

| command (`curl -s 'localhost:47123/<cmd>?a=<arg>'`) | what it does                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ping`                                              | `pong` once the driver is listening                                              |
| `launch[?a=<.env block>]`                           | start the app on a fresh userData dir                                            |
| `ss?a=<name>`                                       | screenshot of the main window -> `<name>.png`                                    |
| `action?a=<name>`                                   | run a shortcut action: `generateHint`, `toggleHintMode`, `stopSolutionStream`, … |
| `goto?a=<hash>`                                     | navigate: `#/`, `#/settings?tab=voice`, …                                        |
| `dashscope`                                         | type `DASHSCOPE_API_KEY` (env, else `.env`) into 设置 → 语音, go back            |
| `say?a=<text>`                                      | speak through the speakers (`SAY_VOICE`, default Tingting)                       |
| `hints` / `waithints?a=<seconds>`                   | hint cards (meta, busy, reasoning, text) / wait until all finished               |
| `click-text?a=<text>`                               | click a button, link or summary by its text                                      |
| `eval?a=<js>` / `text[?a=<css>]`                    | evaluate in the page / print innerText                                           |
| `windows`                                           | URLs of the app's windows                                                        |
| `quit`                                              | close the app, delete its userData, stop the driver                              |

Pass Chinese or spaces with `--get --data-urlencode 'a=…'`.

## Run (human path)

`npm run dev` (README) opens the app with hot reload on your real settings
(`~/Library/Application Support/interview-coder-cn`). Not used by agents.

## Test

There is no unit test suite; these are the checks:

```bash
npm run typecheck
npm run lint
```

Both exit 0 on a clean tree.

## Gotchas

- **Settings live in the renderer's localStorage and win over `.env`.** The driver passes
  `--user-data-dir=<fresh dir>` (Electron honors it), so every launch starts from `.env` defaults
  and the real `~/Library/Application Support/interview-coder-cn` is never read or written.
- **The app reads `.env` itself** (dotenv, cwd = repo root). `MODEL="gpt-5-mini"` there applies
  unless the driver gets `MODEL=`; dotenv never overrides variables already set.
- **Global shortcuts can't be pressed from Playwright.** `action` calls
  `window.api.triggerAction`, which only accepts `clickableActions` in `src/main/shortcuts.ts`;
  anything else comes back `refused`.
- **Content protection does not block `ss`**: Playwright renders through CDP, not OS capture.
- **Two windows**: the main one and the overlay toolbar (`index.html#toolbar`); the driver picks
  the main one.
- **No spinner to wait on**: a hint card drops its spinner at the first text chunk. `waithints`
  waits for the card's latency (`自动 · 1.7s`), which only appears once it is finished.
- **Reasoning is not guaranteed.** `openai/gpt-6-sol` via OpenRouter sends a 思考过程 summary only
  sometimes - repeat `click-text?a=出提示` until one comes.
- **The DashScope key is not read from env** (`dashscopeApiKey: ''` in `src/main/settings.ts`), so
  `dashscope` types it into the settings page.
- **The app hears system audio** (`getDisplayMedia` loopback), so `say` through the speakers is
  recognised - and is audible to whoever is at the machine.
- **No tmux on the verified Mac**, hence the HTTP port instead of a stdin REPL. A driver started
  with `&` keeps running after the shell that started it exits.

## Troubleshooting

- **`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright-core'`**: an `npm install`
  pruned it. `npm i --no-save playwright-core`.
- **`zsh: no matches found: localhost:47123/ss?a=…`**: zsh globbed the `?`. Quote the URL.
- **Header shows `gpt-5-mini` instead of the model you wanted**: `.env`'s `MODEL` won. Start the
  driver with `MODEL=<id>`.
- **`sandbox_extension_issue_file failed … Operation not permitted` in `app.log`**: harmless noise
  from the unpacked Electron.app.
