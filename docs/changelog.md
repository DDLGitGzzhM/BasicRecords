# Changelog

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
