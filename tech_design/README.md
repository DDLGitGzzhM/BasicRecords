# K-Record 技术方案

## 1. 总体架构
- **多层架构**：浏览器/桌面前端（React + Next.js） → 本地数据服务（Go Fiber API + SQLite/IndexedDB 双存储） → 可选云同步节点（Go + PostgreSQL + S3 兼容对象存储）。
- **数据流**：事件记录与指标由前端写入本地 SQLite，经 Service Worker 同步至 IndexedDB 做离线缓存；备份/导出时由 Go 服务打包 manifest 与媒体引用。
- **接口协议**：REST + GraphQL，REST 面向高频 CRUD，GraphQL 面向多端复用与聚合查询；插件接口使用 gRPC/Protobuf 限制数据模型并提供版本控制。

## 2. 模块拆解
1. **Web/桌面客户端**
   - Next.js 14（App Router）+ React 18 + TypeScript。
   - 状态层：Zustand 管事件状态，TanStack Query 管远程/本地数据请求缓存。
   - 富文本编辑器：TipTap + 自定义节点（媒体引用、情绪、标签）。
   - 可视化：ECharts（K 线、热力图）、D3（情绪河流）。
   - 文件访问：浏览器 File System Access API；桌面端采用 Tauri 绑定调用本地 Go API。
2. **本地数据服务（LDS）**
   - Go 1.22 + Fiber + GORM（SQLite driver），暴露 REST/GraphQL。
   - 嵌入 SQLite + Litestream 做实时备份；SQLite 触发器保证 Sheet ↔ 指标表关联。
   - 任务调度：Go cron + BullMQ（当 Electron/Tauri 引入 Node 侧任务时）。
   - Manifest & 索引：Go routine 扫描媒体路径并写入 manifest.json，供备份与迁移。
3. **同步/可扩展层**
   - 同步守护：Go + Temporal 工作流，管理增量上传（可选部署）。
   - 插件总线：gRPC 服务，第三方外设/银行流水通过 OAuth2 + Webhook 注入数据。
4. **备份/导出**
   - Service Worker 拉取 SQLite + manifest + 资源引用，生成 `.krecord` 包。
   - Tauri/Electron 端可调用 Go 服务写入本地 tar.gz/zip。

## 3. 数据与存储设计
### 3.1 个人主页与置顶数据
- 个人主页（/profile）复用 relations 的 `relations-week.json`/`relations-month.json` 直接读取年度活跃热力图数据，避免全量扫描日记。
- 置顶文章配置写入 `relations/profile.json`（主配置）与 `relations/profile-pins.json`（备份/导出时可用），两者结构均为 `{ "pinnedDiaryIds": string[] }`，日记增删时依旧由既有桶写入逻辑维护聚合文件。

- **核心表**：
  - `events`: uuid, title, content, mood, tags, media_refs, sheet_refs。
  - `metrics`: uuid, sheet_id, metric_type, value_open/high/low/close, attachments。
  - `sheets`: 自定义字段配置（JSON Schema）、模版引用。
  - `media_manifest`: path, checksum, type, tags, linked_event.
- **索引策略**：json_extract + GIN（SQLite FTS5）用于全文检索；Sheet 维度使用虚拟表加速按天聚合。
- **加密**：SQLCipher（可选）+ manifest 路径加盐哈希；本地密钥托管在 OS Keychain。

## 4. 中间件与基础设施
- **数据库**：本地 SQLite，云端 PostgreSQL 作为未来同步中心；Prisma schema 生成多端客户端。
- **消息队列**：NATS JetStream（轻量、易嵌入）管理插件/同步任务事件。
- **对象存储**：MinIO/S3 兼容，用于同步包与备份（不含媒体数据本体，只存引用 manifest）。
- **Observability**：OpenTelemetry（OTLP）+ Grafana Agent 采集 Go/前端指令；前端使用 Sentry 记录用户态错误（本地写入日志文件，再决定是否上传）。

## 5. 安全与权限
- 本地数据默认离线，仅在用户授权时生成 API Token。
- 插件接口需要 Scope + manifest 声明，Go 服务会对外设输入做 schema 校验并写入审计日志。
- 桌面端通过 Tauri sandbox + macOS Notarization 保障系统级权限申请透明。

## 6. 开发与交付流程
1. **Git 策略**：Trunk-based + 短期 feature 分支；主分支开启 Commitlint + Conventional Commits。
2. **CI/CD**：GitHub Actions（lint/test/build）→ 可选 release pipeline 打包 Tauri app。
3. **质量保障**：
   - 前端：Playwright 端到端 + Storybook 交互测试。
   - 后端：Go test + sqlc/gqlgen 自动生成代码 + Testcontainers（SQLite/Postgres）。
4. **文档化**：OpenAPI + GraphQL schema 自动导出，tech_design 维护架构与流程；开发日志写入 `docs/changelog.md`。

## 7. 里程碑映射
- **M0**：完成 LDS skeleton、Next.js Shell、技术验证（K 线渲染、文件访问）。
- **M1**：落地事件记录与指标表 CRUD，接入 manifest 生成。
- **M2**：K 线交互、组合模板、备份/导出。
- **M3**：插件接口 + 同步守护 PoC + 桌面端可行性验证。

---
此 README 为所有技术与框架细节的唯一归档，agent 目录仅保留交互指令、执行记录与沟通产物。
