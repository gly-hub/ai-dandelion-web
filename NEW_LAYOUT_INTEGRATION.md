# 新编辑器布局组件集成指南

## 概述

我创建了一个全新的 `FuncEditorLayout` 组件，采用清晰的左右两栏结构，避免了原有代码的复杂性。

## 文件清单

1. **`FuncEditorLayout.tsx`** - 新的布局组件
2. **`FuncEditorLayout.css`** - 配套的样式文件

## 核心设计

### 布局结构

```
┌─────────────┬──────────────────────────────────┐
│             │  普通模式（产品/技术/代码）        │
│   流程栏    │  ┌──────────┬─────────────────┐  │
│   (240px)   │  │  内容区  │   对话框区域    │  │
│             │  │  (45%)   │     (55%)       │  │
│  1. 产品    │  └──────────┴─────────────────┘  │
│  2. 技术    │                                  │
│  3. 代码    │  预览模式                         │
│  4. 预览    │  ┌──────────────────────────┐    │
│             │  │    全屏预览画布           │    │
│             │  └──────────────────────────┘    │
└─────────────┴──────────────────────────────────┘
```

### 关键特性

✅ **固定左右布局**：流程栏始终在左侧 240px
✅ **条件渲染内容**：根据步骤显示不同内容
✅ **预览模式全屏**：预览时对话框不渲染
✅ **统一加载状态**：加载时保持相同的布局结构
✅ **无布局闪烁**：从加载到完成平滑过渡

## 集成步骤

### 步骤 1：在 `FuncOperationWorkspace.tsx` 中导入

```tsx
import { FuncEditorLayout } from './FuncEditorLayout'
import './FuncEditorLayout.css'
```

### 步骤 2：替换 `renderAdminEditor` 函数

找到现有的 `renderAdminEditor` 函数，替换为：

```tsx
function renderAdminEditor(functionItem: OperationFunction | null) {
  return (
    <FuncEditorLayout
      functionItem={functionItem}
      currentStep={resolvedEditorStep}
      conversation={resolvedEditorConversation}
      directoryMenus={directoryMenus}
      openedGenerationIds={openedGenerationIds}
      messages={messages}
      isRequesting={isRequesting}
      isDefaultMessagesRequesting={isDefaultMessagesRequesting}
      activeSessionId={activeSessionId}
      conversationOutboundPending={conversationOutboundPending}
      conversationNotice={activeConversationNotice}
      generationLaunchingIds={generationLaunchingIds}
      modelOptions={modelOptions}
      selectedModelId={selectedModelId}
      canAdminEdit={canAdminEdit}
      canAdminPublish={canAdminPublish}
      canAdminUnpublish={canAdminUnpublish}
      canAdminDelete={canAdminDelete}
      statusUpdatingId={statusUpdatingId}
      deletingId={deletingId}
      onStepChange={selectEditorStep}
      onLeaveEditor={leaveEditor}
      onStatusChange={(status) => functionItem && handleStatusChange(functionItem, status)}
      onDelete={() => functionItem && handleDelete(functionItem.id)}
      onSaveMenuParent={(value) => functionItem && saveFunctionPatch(functionItem, { menuParentId: value })}
      onConversationRequest={handleConversationRequest}
      onAbort={abort}
      onNoticeAction={conversationNotice?.actionLabel ? handleNoticeAction : undefined}
      onModelChange={(modelId) => {
        setSelectedModelId(modelId)
        setSelectedAgentModelId(modelId)
      }}
      renderContent={() => renderPlanningWorkspace(functionItem!)}
    />
  )
}
```

### 步骤 3：保持现有的内容渲染函数

保留以下函数不变（新组件通过 `renderContent` prop 调用它们）：
- `renderPlanningWorkspace`
- `renderDocumentPanel`
- `renderCodePanel`
- `renderPlanningPreviewPanel`
- 以及所有其他渲染函数

## 工作原理

### 1. 布局层

`FuncEditorLayout` 组件负责：
- 左侧流程栏的渲染
- 右侧区域的网格布局（单列或双列）
- 加载状态的骨架屏
- 预览模式的条件渲染

### 2. 内容层

通过 `renderContent()` prop 传入的函数负责：
- 具体步骤的内容渲染
- 文档面板、代码面板、预览面板等

### 3. 分离关注点

```
FuncEditorLayout (布局)
  ├── 左侧：流程栏 + 元信息 + 操作按钮
  └── 右侧：
      ├── 内容区：renderContent() 提供
      └── 对话框：FunctionGenerationConsole
```

## CSS 变量

使用现有的 console 主题变量：
- `--console-bg`
- `--console-neutral-50`
- `--console-line`
- `--console-text`
- `--console-muted`
- `--console-brand-surface`
- `--console-brand-ink`
- `--console-success`
- `--console-warning-500`
- 等等

## 优势对比

### 旧方案的问题
- ❌ 多层嵌套的条件渲染
- ❌ 加载状态和实际内容结构不一致
- ❌ CSS 类名混乱（layout、layout-new、content-shell、content-area）
- ❌ 难以维护和调试

### 新方案的优势
- ✅ 清晰的组件边界
- ✅ 统一的布局结构
- ✅ 简洁的 CSS 类名
- ✅ 易于理解和维护
- ✅ 加载状态与实际内容结构一致

## 测试检查点

### 流程切换
- [ ] 产品方案 → 技术方案：平滑切换，无闪烁
- [ ] 技术方案 → 代码生成：平滑切换，无闪烁
- [ ] 代码生成 → 预览确认：对话框消失，预览全屏
- [ ] 预览确认 → 代码生成：对话框重现，恢复双列

### 加载状态
- [ ] 切换到任何步骤时，加载骨架屏位置正确
- [ ] 加载完成后，内容平滑出现在相同位置
- [ ] 预览模式加载时，不显示对话框骨架屏

### 响应式
- [ ] 调整窗口大小，布局正确缩放
- [ ] 流程栏固定 240px 不变
- [ ] 内容区域自适应

### 功能完整性
- [ ] 所有按钮功能正常
- [ ] 流程步骤可点击切换
- [ ] 状态标签正确显示
- [ ] 表单输入正常工作

## 回退方案

如果新组件有问题，可以快速回退：

1. 删除或注释 `import { FuncEditorLayout }` 行
2. 恢复原来的 `renderAdminEditor` 函数
3. 原有代码保持不变，可立即回退

## 下一步

1. **集成测试**：按照上述步骤集成到现有代码
2. **视觉测试**：测试所有流程切换场景
3. **功能测试**：确保所有交互正常
4. **性能测试**：检查是否有性能问题
5. **清理代码**：集成成功后，可以移除旧的 CSS 类和代码

## 注意事项

⚠️ **不要删除旧代码**：在确认新组件完全正常之前，保留旧代码作为备份

⚠️ **CSS 冲突**：新 CSS 使用 `func-editor-new-*` 前缀，避免与旧样式冲突

⚠️ **TypeScript 错误**：集成时可能需要调整类型定义，根据实际情况修改

⚠️ **渐进式迁移**：可以先在测试环境验证，确认无误后再部署到生产
