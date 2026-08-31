# 悟道：修为储备的出口

状态：待评审。本文只描述设计与算账，不含实现。

## 1 背景

### 1.1 修为储备只进不出

`cultivationReserve` 在整个代码库里只有两个写入点，都在 `applyWholeExperience` 内，都以 `version_cap` 为条件：

```ts
} else if (status === "version_cap") {
  cultivationReserve = cultivationReserve.plus(remaining);
  remaining = decimal(0);
}
```

以及等级循环触顶的那一次：

```ts
if (level === MAX_LEVEL) {
  status = "version_cap";
  cultivationReserve = cultivationReserve.plus(remaining);
  ...
}
```

**它在任何地方都没有减少路径。** 全仓检索的结果是：初始化为 `"0"`（`local-game-snapshot.ts:82`）、只做十进制字符串形状校验（`LocalGameService.ts:3178`）、被 `CultivationProjection` 逐秒投影（`CultivationProjection.ts:58-66`）、在 `AppView.ts:241` 显示为一行 `修为储备 …`。没有消费者。

### 1.2 这个洞有多大

Lv.1000 触顶后，全部修为收入都进这个池子。裸值速率：

| 情形 | 修为加成 | 每秒 | 每小时 | 每天 |
| --- | --- | --- | --- | --- |
| 裸值 | 0 | 60,000 | 2.16e8 | 5.184e9 |
| 满修为配置 | +13,825bp（×2.3825） | 142,950 | 5.146e8 | 1.235e10 |

「满修为配置」= 洞府满级 4,500 + 四槽功法 10 星取修为最优 7,125 + 道侣君如兰 Lv.10 1,200 + 宗门青云 Lv.10 1,000。

也就是说：玩家花 258 天走到 Lv.1000（见 `2026-08-26-true-immortal-realm-split-design.md` §1.1），此后**每天 52 亿修为，全部沉进一个没有任何用途的数字**。这不是「终局内容偏少」，是终局收益的唯一去处是空的。

### 1.3 已有加成源的天花板

作为定价参照，现有三条非战力轴的上限（洞府满级 + 四槽功法 10 星按单轴取最优 + 道侣/宗门按单轴取最优）：

| 轴 | 洞府 | 功法 | 道侣 | 宗门 | 合计 |
| --- | --- | --- | --- | --- | --- |
| 修为 | 4,500 | 7,125 | 1,200 | 1,000 | 13,825 |
| 灵石 | 4,000 | 3,562 | 1,400 | 1,200 | 10,162 |
| 掉落 | 2,500 | 3,562 | 1,000 | 800 | 7,862 |

道侣与宗门各只能选一个，功法四槽也不可能三轴同时取最优，所以单个存档的实际同时值明显低于上表。上表是「单轴极限」，不是「全轴同时可得」。

## 2 目标与不做的事

**目标**：给 `cultivationReserve` 一个消费路径，让 Lv.1000 之后的时间换到永久的、可见的数值成长。

**做**：

- 新增 **悟道** 系统，用修为储备购买 **道行** 等级，共 50 级。
- 每级同时提升修为、灵石、掉落三条加成轴，通过既有的 `addLoadoutBonuses` 汇总链接入。
- 支持单次与批量悟道。
- 存档新增 `dao: { level }` 一个整数字段，配套一步迁移。

**不做**：

- **不做转生／重置**。本作的进度几乎全部按等级门控：`unlocks`、历练首通、试炼塔已通层数、42 级任务链的领取状态。等级回退要么让这些数据失去意义，要么需要逐项豁免，而这些内容本身是一次性的——重置后没有新东西可打，只有 258 天的重播。收益为负。
- **不给战力加成**。理由见 §8.1。
- **不改瓶颈期的溢出丢弃**。理由与后续可能性见 §8.2。
- 不动 `MAX_LEVEL`，不动境界表，不动任何既有掉落／价格曲线。

## 3 数值现状

需要被这套设计锚定的既有数字：

- `requiredExperienceForLevel(1000)` = 1,960,612,150（Lv.1000 是 `MAX_LEVEL`，这条门槛实际永不消耗，但它是「封顶处一级修为」的量纲参照：裸值 2.52 小时）。
- 触顶后修为速率 2.16e8/小时（裸）～5.15e8/小时（满修为配置）。
- 掉落节奏：100% 效率下每分钟一次尝试 = 60 次/小时；`dropBonusBp` 直接乘在 `advanceDropClock` 的 `efficiencyBp` 上（`cultivation-settlement.ts:182-186`），所以掉落加成等价于按比例提高每小时尝试次数。
- `calculateSpiritStonePerMinute(level, bp)` = `level × (1 + bp/10000)`，与境界无关。
- `LOCAL_BATCH_ACTION_CAP = 100`，大于道行满级 50，所以批量上限由道行自身封顶决定。

## 4 数值推导

### 4.1 成本曲线

沿用试炼塔 `trialFloorRequiredPower` 的形态——一条公式而非手写表，常数取整数：

```
道行第 n 级消耗 = ceil(1,000,000 × 1.28^(n-1))     n ∈ [1, 50]
```

| 道行 | 单级消耗 | 单级耗时（裸） | 累计消耗 | 累计耗时（裸） |
| --- | --- | --- | --- | --- |
| 1 | 1.000e6 | 17 秒 | 1.000e6 | — |
| 5 | 2.684e6 | 45 秒 | 8.700e6 | — |
| 10 | 9.223e6 | 2.6 分 | 3.859e7 | 0.01 天 |
| 15 | 3.169e7 | 8.8 分 | 1.413e8 | 0.03 天 |
| 20 | 1.089e8 | 0.50 小时 | 4.942e8 | 0.10 天 |
| 25 | 3.741e8 | 1.73 小时 | 1.707e9 | 0.33 天 |
| 30 | 1.286e9 | 5.95 小时 | 5.873e9 | 1.13 天 |
| 35 | 4.417e9 | 20.5 小时 | 2.019e10 | 3.89 天 |
| 40 | 1.518e10 | 70.3 小时 | 6.938e10 | 13.4 天 |
| 45 | 5.215e10 | 241 小时 | 2.384e11 | 46.0 天 |
| 49 | 1.400e11 | 648 小时 | 6.399e11 | 123.4 天 |
| 50 | 1.792e11 | 830 小时 | 8.191e11 | 158.0 天 |

满级总消耗 **819,103,077,163**，折合：

| 修为配置 | 满道行耗时 |
| --- | --- |
| 裸值 | 158.0 天 |
| 满修为配置（+13,825bp） | 66.3 天 |
| 满修为配置 + 道行 50（+21,325bp） | 50.4 天 |

这三个数是同一条曲线的上下界：一个从不换装的存档要 158 天，一个满配并把道行自身的修为加成算进去的存档要 50 天。对照 Lv.501-1000 的 163 天升级期，悟道给终局续上的是同一量级的一段路，而不是一个下午。

### 4.2 曲线形状

比率 1.28 是在「早期要有连续正反馈」和「后期要有真正的长尾」之间挑的：

- 前 25 级在触顶后 8 小时内全部到手。玩家点开悟道时会立刻连买十几级——这是这套系统的教学环节，刻意设计成免费的。
- Lv.30 在第 1 天，Lv.40 在第 13 天，Lv.45 在第 46 天，Lv.50 在第 158 天。每一级的耗时是上一级的 1.28 倍，所以「下一级还有多远」永远是一个具体、递增、可读的数字。
- 更陡的比率（试算过 1.35 × 40 级）把最后一级推到 47 天，且只有 40 个奖励节点；1.28 × 50 级把最后一级压到 35 天，节点多 25%，总时长反而更短。取后者。

### 4.3 每级加成

```
修为 +150bp    灵石 +150bp    掉落 +100bp
```

满道行 50 级 = 修为 +7,500bp、灵石 +7,500bp、掉落 +5,000bp（即 +75% / +75% / +50%）。

与 §1.3 的单轴天花板对照，悟道满级约等于「再来一套配置」的量级，但三条轴同时给满——这对一个需要 50 天以上的终局系统是合适的重量。掉落取 100bp 而非 150bp，因为掉落收益已经被段位放大 ×10（`2026-08-26-material-income-curve-design.md`），同样的 bp 在掉落轴上的绝对产出比另两轴高一档。

修为加成会自我复利：买了道行 → 储备收入变快 → 下一级更快。这条环是收敛的，因为成本按 1.28 几何增长而加成按 150bp 线性增长；§4.1 表格最后一列的 50.4 天已经把这条复利算进去了。

### 4.4 定价为什么不锚在灵石或材料上

考虑过让悟道额外消耗灵石或材料，被否决：触顶玩家的灵石与材料已经有真正的无底洞（洗练、升华、定向炼器），再挂一个消耗只会和那些系统抢预算，并让悟道的进度取决于运气而不是时间。修为储备是这个阶段唯一**只由时间决定**的资源，单一定价让「悟道进度 = 触顶后的在线时长」这条对应关系保持干净。

## 5 实现

### 5.1 新增配置 `shared/src/config/dao.ts`

```ts
export const DAO_MAX_LEVEL = 50;
export const DAO_EXPERIENCE_BONUS_PER_LEVEL_BP = 150;
export const DAO_SPIRIT_STONE_BONUS_PER_LEVEL_BP = 150;
export const DAO_DROP_BONUS_PER_LEVEL_BP = 100;

export function daoLevelCost(level: number): BigNumberString;
export function daoCumulativeCost(level: number): BigNumberString;
```

`daoLevelCost(n)` 返回从 `n-1` 升到 `n` 的消耗，越界抛 `RangeError`，与 `trialFloorRequiredPower` 的写法一致：`Decimal.pow` 的小数底数配整数指数，**不用 BigInt 幂**（Cocos 3.8 会把 `**` 降级成 `Math.pow`，对 BigInt 运行时抛错，`domain/loadout.ts` 已有同样的注记）。

### 5.2 新增领域函数 `shared/src/domain/dao.ts`

```ts
export function calculateDaoBonuses(dao: { level: number }): LoadoutBonuses;
export function affordableDaoLevels(input: {
  level: number;
  cultivationReserve: BigNumberString;
}): number;
export function spendReserveOnDao(input: {
  level: number;
  cultivationReserve: BigNumberString;
  times: number;
}): { level: number; cultivationReserve: BigNumberString; spent: BigNumberString };
```

`calculateDaoBonuses` 的等级校验照 `calculatePartnerBonuses` 的形状：非整数、负数、超过 `DAO_MAX_LEVEL` 一律 `RangeError`，`level === 0` 返回全零。`spendReserveOnDao` 逐级扣减，任一级付不起就抛错且不产生部分结算。

### 5.3 接入加成汇总

`local-game-snapshot.ts` 的 `refreshSnapshot` 在既有链尾追加一次：

```ts
bonuses = addLoadoutBonuses(bonuses, calculateDaoBonuses(snapshot.dao));
```

这一行是整个接入面。三条轴随后由 `refreshSnapshot` 写进 `progress.experienceBonusBp` / `spiritStoneBonusBp` / `dropBonusBp`，在线速率、离线结算、掉落节奏都自动跟上，不需要改 `settleCultivation`。

### 5.4 契约与服务

- `contracts/bootstrap.ts`：`BootstrapSnapshot` 增加 `dao: { level: number }`。
- `LocalGameService`：新增 `isDaoSnapshot`（`isRecord` + `isIntegerBetween(value.level, 0, DAO_MAX_LEVEL)`）挂进 `isBootstrapSnapshot` 的合取链；新增动作 `cultivateDao(times: number)`，走既有 `mutate` 包装（先结算在线收益、再改快照、再落盘），`times` 越界或储备不足抛 `LocalGameError`。
- 入口可见性**不新增 unlock 位**：等级只增不减，所以 `progress.level === MAX_LEVEL` 本身就是一个已锁存的条件，不存在 P2 里「门槛提高会收回入口」的问题。

### 5.5 展示

`assets/scripts/core/DaoDisplay.ts` 产出视图模型（当前道行、三条加成的百分比、下一级消耗、当前储备可买级数、是否满级），`AppView` 在修炼页 `修为储备` 那一行下方渲染一个区块，仅在 `progress.level === MAX_LEVEL` 时出现。显示逻辑进 `core/` 是为了可单测，节点绘制不进测试——与仓库既有分工一致。

## 6 存档与迁移

配置版本 `local-2.11.0` → `local-2.12.0`，迁移链新增第 15 步。

与 P2 不同，**这一步真的会动存档数据**：`dao` 是一个新的存储字段，不是从等级重新推导的。迁移把它补成 `{ level: 0 }`：

```ts
if (isRecord(config) && config.version === GAME_CONFIG_VERSION_PRE_DAO) {
  migrated = { ...migrated, dao: { level: 0 }, config: { ...config, version: GAME_CONFIG_VERSION } };
}
```

不给老存档补发道行等级：储备是老存档已经持有的资源，补发等级等于凭空发数值，而让它自己去花储备既公平又是这套系统本来的玩法。一个已经在 Lv.1000 挂了很久的存档，打开游戏时会有一大笔储备和一串可以立刻买下的道行——这正是期望的行为。

`dao` 缺失或形状非法的存档按既有规则拒绝载入并建新档，不做静默强制。

## 7 展示

- 修炼页新区块：`道行 Lv.N / 50`，三行加成 `修为 +X% 灵石 +X% 掉落 +X%`，一行 `下一级需 修为储备 …`，两个按钮 `悟道` 与 `批量悟道`。
- 满级时按钮禁用，文案 `道行已至圆满`。
- 储备不足时按钮禁用并显示还差多少。
- 批量按当前储备可买的级数一次结算，结果提示 `道行提升至 Lv.N`。
- 大数走既有 `formatLargeNumber`，与 `修为储备` 现有那一行同一格式。

## 8 已知取舍

### 8.1 不给战力加成

道行不动战力，理由有三条：

1. **没有内容可解锁了。** 试炼塔 90 层的 Lv.917 达成级、历练 12 关的门槛，都在触顶前就被满配装备清掉了。触顶后的战力只影响排行页的数字。
2. **它会污染任务链的锚点。** `test/progression-task-chain.test.ts` 用一个硬编码的 `FULL_LOADOUT_BP = 71774` 重新推导每一层的 `achievableAtLevel`，这个常数的语义是「纯装备」。把道行算进战力，`achievableAtLevel` 的含义就从「装备到位时可达」漂移成「装备加悟道到位时可达」，而悟道的进度是不确定的。保持纯装备语义，这张表就还是可审计的。
3. **战力可以间接拿到。** 灵石与掉落加成喂的是洗练、升华、定向炼器——这些是终局真正在消耗资源的系统，走它们拿到的战力经过了既有内容，而不是绕过。

代价是「悟道不涨战力」在玩家侧是个直觉落差。如果以后要加，`calculateDaoBonuses` 里补一行 `powerBonusBp` 即可，但那时要同步处理第 2 条。

### 8.2 瓶颈期的溢出仍然丢弃

`applyWholeExperience` 在 `breakthrough_ready` 状态下把全部修为收入丢掉（`discarded = remaining`），这个数字经 `experienceDiscarded` 一路存进 `offlineSettlement`，**但全仓没有任何地方显示它**。所以卡关的玩家看到的是一条满的经验条和什么都不发生。

把这笔溢出改道进修为储备是个真正的改善：它不削弱等级压力（储备换不回修为，等级、战力、门控内容一样卡着），却把死时间换成缓慢的永久成长，并让悟道在 Lv.1000 之前就可见。数值上也够用——按各瓶颈的裸速率，攒够道行第 1 级需要：

| 瓶颈 | 裸储备/小时 | 道行 1 级耗时 |
| --- | --- | --- |
| Lv.10 | 36,000 | 27.8 小时 |
| Lv.30 | 216,000 | 4.6 小时 |
| Lv.60 | 648,000 | 1.5 小时 |
| Lv.100 | 1.8e6 | 0.6 小时 |
| Lv.150 | 4.32e6 | 0.2 小时 |
| Lv.300 | 1.944e7 | 6 分钟 |

不在本次范围内，因为它要动 `OfflineSettlementSummary.experienceDiscarded` 这个**已持久化并已校验**的字段的语义：改道之后这个字段结构性恒为 0，一个恒为 0 的字段应该删掉而不是留着，而删掉它需要一步会丢弃未读离线报告的迁移。这笔契约改动值得单独一次评审，不该混在定价里——混进来还会让悟道的可负担性取决于玩家卡关多久，那是个无界且无法建模的量。

### 8.3 前 25 级近乎免费

触顶后 8 小时内前 25 级全部到手（§4.2）。这是「50 个几何节点铺在 158 天里」的必然结果：总量固定时，抬高基数就得砍级数或降比率。接受它，并把它当成这套系统的开场。

### 8.4 修为轴的自我复利

道行的修为加成会加快储备收入，进而加快下一级。曲线收敛（几何成本 vs 线性加成），§4.1 的 50.4 天已含此项。但它意味着最优策略里没有「先买什么」的选择——因为只有一条轨，本来也没有分配决策。这是刻意的：四条独立轨会引入四条要平衡的曲线和一个不可回退的分配决策，换来的深度不如「装备 + 洗练」已经提供的多。

### 8.5 道行不可重置

没有洗点。与本作其他系统一致（分解有返还，加点没有回退），且单轨设计下不存在错点。

## 9 测试与验收

新增 `test/dao-attainment.test.ts`：

- **成本曲线**：`daoLevelCost(1)` 为 `"1000000"`；`daoLevelCost(50)` 与 `daoCumulativeCost(50)` 钉死字面量；逐级严格递增；`daoLevelCost(0)` 与 `daoLevelCost(51)` 抛 `RangeError`。
- **加成**：`calculateDaoBonuses({ level: 0 })` 全零；`{ level: 50 }` 为 `{ powerBonusBp: 0, experienceBonusBp: 7500, spiritStoneBonusBp: 7500, dropBonusBp: 5000 }`；负数／小数／51 抛 `RangeError`。
- **消费**：储备刚够时逐级扣净；差 1 点时抛错且储备与等级都不变（部分结算不落地）；`times` 跨越满级时抛错。
- **接入**：一个 Lv.1000、`dao.level = 50` 的存档，`refreshSnapshot` 后 `progress.experienceBonusBp` 比 `dao.level = 0` 的同一存档高 7,500，`dropBonusBp` 高 5,000，`totalPower` **完全相同**（§8.1 的验收点）。
- **可见性**：Lv.999 存档的悟道区块不出现；`cultivateDao` 在非 `version_cap` 存档上抛 `LocalGameError`。

回归验收：

- `test/progression-task-chain.test.ts` 的 `orders the chain by the level each milestone becomes reachable at` **不改任何期望值即通过**——与 P2 相同的验收标准，证明 §8.1 的战力隔离成立。
- `test/local-save-migration.test.ts` 增加 `local-2.11.0` 迁移块：补出 `dao: { level: 0 }`；其余字段逐字节不变；不补发道行；不被拒绝。既有 16 处 `"local-2.11.0"` 字面量升到 `"local-2.12.0"`。
- 门禁：`pnpm typecheck`、`pnpm test`、`pnpm verify:source`、`pnpm verify:release-config` 全绿。

## 10 实施顺序

1. `shared/src/config/dao.ts`：常数与成本公式。
2. `shared/src/domain/dao.ts`：加成、可买级数、消费。
3. `test/dao-attainment.test.ts` 的成本与加成部分，先验证纯函数。
4. `contracts/bootstrap.ts` 加 `dao`；`local-game-snapshot.ts` 的初始档与 `refreshSnapshot` 接入。
5. `LocalGameService`：`isDaoSnapshot`、`cultivateDao`、迁移第 15 步、版本常数。
6. `test/local-save-migration.test.ts` 的版本字面量与新迁移块。
7. `core/DaoDisplay.ts` 与其测试。
8. `AppView` 的修炼页区块。
9. `docs/game-design-and-technical-spec.md` §2 与迁移表、`README.md` 能力清单与迁移链。
10. 全门禁。
