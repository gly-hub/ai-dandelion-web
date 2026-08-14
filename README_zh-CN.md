# AI Dandelion 前端

AI Dandelion Web 是 AI Dandelion 的 React 浏览器端应用，提供登录后的工作台、AI 对话、功能生成流程、生成应用渲染、用户与权限管理、文件上传和实时通知。

English documentation: [README.md](README.md)

## 关联仓库

本应用依赖后端仓库 [gly-hub/ai-dandelion](https://github.com/gly-hub/ai-dandelion)。后端负责网关、API 契约、认证与权限、持久化、Agent 执行和生成应用运行时服务；本仓库负责浏览器端体验，且只通过后端 HTTP 和 WebSocket 网关访问服务。

本地开发请将两个仓库克隆为同级目录：

```text
workspace/
├── ai-dandelion/       # Go 后端服务与网关
└── ai-dandelion-web/   # 当前仓库
```

```bash
git clone https://github.com/gly-hub/ai-dandelion.git
git clone https://github.com/gly-hub/ai-dandelion-web.git
```

服务配置、基础设施要求和后端启动方式请查看后端 [README](https://github.com/gly-hub/ai-dandelion/blob/main/README_zh-CN.md)。

## 主要能力

- AI Agent：登录后的对话、流式响应、会话历史、技能和 MCP 服务选择。
- 功能运行：生成与管理业务功能、预览生成的前端页面，以及调用其后端能力。
- 系统控制台：用户、角色、菜单、模型、Agent 配置、通知、上传和操作日志管理。
- 实时界面：通过网关 WebSocket 接收通知和对话事件。

## 技术栈

- React 19 与 TypeScript
- Vite
- Ant Design、`@ant-design/x`、`@ant-design/x-sdk`、`@ant-design/x-markdown`
- React Router

## 环境要求

- Node.js LTS 与 npm
- 运行中的 [AI Dandelion 后端](https://github.com/gly-hub/ai-dandelion)，网关地址为 `http://127.0.0.1:8086`
- 本项目约定使用的 `rtk` 命令包装器

## 本地联调

### 1. 先启动后端

在同级后端目录中，由各服务的 `configs_example.yaml` 创建 `configs_local.yaml`，然后按以下顺序启动：

```bash
cd ../ai-dandelion
rtk go run ./system -c system/config/configs_local.yaml
rtk go run ./ai-agent -c ai-agent/config/configs_local.yaml
rtk go run ./func-operation -c func-operation/config/configs_local.yaml
rtk go run ./inner-gateway -c inner-gateway/config/configs_local.yaml
```

网关监听 `http://127.0.0.1:8086`。JWT 签名密钥和 CORS 来源等配置请以后端仓库说明为准。

### 2. 启动前端

```bash
rtk npm install
rtk npm run dev
```

浏览器访问 `http://localhost:5173`。

开发模式下，Vite 会将下列根路径代理到本地网关：

| 路径 | 后端能力 |
| --- | --- |
| `/ai-agent` | Agent 会话、消息、技能和 MCP 配置 |
| `/func-operation` | 功能生成与生成应用 API |
| `/system` | 登录、用户、角色、菜单、上传和通知 |
| `/realtime` | 实时连接凭证请求；Vite 配置也支持 WebSocket 代理 |

代理地址在 [`vite.config.ts`](vite.config.ts) 中定义。默认开发 WebSocket 会在通过代理申请连接凭证后，直连 `ws://127.0.0.1:8086/realtime/ws`。浏览器代码不得直接调用各个内部 gRPC 服务端口。

## 运行与部署

HTTP 请求使用根路径，并自动附带 Bearer 登录令牌。实时连接会先向网关申请连接凭证，再建立 WebSocket；生产环境默认根据当前浏览器域名推导 WebSocket 地址。

生产环境应将前端构建产物部署在与反向代理相同的公开域名下，并将 `/ai-agent`、`/func-operation`、`/system` 和 `/realtime` 转发到 `inner-gateway`。默认实时地址由浏览器当前域名推导；只有需要独立 WebSocket 地址时，才在构建前设置 `VITE_REALTIME_WS_URL`。

生成应用前端模块从 `/func-operation/generated-apps/...` 加载。其业务调用应通过提供的生成应用渲染上下文发起，不要绕过网关。

## 常用命令

```bash
# 启动开发服务器
rtk npm run dev

# 运行 lint
rtk npm run lint

# 类型检查并构建生产产物
rtk npm run build

# 本地预览生产构建
rtk npm run preview
```

## 目录说明

| 路径 | 用途 |
| --- | --- |
| `src/App.tsx` | 应用壳、认证路由、模块切换和全局实时通知。 |
| `src/modules/ai-agent/` | AI Agent 工作台和对话界面。 |
| `src/modules/func-operation/` | 功能生成、管理、生成应用预览和渲染。 |
| `src/modules/system/` | 登录和系统管理工作台。 |
| `src/lib/` | API 客户端、流式 Agent Provider、路由和共享浏览器逻辑。 |
| `src/types.ts` | 共享前端类型，包含生成应用渲染契约。 |
| `vite.config.ts` | 开发 API/WebSocket 代理和生成应用模块处理。 |

## 安全说明

- 浏览器登录令牌保存在 session storage 中，只附加到网关请求。
- 不要在受 Git 跟踪的前端源码或构建环境文件中写入服务凭据、API Key 或私有地址。
- 后端网关的 CORS 与实时连接来源必须限制为实际托管该前端的域名。
- 生成应用属于不受信任代码，向用户开放前请在后端侧审查其权限和已发布产物。

## 许可证

当前仓库尚未声明许可证。公开分发前请补齐许可证、安全漏洞报告方式、贡献指南和 CI 工作流。
