# K-Record 开发计划（Dev Plan）

> *PRD：`agent/prd.md`；技术架构细节：`tech_design/README.md`。agent 目录仅保留沟通/任务文档。*

## 0. 文档约定
- 所有工程产物采用 Monorepo（根目录）管理；`agent/` 写入到 `.gitignore`，仅作临时指令库。
- 详细的架构、框架、技术选型统一维护在 `tech_design/README.md`，本文件聚焦执行计划与研发流程。
- 语言：后端 Go（Go 1.22），前端栈详见技术包，文档默认中文。

## 1. 目标综述（来自 PRD）
1. 单客户端即可完成事件记录、指标维护、K 线洞察，数据完全掌控，后续可平滑拓展桌面/移动端。
2. 事件与指标全部链接，支持素材引用路径、情绪、标签、自定义表头、组合模板。
3. 保持备份/迁移、插件接口能力，为未来云同步和第三方数据输入打基础。

## 2. 系统架构概览
| 层级 | 说明 | 关键技术（简） |
| --- | --- | --- |
| UI 层 | 浏览器/桌面端（Next.js + React 18 + Zustand/TanStack Query + ECharts） | TipTap 富文本、File System Access API、Tauri 外壳 |
| 本地数据服务（LDS） | Go Fiber API + SQLite + manifest 引擎，负责事件/指标 CRUD、备份导出 | GORM/sqlc、GraphQL、Litestream、OpenTelemetry |
| 同步/插件层 | 可选部署的 Go 服务 + PostgreSQL + NATS，面向未来桌面/移动同步与第三方数据注入 | Temporal、gRPC 插件接口、MinIO 备份 |

> 详细架构图、数据模型、CI/CD 方案参见 `tech_design/README.md`。

## 3. 参考项目结构
```
├─ app/                # Next.js 前端
├─ backend/            # Go 本地数据服务（REST + GraphQL）
├─ sync/               # 可选同步/插件守护（M3 以后打开）
├─ scripts/            # 自动化脚本（lint、ci、scaffold）
├─ docs/               # Changelog、API schema 导出
├─ tech_design/        # 架构与流程说明（新包，受控文档）
└─ agent/              # 沟通/指令（已被 gitignore）
```

## 4. 技术与基础设施关键点
- **后端语言选型**：Go 1.22；理由：跨平台编译方便、性能高、生态成熟，适配 Tauri/Electron 调用。
- **数据层**：SQLite（SQLCipher 可选）+ IndexedDB 组合；Litestream 做持续备份，FTS5 支持全文索引。
- **图表与交互**：ECharts（K 线）、D3（情绪河流）、React Aria（可访问性）。
- **中间件**：NATS（插件事件）、Temporal（备份/同步工作流）、MinIO（备份包）、Grafana/Loki（日志）。
- **工具链**：pnpm + Turborepo（前端）、Taskfile/Makefile + Mage（Go）、GitHub Actions（CI）、Conventional Commits。

## 5. 研发流程
1. **需求 → 方案**：PRD 立项后，在 `tech_design/README.md` 更新架构/变更；评审通过后开 issue/任务卡。
2. **分支策略**：Trunk-based，命名 `feature/<scope>`；每次提交需通过 lint/test（CI 门禁）。
3. **代码规范**：Go 使用 `golangci-lint`、前端 ESLint + Biome；提交信息符合 Conventional Commits。
4. **评审机制**：至少 1 名守护人 Review；关键模块需附变更文档+测试证据。
5. **文档**：公共决策写入 `docs/changelog.md`；接口自动导出 OpenAPI/GraphQL schema。

## 6. 里程碑 & 任务拆解
| 阶段 | 时间 | 关键交付 | 关注点 |
| --- | --- | --- | --- |
| M0（Week1） | 环境搭建 | Monorepo 初始化、CI 骨架、LDS 与 Next.js Hello、K 线 PoC | 完成本地文件访问 PoC、确认 SQLite schema |
| M1（Week2-6） | MVP | 事件/指标 CRUD、Sheet 模型、K 线初版、manifest 生成、备份导出 API | 保证离线可用、引入 Litestream、Playwright MVP |
| M2（Week7-10） | 体验强化 | K 线热点 & 事件抽屉、模版库、批量导入导出、Service Worker 备份、设置页 | 性能优化（虚拟列表、批量写入）、FTS 搜索 |
| M3（Week11-14） | 扩展准备 | 插件接口、同步守护 PoC、桌面端打包验证 | gRPC Schema 固化、Temporal 工作流 PoC |

每个阶段结束需输出：Demo（屏幕录制/包）、测试报告、技术文档更新。

## 7. 可交付清单（每次迭代）
- **产品/设计**：更新 PRD、低保真原型（`agent/*.html` 可选）。
- **技术**：`tech_design/README.md` 更新、API Schema、性能基线。
- **测试**：自动化覆盖率、端到端脚本 + 关键场景验证记录。
- **运维**：备份脚本、日志/监控配置、打包脚本（Tauri）。

## 8. 风险与对策
- **本地文件权限**：浏览器环境需用户授权；通过引导 + 缓存最近目录，并预留桌面客户端策略。
- **多数据源同步**：先实现 manifest + checksum 机制；M3 引入 Temporal，控制增量同步。
- **性能**：Sheet/事件数据量大时需虚拟滚动 + Worker 线程。Go 侧提供批量写入 API。
- **插件安全**：gRPC 接口增加 Scope 校验、限速、沙箱配置；所有插件在独立进程运行。

## 9. 新成员入场手册（精简版）
1. 阅读 `README.md` 与 `tech_design/README.md`，完成环境准备脚本 `scripts/setup.(sh|ps1)`。
2. 运行 `task dev`（或 `pnpm dev` + `task backend:dev`）启动前后端；确保 `.env.example` 配置本地路径。
3. 执行 `task test:all` 验证工具链；提交前执行 `task lint`.
4. 了解 issue/任务看板（Linear/Jira），按优先级领取并更新状态。

---
本计划文档随需求与技术演进更新，所有架构细节以 `tech_design/README.md` 为准。欢迎在 PR 描述中引用对应 section 以便追踪。
