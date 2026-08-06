# 我的修仙日记

《我的修仙日记》是一款使用 Cocos Creator 3.8.8 开发的竖屏修仙放置小游戏。当前 `0.11.0` 开发基线处于第一阶段核心循环收尾期，已经接通本地客户端、Fastify 服务端、PostgreSQL 持久化和 Redis 健康检查，发布目标为微信小游戏。

完整玩法、数值、接口和验收基线见 [游戏设计与技术规范](docs/game-design-and-technical-spec.md)。

## 当前能力

- 开发账号登录、微信登录适配边界、JWT 和刷新令牌轮换
- 个人档案、首次主角形象二选一、一次免费改名及改名卡消费
- 在线/离线修炼结算、自动升级、境界瓶颈和手动突破
- 挂机掉落、背包扩容、收获箱收取/分解和小经验丹使用
- 四类功法槽和六类法宝槽的装备、替换、卸下及权威战力重算
- Cocos 修炼主页、个人档案、固定四 Tab、离线收益弹窗和第一阶段占位页面
- 服务端事件驱动的升级、突破和战力变化表现；动画可合并、排队、结束并在切后台/切页时中断
- 正式 30 秒 heartbeat、身份与版本绑定的 v3 权威快照缓存、断网冷启动只读预览及 Cocos 前后台自动同步
- 当前会话断网/重连状态提示、最近同步时间、经济操作只读保护及联网自动恢复
- 离线功法/法宝装备操作的本地乐观队列、发送前落盘、重连顺序回放及冲突明确回滚；`reconnecting` 期间保持操作冻结
- PostgreSQL 事务、幂等键、玩家版本冲突保护和资产流水
- 仅开发构建可见的诊断面板：显示同步、生命周期、队列和修炼快照，可通过真实服务端结算模拟离线 1/8/24 小时，并可固定修满当前经验条、增加 10000 灵石或增加 1 枚突破丹

伴侣、洞府、真实排行榜、深度装备养成、副本、商业化和正式部署尚未进入完整实现。

当前第一阶段收尾顺序为：完成微信开发者工具和真机验收；网络故障模拟、固定随机种子和测试账号清理等其余开发调试控制随后开发。

## 工程结构

```text
assets/       Cocos Creator 场景和客户端 TypeScript
server/       Node.js、Fastify、PostgreSQL 服务端
shared/       客户端与服务端共享的协议、配置和领域纯函数
docs/         游戏设计、技术规范和验收状态
settings/     Cocos Creator 项目设置
```

## 环境要求

- Node.js `22.x`
- pnpm `11.15.0`
- Docker Desktop 或兼容的 Docker Compose 环境
- Cocos Creator `3.8.8`

## 本地启动

安装依赖：

```bash
pnpm install
```

启动 PostgreSQL 17 和 Redis 7.4：

```bash
docker compose up -d
docker compose ps
```

创建服务端本地配置并执行迁移：

```bash
cp server/.env.example server/.env
pnpm db:migrate
```

启动 API 服务：

```bash
pnpm dev:server
```

默认监听 `http://127.0.0.1:3000`。可用以下地址检查状态：

```text
GET http://127.0.0.1:3000/health/live
GET http://127.0.0.1:3000/health/ready
GET http://127.0.0.1:3000/openapi.json
```

在 Cocos Creator 3.8.8 中打开仓库根目录，选择 `assets/scene.scene`，使用浏览器预览即可通过开发账号自动登录。客户端当前默认连接本机 `3000` 端口。

## 验证命令

```bash
# 共享包、客户端和服务端类型检查
pnpm typecheck

# 共享包与服务端单元测试
pnpm test

# PostgreSQL 集成测试，需要本地 PostgreSQL 和 Redis 已启动
pnpm test:integration

# 构建共享包和服务端
pnpm build:server

# 生产依赖安全审计
pnpm audit --prod --registry=https://registry.npmjs.org
```

集成测试使用独立测试数据库，不应将 `TEST_DATABASE_URL` 指向开发或生产数据。

当前自动化基线为共享领域 29 项、服务端及客户端单元 110 项、PostgreSQL 集成 26 项，共 165 项。

## 常用脚本

| 命令 | 用途 |
|---|---|
| `pnpm dev:server` | 监听模式启动本地 API |
| `pnpm start:server` | 构建并运行服务端产物 |
| `pnpm typecheck:client` | 单独检查 Cocos 客户端类型 |
| `pnpm db:generate` | 根据 Drizzle schema 生成迁移 |
| `pnpm db:migrate` | 执行数据库迁移 |

## 环境变量

服务端变量模板位于 [`server/.env.example`](server/.env.example)。主要变量包括：

- `DATABASE_URL`、`REDIS_URL`
- `ACCESS_TOKEN_SECRET`、`REFRESH_TOKEN_SECRET`
- `ENABLE_DEV_AUTH`
- `WECHAT_APP_ID`、`WECHAT_APP_SECRET`
- `CORS_ALLOWED_ORIGINS`

生产环境必须关闭开发登录、使用独立强密钥，并配置微信凭据和严格的 CORS 白名单。密钥只允许保存在服务端环境中。

## 微信小游戏说明

当前源码可以由 Cocos Creator 构建微信小游戏，但仓库仍以本地联调为交付范围。真机运行前至少需要：

1. 将客户端 API 地址改为可由设备访问的 HTTPS 域名。
2. 配置微信小游戏 AppID、服务端 AppSecret 和微信合法域名。
3. 在微信开发者工具及真机验证登录、前后台切换、弱网和安全区适配。
4. 使用与当前源码一致的已核验微信构建产物导入微信开发者工具。

当前源码对应的 `0.11.0-r1` 微信小游戏 debug/release 产物已完成构建和 JavaScript 语法检查；debug 包包含离线 1/8/24 小时和固定资源注入入口，release 包不包含 `DebugRoot`、调试面板标题或按钮文案；尚未完成微信开发者工具和真机验收。

正式云部署、监控、备份、域名、证书、备案和发布流水线尚未纳入当前阶段。
