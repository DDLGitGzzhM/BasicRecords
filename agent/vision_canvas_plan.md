# 视觉标签画布页方案

## 0. 目标与价值
- 在一张自选背景图上布置可视化标签球，用于呈现情绪、价值观、项目地图等概念。
- 支持关键词展示、关联日记、拖拽排布；保证位置在不同分辨率下稳定（百分比定位）。

## 1. 数据模型
```ts
Bubble {
  id: string
  label: string          // 球上显示的短词，建议 2-8 字
  content?: string       // 点击后的简介/描述
  diaryId?: string       // 关联日记条目 ID
  x: number              // 0-1，画布宽度百分比
  y: number              // 0-1，画布高度百分比
  color?: string
  size?: number          // px 半径/直径，或映射为字号
  shape?: "circle" | "pill"
  borderStyle?: "none" | "solid" | "glow"
  zIndex?: number
  locked?: boolean
}
Canvas {
  id: string
  title?: string
  backgroundUrl: string  // 图片引用路径，不上传云
  bubbles: Bubble[]
  createdAt: number
  updatedAt: number
}
```

## 2. 页面与组件
- 布局：左/中部画布（背景图 + 绝对定位小球），右侧列表+属性面板，顶部工具栏（上传/更换图片、保存/撤销/重做）。
- 组件拆分：
  - `CanvasView`：背景渲染、位置换算（像素↔百分比）。
  - `BubbleItem`：单个球，选中态、拖拽、hover。
  - `Inspector`：文字/颜色/大小/形状/锁定/关联日记编辑。
  - `BubbleList`：列表管理、搜索、批量删除（后续）。
  - `Toolbar`：图片上传、保存、撤销/重做（可选）。
  - `BubblePopover`：点击球后的详情与“查看日记”入口（调用 `DiaryModal` 或路由）。

## 3. 关键交互
- 添加：按钮/快捷键创建默认球并选中。
- 移动：拖拽或方向键微调；锁定后禁用拖拽；支持 zIndex 调整（置顶/置底）。
- 选中：点击球或列表项，同步高亮。
- 编辑：右侧面板实时更新 label/颜色/大小/形状/描边/关联日记；删除按钮。
- 详情：点击球弹出气泡/侧栏，显示 `content`，提供“查看关联日记”入口。
- 保存：拖拽结束即写入 `x/y`；显式“保存布局”按钮调用 API；`x/y` 始终以百分比存储，确保自适应。

## 4. 状态与持久化
- 前端：React state 管理当前画布与撤销/重做栈（history 数组）。
- 持久化：通过 Next.js API 路由 `/api/vision` 持久化到本地文件系统。
- 数据存储：
  - `relations/vision-config.json`：存储背景列表、当前背景索引、每个背景对应的小球数据
  - `relations/vision-links.json`：存储小球与日记 ID 的关联关系
  - `vision/image/`：存储用户上传的背景图片
- 接口：
  - `GET /api/vision`：获取当前背景的小球数据
  - `GET /api/vision?index=N`：获取指定索引背景的小球数据
  - `GET /api/vision?all=true`：获取所有背景的小球数据（用于导入功能）
  - `POST /api/vision`：保存小球数据、背景列表和当前索引
  - `POST /api/vision/background`：上传背景图片
- 背景图：存储在本地 `vision/image/` 目录，通过相对路径引用。
- 初始化行为：不自动创建 demo 数据，不自动下载背景图片，显示占位符提示用户手动添加。

## 5. 技术实现要点
- 拖拽：使用 `pointerdown/move/up` 或 `react-use-gesture`；在 `pointermove` 将像素转百分比 `x = (clientX - rect.left)/rect.width`，限制 0-1。
- 尺寸自适应：画布容器保持固定比例（如 16:9）；窗口缩放后球位置保持。
- 无障碍：键盘移动/删除、焦点环、ARIA label。
- 性能：几十级节点以内无需虚拟化；可选轻微漂浮动画（CSS keyframes）。

## 6. 里程碑 (建议)
1) MVP：上传/切换背景图；添加/删除/选中球；拖拽保存百分比位置；右侧编辑 label/颜色/大小/锁定；关联日记下拉；点击球弹出详情；保存/加载接口对接。
2) 体验：撤销/重做、键盘微调、zIndex 控制、选中态描边/发光、溢出省略号、提示浮层。
3) 进阶：批量操作、分组/多选、导出截图（html2canvas）、模板库。

## 7. 风格指引
- 沿用日记 UI 色板、圆角、阴影；选中态描边/发光。
- 文本建议 6-8 字，溢出省略号；形状支持圆/胶囊；描边可选细线或柔光。

## 8. 风险与对策
- 响应式错位：统一使用百分比坐标并固定画布比例，避免基于原图分辨率。✅ 已实现
- 媒体路径：明确提示背景图仅存引用，需用户保证本地可访问。✅ 已实现，背景图存储在本地
- 撤销频繁：用 reducer 管理 past/future，限制栈深度避免内存增大。✅ 已实现，使用 history 数组
- 数据一致性：确保 API 路由和文件存储逻辑一致，避免数据不同步。✅ 已修复
- 边界情况：处理背景数组为空、索引超出范围等情况。✅ 已优化

## 9. 实现细节（2025-11-19 更新）
- 数据模型已实现：Bubble 包含 id, label, content, diaryIds, x, y, color, size
- 支持多背景切换，每个背景有独立的小球列表
- 导入功能：可以从其他背景导入小球，但只导入有内容的（content 不为空）
- 占位符：当没有背景时，显示蚂蚁线边框和提示文字
- 错误处理：完善的边界情况检查和错误提示
