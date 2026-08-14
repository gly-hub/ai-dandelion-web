# AI Dandelion Web

AI Dandelion Web is the React application for AI Dandelion. It provides the authenticated console, AI conversations, function-generation workflow, generated-app rendering, user and permission management, uploads, and realtime notifications.

Chinese documentation: [README_zh-CN.md](README_zh-CN.md)

## Related Repository

The application requires the backend services from [gly-hub/ai-dandelion](https://github.com/gly-hub/ai-dandelion). The backend owns the gateway, API contracts, authentication and authorization, persistence, Agent execution, and generated-app runtime services. This repository owns the browser experience and calls the backend only through its HTTP and WebSocket gateway.

For local development, clone both repositories as siblings:

```text
workspace/
├── ai-dandelion/       # Go backend services and gateway
└── ai-dandelion-web/   # this repository
```

```bash
git clone https://github.com/gly-hub/ai-dandelion.git
git clone https://github.com/gly-hub/ai-dandelion-web.git
```

See the backend [README](https://github.com/gly-hub/ai-dandelion/blob/main/README.md) for service configuration, infrastructure prerequisites, and backend startup.

## Capabilities

- AI Agent: authenticated conversations, streamed responses, session history, skills, and MCP server selection.
- Function operation: generate and manage business functions, preview their generated frontends, and invoke their backend capabilities.
- System console: user, role, menu, model, Agent configuration, notification, upload, and operation-log management.
- Realtime UI: notifications and chat events delivered through the gateway WebSocket endpoint.

## Technology

- React 19 and TypeScript
- Vite
- Ant Design, `@ant-design/x`, `@ant-design/x-sdk`, and `@ant-design/x-markdown`
- React Router

## Prerequisites

- Node.js LTS and npm
- A running [AI Dandelion backend](https://github.com/gly-hub/ai-dandelion) gateway at `http://127.0.0.1:8086`
- The local `rtk` command wrapper used by this project

## Local Development

### 1. Start the backend first

In the sibling backend checkout, create each `configs_local.yaml` from its corresponding `configs_example.yaml`, then start the services in this order:

```bash
cd ../ai-dandelion
rtk go run ./system -c system/config/configs_local.yaml
rtk go run ./ai-agent -c ai-agent/config/configs_local.yaml
rtk go run ./func-operation -c func-operation/config/configs_local.yaml
rtk go run ./inner-gateway -c inner-gateway/config/configs_local.yaml
```

The gateway listens on `http://127.0.0.1:8086`. Configuration details, including matching JWT signing secrets and CORS origins, are documented in the backend repository.

### 2. Run the web application

```bash
rtk npm install
rtk npm run dev
```

Open `http://localhost:5173`.

During development, Vite proxies these root-relative paths to the local gateway:

| Path | Backend capability |
| --- | --- |
| `/ai-agent` | Agent sessions, messages, skills, and MCP configuration |
| `/func-operation` | Function generation and generated-app APIs |
| `/system` | Authentication, users, roles, menus, uploads, and notifications |
| `/realtime` | Realtime ticket requests; the Vite config also supports WebSocket proxying |

The proxy target is defined in [`vite.config.ts`](vite.config.ts). The default development WebSocket connects directly to `ws://127.0.0.1:8086/realtime/ws` after obtaining its ticket through the proxy. Do not call the individual gRPC service ports from browser code.

## Runtime and Deployment

HTTP calls use root-relative paths and attach the authenticated browser token as a Bearer token. Realtime connections obtain a gateway ticket before opening their WebSocket connection. In production, the default WebSocket URL is derived from the current browser origin.

For production, serve the built application on the same public origin as a reverse proxy that forwards `/ai-agent`, `/func-operation`, `/system`, and `/realtime` to `inner-gateway`. The default realtime URL is derived from the browser origin. Set `VITE_REALTIME_WS_URL` during the build only when realtime traffic must use a separate WebSocket endpoint.

Generated app frontend modules are loaded from `/func-operation/generated-apps/...`. Their APIs must use the supplied generated-app render context instead of bypassing the gateway.

## Commands

```bash
# Start the development server
rtk npm run dev

# Run lint checks
rtk npm run lint

# Type-check and create a production build
rtk npm run build

# Serve the production build locally
rtk npm run preview
```

## Project Layout

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Application shell, authenticated routes, module switching, and global realtime notifications. |
| `src/modules/ai-agent/` | AI Agent workspace and conversation interface. |
| `src/modules/func-operation/` | Function generation, management, generated-app preview, and rendering. |
| `src/modules/system/` | Login and system management workspaces. |
| `src/lib/` | API clients, streamed Agent provider, routing, and shared browser logic. |
| `src/types.ts` | Shared frontend types, including generated-app render contracts. |
| `vite.config.ts` | Development API/WebSocket proxy and generated-app module handling. |

## Security Notes

- Browser authentication tokens are stored in session storage and attached only to gateway requests.
- Never add service credentials, API keys, or private endpoints to tracked frontend source or build-time environment files.
- Restrict the backend gateway's CORS and realtime allowed origins to the domains that serve this application.
- Treat generated applications as untrusted code. Review their permissions and published artifacts in the backend before exposing them to users.

## License

No license has been declared in this repository yet. Add a license, security-reporting policy, contribution guide, and CI workflow before public distribution.
