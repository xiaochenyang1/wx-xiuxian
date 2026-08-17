# 中期内容与战力模型设计

日期：2026-08-17

## 1. 背景

当前版本的框架撑到 Lv.1000 和十个境界，但内容在 Lv.11 就用完了。实测节奏（纯在线、无加成，由 `requiredExperienceForLevel` 与 `calculateOnlineExperiencePerSecond` 推出）：

| 里程碑 | 累计时长 | 事件 |
| --- | ---: | --- |
| Lv.10 | 40m | 第一次境界瓶颈 |
| Lv.11 | 1h17m | 伴侣与洞府解锁，两个解锁点全部用完 |
| Lv.33 | 20h23m | 古修遗府首通，六关历练全部打完 |
| Lv.100 | 5.0 天 | 无新内容 |
| Lv.1000 | 258.6 天 | 无新内容 |

20 小时之后，玩家剩下的全部内容是三条无限重复的数值管道：洞府五建筑升至 Lv.10、法宝强化至 +20、功法升至 10 星。没有新解锁、没有新任务、没有新关卡。

### 1.1 根因：配装战力被硬顶死

内容断层不只是"关卡不够"。理论满配（全传说品质、满 +20 强化、全功法 10 星、炼器室 Lv.10）的固定战力合计只有 **16,005**，而裸等级战力 `level × 100 × realmMultiplier` 一路涨到 10 亿：

| 等级 | 裸战力 | 满配总战力 | 配装占比 |
| --- | ---: | ---: | ---: |
| Lv.11 | 2,200 | 18,205 | 87.9% |
| Lv.33 | 16,500 | 32,505 | 49.2% |
| Lv.100 | 100,000 | 116,005 | 13.8% |
| Lv.150 | 450,000 | 466,005 | 3.4% |
| Lv.1000 | 1,000,000,000 | 1,000,016,005 | 0.00% |

同时 `calculateTotalPower` 早就接受 `percentBonusBp` 参数（`shared/src/domain/progression.ts:34,67,79`），但**全项目没有任何调用方传过它**——百分比战力这条路留了口子没接。

这个模型有两个后果。一是历练门槛被等级碾过去：Lv.11 裸战力 2,200 就能连过前四关，六关没有一关构成挑战。二是**任何以战力为门槛的新玩法都会退化成等级检查**——玩家卡住时唯一有效的应对是继续挂机升级，而不是优化配装。因此新增关卡类内容之前必须先修战力模型，否则只是换个界面重演同一个问题。

## 2. 目标与非目标

### 目标

1. 让配装对总战力的贡献不再随等级衰减，恒定在约 87.8%。
2. 用一条公式化的战力阶梯（试炼塔）覆盖 Lv.11 → Lv.100 的里程碑需求，并让同一条公式免费铺到 Lv.917。
3. 让任务链从 Lv.8 延伸到 Lv.100，解锁点从"全挤在 Lv.11"改为分散到 Lv.11 / 15 / 20。
4. 老存档（`local-1.0.0` 起）在引入新字段后不丢进度。

### 非目标

- 不做装备等级分档。百分比模型下配装天然随等级缩放，每槽保留一件基础装备即可，不需要把档位铺到 Lv.1000。
- 不做功法扩表或开放稀有以上功法品质。见 4.4 的实测：功法贡献已达装备的 64.1%，不存在需要修的失衡。
- 不把掉落表从 `LocalGameService` 抽到 `shared/src/config/`。它是真实的架构债，但与本期目标无关。见第 9 节。
- 不重排历练六关门槛。它是 Lv.1-33 的教学阶梯，保持不动可以完全不碰 `clearedStageIds` 的前缀校验及其现有测试。
- 不提高洞府等级上限。洞府满级已需约 578 万灵石，本期反而是在缓解这条长坡。
- 不新增消耗型或恢复型资源（体力、挑战券）。
- 不填 `wallet.immortalJade` 和 `activeEffects` 两个空壳，不补美术资产。它们是独立工作流。

## 3. 战力模型：固定值改百分比

### 3.1 计算式

`LoadoutBonuses.fixedPower` 改为 `powerBonusBp`，喂给 `calculateTotalPower` 的 `percentBonusBp`。单件贡献多一个乘数：

```text
contribution_bp = basePower × LOADOUT_POWER_SCALE_BP/1e4 × qualityBp/1e4 × enhanceBp/1e4
```

`shared/src/domain/loadout.ts` 的 `scaleByBasisPoints` 本来就是变参多乘数、BigInt 精确整数运算，因此这是加一个乘数并改输出字段名，不是重写。功法侧同理，`enhanceBp` 位置换成 `starMultiplierBp`。

### 3.2 标尺：保住早期手感，只修后期衰减

`LOADOUT_POWER_SCALE_BP = 45_000`（×4.5）。这个值不是拍的，是按"Lv.11 满配总战力与改造前基本相等"反解出来的：

满配 base 之和固定——装备六槽 80+75+55+55+95+90 = 450，功法四槽 100+90+125+110 = 425。乘满品质满强化倍率得 15,505，与 1.1 节实测的固定战力上限 16,005 减去洞府 500 后完全吻合。取 SCALE = 4.5，按 `scaleByBasisPoints` 的逐件整数除法累加，得满配 `powerBonusBp = 71,774`（洞府炼器室 2,000 已计入），即 **+717.7%**：

| 等级 | 改造前满配 | 改造后满配 | 配装占比 |
| --- | ---: | ---: | ---: |
| Lv.11 | 18,205 | 17,990 | 87.77% |
| Lv.100 | 116,005 | 817,740 | 87.77% |
| Lv.1000 | 1,000,016,005 | 8,177,400,000 | 87.77% |

Lv.11 那一行几乎不动（18,205 → 17,990），意味着早期数值不需要重新调平衡；而配装占比从"衰减到 0"变成恒定 87.77%，这条线以后不会再衰减。起步装（六槽普通 +0、四功法普通 1 星）逐件累加为 3,935 bp，即 +39.35%，与改造前 Lv.11 的 +875 固定值（+39.77%）对齐；两种模型下 Lv.11 起步装总战力分别是 3,075 与 3,065。

所有 bp 数值均按逐件 `floor` 后求和，不能先求 base 之和再乘倍率——两种算法会因舍入产生数点差异，测试断言以逐件累加为准。

### 3.3 连带改动

- 洞府炼器室由 `+50 固定战力/级` 改为 `+200 bp/级`（2%/级，Lv.10 = +20%）。等价换算约为 225 bp/级，取整为 200。`CaveBuildingConfig.bonusStat` 的 `"power"` 分支改为写入 `powerBonusBp`。
- 派生字段 `progress.loadoutFixedPower` 改名 `progress.loadoutPowerBonusBp`，类型由 `BigNumberString` 改为 `number`（bp 与其他三项加成一致）。
- 修为、灵石、掉落三项加成本来就是 bp，天然随等级缩放，一行不改。本期只修战力这一个轴。

### 3.4 为什么不需要数据迁移

`totalPower`、`loadoutPowerBonusBp` 和三项加成全部是派生值，`refreshSnapshot` 每次载入都从配置、品质、星级、强化等级重新生成（技术规范 2.6 节已明确"存档中的旧派生展示值不会被当作权威数值"）。因此战力模型改造不搬运任何权威数值，迁移只需处理字段改名。

## 4. 试炼塔

### 4.1 定位与门槛语义

纯战力门槛：无消耗、无次数限制、无失败惩罚。只能挑战 `highestFloor + 1` 层，当前总战力达标即刻完成并发放一次性奖励。

**塔没有扫荡。** 纯战力门槛配可重复扫荡会构成无限资源回路——站在已通层反复扫荡即可刷出无限灵石。现有历练扫荡正是用"消耗 1 枚寻宝令且不返还"堵这个口子（技术规范 2.8 节）。塔的定位收窄为纯里程碑，重复收入继续由历练扫荡和寻宝承担。

### 4.2 门槛公式

```text
门槛(n) = ceil(3000 × 1.18^(n-1))        n ∈ [1, 90]
```

用 `Decimal.pow` 计算并输出 `BigNumberString`，与 `totalPower` 同类型直接比较。`decimal.js-light` 的 `.pow()` 已验证可用且精确（`3000 × 1.18^89 = 7,492,381,882`），绕开了 `loadout.ts` 注释警告的 Cocos 将 BigInt 幂运算转译成 `Math.pow` 而抛错的问题。

| 层 | 战力门槛 | 满配最早可通等级 | 起步装最早可通等级 |
| ---: | ---: | --- | --- |
| 1 | 3,000 | Lv.4 | Lv.11 |
| 10 | 13,307 | Lv.11 | Lv.31 |
| 20 | 69,644 | Lv.31 | Lv.61 |
| 25 | 159,328 | Lv.39 | Lv.101 |
| 34 | 706,688 | Lv.87 | Lv.151 |
| 90 | 7,492,381,882 | Lv.917 | 永远不可 |

右侧两列之差是配装检查窗口。第 20 层满配 Lv.31 可通、起步装要拖到 Lv.61；第 25 层这个差扩大到 60 级以上。爬塔卡住时，补品质与强化永远比再挂机 30 级划算——这正是 1.1 节要修的根因。覆盖 Lv.100 用掉 34 层，剩余 56 层由同一公式免费铺到 Lv.917。

### 4.3 奖励公式

四条规则，全部由层数算出：

| 项 | 公式 |
| --- | --- |
| 灵石 | `ceil(1000 × 1.18^(n-1))` |
| 强化石 | `1 + floor(n/2)` |
| 功法残页 | `1 + floor(n/3)` |
| 寻宝令 | 每 5 层额外 ×2 |

灵石与门槛同底，保证奖励价值不随层数脱节；34 层累计 1,538,704 灵石，同时缓解洞府满级 578 万灵石的长坡。寻宝令补的是实测供给不足——当前挂机产出约 1.4 枚/天（每分钟 0.1% 概率），历练首通一共只给 14 枚。

不发洞府材料：按当前掉落率约 65 小时即可攒满全部洞府材料需求（2,750 个，约 42 个/小时），不是瓶颈。

### 4.4 为什么不同时扩功法表

初稿曾计划把功法从 8 本扩到 20 本并开放稀有以上品质，理由是"装备品质能到传说（×7），功法被写死在优秀（×1.5）"。该理由不成立：它漏算了功法的星级倍率。实测

```text
装备 450 base × 传说 7 × 强化 3  = 9,450
功法 425 base × 优秀 1.5 × 10 星 9.5 = 6,056     → 64.1%
```

功法贡献已达装备的 64.1%，而功法占四槽、装备占六槽，本来就大致平衡。功法的进阶轴（升星至 10 星，消耗同名副本与残页）已经存在且是长线目标，塔的残页奖励正好喂它。因此扩表被删除。

### 4.5 模块边界

```text
shared/src/config/trial-tower.ts    TRIAL_TOWER_MAX_FLOOR、门槛与奖励两个纯函数
shared/src/domain/trial-tower.ts    canClearTrialFloor(highestFloor, totalPower)
```

塔只依赖 `totalPower` 一个输入，产出奖励清单，不引用 `expedition` 的任何代码。`LocalGameService.challengeTrialTower` 承担事务：行囊栈位预检 → 发奖 → `highestFloor` 递增，任一校验失败不改动任何字段。

### 4.6 存档形状

```ts
trialTower: { highestFloor: number }   // 0 = 未通任何层
unlocks: { partner: boolean; cave: boolean; trialTower: boolean }
```

塔是严格顺序爬的，最高层数本身即完整进度，不需要 `expedition` 那样的 id 数组加前缀校验。

## 5. 任务链与解锁点

### 5.1 任务条件类型

`NewcomerTaskConfig` 现在只有 `targetLevel` 一种条件。改为判别联合，只加两种：

```ts
type TaskCondition =
  | { kind: "level"; level: number }
  | { kind: "trial_tower_floor"; floor: number };
```

塔层条件的作用是把玩家推向新系统；洞府总等级、装备品质等条件本期不做。

### 5.2 任务表

保留现有 Lv.3 / 5 / 8 三条，新增 19 条，合计 22 条：

- 等级任务 12 条：Lv.12、15、20、25、30、40、50、60、70、80、90、100。奖励 `灵石 = level × 500`、`强化石 = ceil(level/10)`。
- 塔层任务 7 条：第 1、5、10、15、20、25、30 层。奖励大经验丹 ×1；第 15 层及以后额外突破丹 ×1。

任务奖励沿用现有 Lv.8 任务的行囊满处理：先记录完成、保持未领取，后续结算检测到空位后自动补发。塔与任务在这一点上的策略不同——塔是玩家主动发起的单次操作，行囊不足时整笔拒绝并给出精确缺口，不留半完成状态；任务是被动达成的，不能因为行囊满就把奖励丢掉。

第 30 层门槛为 364,502。Lv.100 满配战力 817,740、半数配装（bp 折半）458,870，均可达。

### 5.3 字段改名

`newcomerTasks` 改名 `progressionTasks`。任务链铺到 Lv.100 之后"新手任务"这个名字就是错的，而且本期已必须开迁移，一起改比留命名债便宜。

### 5.4 解锁点重排

当前解锁等级是 `local-game-snapshot.ts:161` 的一句 `const unlocked = level >= 11;` 魔法数，两个系统共用。改为三个命名常量：

| 系统 | 解锁等级 |
| --- | ---: |
| 洞府 | Lv.11 |
| 试炼塔 | Lv.15 |
| 伴侣 | Lv.20 |

Lv.11 一次砸两个大系统给玩家，改后分散到三个节点。

**前置改动：`unlocks` 必须先改为单调。** 当前 `refreshSnapshot` 用当前等级无条件覆写整个 `unlocks`（`local-game-snapshot.ts:161,187` 的 `const unlocked = level >= 11` 与 `unlocks: { partner: unlocked, cave: unlocked }`），解锁是派生值而非存储值。若不先改，伴侣解锁等级一提到 Lv.20，Lv.11-19 的老存档下次载入就会看到伴侣页退回锁定页——即使玩家已经结缘。改为按位单调：

```ts
partner: snapshot.unlocks.partner || level >= PARTNER_UNLOCK_LEVEL
```

三个系统各用一个命名常量，规则统一为"一旦解锁永不回收"。这条改动是提高伴侣解锁等级的前提，不能分开发布。副作用是 Lv.11-19 的老档即使尚未结缘也会保留伴侣入口——这是正确的取舍：宁可让少量老档比新档早拿到入口，也不能回收任何已给出的东西。

## 6. 存档迁移与校验

### 6.1 迁移 `local-2.3.0 → local-2.4.0`

一次版本跳，四件事：

1. 补 `trialTower: { highestFloor: 0 }` 与 `unlocks.trialTower`（按当前等级判定，`level >= 15` 为 `true`）。
2. `newcomerTasks` 改名 `progressionTasks`，并**补齐 19 条新增任务记录**（`progress: "0"`、`completedAt: null`、`claimedAt: null`）。
3. `progress.loadoutFixedPower` 改名 `progress.loadoutPowerBonusBp`。
4. 其余字段不动，不发放补偿资源。

第 2 步是强制项而非优化项：`isNewcomerTaskList` 要求存档任务条数与配置表长度**完全相等**（`LocalGameService.ts:2906`）。任务表加一行就会让所有现存存档被判为损坏并创建新档。因此任务扩表和迁移必须同一次发布，不能拆开。

`local-1.0.0` 起的老档仍应能在一次载入中连续迁移到 `local-2.4.0`。

### 6.2 新增校验

- `trialTower.highestFloor`：`0 .. TRIAL_TOWER_MAX_FLOOR` 的整数。
- `unlocks.trialTower`：布尔。
- `progress.loadoutPowerBonusBp`：非负整数。
- `progressionTasks`：沿用现有规则（长度等于配置表、id 来自配置、无重复、`claimedAt` 非空时 `completedAt` 必须非空）。

## 7. 测试策略与回归面

沿用现有 vitest 加基于 `Map` 的假 `PlatformAdapter` 模式，时间与掉落种子从入参注入，不依赖 Cocos、浏览器或微信环境。TDD：先写失败测试。

### 7.1 新增测试

- `test/trial-tower.test.ts`：门槛与奖励公式的边界（第 1 层、第 90 层、越界抛错）、只能挑 `highestFloor + 1`、战力不足时不扣不发不进度、行囊满时整笔事务回滚、寻宝令每 5 层的发放点。
- `test/loadout-power-model.test.ts`：标尺校准断言——满配 `powerBonusBp` 为 71,774、起步装为 3,935、Lv.11 满配总战力 17,990、配装占比在 Lv.11 / 100 / 1000 三点恒定 87.77%、洞府炼器室 Lv.10 贡献 +20%。所有断言按逐件 `floor` 累加取值。
- `test/progression-task-chain.test.ts`：两种条件类型的完成判定、塔层任务在通关瞬间完成、奖励在行囊满时的补发路径。
- `test/unlock-monotonicity.test.ts`：三个系统各自的解锁阈值；已解锁位在等级阈值上调后不被 `refreshSnapshot` 回收；Lv.15 老档保留伴侣入口。
- `test/local-save-migration.test.ts` 增加 `local-2.3.0 → local-2.4.0` 用例，以及 `local-1.0.0` 直达 `local-2.4.0` 的链式迁移用例。

### 7.2 预期回归面

战力模型改造会让现有断言的期望值失效。以下测试需要更新，属于预期改动而非"顺手改绿"，实施计划里应逐个列出并说明每处新期望值的来源：

- `test/asset-upgrades.test.ts`（37 个）
- `test/cave-bonuses.test.ts`（9 个）
- `test/expedition-domain.test.ts`、`test/expedition-challenge.test.ts`、`test/expedition-sweep.test.ts`
- `test/save-round-trip-audit.test.ts`、`test/local-save-validation.test.ts`（字段改名与新字段）
- `test/progression-journey.test.ts`

`test/feature-rail.test.ts` 需要为试炼塔入口增加一条断言。

## 8. 验收基线

- `pnpm typecheck`、`pnpm test`、`pnpm verify:source`、`pnpm verify:release-config` 全部通过。
- 现有 294 个测试在更新期望值后全绿，无跳过。
- `local-1.0.0` 至 `local-2.3.0` 的存档载入后进度完整，任务记录补齐到 22 条，不创建新档。
- 新档在 Lv.11 解锁洞府、Lv.15 解锁试炼塔、Lv.20 解锁伴侣。
- Lv.11-19 的老存档载入后仍保留伴侣入口，解锁位不被回收；已结缘的老档伴侣页正常显示而非锁定页。
- 试炼塔第 1 层在起步装 Lv.11 可通、第 2 层不可通（配装检查生效）。
- 塔的任一层不能重复领奖；界面上不存在塔的扫荡入口。
- `docs/game-design-and-technical-spec.md` 与 `README.md` 的当前能力、存档规则和迁移链同步更新。

## 9. 已知遗留（不在本期）

以下是本次分析中确认存在、但与本期目标无关的问题，记录以免丢失：

- `wallet.immortalJade`：契约、初始化和校验都有，全项目零产出零消耗零 UI。
- `activeEffects`：校验强制为空数组，buff 系统只有槽位。
- `settings.selectedTab`：存盘并校验，但 `AppStore` 永远从 `"cultivation"` 起，读档不回填。
- `equipment.rolledAffixes`：契约里是 `unknown`，未进类型系统。
- 词条无随机性：字段名叫 `rolledAffixes`，实际 `affixCount` 与 `affixValueBp` 全是品质的纯函数，同槽位同品质的两件法宝永远相同。
- `mythic` / `primordial` 两档品质配了完整数值但无任何产出口，且 `buildCraftedEquipment` 的 `affixCount` 三元链没有这两档分支，一旦开放会掉到 0 条词条。
- `EquipmentConfig.minLevel/maxLevel` 全为 `1..1000`，是死字段。
- 掉落表硬编码在 `LocalGameService.ts:1851-1935`，是全项目唯一一处数值未落在 `shared/src/config/`。
- 美术资产：`docs/art-asset-guide.md` 要求约 20 个文件，实际只有 `art/backgrounds/cultivation.png`。
- `docs/superpowers/plans/2026-08-10-cave-system.md` 的 40 个 checkbox 全未勾选，但对应代码均已落地，是过期账本。
