# 布局闪烁问题修复

## 问题描述

在流程切换时，页面出现明显的布局跳动和闪烁：
1. 加载状态时显示为居中的 loading
2. 加载完成后突然变成左右两栏布局
3. 导致视觉上的不连贯和闪烁

## 根本原因

**加载状态和实际内容的布局结构不一致**：
- 加载时：使用 `func-editor-content-loading` 居中显示
- 加载后：使用左右两栏的 Grid 布局

## 解决方案

### 1. 统一布局结构

**所有状态（加载中、预览模式、普通模式）都使用相同的基础结构**：

```tsx
// 普通模式（产品、技术、代码）
<>
  <div className="func-editor-workspace-primary">
    {内容区}
  </div>
  <div className="func-editor-workspace-secondary">
    {对话框}
  </div>
</>

// 预览模式
<div className="func-editor-workspace-primary">
  {预览画布}
</div>
// 对话框通过 CSS 隐藏

// 加载状态 - 也保持相同结构
普通模式加载：左侧骨架屏 + 右侧骨架屏
预览模式加载：只显示左侧骨架屏
```

### 2. TSX 修改

#### 修改前
```tsx
{isLoading ? (
  <div className="func-editor-content-loading">
    {renderEditorLoadingWorkspace(resolvedEditorStep)}
  </div>
) : isPreviewStep ? (
  renderPlanningWorkspace(functionItem)
) : (
  <>
    <div className="func-editor-workspace-primary">...
    <div className="func-editor-workspace-secondary">...
  </>
)}
```

#### 修改后
```tsx
{isLoading ? (
  isPreviewStep ? (
    <div className="func-editor-workspace-primary">
      {renderEditorLoadingWorkspace(resolvedEditorStep)}
    </div>
  ) : (
    <>
      <div className="func-editor-workspace-primary">
        {renderEditorLoadingWorkspace(resolvedEditorStep)}
      </div>
      <div className="func-editor-workspace-secondary">
        <section className="generation-console func-editor-panel-skeleton">
          <Spin /> 正在加载会话
        </section>
      </div>
    </>
  )
) : isPreviewStep ? (
  <div className="func-editor-workspace-primary">
    {renderPlanningWorkspace(functionItem)}
  </div>
) : (
  <>
    <div className="func-editor-workspace-primary">...
    <div className="func-editor-workspace-secondary">...
  </>
)}
```

### 3. 统一加载骨架屏

#### `renderEditorLoadingWorkspace` 重构

**修改前**：
- 预览步骤：完整的预览面板结构
- 其他步骤：简单的居中 loading

**修改后**：
- 所有步骤：统一的 `func-planning-workspace` 结构
- 包含页头、流程管线、内容区域
- 内容区域显示骨架屏

```tsx
function renderEditorLoadingWorkspace(step: EditorStep) {
  const stepConfig = EDITOR_STEPS.find((s) => s.id === step)
  
  return (
    <section className="func-planning-workspace">
      <header className="func-planning-header">
        <strong>{stepConfig?.label}</strong>
        <p>{stepConfig?.hint}</p>
      </header>
      <div className="func-workflow-pipeline" />
      <div className="func-planning-stage">
        <div className="func-editor-panel-skeleton">
          <Spin /> 正在加载{stepConfig?.label}...
        </div>
      </div>
    </section>
  )
}
```

### 4. CSS 优化

#### 骨架屏样式
```css
.console-app .func-editor-panel-skeleton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 300px;
  border: 1px solid var(--console-line-soft);
  border-radius: 12px;
  background: var(--console-surface);
}

.console-app .func-planning-stage .func-editor-panel-skeleton {
  flex: 1;
  min-height: 0;
}
```

#### 预览模式特殊处理
```css
/* 预览模式下隐藏页头和流程管线 */
.console-app .func-editor-content-area.is-preview-mode .func-planning-header {
  display: none !important;
}

.console-app .func-editor-content-area.is-preview-mode .func-workflow-pipeline {
  display: none !important;
}

/* 预览模式下的骨架屏也要全屏 */
.console-app .func-editor-content-area.is-preview-mode .func-editor-panel-skeleton {
  border: none;
  border-radius: 0;
  min-height: 100%;
}
```

#### 移除废弃样式
```css
/* 移除 */
.console-app .func-editor-content-loading {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
```

## 效果对比

### 修复前
```
加载中：       [居中的 Loading]
             ↓ (布局跳动)
加载后：  [左侧内容 | 右侧对话框]
```

### 修复后
```
加载中：  [左侧骨架屏 | 右侧骨架屏]
             ↓ (平滑过渡)
加载后：  [左侧内容   | 右侧对话框]
```

### 预览模式
```
加载中：  [全屏骨架屏]
             ↓ (平滑过渡)
加载后：  [全屏预览画布]
```

## 核心原则

1. **结构一致性**：加载状态和实际内容使用相同的布局结构
2. **视觉连续性**：骨架屏的位置、大小与实际内容匹配
3. **条件渲染**：通过 CSS 隐藏而非完全不渲染（预览模式的对话框）
4. **无布局重排**：从加载到完成，Grid 列的宽度保持不变

## 测试要点

1. ✅ 流程切换时无布局跳动
2. ✅ 加载状态的骨架屏与实际内容位置一致
3. ✅ 预览模式下对话框完全不可见
4. ✅ 普通模式下左右两栏比例固定（45:55）
5. ✅ 所有流程的页头、流程管线保持一致
6. ✅ 预览模式下页头和流程管线被隐藏

## 性能考虑

- 使用 CSS `display: none` 隐藏对话框，避免组件挂载/卸载
- Grid 布局硬件加速，过渡流畅
- 骨架屏轻量级，渲染开销小
