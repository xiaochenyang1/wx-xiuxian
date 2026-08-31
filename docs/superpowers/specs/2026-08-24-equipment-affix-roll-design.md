# 装备词条随机化与高品质出口设计

日期：2026-08-24

## 1. 背景

试炼塔上线后，配装成了后期唯一的推进手段：塔顶第 78–90 层落在真仙境（Lv.501–1000，境界倍率恒为 ×10000）内，等级在带内只线性加，所以这 13 层几乎只由装备推动。实测可通层数（`calculateTotalPower` + `trialFloorRequiredPower`）：

| 等级 | 裸装 | 起步装 | 满配传说 |
| ---: | ---: | ---: | ---: |
| Lv.100 | 22 | 23 | 34 |
| Lv.500 | 66 | 67 | 78 |
| Lv.700 | 75 | 77 | 88 |
| Lv.1000 | 77 | 79 | 90 |

但"刷到一件传说"和"刷到第二件传说"目前完全等价，配装这条唯一的推进线里没有任何决策。

### 1.1 词条是确定性的，而且不可见

`rolledAffixes` 这个名字是假的。`createCraftedEquipment`（`assets/scripts/services/LocalGameService.ts:2232`）里 `affixCount` 与 `affixValueBp` 都是品质的纯函数，词条 `stat` 由槽位下标轮转决定：

| 品质 | 条数 | 每条 `valueBp` |
| --- | ---: | ---: |
| 普通 | 0 | — |
| 优秀 | 1 | 100 |
| 稀有 | 1 | 180 |
| 史诗 | 2 | 250 |
| 传说 | 3 | 350 |

同槽位同品质的两件法宝因此永远逐字节相同。挂机掉落走的又是另一套硬编码逻辑（`LocalGameService.ts:2001`）：优秀固定给 `experience_bonus 100`，普通给空数组——两条产出路径的词条规则不一致。

更彻底的是：`grep rolledAffixes assets/scripts/ui assets/scripts/core` 零命中，词条在 UI 里**完全不可见**。它却不是装饰性的，满配传说的挂机加成里有相当一部分来自词条：

| 加成 | 满配（含词条） | 去掉词条 | 词条占比 |
| --- | ---: | ---: | ---: |
| 每秒修为 | 9,225 bp | 7,125 bp | 22.8% |
| 每分钟灵石 | 5,662 bp | 3,562 bp | 37.1% |
| 掉落效率 | 5,662 bp | 3,562 bp | 37.1% |

### 1.2 神话与洪荒是两档死品质

`ASSET_QUALITY_MULTIPLIER_BP` 给了神话 `120000`、洪荒 `200000`，`EQUIPMENT_SALVAGE_BASE_REWARD` 也配齐了两档分解收益，但 `craftingQualityWeight` 对这两档一律返回 `0`，掉落表也只产出普通与优秀——全项目没有任何产出口。而且 `affixCount` 的三元链没有这两档分支，一旦开放会掉到 0 条词条。

## 2. 目标与非目标

### 目标

1. 让同槽位同品质的法宝不再等价：词条的 `stat` 组合与数值都随机，并给出一个可比较的评分。
2. 让词条可见：法宝页显示每条词条与该件的词条评分。
3. 给词条一个长期消耗口（洗练），把强化石与灵石的后期过剩转成配装收益。
4. 给神话与洪荒一个真实出口（升华），并顺手消掉 `affixCount` 三元链缺分支的隐患。
5. 老存档不丢进度，也不因为新规则被重新 roll。

### 非目标

- **不动战力公式，也不动满配占比。** 词条只喂修为、灵石、掉落三条挂机加成，`powerBonusBp` 完全不读 `rolledAffixes`（`shared/src/domain/loadout.ts:105`）。因此 `LOADOUT_POWER_SCALE_BP = 45_000` 与满配恒定 `87.77%` 这条基线一个字都不用改，`loadout-power-model.test.ts` 的标尺原样保留。
- **不改 `craftingQualityWeight`，不让神话洪荒进抽奖池。** 按现有权重给神话开 `(lv-5)*2` 的口子，炼器室 Lv.10 也只有 0.100% 神话、0.020% 洪荒，配合材料供给约 1.6 次锻造/小时，等于把这两档挂在几千小时的彩票上。改成确定性合成后，炼器与其现有文档、测试完全不动。
- 不新增掉落源，不改试炼塔奖励表。塔已经产强化石与灵石，升华要的是重复法宝，走炼器这条既有管道即可。
- 不做词条锁定洗练（锁 1 条只洗其余），不做"先看结果再决定是否替换"的待确认 roll。两者都要在存档里加待定状态，见第 10 节。
- 不填 `wallet.immortalJade` 与 `activeEffects`，不迁移掉落表，不补美术资产。
- 不改功法。功法没有词条字段，本期不给它加。

## 3. 词条模型

### 3.1 词条集合与条数

`stat` 仍是三种：`experience_bonus`、`spirit_stone_bonus`、`drop_bonus`。**同一件法宝里每种 `stat` 最多出现一次**，存储时按上述固定顺序排列，因此展示不需要再排序，同一份数据也不会有两种等价写法。

条数与数值中心按品质查表，落在 `shared/src/config/assets.ts`：

```ts
export const EQUIPMENT_AFFIX_ROLL: Readonly<
  Record<AssetQuality, { readonly count: number; readonly centerBp: number }>
> = { … };
```

用 `Record<AssetQuality, …>` 而不是三元链：再加一档品质时缺分支是编译错误，而不是静默的 0 条词条。

| 品质 | 条数 | 中心值 | 区间（±40%） |
| --- | ---: | ---: | ---: |
| 普通 | 0 | — | — |
| 优秀 | 1 | 100 | 60 – 140 |
| 稀有 | 1 | 180 | 108 – 252 |
| 史诗 | 2 | 250 | 150 – 350 |
| 传说 | 3 | 350 | 210 – 490 |
| 神话 | 3 | 500 | 300 – 700 |
| 洪荒 | 3 | 700 | 420 – 980 |

前五档中心值与现在的固定值完全一致，所以既有内容的**期望**收益不动，只是有了方差；神话与洪荒沿用同一形状（条数封顶 3，中心值继续走 ×1.4）。条数封顶在 3 是因为 `stat` 只有三种：让神话多出第 4 条只能重复 `stat`，展示与理解成本都变高，收益却和抬高数值区间等价。

### 3.2 roll 规则

```text
count      = EQUIPMENT_AFFIX_ROLL[quality].count
stats      = 从三种 stat 中不重复地随机取 count 种
valueBp    = 每条独立取 [ceil(center*0.6), floor(center*1.4)] 内的均匀随机整数
```

传说及以上 `count = 3`，三种 `stat` 必然全在，方差只体现在数值上；史诗只有 2 条，因此还多一层"缺哪一种"的差异。

### 3.3 词条评分

```text
scoreBp = floor(实际 valueBp 之和 * 10000 / 该品质满 roll 之和)
```

满 roll 之和为 `count * floor(center*1.4)`。普通没有词条，评分定义为 `0` 并在 UI 上显示为"无词条"而不是 0%。评分是纯函数，从 `quality` 与 `rolledAffixes` 现算，**不落盘**：这是唯一能保证它和词条永不脱节的做法，也不用为它加一次迁移。

### 3.4 统一两条产出路径

挂机掉落与炼器共用同一个 `rollEquipmentAffixes(quality, randomInt)`。掉落侧现有的"优秀固定 `experience_bonus 100`"随之消失，改为按优秀档正常 roll；这会让掉落的优秀法宝三种 `stat` 都可能出现，是本期唯一一处既有产出行为的变化，属于目标 1 的一部分。

## 4. 洗练

### 4.1 入口与代价

洗练是法宝页里紧挨强化的第二个养成操作，作用对象与强化一致：行囊内或已装备的法宝可以洗练，收获箱候选不行。普通品质没有词条，洗练直接拒绝并说明原因。

| 资源 | 公式 | 优秀 | 稀有 | 史诗 | 传说 | 神话 | 洪荒 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 强化石 | `ceil(3 * 品质倍率)` | 5 | 8 | 12 | 21 | 36 | 60 |
| 灵石 | `ceil(800 * 品质倍率)` | 1,200 | 2,000 | 3,200 | 5,600 | 9,600 | 16,000 |

品质倍率沿用 `ASSET_QUALITY_MULTIPLIER_BP`，与强化、分解同一套。资源不足时不扣任何东西，按钮仍可点击以给出精确缺口——和强化、洞府升级的既有约定一致。

### 4.2 只留更好的那次

新 roll 的评分**不高于**当前评分时，词条保持不变，资源照样消耗，结果消息同时报出两个评分：

```text
洗练完成：词条评分 68% → 81%
洗练结果 62% 未超过当前 81%，词条保持不变
```

单机放置游戏里这条规则换来三件事：不需要待确认状态，不需要在存档里存一份待定 roll，也不会出现"点一下把一件毕业装洗废"的挫败。代价是词条长期会收敛到满 roll，方差只在获取期起作用——这是有意的取舍，见第 10 节。

### 4.3 事务顺序

洗练走 `LocalGameService.mutate`，因此天然遵循"先结算、再修改、最后整体写入"：已装备法宝的词条变化会先把之前的挂机时间按旧加成结算掉，再由同一次 `refreshSnapshot` 把新加成写进 `progress`。校验顺序为品质有词条 → 强化石 → 灵石 → roll，任一步失败不改变存档。

## 5. 升华

### 5.1 规则

升华把一件传说升为神话、神话升为洪荒，是这两档品质的**唯一**来源。

- 门槛：炼器室 Lv.5 可升神话，Lv.8 可升洪荒。这让洞府炼器室 6–10 级第一次有了除权重微调之外的用途。
- 材料：目标法宝之外，再消耗 **2 件同 `equipmentConfigId`、同品质**的法宝。它们必须在行囊内、未锁定、未装备，升华时被销毁。
- 灵石：`ceil(20000 * 目标品质倍率)`，即神话 240,000、洪荒 400,000。真正的成本是那 2 件重复法宝，灵石只是防止零成本连续升华。
- 结果：`quality` 进一档，`enhanceLevel`、`id`、`location` 与 `equippedSlot` 全部保留（已装备的法宝可以原地升华），`isLocked` 按 `shouldAutoLockEquipment` 强制为 `true`，词条按新品质区间**重新 roll**。

保留强化等级是必须的：品质倍率同时放大基础战力与强化收益，让升华清零强化等于让玩家在"升品质"和"留强化"之间二选一，而这条路本来就已经很长了。

### 5.2 为什么是确定性合成而不是抽奖

按材料供给估算（满配掉落加成下约 66 个材料/小时，`forge_weapon` 需 8 木材 + 6 矿石，材料在五类间大致均匀）：

| 量 | 估算 |
| --- | ---: |
| 锻造次数 | 约 1.6 次/小时 |
| 传说产出（炼器室 Lv.10，0.599%） | 约 1 件/104 小时 |
| 一件神话（3 件传说） | 约 13 天连续在线 |
| 一件洪荒（3 件神话） | 约 39 天以上 |

这些是按上述假设推出的估算，不是实测值；写进来是为了让"升华到底有多远"这件事可被后续实测校正。同样的供给下，把神话做成 0.100% 的抽奖意味着约 625 小时才出一件，而且完全不可规划。确定性合成把同一段时长变成一条看得见的进度，也让"仓库里第三件重复传说"从纯分解材料变成目标的一部分。

### 5.3 对塔顶的连带影响

满配从传说换成神话、洪荒后（六件 +20、四本 10 星功法、炼器室 Lv.10）：

| 满配品质 | 配装战力加成 | Lv.500 | Lv.700 | Lv.1000 |
| --- | ---: | ---: | ---: | ---: |
| 传说 | 69,774 bp | 78 层 | 88 层 | 90 层 |
| 神话 | 100,151 bp | 80 层 | 90 层 | 90 层 |
| 洪荒 | 148,751 bp | 83 层 | 90 层 | 90 层 |

塔顶因此从"Lv.1000 且满配传说刚好够"变成"Lv.700 配神话可以封顶"。这是本期有意的结果：按既有节奏表 Lv.1000 要 258 天，把第 90 层挂在等级上限上等于让它永远是装饰。

## 6. 模块边界

| 位置 | 内容 |
| --- | --- |
| `shared/src/config/assets.ts` | `EQUIPMENT_AFFIX_ROLL` 表、`equipmentAffixRange(quality)` |
| `shared/src/domain/loadout.ts` | `rollEquipmentAffixes(quality, randomInt)`、`equipmentAffixScoreBp(quality, affixes)`、`AffixStat` 与 `RolledAffix` 类型 |
| `shared/src/config/asset-upgrades.ts` | `equipmentRerollCost(quality)`、`equipmentAscendCost(quality)`、`nextAssetQuality(quality)` |
| `LocalGameService` | `rerollEquipmentAffixes(equipmentId)`、`ascendEquipment(equipmentId)`，以及掉落与炼器改调 `rollEquipmentAffixes` |
| `assets/scripts/core/AssetUpgradeDisplay.ts` | `getEquipmentRerollDisplay`、`getEquipmentAscendDisplay`、词条行与评分文案 |
| `assets/scripts/ui/panels/EquipmentPanel.ts` | 词条行、评分、洗练与升华按钮 |
| `assets/scripts/ui/panels/InventoryPanel.ts` | 收获箱候选行追加词条评分（`InventoryPanel.ts:286` 的候选列表） |

数值全部落在 `shared/`，`LocalGameService` 只做事务与校验——与洞府、试炼塔同一条边界。

### 6.1 随机数接缝

`rollEquipmentAffixes` 接一个 `randomInt(maxExclusive)` 参数，服务层继续传现成的 `randomInteger`。**不新增 seed 参数**：炼器的品质 roll 已经用不可注入的 `randomInteger`，现有测试通过 `vi.spyOn(Math, "random")` 拿到确定性（`test/alchemy-crafting.test.ts:302`），洗练与升华沿用同一手法就够了。挂机掉落那条路径本来就有 `createSeededRandomInteger`，改调之后种子照旧生效。

## 7. 存档与迁移

### 7.1 契约与校验

`BootstrapSnapshot.equipment[].rolledAffixes` 从 `unknown` 收紧为具名数组（`shared/src/contracts/bootstrap.ts:75`），`stat` 在契约层仍是 `string`，narrow 在 domain 侧做——与 `quality`、`slot` 等既有字段保持同一风格。`loadout.ts` 里那个防御性的 `parseAffixes` 因此可以退成一次类型断言，但本期保留它：载入校验之外还有一层不信任输入的防线不亏。

`isRolledAffixes` 收紧为：

- 数组长度 `0..3`（原为 `0..16`）
- `stat` 三选一，且**同一件内不重复**（新增）
- `valueBp` 为 `0..1,000,000` 的整数（不变）

刻意**不**按品质区间校验数值：那会让校验依赖数值表，往后任何一次区间调整都会把老存档判成损坏。区间只约束新 roll，不约束已经存在的词条。

### 7.2 迁移 `local-2.5.0 → local-2.6.0`

迁移体只做版本号推进，不改写任何词条。理由是现有数据全部满足新校验：

| 来源 | 现状 | 是否合法 |
| --- | --- | --- |
| 炼器：传说 / 史诗 / 稀有 / 优秀 | 3 / 2 / 1 / 1 条，`stat` 按槽位轮转所以互不重复 | 是 |
| 掉落：优秀 | 1 条 `experience_bonus` | 是 |
| 掉落 / 炼器：普通 | 空数组 | 是 |

老装备的固定值恰好是新区间的中心，读起来就是一次普通的 roll。**不重新 roll 老装备**：那会在读档瞬间静默改掉已装备法宝的挂机加成，而玩家没有做任何操作。

`DROP_CONFIG_VERSION` 保持 `local-idle-drop-v1`。法宝的字段形状没变，动它等于把每件法宝判成过期，收益为零。

## 8. 展示

### 8.1 词条行

法宝页每张法宝卡在战力行之后插入词条区，用已有的 `formatBasisPoints` 与 `QUALITY_NAMES`（`assets/scripts/ui/primitives/Format.ts:19`）：

```text
词条 81%
  修为 +4.20%   灵石 +3.85%   掉落 +3.86%
```

上例是一件传说：三条 `valueBp` 为 `420 / 385 / 386`，满 roll 之和为 `3 × 490 = 1470`，所以 `scoreBp = floor(1191 * 10000 / 1470) = 8102`。

- 评分按 `floor(scoreBp / 100)` 显示为整数百分比；词条数值用 `formatBasisPoints` 显示两位小数，与其他基点文案一致。
- 顺序按 `rolledAffixes` 的存储顺序，不在 UI 里再排一次（见 3.1）。
- 普通品质显示单行"无词条"，不显示 `0%`——评分 0% 和"这档没有词条"是两件事。
- 收获箱候选在行囊页（`InventoryPanel.ts`）的候选行里**只追加一个评分**，不铺开三条词条：那是一行紧凑列表，塞不进三段数值。评分足够回答"这件值不值得占一个格子"，明细在收入行囊后的法宝页看。

### 8.2 洗练与升华按钮

两个操作复用 `AssetUpgradeDisplay` 那套形状（`maxed` / `affordable` / `costText` / `actionText` / `actionEnabled`），因此按钮的可点与缺口行为和强化完全一致：

| 情况 | `actionText` | `costText` | `actionEnabled` |
| --- | --- | --- | --- |
| 洗练可行 | `洗练` | `强化石 12/12\n灵石 3,200` | 是 |
| 洗练资源不足 | `洗练` | 同上（自有量低于需求） | 是（点击后报缺口） |
| 普通品质 | `无词条` | `普通品质没有词条` | 否 |
| 升华可行 | `升华` | `传说 x2\n灵石 240,000` | 是 |
| 炼器室不足 | `升华` | `需要炼器室 Lv.5` | 否 |
| 传说以下 / 洪荒 | `升华` | `仅传说与神话可升华` / `已是最高品质` | 否 |

`affordable` 只决定按钮配色，不决定能否点击——与强化、洞府升级一致：点得动、但点了给精确缺口，比一个灰掉且不解释原因的按钮更有用。炼器室等级与品质档位这类**不可能靠攒资源解决**的前置条件才禁用按钮。

## 9. 测试与验收

### 9.1 新增测试

| 文件 | 覆盖 |
| --- | --- |
| `test/equipment-affix-roll.test.ts` | `EQUIPMENT_AFFIX_ROLL` 七档齐全；每档 roll 的条数、`stat` 不重复、数值落在 `[ceil(c*0.6), floor(c*1.4)]`；普通恒为空数组；评分在满 roll 时为 `10000`、最低 roll 时的确切值、普通为 `0`；给定 `randomInt` 序列时 roll 完全确定 |
| `test/equipment-reroll.test.ts` | 费用表六档；扣费与词条同时生效；新评分更低时词条不变而资源照扣；资源不足时快照逐字节不变；普通品质与收获箱候选被拒；已装备法宝洗练后 `progress.experiencePerSecond` 立即变化；重载后词条一致 |
| `test/equipment-ascend.test.ts` | 炼器室 Lv.4 拒绝、Lv.5 通过；消耗恰好 2 件同 id 同品质并保留第 3 件；已锁定 / 已装备 / 收获箱内的法宝不被当作材料；`enhanceLevel`、`id`、`equippedSlot` 保留且 `isLocked` 为真；词条按新品质区间重 roll；材料或灵石不足时报精确缺口且不改存档；洪荒不可再升 |

`test/asset-upgrade-display.test.ts` 补两个操作的展示分支。既有测试里**没有任何一条断言现有词条数值**：`grep -rn rolledAffixes test/` 的 14 处命中全是构造夹具时写的 `[]`。因此把掉落与炼器改成随机 roll 不会改写任何既有断言，只需要新增覆盖。

### 9.2 回归面

| 已有测试 | 期望 |
| --- | --- |
| `test/loadout-power-model.test.ts` | 一个字不改。满配传说仍是 `69,774 bp`，`LOADOUT_POWER_SCALE_BP` 仍是 `45_000`（词条不进战力，见第 2 节非目标） |
| `test/alchemy-crafting.test.ts` | 品质权重与批量逻辑不变；本身不断言词条，所以随机化后无需改动 |
| `test/local-save-migration.test.ts` | 新增 `local-2.5.0 → local-2.6.0` 用例：老档词条**逐字节不变**，版本号推进；`local-1.0.0` 仍能一次性迁到 `local-2.6.0` |
| `test/local-save-validation.test.ts` | 4 条词条、重复 `stat`、非整数 `valueBp` 均判损坏；3 条不重复的合法 |
| `test/save-round-trip-audit.test.ts` | 洗练与升华后的存档能原样读回 |
| `test/trial-tower.test.ts` | 门槛与奖励不动。塔顶可达层数的变化是配装侧的结果，不写进塔的测试 |

### 9.3 验收基线

`pnpm typecheck`、`pnpm test`、`pnpm verify:source`、`pnpm verify:release-config` 全绿，随后 `pnpm build:candidate` + `pnpm verify:candidate`（微信候选包会因为新 commit 失效，必须重建）。浏览器侧手动验收三条：洗练一件已装备法宝后每秒修为立刻变化且刷新不回退；升华消耗的 2 件重复法宝从行囊消失、强化等级仍在；旧档载入后词条与升级前完全一致。

## 10. 已知取舍

**词条长期会收敛到满 roll。** 洗练"只留更好的那次"意味着强化石与灵石足够时，任何一件法宝的评分都会单调爬向 100%，方差只在获取期起作用。这是刻意选的：替代方案是让洗练可能变差，那需要在存档里存一份待定 roll 并加一个确认态，而单机放置游戏里"点错一下毁掉毕业装"的挫败远大于它换来的紧张感。收敛速度由资源约束——洪荒一次洗练 60 强化石，塔的强化石产出是 `1 + floor(n/2)`，所以后期洗练是一条持续消耗，不是一次性动作。

**史诗是唯一有"缺哪一种"差异的档位。** 传说及以上三条 `stat` 必然齐全，比较只剩数值；这让高端配装的决策比中端更简单。可以接受：高端的决策压力已经由升华的材料取舍承担了。

**升华没有失败率，也没有保底以外的随机。** 3 件传说换 1 件神话是确定的，玩家可以按小时算出目标距离。代价是这条线没有惊喜，靠的是词条重 roll 提供的方差。

**不做的：** 词条锁定洗练（锁 1 条只洗其余）、先看结果再决定是否替换的待确认 roll、第 4 条词条、词条进战力公式、神话洪荒进炼器抽奖池。前两条都要在存档里加待定状态，第三条要么重复 `stat` 要么扩充 `stat` 集合，后两条会动已经校准好的战力基线与炼器文档。

## 11. 实施顺序

| 步骤 | 内容 | 可否独立成 commit |
| --- | --- | --- |
| 1 | `shared`：`EQUIPMENT_AFFIX_ROLL`、`rollEquipmentAffixes`、`equipmentAffixScoreBp`、费用与 `nextAssetQuality`，配套 shared 测试 | 是 |
| 2 | 掉落与炼器改调 `rollEquipmentAffixes`；契约收紧、校验收紧、`local-2.6.0` 迁移 | 否，与 3 同一次版本跳 |
| 3 | `rerollEquipmentAffixes`、`ascendEquipment` 两个事务与服务测试 | 否，与 2 一起 |
| 4 | 展示模型与法宝页 UI | 是 |
| 5 | 同步 `README.md` 与 `docs/game-design-and-technical-spec.md`（配置版本 `local-2.6.0`、迁移第 9 条、§2.6 的词条与洗练升华规则、§2.10 炼器的词条描述改为随机区间） | 是 |

第 2 步单独落地会让掉落产出新形状的词条却没有对应的校验/迁移，所以 2 与 3 必须同一次提交；其余三步各自成 commit。
