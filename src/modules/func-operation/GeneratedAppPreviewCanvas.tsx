import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Spin } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { loadGeneratedAppModuleSourceGraph } from '../../lib/funcOperationApi'
import { flattenMenus } from '../../lib/navMenus'
import type {
  GeneratedApp,
  GeneratedAppInvokeResult,
  SystemMenu,
} from '../../types'
import { GeneratedAppInvokeError } from '../../types'

export type PreviewErrorKind = 'load' | 'render' | 'invoke' | 'missing'

export interface PreviewErrorState {
  kind: PreviewErrorKind
  message: string
  hint?: string
  stage?: string
  errorCode?: string
}

interface GeneratedAppPreviewCanvasProps {
  app: GeneratedApp | null
  enabled: boolean
  renderKey: string
  functionId?: string
  className?: string
  versionHint?: string
  showManualRefresh?: boolean
  navTree?: SystemMenu[]
  runFunction: (appId: string, payload?: unknown) => Promise<GeneratedAppInvokeResult>
  onErrorChange?: (error: PreviewErrorState | null) => void
  onReload?: () => void
  onFixWithAI?: () => void
}

const EMPTY_NAV_TREE: SystemMenu[] = []

const GENERATED_APP_SANDBOX_BOOTSTRAP = String.raw`<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<style>html,body,#generated-app-root{margin:0;width:100%;height:100%;overflow:hidden}#generated-app-root{box-sizing:border-box}</style>
</head><body><div id="generated-app-root"></div><script>
(() => {
  const root = document.getElementById('generated-app-root');
  const pending = new Map();
  const bootstrapChannel = '__GENERATED_APP_SANDBOX_CHANNEL__';
  let channel = '';
  let nextRequest = 1;
  const imports = /(['"])(\.\.?\/[^'"]+\.js)\1/g;
  const emit = (type, payload = {}) => parent.postMessage({ type, channel, ...payload }, '*');
  const errorMessage = (error) => error && error.message ? error.message : String(error || '功能页面运行失败');
  const moduleKey = (url) => url.origin + url.pathname;
  const importModules = async (entry, modules) => {
    const blobs = new Map();
    try {
      for (const key of Object.keys(modules)) {
        const source = modules[key] || '';
        const moduleURL = new URL(key);
        const rewritten = source.replace(imports, (match, quote, specifier) => {
          const dependency = moduleKey(new URL(specifier, moduleURL));
          if (!Object.prototype.hasOwnProperty.call(modules, dependency)) throw new Error('缺少页面模块依赖');
          // Keep dependencies as stable virtual URLs. The import map below
          // resolves them to Blob URLs and, unlike a topological rewrite,
          // supports circular ESM dependencies.
          return quote + dependency + quote;
        });
        blobs.set(key, URL.createObjectURL(new Blob([rewritten], { type: 'text/javascript' })));
      }
      if (!blobs.has(entry)) throw new Error('页面入口模块不存在');
      const importMap = document.createElement('script');
      importMap.type = 'importmap';
      importMap.textContent = JSON.stringify({ imports: Object.fromEntries(blobs) });
      document.head.append(importMap);
      return await import(entry);
    } finally {
      for (const blob of blobs.values()) URL.revokeObjectURL(blob);
    }
  };
  const invoke = (appId, payload, defaultAppId) => new Promise((resolve, reject) => {
    const requestId = String(nextRequest++);
    pending.set(requestId, { resolve, reject });
    emit('generated-app-sandbox:invoke', { requestId, appId: appId || defaultAppId, payload: payload === undefined ? {} : payload });
  });
  const configGetMany = async (keys, defaultAppId) => {
    const normalized = Array.isArray(keys) ? [...new Set(keys.map((key) => String(key || '').trim()).filter(Boolean))] : [];
    if (!normalized.length) throw new Error('配置 key 不能为空');
    const result = await invoke(defaultAppId, { action: '__platform.config.get', configKeys: normalized }, defaultAppId);
    const data = result && result.response !== undefined ? result.response : result && result.result;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('公共配置返回格式错误');
    return data;
  };
  window.addEventListener('message', async (event) => {
    if (event.source !== parent || !event.data || typeof event.data !== 'object') return;
    const message = event.data;
    if (message.type === 'generated-app-sandbox:invoke-result' || message.type === 'generated-app-sandbox:invoke-error') {
      if (message.channel !== channel) return;
      const request = pending.get(String(message.requestId || ''));
      if (!request) return;
      pending.delete(String(message.requestId || ''));
      if (message.type === 'generated-app-sandbox:invoke-result') request.resolve(message.result);
      else request.reject(new Error(String(message.message || '功能调用失败')));
      return;
    }
    if (message.type !== 'generated-app-sandbox:init' || !message.channel) return;
    channel = String(message.channel);
    try {
      const app = message.app;
      const permissions = message.permissions || { controlledActions: [], actions: [] };
      const controlled = Array.isArray(permissions.controlledActions) ? permissions.controlledActions : [];
      const granted = Array.isArray(permissions.actions) ? permissions.actions : [];
      const context = {
        app,
        permissions: { controlledActions: controlled, actions: granted },
        can: (actionKey) => { const value = String(actionKey || '').trim(); return !value || !controlled.includes(value) || granted.includes(value); },
        isControlled: (actionKey) => controlled.includes(String(actionKey || '').trim()),
        invoke: (appId, payload) => invoke(appId, payload, app.id),
        invokeData: async (appId, payload) => { const result = await invoke(appId, payload, app.id); return result.response !== undefined ? result.response : result.result; },
        unwrap: (result) => result && result.response !== undefined ? result.response : result && result.result,
        config: {
          get: async (key) => {
            const normalized = String(key || '').trim();
            const values = await configGetMany([normalized], app.id);
            if (!Object.prototype.hasOwnProperty.call(values, normalized)) throw new Error('公共配置不存在：' + normalized);
            return values[normalized];
          },
          getMany: (keys) => configGetMany(keys, app.id),
        },
      };
      const module = await importModules(String(message.entry || ''), message.modules || {});
      if (typeof module.render !== 'function') throw new Error('页面未导出 render 函数');
      await module.render(root, context);
      emit('generated-app-sandbox:rendered');
    } catch (error) {
      emit('generated-app-sandbox:error', { message: errorMessage(error) });
    }
  });
  window.addEventListener('error', (event) => emit('generated-app-sandbox:runtime-error', { message: event.message || '功能页面运行失败' }));
  window.addEventListener('unhandledrejection', (event) => emit('generated-app-sandbox:runtime-error', { message: errorMessage(event.reason) }));
  parent.postMessage({ type: 'generated-app-sandbox:ready', channel: bootstrapChannel }, '*');
})();
</script></body></html>`

const SANDBOX_RENDER_TIMEOUT_MS = 15_000

function createSandboxChannel(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function postSandboxMessage(target: MessageEventSource | null, message: Record<string, unknown>) {
  if (target && 'postMessage' in target) {
    target.postMessage(message, { targetOrigin: '*' })
  }
}

function messageText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '功能调用失败')
}

export function GeneratedAppPreviewCanvas({
  app,
  enabled,
  renderKey,
  functionId = '',
  className = '',
  versionHint,
  showManualRefresh = false,
  navTree = EMPTY_NAV_TREE,
  runFunction,
  onErrorChange,
  onReload,
  onFixWithAI,
}: GeneratedAppPreviewCanvasProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const runFunctionRef = useRef(runFunction)
  const onErrorChangeRef = useRef(onErrorChange)
  const permissionsRef = useRef<{ key: string; value: { controlledActions: string[]; actions: string[] } } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<PreviewErrorState | null>(null)
  const [reloadSeed, setReloadSeed] = useState(0)
  const appId = app?.id || ''
  const appName = app?.name || ''
  const appVersion = app?.version || ''
  const appDescription = app?.description || ''
  const appExport = app?.export || ''
  const appFrontendEntry = app?.frontendEntry || ''
  const appBackendSource = app?.backendSource || ''
  const appBackendModule = app?.backendModule || ''
  const appTablePrefix = app?.tablePrefix || ''
  const appCreatedAt = app?.createdAt || 0
  const appUpdatedAt = app?.updatedAt || 0

  const appSnapshot = useMemo<GeneratedApp | null>(() => {
    if (!appId) {
      return null
    }
    return {
      id: appId,
      name: appName,
      version: appVersion,
      description: appDescription,
      export: appExport,
      frontendEntry: appFrontendEntry,
      backendSource: appBackendSource,
      backendModule: appBackendModule,
      tablePrefix: appTablePrefix,
      createdAt: appCreatedAt,
      updatedAt: appUpdatedAt,
    }
  }, [
    appBackendModule,
    appBackendSource,
    appCreatedAt,
    appDescription,
    appExport,
    appFrontendEntry,
    appId,
    appName,
    appTablePrefix,
    appUpdatedAt,
    appVersion,
  ])

  const permissions = useMemo(() => {
    if (!appSnapshot) {
      return { controlledActions: [], actions: [] }
    }
    const resolved = resolveGeneratedAppActionPermissions(navTree, appSnapshot.id, functionId)
    const key = `${resolved.controlledActions.join('\u0000')}\u0001${resolved.grantedActions.join('\u0000')}`
    if (permissionsRef.current?.key === key) {
      return permissionsRef.current.value
    }
    const value = { controlledActions: resolved.controlledActions, actions: resolved.grantedActions }
    permissionsRef.current = { key, value }
    return value
  }, [appSnapshot, functionId, navTree])

  const reportError = useCallback((next: PreviewErrorState | null) => {
    setError(next)
    onErrorChangeRef.current?.(next)
  }, [])

  useEffect(() => {
    runFunctionRef.current = runFunction
  }, [runFunction])

  useEffect(() => {
    onErrorChangeRef.current = onErrorChange
  }, [onErrorChange])

  useEffect(() => {
    if (!enabled || !appSnapshot) {
      return
    }

    let canceled = false
    let sandboxReady = false
    let initializationPosted = false
    let sourceLoadFailed = false
    let sourceTimedOut = false
    let sandboxBooted = false
    let sourceGraph: { entry: string; modules: Record<string, string> } | null = null
    let renderTimeout: number | undefined
    const channel = createSandboxChannel()
    const sourceAbortController = new AbortController()

    const frame = frameRef.current
    if (!frame) {
      return
    }
    const isCurrentRender = () => !canceled
    const postInit = () => {
      if (!frame.contentWindow || !sandboxReady || !sourceGraph || !isCurrentRender() || sourceTimedOut || initializationPosted) {
        return
      }
      initializationPosted = true
      if (sourceTimeout !== undefined) {
        window.clearTimeout(sourceTimeout)
      }
      setLoading(true)
      renderTimeout = window.setTimeout(() => {
        if (isCurrentRender()) {
          reportError({
            kind: 'load',
            message: '功能页面渲染超时',
            hint: '页面初始化未完成，请重新加载页面代码。',
          })
          setLoading(false)
        }
      }, SANDBOX_RENDER_TIMEOUT_MS)
      frame.contentWindow.postMessage({
        type: 'generated-app-sandbox:init',
        channel,
        app: appSnapshot,
        permissions,
        entry: sourceGraph.entry,
        modules: sourceGraph.modules,
      }, '*')
    }
    const onMessage = (event: MessageEvent<Record<string, unknown>>) => {
      if (!isCurrentRender() || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') {
        return
      }
      if (event.data.type === 'generated-app-sandbox:ready') {
        if (event.data.channel !== channel) {
          return
        }
        sandboxReady = true
        sandboxBooted = true
        if (sandboxBootTimeout !== undefined) {
          window.clearTimeout(sandboxBootTimeout)
        }
        if (!sourceLoadFailed) {
          reportError(null)
        }
        postInit()
        return
      }
      if (event.data?.channel !== channel) {
        return
      }
      if (event.data.type === 'generated-app-sandbox:rendered') {
        if (isCurrentRender()) {
          if (renderTimeout !== undefined) {
            window.clearTimeout(renderTimeout)
          }
          setLoading(false)
        }
        return
      }
      if (event.data.type === 'generated-app-sandbox:error' || event.data.type === 'generated-app-sandbox:runtime-error') {
        if (isCurrentRender()) {
          if (renderTimeout !== undefined) {
            window.clearTimeout(renderTimeout)
          }
          reportError(toPreviewError(new Error(messageText(event.data.message)), event.data.type === 'generated-app-sandbox:error' ? 'render' : 'invoke'))
          setLoading(false)
        }
        return
      }
      if (event.data.type !== 'generated-app-sandbox:invoke') {
        return
      }
      const requestId = messageText(event.data.requestId)
      const targetID = messageText(event.data.appId) || appSnapshot.id
      if (!requestId) {
        return
      }
      if (targetID !== appSnapshot.id) {
        postSandboxMessage(event.source, { type: 'generated-app-sandbox:invoke-error', channel, requestId, message: '不允许调用其他功能' })
        return
      }
      void runFunctionRef.current(appSnapshot.id, event.data.payload)
        .then((result) => {
          if (isCurrentRender()) {
            postSandboxMessage(event.source, { type: 'generated-app-sandbox:invoke-result', channel, requestId, result })
          }
        })
        .catch((err) => {
          if (isCurrentRender()) {
            reportError(toPreviewError(err, 'invoke'))
            postSandboxMessage(event.source, { type: 'generated-app-sandbox:invoke-error', channel, requestId, message: errorMessage(err) })
          }
        })
    }
    window.addEventListener('message', onMessage)
    reportError(null)
    setLoading(true)
    const sandboxBootTimeout = window.setTimeout(() => {
      if (!isCurrentRender() || sandboxBooted) {
        return
      }
      reportError({
        kind: 'render',
        message: '功能页面隔离环境未能启动',
        hint: '请重新加载页面代码；若仍失败，请使用“让 AI 修复页面”查看页面运行错误。',
      })
      setLoading(false)
    }, 3_000)
    frame.srcdoc = GENERATED_APP_SANDBOX_BOOTSTRAP.replace('__GENERATED_APP_SANDBOX_CHANNEL__', channel)
    const sourceTimeout = window.setTimeout(() => {
      if (isCurrentRender()) {
        sourceTimedOut = true
        sourceAbortController.abort()
        reportError({
          kind: 'load',
          message: '加载功能页面代码超时',
          hint: '页面代码未能及时返回，请重新加载页面代码。',
        })
        setLoading(false)
      }
    }, SANDBOX_RENDER_TIMEOUT_MS)
    void loadGeneratedAppModuleSourceGraph(appSnapshot, {
      cacheBust: `${renderKey}:${reloadSeed}`,
      signal: sourceAbortController.signal,
    })
      .then((graph) => {
        if (!isCurrentRender()) {
          return
        }
        sourceGraph = graph
        postInit()
      })
      .catch((err) => {
        if (sourceTimeout !== undefined) {
          window.clearTimeout(sourceTimeout)
        }
        if (isCurrentRender() && !sourceTimedOut && !(err instanceof DOMException && err.name === 'AbortError')) {
          sourceLoadFailed = true
          reportError(toPreviewError(err, 'load'))
          setLoading(false)
        }
      })

    return () => {
      canceled = true
      if (sourceTimeout !== undefined) {
        window.clearTimeout(sourceTimeout)
      }
      if (renderTimeout !== undefined) {
        window.clearTimeout(renderTimeout)
      }
      if (sandboxBootTimeout !== undefined) {
        window.clearTimeout(sandboxBootTimeout)
      }
      sourceAbortController.abort()
      window.removeEventListener('message', onMessage)
    }
  }, [appSnapshot, enabled, permissions, renderKey, reloadSeed, reportError])

  function handleManualRefresh() {
    setReloadSeed((current) => current + 1)
    reportError(null)
    onReload?.()
  }

  if (!app) {
    return (
      <div className="preview-canvas-shell preview-canvas-shell-pending">
        <div className="preview-canvas-loading-overlay is-static">
          <Spin size="small" />
          <strong>正在加载功能页面</strong>
        </div>
      </div>
    )
  }

  return (
    <div className="preview-canvas-shell">
      {versionHint || showManualRefresh ? (
        <div className="preview-canvas-toolbar">
          {versionHint ? <p className="preview-version-hint">{versionHint}</p> : <span />}
          {showManualRefresh ? (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={handleManualRefresh}
            >
              刷新页面
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="preview-error-panel">
          <p className="preview-error">{error.message}</p>
          {error.hint ? <p className="preview-error-hint">{error.hint}</p> : null}
          <div className="preview-error-actions">
            {error.kind === 'load' && onReload ? (
              <Button
                icon={<ReloadOutlined />}
                onClick={handleManualRefresh}
              >
                重新加载页面代码
              </Button>
            ) : null}
            {(error.kind === 'render' || error.kind === 'invoke') && onFixWithAI ? (
              <Button type="primary" onClick={onFixWithAI}>
                让 AI 修复页面
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="preview-canvas-runtime">
        <iframe
          ref={frameRef}
          className={`generated-app-mount generated-app-frame ${className}`.trim()}
          sandbox="allow-scripts"
          title={`${app.name || app.id} 功能页面`}
        />
        {loading ? (
          <div className="preview-canvas-loading-overlay" aria-live="polite">
            <Spin size="small" />
            <strong>正在渲染功能页面</strong>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function resolveGeneratedAppActionPermissions(navTree: SystemMenu[], appId: string, functionId: string): {
  controlledActions: string[]
  grantedActions: string[]
} {
  if (!appId) {
    return { controlledActions: [], grantedActions: [] }
  }
  const flatMenus = flattenMenus(navTree)
  const sourceIds = [functionId.trim(), appId.trim()].filter(Boolean)
  const appMenu = flatMenus.find(
    (item) =>
      item.sourceType === 'generated_function' &&
      sourceIds.includes(item.sourceId || '') &&
      item.menuType === 2,
  )
  if (!appMenu) {
    return { controlledActions: [], grantedActions: [] }
  }
  const grantedActions = flatMenus
    .filter((item) => item.parentId === appMenu.id && item.menuType === 3)
    .map((item) => item.viewKey || item.code.split('.').pop() || '')
    .filter(Boolean)

  const controlledActions = Array.from(
    new Set(
      grantedActions.concat(resolveControlledActionKeys(appMenu)),
    ),
  )
  return { controlledActions, grantedActions }
}

function resolveControlledActionKeys(appMenu: SystemMenu): string[] {
  const remark = appMenu.remark || ''
  const marker = 'actions:'
  const index = remark.indexOf(marker)
  if (index < 0) {
    return []
  }
  return remark
    .slice(index + marker.length)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toPreviewError(error: unknown, kind: PreviewErrorKind): PreviewErrorState {
  if (error instanceof GeneratedAppInvokeError) {
    return {
      kind: 'invoke',
      message: error.message,
      hint: error.hint,
      stage: error.stage,
      errorCode: error.errorCode,
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  if (kind === 'load') {
    return {
      kind: 'load',
      message,
      hint: '请尝试重新加载页面代码，或返回页面生成步骤继续修改',
    }
  }
  if (kind === 'render') {
    return {
      kind: 'render',
      message,
      hint: '页面渲染失败，可让 AI 修复页面代码',
    }
  }
  return {
    kind,
    message,
    hint: '功能运行失败，请查看错误详情',
  }
}
