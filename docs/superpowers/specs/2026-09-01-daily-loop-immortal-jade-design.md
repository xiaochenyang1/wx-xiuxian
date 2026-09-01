# 每日循环与仙玉设计

- 日期:2026-09-01
- 状态:待评审
- 相关:`docs/superpowers/specs/2026-09-01-treasure-hunt-band-progression-design.md`(段位化链的最后一份)、`docs/superpowers/specs/2026-08-26-material-income-curve-design.md`(材料日收入的 30% 口径)、`docs/superpowers/specs/2026-08-26-enhance-stone-income-curve-design.md`(强化石"挂机一半、扫荡一半")、`docs/game-design-and-technical-spec.md`

## 1. 背景

### 1.1 段位化链闭合之后,游戏里没有一处按天节流

七份设计把每一张四段同价的表都改完了:装备与词条、功法、挂机材料、强化石、历练扫荡、洞府/宗门/道侣、炼丹、寻宝。数值骨架自此闭合——每一种产出都随段位长,每一份开销都有对应的收入。

但把 `每日`、`daily`、`签到`、`checkIn` 四个词在 `shared/src` 与 `assets/scripts` 里搜一遍,结果是空的。这不是漏了一个功能,而是**整套玩法没有"一天"这个单位**:

| 系统 | 什么时候能做 | 有没有每日上限 |
| --- | --- | --- |
| 挂机结算 | 随时 | 无(只有 24 小时离线上限) |
| 历练首通/扫荡 | 有寻宝令就能做 | 无 |
| 寻宝 | 有寻宝令就能做 | 无 |
| 试炼塔 | 战力够就能爬 | 无 |
| 炼丹/炼器 | 有材料就能做 | 无 |
| 洞府/宗门/道侣 | 有资源就能升 | 无 |
| 强化/洗练/晋阶 | 有强化石就能做 | 无 |
| 悟道 | 有修为存量就能点 | 无 |

十一个系统,零个按天。玩家把手上资源花完之后,唯一能做的事是等资源自己长出来——而资源长出来靠的是挂机,挂机不需要人在。**于是这个游戏没有任何一处在说"明天再来一趟"。**

### 1.2 唯一与时间挂钩的机制说的是"别离开太久",不是"每天回来"

`CLIENT_CONFIG` 里只有两个与时间有关的数:

```ts
offlineEfficiencyBp: 7_000,   // 离线按 70% 结算
maxOfflineSeconds: 86_400,    // 一次最多补 24 小时
```

这两个数刻画的是惩罚,不是激励。离开 24 小时以内,拿到 70%;离开更久,超出的部分整段丢掉。它给玩家的指令是"别断超过一天",而一个每天准时回来一次的玩家,和一个隔 23 小时回来一次的玩家,拿到的东西完全一样——**回来这个动作本身不产生任何收益**,它只是避免损失。

收获箱也不构成每日压力:容量 100,装备掉落 `4,000/1,000,000` 每分钟、功法 `1,200/1,000,000`,合计 7.5 件/天,13 天才装满。

### 1.3 仙玉是一个从上线起既无产出也无出口的字段

`wallet.immortalJade` 全仓库只有四处引用,没有一处是产出或消耗:

| 位置 | 用途 |
| --- | --- |
| `shared/src/contracts/bootstrap.ts:42` | 契约里的字段声明 |
| `assets/scripts/services/local-game-snapshot.ts:98` | 初始存档写 `"0"` |
| `assets/scripts/services/LocalGameService.ts:3521` | 存档校验它是十进制串 |
| `test/local-save-validation.test.ts:466` | 校验那一条的测试 |

面板不显示它,没有任何 mutation 加它或减它。它是这版唯一一个"占着契约但什么都不做"的字段,处理它只有两条路:删掉(要一次带字段删除的迁移),或者给它一个角色。本文选后者——**因为一个不进任何供给表的第二货币,正好是每日循环缺的那件东西**,理由见 §3.2。

### 1.4 收入口径

沿用本链一贯的四段挂机小时数 52 / 206 / 761 / 5,189,以及每分钟一次掉落尝试:

| 段位 | 日灵石(每级 1/分钟) | 日材料 | 日强化石 | 日寻宝令 |
| --- | --- | --- | --- | --- |
| 凡阶 Lv.15 | 21,600 | 1,008 | 14.4 | 1.44 |
| 凡阶 Lv.60 | 86,400 | 1,008 | 14.4 | 1.44 |
| 灵阶 Lv.61 | 87,840 | 3,024 | 43.2 | 1.44 |
| 玄阶 Lv.151 | 217,440 | 6,048 | 86.4 | 1.44 |
| 天阶 Lv.301 | 433,440 | 10,080 | 144 | 1.44 |

寻宝令那一列四段全是 1.44,是本链刻意留下的冻结项(`expedition-band-extension` §1.2),下文 §3.2 会用到这一点。

## 2. 目标与非目标

目标:

1. 让"今天回来过一趟"这件事本身产生收益,且收益有明确上限——判据见 §3.1。
2. 给 `wallet.immortalJade` 一个产出口和一个消耗口,使它不再是死字段。
3. 不重算前七份设计里的任何一张供给表。

非目标:

1. 不做体力/次数限制。现有系统一个都不改成"每日 N 次",本文只**新增**一层,不给旧玩法加闸。
2. 不做连续签到递增奖励,理由见 §3.4。
3. 不做月卡、礼包、付费入口。这版仍是纯前端单机。
4. 不补离线在灵石和掉落上的损失,只补经验,理由见 §3.3。

## 3. 承重推导

### 3.1 判据:一天的仙玉恰好补齐 24 小时离线在经验轴上损失的那 30%

一个每天回来一次的玩家,离线那 24 小时按 70% 结算,拿到 16.8 小时的等效在线量,损失 7.2 小时。这 7.2 小时是**现成的、已经在配置里的、不需要新定一个数**的缺口,本文把它当成每日循环的全部预算:

> 一天能领到的仙玉全部换成经验丹,折算出的模拟在线时长,恰好等于 24 小时离线在经验轴上损失的那 30%。

写成可断言的等式:

```
DAILY_IMMORTAL_JADE_TOTAL × IMMORTAL_JADE_MINUTES_PER_UNIT × 60
  === maxOfflineSeconds × (10_000 − offlineEfficiencyBp) / 10_000
```

取 `IMMORTAL_JADE_MINUTES_PER_UNIT = 6`(一枚仙玉 = 6 分钟满效率在线),则每日总额固定为:

```
86_400 × 0.3 / 60 / 6 = 72 枚
```

判据挑这个而不是"每天送 X 灵石"的好处有三个:

1. **上限自带,不用另立**。补满就是补满,再多一枚就越过 100%,所以"日常该发多少"不是一个可以随手加码的旋钮。
2. **两个端点都在配置里**。`offlineEfficiencyBp` 与 `maxOfflineSeconds` 一动,判据两边一起动,测试会立刻指出 72 这个数过时了。
3. **每日性是推导出来的,不是规定的**。离线损失按天累积,所以补偿也按天发;隔三天回来一次的玩家损失 `72 − 16.8 = 55.2` 小时,而日常只补今天这一份——它奖励"每天来",而不是"总共来过"。

### 3.2 为什么出口只能是时间,不能是物资

链条闭合的代价是经济里没有空位了。每一种物资都已经被某份设计的供给表算过一遍:

| 物资 | 谁算过它 | 加一个新来源会怎样 |
| --- | --- | --- |
| 寻宝令 | 全链冻结在 1.44/天,终身 493 枚 | 扫荡与寻宝两张表的段内账全部重算 |
| 强化石 | `enhance-stone-income-curve`:挂机一半、扫荡一半 | 组成比变成三份,那份设计的结论失效 |
| 五种材料 | `material-income-curve`:开销不超过日收入的 30% | 分母变大,30% 这个口径要重新校 |
| 突破丹 | 终身硬上限 6,077 枚,由境界表推出 | 绕过炼丹配方,材料在中期就不再是瓶颈 |
| 功法残页 | 终身有限成本,按段位掉落 | 传承节奏被打乱 |
| 灵石 | 无上限,但它是炼丹/炼器/宗门三处定价的基准 | 定价基准漂移 |

只有一件东西不进任何一张表:**经验丹**。它的作用是 `simulateOnlineExperience`——把未来的挂机时间提前领,物资总量一位不变,掉落次数一次不增。它是这个经济里唯一一个"给了也不欠账"的出口,所以仙玉的出口只能是它。

反过来说,这也解释了为什么仙玉必须是第二货币而不是直接发灵石:灵石有六个花处,一旦日常开始发灵石,它就同时是这六处的补贴;仙玉只有经验丹一个花处,发多少就是多少小时,不会渗到别处。

### 3.3 为什么只补经验轴

离线损失的 30% 里,经验、灵石、掉落三样都在。本文只补经验,另外两样保持 70%。

理由是 §3.2 那张表:补掉落等于加物资,直接撞上五张供给表;补灵石虽然没有上限表可撞,但灵石是三处定价的基准,补它等于给这三处同时打折。经验是三样里唯一不影响任何一张表的——多几小时经验只会让玩家早几天进入下一段位,而"段位靠时间到达"本来就是本链的前提。

代价写在明处:一个每天准时回来的玩家,在经验上等于满效率,在灵石和掉落上仍然是 70%。这不是遗漏,是判据只锚一条轴的必然结果,取舍见 §11.1。

### 3.4 为什么不做连续签到递增

连续签到是这类玩法的标配,但它和 §3.1 直接冲突:递增意味着某些天会超过 7.2 小时的预算,而 7.2 小时是"补到 100%"的上界,越过它就是在给挂机加速而不是补偿损耗。要么放弃判据,要么把递增做成"前几天低于均值、后几天回到均值",后者只是把同一笔钱换个顺序发,徒增一个状态字段。

累计签到天数仍然记录并显示——它不改变任何发放量,只是一个玩家看得见的长期反馈。

### 3.5 五条日常为什么是这五条

约束只有一条,但它很硬:**每一条都必须是每天必然可完成的**。判据说"一天能领到 72 枚",如果某天有一条领不到,那天就补不满 30%,判据从一个等式退化成一个上界。

按这条筛,大多数系统都出局:

| 候选 | 为什么不行 |
| --- | --- |
| 试炼塔挑战 1 次 | `challengeTrialTower` 对已过的层抛"奖励不可重复领取",对战力不够的层抛"战力不足"。爬到卡层之后**每天都做不了** |
| 寻宝或扫荡 1 次 | 每天要吃掉 1 枚寻宝令,而供给是 1.44 枚/天。净收入掉到 0.44,终身 493 枚的账当场作废 |
| 强化装备 1 次 | 单次强化石成本随等级上涨且无上限,后期会超过日收入 |
| 升级功法 1 次 | 满星之后做不了 |
| 洞府/宗门/道侣升级 1 次 | 三者都有 `10 × 段位` 的上限,段内升满就做不了 |
| 使用经验丹 1 次 | 突破瓶颈状态下 `useExperienceItems` 直接拒绝 |

剩下能过筛的只有四类:挂机结算(被动,必然)、炼丹(材料充足)、炼器(材料充足)、处理收获(掉落 7.5 件/天)。为了凑到五条并且让"回来"这件事有两个不同的时间尺度,挂机拆成 1 小时和 6 小时两档——6 小时这一档与经验丹(大)的 `durationSeconds` 同长,是刻意的呼应。

解锁等级取 **Lv.15**,与 `TRIAL_TOWER_UNLOCK_LEVEL` 对齐。选它不是因为日常用到塔(恰恰相反),而是因为 Lv.15 是"炼丹、炼器、洞府都已开、系统基本齐全"的第一个点,再早日常里会有玩家点不开的按钮。

## 4. 配置族改动

### 4.1 `shared/src/config/daily.ts`(新)

```ts
export const DAILY_LOOP_UNLOCK_LEVEL = 15;
/** 一枚仙玉折算多少分钟满效率在线。判据的换算常数,见 §3.1。 */
export const IMMORTAL_JADE_MINUTES_PER_UNIT = 6;
export const DAILY_CHECK_IN_JADE = 12;
export const DAILY_TASK_JADE = 12;

export type DailyTaskUnit = "second" | "count";
export type DailyTaskKind =
  | "idle_seconds"
  | "alchemy_brew"
  | "crafting_forge"
  | "harvest_handled";

export interface DailyTaskConfig {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: DailyTaskKind;
  readonly target: number;
  readonly unit: DailyTaskUnit;
  readonly jade: number;
}

export const DAILY_TASK_CONFIGS: readonly DailyTaskConfig[] = [ /* 五条,见 §5 */ ];
export const DAILY_IMMORTAL_JADE_TOTAL: number; // 由上表求和,不是手写常数

export interface ImmortalJadeShopRow {
  readonly id: string;
  readonly itemConfigId: string;
  readonly quantity: number;
  readonly jadeCost: number;
  /** 是否参与 §3.1 的时间判据。改名卡为 false。 */
  readonly countsTowardTimeBudget: boolean;
}
export const IMMORTAL_JADE_SHOP_ROWS: readonly ImmortalJadeShopRow[] = [ /* 三行,见 §6 */ ];

export function getDailyTaskConfig(id: string): DailyTaskConfig;   // 未知 id 抛 RangeError
export function getImmortalJadeShopRow(id: string): ImmortalJadeShopRow;
```

两条 `idle_seconds` 共用一个 `kind`,靠 `target` 区分(3,600 与 21,600)。这一点是刻意的:进度只打一次点,两条任务读同一个计数器,所以"挂机 6 小时"完成时"挂机 1 小时"必然也完成,不会出现两条挂机任务进度不一致的状态。

### 4.2 本地日序号

```ts
/**
 * 玩家所在时区的日历日序号。用本地日而不是 UTC 日,是因为"每天"对玩家的意思是
 * 他自己的午夜;用序号而不是日期串,是因为跨日判定只需要一次整数比较。
 */
export function localDayIndex(at: Date): number {
  return Math.floor((at.getTime() - at.getTimezoneOffset() * 60_000) / 86_400_000);
}
```

刷新点取本地 0 点,不做 4/5 点偏移。偏移能照顾熬夜玩家,代价是"今天"和日历不一致,而这版没有任何跨玩家的同步需求,不值得为它引入一个解释成本。

### 4.3 `shared/src/index.ts`

`export * from "./config/daily"` 与 `export * from "./domain/daily"` 两行。前七份里 `treasure.ts` 之所以不用改 index,是因为它已经在桶里;这两个文件是新的,必须显式加。

### 4.4 `shared/src/domain/daily.ts`(新)

纯函数,不碰存档结构以外的东西:

```ts
export interface DailyTaskState { taskConfigId: string; progress: string; claimedAt: string | null }
export interface DailyState { dayIndex: number; checkedInAt: string | null; checkInCount: number; tasks: DailyTaskState[] }

/** 跨日则整块重置并把签到天数留下;同日原样返回(引用相等)。 */
export function rollDailyState(state: DailyState, dayIndex: number): DailyState;
export function isDailyTaskComplete(config: DailyTaskConfig, progress: string): boolean;
/** 待处理数:未签到算 1,加上已完成未领的条数。徽章与面板读同一个函数。 */
export function countPendingDailyRewards(state: DailyState): number;
export function addDailyProgress(state: DailyState, kind: DailyTaskKind, amount: number): DailyState;
```

## 5. 仙玉产出表

| 来源 | 目标 | 仙玉 | 折算满效率在线 | 占 24 小时 |
| --- | --- | --- | --- | --- |
| 每日签到 | — | 12 | 1.2 小时 | 5% |
| `daily.idle_hour` 今日挂机满 1 小时 | 3,600 秒 | 12 | 1.2 小时 | 5% |
| `daily.idle_six_hours` 今日挂机满 6 小时 | 21,600 秒 | 12 | 1.2 小时 | 5% |
| `daily.alchemy` 炼丹 1 次 | 1 次 | 12 | 1.2 小时 | 5% |
| `daily.crafting` 炼器 1 次 | 1 次 | 12 | 1.2 小时 | 5% |
| `daily.harvest` 处理收获 1 件 | 1 件 | 12 | 1.2 小时 | 5% |
| **合计** | | **72** | **7.2 小时** | **30%** |

"处理收获"记的是转移入库、单件分解、批量收取、批量分解四个入口的任意一次,每处理一件算一件——`collectAllHarvest` 一次收 5 件就记 5。

一个只签到的玩家拿 12 枚(1.2 小时),全做完拿 72 枚(7.2 小时)。每天回来一次的玩家,第一次结算就会因为跨了 24 小时而同时完成两条挂机任务,拿到 24 枚,剩下 36 枚要主动点三下。

## 6. 兑换表

| 商品 | 仙玉 | 折算 | `countsTowardTimeBudget` |
| --- | --- | --- | --- |
| 经验丹(小) ×1 | 10 | 1 小时 | ✓ |
| 经验丹(大) ×1 | 60 | 6 小时 | ✓ |
| 改名卡 ×1 | 300 | — | ✗ |

前两行的价格由 `IMMORTAL_JADE_MINUTES_PER_UNIT` 与各自的 `useEffect.durationSeconds` 反算,不是手写:小丹 `3,600 / 60 / 6 = 10`,大丹 `21,600 / 60 / 6 = 60`。测试直接从 `getItemConfig` 读时长再算一遍,所以改丹的时长会立刻暴露价格过时。

改名卡是唯一一个不换时间的出口,定价 300 枚 ≈ 4.17 天的全部仙玉。它不参与判据(玩家把仙玉花在这里就是自愿放弃那部分时间补偿),留着它的理由是仙玉总要有第二个花处,而改名是全仓库唯一一件既不进供给表也不影响战力的东西。

## 7. 每日开销核算

主动那三条要花钱:炼丹取最便宜的小经验丹,炼器取最便宜的锻造兵器,处理收获免费。

| 段位 | 炼丹 | 炼器 | 合计灵石 | 占日灵石 | 合计材料 | 占日材料 |
| --- | --- | --- | --- | --- | --- | --- |
| 凡阶 Lv.15 | 300 + 6 材 | 1,200 + 14 材 | 1,500 | 6.9% | 20 | 2.0% |
| 凡阶 Lv.60 | 300 + 6 材 | 1,200 + 14 材 | 1,500 | 1.7% | 20 | 2.0% |
| 灵阶 Lv.61 | 1,200 + 18 材 | 4,800 + 14 材 | 6,000 | 6.8% | 32 | 1.1% |
| 玄阶 Lv.151 | 3,600 + 36 材 | 14,400 + 14 材 | 18,000 | 8.3% | 50 | 0.8% |
| 天阶 Lv.301 | 9,000 + 60 材 | 36,000 + 14 材 | 45,000 | 10.4% | 74 | 0.7% |

灵石那一列跟着 `ALCHEMY_BAND_SPIRIT_STONE_MULTIPLIER` 和 `CRAFTING_BAND_SPIRIT_STONE_MULTIPLIER`(两张都是 ×1/×4/×12/×30)走,材料只有炼丹那 6 个跟段位(`materialScalesWithBand: true`),炼器的 14 个不跟。

每一段取的都是**段内首级**,也就是最坏情况;段内升级会把占比继续压下去(凡阶那两行 6.9% → 1.7% 就是这个效果)。灵石占比稳定在 7–10%,材料一路低于 2%,两条都远离 `material-income-curve` 那份 30% 的口径,所以这三条日常不需要给任何供给表让路。

## 8. 存档与迁移

`BootstrapSnapshot` 新增一块:

```ts
daily: {
  /** 当前进度归属的本地日序号。`-1` 表示这份存档还没刷新过。 */
  dayIndex: number;
  checkedInAt: string | null;
  checkInCount: number;
  tasks: Array<{ taskConfigId: string; progress: BigNumberString; claimedAt: string | null }>;
}
```

没有 `completedAt`:日常一天就清,完成时刻不承载任何跨会话信息,能从 `progress` 与 `target` 推出来。这一点与 `progressionTasks` 不同,那边的完成时刻要跨会话保留。

版本 `local-2.16.0` → `local-2.17.0`,`GAME_CONFIG_VERSION_PRE_DAILY_LOOP = "local-2.16.0"`。

**这一步是带字段的真迁移,不是前七份里那种只改版本号的链接**。旧存档补:

```ts
daily: { dayIndex: -1, checkedInAt: null, checkInCount: 0, tasks: [] }
```

`dayIndex: -1` 是哨兵:任何真实日序号(2026 年在 20,700 附近)都大于它,所以迁移之后第一次结算必然触发 §9.1 的跨日重置,把 `tasks` 建成当天的空进度。**迁移因此不需要知道"今天是几号"**,这是选序号而不是选日期串的第二个好处。

存档校验(`LocalGameService` 里那一族 `isRecord` 检查)要同步加:`dayIndex` 是整数、`checkInCount` 是非负整数、`checkedInAt` 是 `null` 或字符串、`tasks` 每项的 `progress` 是十进制串。校验不通过的存档按既有规则整份丢弃。

## 9. 服务层

### 9.1 跨日重置的时机

重置发生在 `settleTo` 累加进度**之前**,按 `now` 的本地日序号判定:

```
settleTo(now):
  1. rollDailyState(daily, localDayIndex(now))   // 跨日则清空
  2. 结算这段时长,把秒数加到 idle_seconds 计数器
```

于是跨日的那一段挂机时长整段记入新的一天。一个三天没登录的玩家回来时结算 24 小时(离线上限),这 24 小时全部算作"今天挂的",两条挂机任务立刻完成——他确实挂了那么久,这个读法对玩家有利,也不需要把一次结算按日界切成两段。

`mutate` 已经在每次操作前调 `settleTo(new Date(), ...)`,所以每一个玩家动作都自带一次跨日检查,不需要额外的定时器。

### 9.2 新增 mutation

| 方法 | 拒绝条件 |
| --- | --- |
| `checkInDaily()` | 等级不到 `DAILY_LOOP_UNLOCK_LEVEL`;今天已签到 |
| `claimDailyTask(taskConfigId)` | 未解锁;未知 id;进度未达标;今天已领 |
| `exchangeImmortalJade(rowId)` | 未解锁;未知 id;仙玉不足;行囊放不下 |

三个都走 `mutate`,所以都自带结算与跨日检查。领取只加 `wallet.immortalJade`,不占背包格子;兑换按 `hasStackOutputCapacity` 那套规则检查空间,放不下就整笔拒绝(与试炼塔"满包不吞奖励"的既有行为一致)。

### 9.3 打点位置

`idle_seconds` 在 `settleElapsed` 里按 `Math.floor(elapsedMilliseconds / 1000)` 累加,余数不留——一次结算最多丢 1 秒,而自动保存是 30 秒一次,相对 3,600 秒的门槛可以忽略。其余三个 kind 各在对应 mutation 成功返回前打点:

| kind | 打点处 |
| --- | --- |
| `alchemy_brew` | `brewAlchemy` / `brewAlchemyBatch`(按实际炉数计) |
| `crafting_forge` | `craftEquipment` / `craftEquipmentBatch`(按实际件数计) |
| `harvest_handled` | `transferHarvest`、`salvageHarvest`、`collectAllHarvest`、`salvageLowQualityHarvest`(按实际件数计) |

批量入口按件数而不是按"一次"计,是为了让批量操作不比单件操作吃亏。

## 10. 展示与入口

### 10.1 入口

修炼页左栏第三格。`CULTIVATION_SHORTCUTS` 现有两格在 y=255 / 150,间距 105,所以第三格落在 **y=45**:

```ts
{ label: "日常", feature: "daily", x: -322, y: 45, icon: 0, badge: "daily" }
```

这一栏的规矩是"每格都要显示一个玩家在等的数字"(见 `AppNavigation.ts` 的注释),日常的徽章正好是 `countPendingDailyRewards`——未签到算 1,加上已完成未领的条数,最大 6。`icon: 0` 是三横线字形(清单),`iconIndex % 2 === 0` 出金色,与任务那格的青色时钟(`icon: 3`)分得开。

同时要改:`ClientTypes.ts` 的 `ImplementedFeaturePanel` 加 `"daily"`;`AppNavigation.ts` 的 `ALL_FEATURE_PANELS` 加 `"daily"`(不加则 `_everyPanelIsListed` 那条编译断言直接失败);`AppArtConfig.ts` 的 `FEATURE_NAVIGATION_ART_FILES` 加 `daily: "daily"`(`ArtCapableFeature` 由两张表推出,不加同样编译不过)。

### 10.2 面板

一页装完"赚仙玉"和"花仙玉",这样循环在一屏内闭合,不占第二个入口:

| 区域 | y | 内容 |
| --- | --- | --- |
| 页眉 | 404 | `仙玉 N · 累计签到 M 天` |
| 签到行 | 350 | 说明 + `签到 12` 按钮(已签则禁用并显示"今日已签到") |
| 五条日常 | 280 起,每行 −64 | 标题、`进度 x / y`、`仙玉 12`、领取按钮 |
| 分隔标题 | −60 | `仙玉兑换` |
| 三行兑换 | −105 起,每行 −64 | 商品名、折算说明、价格、兑换按钮 |

进度文案按 `unit` 分流:`count` 直接写次数(`进度 0 / 1`),`second` 换成分钟(`进度 25 / 60 分`)——3,600 这种秒数写在面板上没有可读性。

### 10.3 `assets/scripts/core/DailyDisplay.ts`(新)

与 `ProgressionTaskDisplay.ts` 同一形状:一个 `getDailyTaskDisplay(config, state)` 返回全部文案与按钮可用性,一个 `getDailyCheckInDisplay(snapshot)`,一个 `getImmortalJadeShopDisplay(snapshot, row)`。面板只排版,不算数——判据相关的数字一律从 `shared` 读。

### 10.4 不需要改的地方

`refreshSnapshot` 不动:`daily` 是纯记录,不参与任何派生量(战力、经验速率、加成都与它无关)。`syncProgressionTasks` 不动:日常与成就链是两套独立的记录,前者手动领、后者自动发。

## 11. 已知取舍

1. **只补经验,不补灵石和掉落**。每天回来的玩家在经验上等于满效率,另外两轴仍是 70%。这是判据只锚一条轴的必然结果(§3.3),换来的是七张供给表一张都不用重算。
2. **不做连续签到递增**(§3.4)。累计天数只是展示,不改变发放量。
3. **跨日结算的时长整段记入新的一天**(§9.1)。三天没登录的玩家回来时一次拿满两条挂机任务。按日界切分结算能更"准确",但那要在结算里引入日历循环,而它换不到任何玩家能感知的差别。
4. **五条里有两条是被动的**。挂机那两条不需要玩家做任何事,等于把 24 枚仙玉直接送给"今天登录过"。这是刻意的:签到 12 枚加这 24 枚,构成"只登录不操作"的 36 枚下限,剩下 36 枚才要动手。
5. **本地日跟随设备时区**。改时区可以在一天里多刷一次。这版是纯前端单机存档,玩家直接改 `localStorage` 比改时区更省事,为它加一层防护没有意义。
6. **手动领取**。成就链是自动发放(仙玉不占背包格子,本来也可以自动),这里选手动,因为"回来点几下"是这层玩法要提供的东西本身。代价是玩家可能忘领,而忘领的当天就作废——徽章数字就是为这个存在的。
7. **改名卡是判据外的出口**(§6)。玩家把 300 枚花在它上面,就是自愿放弃 4.17 天的时间补偿。
8. **仙玉不能跨天存到很大再一次性花**。它能——`wallet.immortalJade` 没有上限。攒 60 枚换一颗大丹本来就是预期用法(小丹 10 枚一颗,不攒也能花),攒到几千枚也只是把补偿延后领,总量不变,所以不设上限。

## 12. 测试与验收

新增 `test/daily-loop.test.ts`:

1. **判据**:`DAILY_IMMORTAL_JADE_TOTAL × IMMORTAL_JADE_MINUTES_PER_UNIT × 60` 等于 `CLIENT_CONFIG.maxOfflineSeconds × (10_000 − offlineEfficiencyBp) / 10_000`,两端都从配置读,不写 25_920 这个字面量。
2. **总额自洽**:`DAILY_IMMORTAL_JADE_TOTAL` 等于 `DAILY_CHECK_IN_JADE` 加五条任务的 `jade` 之和;五条都等于 `DAILY_TASK_JADE`。
3. **兑换定价**:两行经验丹的 `jadeCost` 等于 `getItemConfig(id).useEffect.durationSeconds / 60 / IMMORTAL_JADE_MINUTES_PER_UNIT`;改名卡的 `countsTowardTimeBudget` 为 `false`,且只有它是 `false`。
4. **`localDayIndex`**:同一天不同时刻同值;本地午夜前后一毫秒相差 1;跨月跨年各一例。
5. **`rollDailyState`**:同日返回同一引用;跨日清空 `tasks` 与 `checkedInAt`,保留 `checkInCount`;`dayIndex: -1` 的旧存档一律触发重置。
6. **签到**:Lv.14 拒绝、Lv.15 通过;签到加 12 枚仙玉与 1 天累计;同日二次签到抛错;跨日后可再签,累计变 2。
7. **五条任务各一例**:炼丹/炼器/处理收获各做一次后进度为 1 并可领;领取加 12 枚;二次领取抛错。
8. **挂机两条**:结算 1 小时后第一条可领、第二条不可;结算 6 小时后两条都可领;两条读同一个计数器。
9. **兑换**:60 枚换一颗大丹后仙玉归零、行囊多一颗;59 枚抛"仙玉不足";满包抛错且仙玉不减。
10. **一天的上界**:从零开始把签到与五条全领完,`wallet.immortalJade` 恰好是 72,且第二次全领(同日)一枚不加。
11. **徽章**:`countPendingDailyRewards` 在全新的一天是 **1**——只有未签到那一份,五条一动没动的任务不是"等领的奖励"(见 §10.1 的定义);签到后 0,五条都做完未领时 5,全领完 0。
12. **面板文案**:签到行、一条 `count` 任务、一条 `second` 任务、一行兑换,各断言整串。

改动既有测试:

- `test/local-save-migration.test.ts`:全部 `local-2.16.0` 断言改 `local-2.17.0`;新增 `describe("local-2.16.0 migration")`,断言旧存档补出 `dayIndex: -1` 的空 `daily` 块,且其余部分逐字节不变。
- `test/local-save-validation.test.ts`:`daily` 四个字段各一条腐坏用例。
- `test/app-navigation.test.ts`:`daily` 恰好由一张表提供入口,且 `ALL_FEATURE_PANELS` 与 `FeaturePanel` 仍然互相覆盖。

文档同步:`docs/game-design-and-technical-spec.md` 增一节(每日循环与仙玉,含 §5 §6 §7 三张表与判据),`README.md` 增一条。

五条验收命令全绿:`pnpm typecheck`、`pnpm test`、`pnpm verify:source`、`pnpm build:web`、`pnpm test:e2e`。

## 13. 实施顺序

1. `shared/src/config/daily.ts` 与 `shared/src/domain/daily.ts`,两行 index 导出。
2. `shared/src/contracts/bootstrap.ts` 加 `daily` 块。
3. `local-game-snapshot.ts`:初始存档、版本号、`GAME_CONFIG_VERSION_PRE_DAILY_LOOP`。
4. `LocalGameService.ts`:迁移一步、校验、跨日重置接入 `settleTo`、三个新 mutation、六处打点。
5. `test/daily-loop.test.ts` 与三份既有测试。
6. `DailyDisplay.ts`、`DailyPanel.ts`、四处导航/类型/美术表、`AppView` 的 actions 与分发。
7. 规格文档与 README。
8. 跑五条验收命令。
