# 真仙期拆分设计

状态：待评审。本文只描述设计与算账，不含实现。

## 1 背景

`shared/src/config/realms.ts` 的最后一条把 Lv.501 到 Lv.1000 整个装进一个境界：

```ts
{
  id: "true_immortal",
  displayName: "真仙期",
  minLevel: 501,
  maxLevel: 1000,
  expMultiplier: 60,
  powerMultiplier: "10000",
  expRequirementCoefficientBp: 6_200_000,
  breakthroughPillCost: null,
  nextRealmId: null,
}
```

`breakthroughPillCost: null` 和 `nextRealmId: null` 是这一条的全部问题所在。突破由 `isRealmMaxLevel` 触发，而这个境界的上限就是版本上限，所以从 Lv.501 一直到通关，玩家不会再经历一次突破。下面三节按重要性排列。

### 1.1 63% 的时长、50% 的等级，一次突破都没有

裸装（无洞府、无道侣、无宗门、无配装加成）逐级累加 `requiredExperienceForLevel / calculateOnlineExperiencePerSecond` 得到的时长：

| 境界 | 等级 | 级数 | 小时 | 天 | 突破丹 |
| --- | --- | --- | --- | --- | --- |
| 练气期 | 1-10 | 10 | 1 | 0.0 | 1 |
| 筑基期 | 11-30 | 20 | 17 | 0.7 | 3 |
| 金丹期 | 31-60 | 30 | 35 | 1.4 | 8 |
| 元婴期 | 61-100 | 40 | 70 | 2.9 | 15 |
| 化神期 | 101-150 | 50 | 136 | 5.7 | 30 |
| 炼虚期 | 151-220 | 70 | 253 | 10.6 | 60 |
| 合体期 | 221-300 | 80 | 508 | 21.2 | 120 |
| 大乘期 | 301-400 | 100 | 510 | 21.2 | 240 |
| 渡劫期 | 401-500 | 100 | 766 | 31.9 | 500 |
| **真仙期** | **501-1000** | **500** | **3,904** | **162.7** | **—** |

合计 6,199 小时 / 258.3 天。真仙期一个境界占 63.0% 的时长和 50.0% 的等级。前 500 级安排了 9 次突破、平均每 3.5 天一次；后 500 级安排了 0 次、持续 163 天。突破是这类游戏唯一的节奏闸门，也是本作唯一会打断"挂机—自动升级"循环、需要玩家主动做一件事的环节。它在最长的那一段里不存在。

### 1.2 突破丹在 Lv.500 之后变成死道具

突破丹的终身需求是 977 枚，全部落在 Lv.500 之前。但它的三个来源没有一个会停：

- 炼丹房的四类配方之一（`shared/src/config/alchemy.ts:59`，20 灵草 + 5 矿石 + 3,000 灵石 → 1 枚，需炼丹房 Lv.4）
- 挂机掉落的独立抽取，0.05%，且刻意不随段位放大
- 试炼塔任务奖励，第 15 层起每条一枚

第三项已经为此打了补丁：`progression-tasks.ts:90` 有一个 `TOWER_BREAKTHROUGH_PILL_TO_FLOOR = 60` 的上限，注释写明理由是"第 70 层最早的达成者是 Lv.501，已进真仙期，那里的 `breakthroughPillCost` 是 `null`，再发就是死物"。这个常量的存在本身就是这个洞的存在证明。

### 1.3 战力在最后 500 级只长 2.00 倍，而且没有消费者

`calculateTotalPower` 是 `等级 × 100 × 境界倍率 × (1 + 百分比加成)`。境界倍率在真仙期内恒为 10000，所以裸装战力从 Lv.501 的 5.01e8 线性长到 Lv.1000 的 1e9——整段 500 级只有 **2.00 倍**。作为对比，前 500 级长了 1.5e6 倍，单是 Lv.500→501 那一次突破就跳 3.34 倍。

更要紧的是这 2.00 倍没有去处。历练第 12 关要 1.2e8 战力，而 Lv.500 裸装就有 1.5e8——**整条历练在真仙期开始之前就已经打完了**。真仙期之后战力的唯一消费者是试炼塔的三个里程碑，而其中第 80 层（1.4315e9）和第 90 层（7.4924e9）在任何等级裸装都不可达，只能靠满配（×8.1774）跨过去，这在 `progression-tasks.ts:49` 里写明是故意的："the top of the tower is open to gear, not to time."

### 1.4 称号密度掉到原来的 1/5

`getRealmStage` 把任意境界均分成四段，所以真仙期的每一段是 125 级：真仙初期 501-625（35 天）、真仙中期 626-750（39 天）、真仙后期 751-875（43 天）、真仙圆满 876-1000（46 天）。前面的境界平均每 25 级换一次称号，这里变成每 125 级一次。

## 2 目标与不做的事

做：

- 把 Lv.501-1000 拆成 5 个各 100 级的境界，在 Lv.600 / 700 / 800 / 900 各安排一次突破。
- 给这四次突破定突破丹价格，让炼丹房、挂机掉落和塔奖励在终局仍有意义。
- 把塔任务的突破丹条件从硬编码的层数上限改成由境界推导，`TOWER_BREAKTHROUGH_PILL_TO_FLOOR` 这个常量随之消失。
- 称号密度回到每 25 级一次。

不做：

- **不动 `powerMultiplier`、`expRequirementCoefficientBp`、`expMultiplier` 中的任何一个。** 五条新境界全部沿用 `10000 / 6_200_000 / 60`。理由见 4.2，代价见第 8 节。
- 不动 `MAX_LEVEL`，仍是 1000；不动总时长，仍是 258.3 天。
- 不新增境界特有的机制、加成或解锁。这次只补节奏，不加系统。
- 不改历练、试炼塔、修行任务链的任何门槛数字。

## 3 数值现状

三个旋钮里只有 `expMultiplier` 和 `expRequirementCoefficientBp` 决定时长，`powerMultiplier` 决定战力，四者互不耦合：

| 字段 | 真仙期取值 | 影响 |
| --- | --- | --- |
| `expMultiplier` | 60 | `calculateOnlineExperiencePerSecond = 等级 × 60 × (1+加成)` |
| `expRequirementCoefficientBp` | 6_200_000 | `requiredExperienceForLevel = ceil(等级^1.5 × 100 × 620)` |
| `powerMultiplier` | `"10000"` | `calculateTotalPower = 等级 × 100 × 10000 × (1+加成)` |
| `breakthroughPillCost` | `null` | `completeBreakthrough` 在这里直接抛 `BREAKTHROUGH_NOT_READY` |

`calculateSpiritStonePerMinute` 只用 `getRealmConfigForLevel(level)` 做一次校验，返回值只由等级决定，与境界字段无关。

## 4 拆分推导

### 4.1 为什么是 5 个 100 级

100 级一段直接继承大乘期和渡劫期已经确立的步长，而且落在整百上——`LEVEL_TASK_LEVELS` 里已经有 600 / 700 / 800 / 900 / 1000 五条等级任务，拆分点和任务链的既有里程碑逐一重合，不需要在任务链里插一条新行。

各段裸装时长：

| 境界 | 等级 | 小时 | 天 |
| --- | --- | --- | --- |
| 真仙期 | 501-600 | 673 | 28.1 |
| 金仙期 | 601-700 | 732 | 30.5 |
| 太乙期 | 701-800 | 786 | 32.8 |
| 大罗期 | 801-900 | 837 | 34.9 |
| 道祖期 | 901-1000 | 876 | 36.5 |

28 / 31 / 33 / 35 / 37 天，平滑接上渡劫期的 32 天，且五段之间只差 30%——比"1 天 → 163 天"的现状有意义得多。合计仍是 3,904 小时，总时长一分钟都不变。

### 4.2 三个数值旋钮全部保持不变，是为了让改动没有涟漪

`powerMultiplier`、`expRequirementCoefficientBp`、`expMultiplier` 在五条新境界里全部等于真仙期的原值。于是：

- `calculateTotalPower(level)`、`requiredExperienceForLevel(level)`、`calculateOnlineExperiencePerSecond(level)` 在 501..1000 的每一级上返回**逐字节相同**的结果。
- 因此试炼塔 90 层的门槛表、`TOWER_TASK_FLOORS.achievableAtLevel`（第 70 层 Lv.501、第 80 层 Lv.501、第 90 层 Lv.917）和历练十二关的战力门槛全部不动。这三处都由 `test/progression-task-chain.test.ts` 从 `calculateTotalPower` 与 `trialFloorRequiredPower` 反推校验，是故意设的护栏；本次改动不会触发它们，这是设计目标而不是巧合。
- `validateProgressState` 只拒绝 `experience > required`。既然 `required` 在每一级都不变，就不存在"老档的经验超过了新的需求量"这种拒档路径。

代价是这四次突破不带任何数值奖励。这一点在第 8 节明确记账。

### 4.3 突破丹价格：700 / 1,000 / 1,400 / 2,000

锚在渡劫期的既有比例上。渡劫期要 500 枚 = 10,000 灵草，而这一段（766 小时、天阶）的挂机灵草收入是 64,349，占 **15.5%**。

天阶灵草收入是 84/小时：每分钟一次掉落尝试 × 35% 命中 × 五种材料均分 × 平均 2 个 × 段位 ×10。各段收入与账单：

| 突破 | 攒钱的境界 | 该境界灵草收入 | 突破丹 | 灵草账单 | 占比 |
| --- | --- | --- | --- | --- | --- |
| Lv.600 | 真仙期 501-600 | 56,552 | 700 | 14,000 | 24.8% |
| Lv.700 | 金仙期 601-700 | 61,480 | 1,000 | 20,000 | 32.5% |
| Lv.800 | 太乙期 701-800 | 66,041 | 1,400 | 28,000 | 42.4% |
| Lv.900 | 大罗期 801-900 | 70,306 | 2,000 | 40,000 | 56.9% |

比例从 25% 爬到 57%：最后一次刻意做成跨两个境界的项目，而不是当段就能顺手付掉的开销。合计 5,100 枚 = 102,000 灵草 / 25,500 矿石 / 15,300,000 灵石。分母上，Lv.501-1000 的挂机灵草总收入是 327,942，所以这笔账占 **31%**，剩下 226,000 留给炼器和另外三个丹方；灵石总收入是 178,967,172，15.3M 只占 **8.5%**，不构成瓶颈。

### 4.4 为什么不是 ×2 递增

试过 1,000 / 2,000 / 4,000 / 8,000。最后一笔是 160,000 灵草，等于大罗期整段灵草收入的 **227%**——要横跨两个多境界才付得起，而且会把炼器彻底挤出终局。25%→57% 这条曲线已经有足够的爬坡感。

## 5 实现

### 5.1 境界表与 `RealmId`

`RealmId` 联合类型加四个成员 `golden_immortal` / `taiyi` / `daluo` / `daozu`，`REALM_CONFIGS` 从 10 条变 14 条。真仙期的 `maxLevel` 从 1000 改为 600，`breakthroughPillCost` 从 `null` 改为 700，`nextRealmId` 从 `null` 改为 `"golden_immortal"`；只有最后一条 `daozu` 保留 `null / null`。

`REALM_CONFIGS` 在 `config/realms.ts` 之外没有任何消费者依赖它是 10 条——`getRealmConfigForLevel` 按区间查找，`getRealmConfig` 按 id 查找，都与条数无关。

### 5.2 塔任务的突破丹条件改为由境界推导

`TOWER_BREAKTHROUGH_PILL_TO_FLOOR = 60` 这个上限不是简单删掉就完事——第 90 层的达成等级是 Lv.917，落在道祖期，而道祖期是版本最后一个境界、`breakthroughPillCost` 仍是 `null`，那里发丹依旧是死物。死区没有消失，只是从 500 级缩到 100 级。

所以把条件换成它本来想表达的那句话：**该层最早达成者所在的境界还在为突破收费**。

```ts
if (
  floor >= TOWER_BREAKTHROUGH_PILL_FROM_FLOOR &&
  getRealmConfigForLevel(TRIAL_TOWER_TASK_ACHIEVABLE_LEVELS[floor]!)
    .breakthroughPillCost !== null
) {
```

结果是第 70 层（Lv.501，真仙期，700 枚）和第 80 层（同样 Lv.501）开始发丹，第 90 层照旧不发。净增 2 枚，在 5,100 枚的账单里可以忽略；做这件事是为了让规则跟着境界表走，而不是靠一个每次改表都要重算的层数常量。

`test/progression-task-chain.test.ts:165` 的不变式（"发了丹，则该层达成者所在境界的 `breakthroughPillCost` 非空"）不变，并且正是它逼出了上面这个修正——第一版实现直接去掉上限，它立刻在第 90 层上报错。同一个测试里钉住具体奖励的断言从两条变三条（第 60、80、90 层）。

### 5.3 称号自动跟随，不需要改代码

`getRealmTitle` 是 `displayName.replace(/期$/, "") + 段位名`。五条新境界的名字都以"期"结尾，所以自动得到真仙初期…道祖圆满共 20 个称号，每 25 级一次（7-9 天），密度回到前期水平。`realmName` 的存档校验是 `isBoundedString(value.realmName, 1, 24)`，三字名远在范围内。

## 6 存档与迁移

只需要版本号，不需要搬数据。

`isProgressSnapshot` 对境界字段只校验形状：`typeof value.realmId === "string"`、`isBoundedString(value.realmName, 1, 24)`，**从不拿 `realmId` 去对 `REALM_CONFIGS`**。而 `refreshSnapshot` 每次载入都从等级重新派生 `realmId` / `realmName` / `stage` / `title` / `requiredExperience` / `totalPower` / `experiencePerSecond`。所以一个停在 Lv.700、`realmId` 写着 `"true_immortal"` 的老档载入后会被静默改写成 `"taiyi"`，不会被拒。

配置版本 `local-2.10.0 → local-2.11.0`，迁移步骤只改版本号：等级不动，经验不动，`required` 每一级都没变所以经验不可能越界，境界字段本来就是派生的。不补发老档"本应经历过"的突破，也不回收它已经花掉的突破丹——一个 Lv.700 的老档会在 Lv.800 遇到它的第一次新突破，需要为此现攒 1,400 枚。这个取舍写进第 8 节。

## 7 展示

没有新增 UI。既有表现自动覆盖：

- 修炼页顶部的境界名与称号来自快照的派生字段。
- `CultivationPresentation` 以 `realmId` 变化触发突破表现，现在会在 Lv.601 / 701 / 801 / 901 各触发一次。
- 突破按钮与突破丹数量的展示读 `breakthroughPillCost`，从 `null` 变成数字后自然出现。
- 排行页、任务链、试炼塔面板都不读境界条数。

## 8 已知取舍

**四次突破不给任何数值奖励。** 这是本次设计最大的一处让步，直说原因：`RealmConfig` 只提供两条数值回报轴，两条的代价都超过奖励本身的价值。

- `powerMultiplier`：终局裸装战力必须留在第 80 层门槛 1.4315e9 以下，否则"塔顶只对装备开放、不对时间开放"这条既定设计就废了。Lv.1000 裸装是 `1000 × 100 × 倍率`，所以倍率的硬上限是 **14,315**，只有 1.43 倍的余量可分给四次突破。而且哪怕只用掉一部分，第 90 层的满配达成等级也会从 Lv.917 提前到 Lv.790 上下，把 `TOWER_TASK_FLOORS` 的排序和整条任务链的顺序一起搅动——那张表的每一行都由测试从战力反推。
- `expMultiplier`：一条 ×1.15 的递增会把终局从 163 天压到 124 天。这是在拿内容长度换突破手感，方向反了。

不付这两笔的理由是：Lv.501 时玩家的战力已经超过历练全部十二关，塔里剩下的两层按设计是装备问题而不是等级问题。所以这四次突破的价值在节奏、称号和突破丹的去处上，不在数字上。这一点必须在文档里写明，避免以后被当成漏配。

**老档不补发已跨过的突破。** 停在 Lv.700 的存档不会追认 Lv.600 那一次，它的第一次新突破在 Lv.800，且要现攒 1,400 枚突破丹。反向的选择（按等级追认并补扣丹药）要么倒扣一个玩家可能已经没有的资源，要么白送一次突破，两者都比"从此刻开始按新表走"更糟。

**2,000 枚要按 20 次批量炼制。** `LOCAL_BATCH_ACTION_CAP` 是 100，五千枚丹总共 51 次点击。这是既有的批量上限，不在本次范围内改；如果终局炼丹的手感成为问题，那是批量上限自己的设计题。

**新境界名沿用常见的仙侠阶位。** 金仙 / 太乙 / 大罗 / 道祖是通用称谓，接在渡劫、真仙之后符合读者预期，没有引入设定包袱。

## 9 测试与验收

`shared` 侧：

- 境界表连续且无缝：逐条断言 `minLevel === 上一条 maxLevel + 1`，第一条从 1 起、最后一条到 `MAX_LEVEL` 止。
- `nextRealmId` 链从 `qi_refining` 走到 `daozu` 恰好经过 14 条，且只有最后一条是 `null`。
- 除最后一条外每条 `breakthroughPillCost` 非空；五条新境界的 `powerMultiplier` / `expRequirementCoefficientBp` / `expMultiplier` 三值相等。
- **逐字节不变**：对 501..1000 每一级断言 `calculateTotalPower`、`requiredExperienceForLevel`、`calculateOnlineExperiencePerSecond`、`calculateSpiritStonePerMinute` 的返回值等于拆分前的值（用当前实现算出的常量表钉住，Lv.501 战力 `"501000000"`、Lv.1000 `"1000000000"` 至少显式列出）。
- `getRealmTitle` 在 Lv.501 / 526 / 551 / 576 / 601 / 900 / 1000 上分别是真仙初期 / 真仙中期 / 真仙后期 / 真仙圆满 / 金仙初期 / 大罗圆满 / 道祖圆满。
- `isRealmMaxLevel` 在 600 / 700 / 800 / 900 为真，在 625 / 875 为假（旧的 125 级段位边界不再是境界边界）。

服务侧：

- Lv.600 修为填满后状态是 `breakthrough_ready`；带足 700 枚突破丹可以 `breakthrough()` 进入金仙期并扣掉 700 枚；丹药不足时抛 `LocalGameError("突破丹不足，需要 700 枚")` 且不扣任何资源。
- Lv.1000 填满仍然是 `version_cap`，而不是 `breakthrough_ready`。
- 老档：`realmId: "true_immortal"`、`level: 700` 能正常载入，载入后 `realmId` 是 `"taiyi"`，且 `totalPower` 与 `requiredExperience` 与改动前一致。
- 迁移：`local-2.10.0` 的档载入后版本变成 `local-2.11.0`，其余字段逐字节相同。

任务链：

- 既有的"从战力反推每一层达成等级"测试必须**在不修改期望值的情况下继续通过**——这是 4.2 的验收标准。
- 第 60 / 80 / 90 层的奖励断言：前两条含一枚突破丹，第 90 层仍然只有经验丹。

## 10 实施顺序

1. `shared/src/config/realms.ts`：`RealmId` 加四个成员，`REALM_CONFIGS` 改末条并追加四条。
2. `shared/src/config/progression-tasks.ts`：突破丹条件改为由 `getRealmConfigForLevel` 推导，删掉 `TOWER_BREAKTHROUGH_PILL_TO_FLOOR`。
3. `pnpm build:shared`，然后 `pnpm typecheck` —— `RealmId` 是联合类型，任何穷举分支会在这里暴露。
4. 新增 `test/realm-split.test.ts` 覆盖第 9 节的 `shared` 侧与老档条目；更新 `test/progression-task-chain.test.ts` 的两条奖励断言。
5. `assets/scripts/services/local-game-snapshot.ts`：`GAME_CONFIG_VERSION` 升到 `local-2.11.0`，加 `GAME_CONFIG_VERSION_PRE_REALM_SPLIT = "local-2.10.0"`。
6. `LocalGameService.ts`：迁移链尾部加一步，只改版本号。
7. `test/local-save-migration.test.ts`：版本字面量整体上移，新增一个 `local-2.10.0` 迁移块。
8. `pnpm test` 全绿。
9. 同步 `docs/game-design-and-technical-spec.md`（境界表、突破丹终身需求、塔奖励规则、配置版本与迁移步骤）与 `README.md`（境界与迁移链）。
10. `pnpm verify:source`、`pnpm verify:release-config`。
