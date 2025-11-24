# Changelog

## 2025-11-21
- 日/周/月聚合关系落盘：`relations.json` 结构改为 `weekBuckets` / `monthBuckets`（含 day map 与 total），同步生成 `relations-week.json`、`relations-month.json`，日记增删改直接更新，无需全量扫描。
- 导出流程会先加载 relations 以确保周/月聚合写入到压缩包中。
- 周/月视图默认读取预计算聚合数据（缺省时回退至内存分组），并沿用现有导航与跳转。

## 2025-11-19
- 修复 vision canvas 自动创建 demo 数据的问题
  - 修复 `createSheet` 中 `slugifyName` 未定义的错误，改为使用 `titleToSlug`
  - 移除自动创建包含"品质精神"的 demo bubbles
  - 移除自动下载默认背景图片的逻辑
  - 添加蚂蚁线边框占位符，当没有背景时显示虚线边框和提示文字
  - 移除 CanvasDemo 组件 fallback 到预设数据的逻辑
- 优化和修复 vision canvas 代码逻辑
  - 修复 API 路由中背景数组为空时的配置保存问题
  - 优化边界情况处理：安全处理 `currentBackgroundIndex` 超出范围的情况
  - 优化导入逻辑：当所有选中的 bubbles 都被过滤时给用户提示
  - 改进错误处理和边界条件检查

## 2025-11-18
- 把日记改为 Markdown 文件、表格改为 CSV + `relations.json`，Next.js API 负责读写本地内容。
- `/diary` 提供 Markdown 表单、附件预览、弹窗放大；支持图片/视频/音频引用。
- `/sheets` 直接编辑 CSV（新增/删除行、关联日记 ID），K 线更紧凑并匹配 TradingView 间距。
- `/trends` 点击蜡烛即可展开当天关联日记，表格引用关系由 `relations.json` 维护。
- 新增 `content/` 样例数据、`fileStore` 工具、README/Settings 说明同步更新。
- 设置页支持根目录切换（或恢复 Demo），底层通过 `krecord.config.json` 管理，结构限定为 `dailyReport` / `table` / `relations.json` / `assets`。
- 日记表单新增母子层级（`parentId`）、文件选择按钮与附件/封面预览；上传文件落在 `assets/` 并通过 `/api/uploads` + `/api/assets/*` 提供服务。
## 2025-11-17
- 前端页面拆分为 `/diary` / `/sheets` / `/trends` / `/settings`，加入主题切换。
- `/sheets` 支持本地多维表格编辑，并实时推导对应 K 线；趋势页可多选 Sheet 比较。
- TradingView 样式 K 线（ECharts）升级，新增 `TradingKLine` 组件。
- 日记页可直接写入事件（POST `/api/v1/events`），无后端时降级为本地 mock。
- README 更新当前能力描述。

## 2025-11-16
- 初始化 Monorepo（Next.js + Go Fiber）。
- 新增日记/表格/趋势占位页面与 K 线预览组件。
- 提供本地数据服务（LDS）示例 API：事件与指标。
- 文档：补充 README、Taskfile，巩固 PRD/Dev Plan 约定。
