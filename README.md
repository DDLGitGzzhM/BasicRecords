# K-Record Monorepo

基于 Next.js + Go Fiber 的离线优先日常记录应用。事件、指标与 K 线趋势紧密联动，并为未来桌面/移动端同步做好铺垫。

> 产品与研发上下文见 `agent/prd.md`、`agent/dev_plan.md`，技术方案在 `tech_design/README.md`。

## 仓库结构
```
├─ app/           # Next.js 14（App Router）前端，拆分日记/表格/趋势/设置页面
├─ backend/       # Go Fiber 本地数据服务（LDS）示例，内置内存存储
├─ content-demo/  # 示例数据根目录（package: dailyReport / table / relations.json / assets）
├─ docs/          # 变更记录、API/Schema 输出目录
├─ scripts/       # 自动化脚本（setup、CI hook 预留）
├─ tech_design/   # 架构文档（已给定）
└─ Taskfile.yml   # 统一任务入口
```

## 快速开始
1. 安装依赖：`./scripts/setup.sh`（需要 Go 1.22+ 与 pnpm）。
2. 一键启动前后端（推荐）：
   ```bash
   task dev:all
   # 或 ./scripts/dev.sh
   ```
   若需单独运行，可使用 `pnpm --filter @basicrecords/web dev` 与 `task backend:dev`。
3. 浏览 `http://localhost:3000`，默认跳转 `/diary`。左侧竖向导航可在「日记 / 表格 / 趋势 / 设置」之间切换，并内置黑/白主题；数据根目录默认指向 `content-demo`（可在设置页或 `task demo:reset` 恢复），自动加载 Hugo 风格的 Markdown 日记、`table/*.csv` 指标与 `relations` 关系包。

## 数据根目录结构
- 根目录通过 `krecord.config.json`（或设置页内的目录选择器）指定，默认值为 `./content-demo`。
- 目录规范：
  ```
  <data-root>/
    ├─ content/
    │   └─ <year>/<yyyymm>/<yyyymmdd>/[#children]/0xNN-<title>.md   # Markdown 日记，母/子日记按日期分目录
    │       ├─ imgs/ | video/ | files/                             # 同日媒体，正文/封面/附件均引用相对路径
    ├─ table/*.csv       # 指标数据
    └─ relations/
        ├─ relations.json    # Sheet 行 ↔ 日记的关系映射
        └─ meta.json         # Sheet 元信息
  ```
  - 日记文件名以 `0xNN-<title>` 形式生成，标题中的特殊符号以 `_` 代替，避免重名；上传接口会根据发生时间写入对应日期目录。
  - 附件/封面/正文内嵌媒体统一落在当日的 `imgs/` / `video/` / `files/`，导出 ZIP 时保持该结构。
- 如果用户尚未指定自定义路径，则自动使用项目内的 Demo 数据；切换路径后刷新页面即可重新载入。执行 `task demo:reset`（或 `./scripts/reset-demo.sh`）也能快速写回默认路径。

## 配置
- `LDS_ADDR`：后端监听地址（默认 `:8080`）。
- `NEXT_PUBLIC_API_BASE_URL`：前端访问本地数据服务的地址，例如 `http://localhost:8080`。

- **Markdown 日记**：`package: dailyReport/*.md` 记录正文 + Frontmatter（标题、情绪、附件、发生时间、`parentId`）。前端提供富表单弹窗（Markdown 编辑区 + 图片/封面上传按钮）、母子日记树和附件预览，并支持列表/周/月三种视图（周/日历缩略仅展示母日记标题且可跳转详情）。
- **CSV 表格**：`package: table/*.csv` + `relations.json` 构成多维表格，可在 `/sheets` 通过弹窗新增/删除/编辑行、关联日记 ID，系统自动反写 CSV 与关系文件，并实时生成 TradingView 风格的紧凑 K 线。
- **趋势洞察**：`/trends` 支持多 Sheet 勾选，点击任意蜡烛即可展开当天关联的 Markdown 日记（含母子关系）。
- **根目录管理**：设置页支持通过系统文件选择器或目录浏览器切换任意根目录，也可以一键加载 Demo 数据；根路径变更后页面自动重新加载。
- **附件服务**：上传的图片/视频/音频会落在 `assets/`，通过 `/api/uploads` 写入、本地 `/api/assets/*` 读取，避免手动输入路径。
- **数据获取**：Next.js API 直接读写上述文件结构；Go Fiber LDS 仍保留事件示例 API 以便未来扩展。
- **本地数据服务**：Fiber + CORS + Logger，中提供：
  - `GET /api/v1/events`：获取最近事件；
  - `POST /api/v1/events`：创建事件（保存在内存）;
  - `GET /api/v1/metrics/daily`：示例 OHLC 指标数据；
  - `GET /healthz`：健康检查。
- **开发工具链**：Turborepo + pnpm workspace、Taskfile、Go modules、TailwindCSS。

## 下一步建议
1. 将 Markdown/CSV 写入逻辑统一由 LDS 或 Server Action 托管，引入版本/冲突控制；
2. 接入 SQLite（GORM/sqlc）并保留 CSV 导出，实现 manifest + 媒体目录扫描；
3. 在趋势页完善热点批注、模板保存，并打通与日记抽屉的编辑闭环；
4. 编写端到端测试（Playwright）与后端单元测试，纳入 CI；补充文件访问权限与备份脚本。
