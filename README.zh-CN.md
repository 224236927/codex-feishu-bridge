# Codex 飞书桥

`codex-feishu-bridge` 是一个轻量飞书私聊桥接服务，用来把飞书自建机器人的私聊消息转发给本机官方 Codex CLI，再把完整回复发回飞书。

[English README](./README.md)

## 功能

- 接收飞书私聊文本、图片和文件消息。
- 调用本机 Codex CLI 处理请求。
- 为每个飞书用户保留一个当前 Codex 会话。
- 支持 `/new`、`/reset`、`/status`。
- 当 Codex 回复末尾包含 `OUTPUT_IMAGE: <path>` 或 `OUTPUT_FILE: <path>` 时，可回传生成文件。

## 前置条件

- Node.js 22+
- 本机已安装并登录官方 Codex CLI
- 飞书自建机器人应用凭据
- 飞书应用已启用长连接事件订阅

## 快速开始

```powershell
npm install
Copy-Item .env.example .env
```

编辑 `.env`：

```dotenv
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CODEX_WORKSPACE=.
STATE_FILE=runtime/state.json
CODEX_TIMEOUT_MS=300000
```

真实 `.env` 只留在本机，不要提交到仓库。

## 命令

```powershell
npm test
npm start
npm run start:bg
npm run stop:bg
```

## 运行态文件

以下内容只属于本机运行态，默认不提交：

- `runtime/bridge.pid`
- `runtime/bridge.out.log`
- `runtime/bridge.err.log`
- `runtime/state.json`
- `runtime/media/`

## 说明

- v1 只处理飞书私聊。
- 当前回复是非流式：先发送处理提示，再返回完整 Codex 回复。
- 默认工作目录优先级为 `CODEX_WORKSPACE`、`CODEX_WORKSPACE_ROOT`、当前目录。
