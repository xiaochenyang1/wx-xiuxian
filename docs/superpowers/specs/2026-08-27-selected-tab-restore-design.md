# 主页签记忆设计

状态：待评审。本文只描述设计与算账，不含实现。

## 1 背景

`settings.selectedTab` 是全项目唯一一个"写进存档、参与校验、但没有任何人读"的字段。它从 `local-1.0.0` 起就在每一份存档里，`LocalGameService.ts:3123` 的 `isMainTab(settings.selectedTab)` 把它列入载入校验——值不合法整份存档会被拒收并建新档——而 `AppStore` 永远从 `"cultivation"` 起（`AppStore.ts:14`），`setReady` 只在换号时把它重置回去。

更准确地说，它连"写"都没有：`local-game-snapshot.ts:118` 建档时填 `"cultivation"`，此后没有任何一条代码路径改过它。所以今天的实际状态是——每一份存档都带着一个恒为 `"cultivation"` 的字段，为它准备了一条能让存档整份作废的校验规则，而它的取值从不影响任何行为。这条记在 `2026-08-17-midgame-content-design.md` §9 的遗留账本上，至今未动。

代价不大，但按次计费。放置游戏的打开次数远多于单次时长：一次打开可能只是收一次收获箱、点一次悟道。玩家当前在忙的那件事在洞府页或伴侣页时，每一次打开都要先付一次点击把页签拨回去。这不是玩法问题，是每次进门都得重新开一次灯。

## 2 目标与不做的事

做：

- 载入存档时恢复上次所在的主页签。
- 切换主页签时把它写进存档。
- 存档里记的页签当前还锁着时退回修炼页。
- 给 `AppStore` 和 `ClientTypes` 补上对应测试。

不做：

- **不恢复 `activeFeature`。** 功能面板是一次性操作的入口（炼丹、分解、备份），不是"我在哪"。把玩家丢回上次的炼器页会挡住主页的挂机与升级信息，而导入和重置流程本来就会显式打开档案页——那是唯一该被程序决定的面板。
- **不改存档结构，不升配置版本，不写迁移。** 字段自 `local-1.0.0` 就存在，校验也已经在，本次只是让它开始有用。`GAME_CONFIG_VERSION` 保持 `local-2.12.0`。
- **不给页签加"回到上次位置"的提示或动画。** 恢复对的位置本身就是无声的，提示反而是在为一件不该被注意到的事索取注意。
- **不动 `immortalJade` 与 `activeEffects`。** 同一份账本里的另外两条空壳，处置理由见 §8.2，不在本次范围。

## 3 现状

四个主页签 `cultivation | partner | ranking | cave`（`ClientTypes.ts:3`），其中两个受解锁位约束：`partner` 在 Lv.20、`cave` 在 Lv.11。`ranking` 与 `cultivation` 始终可用。

读写点：

| 位置 | 现在做什么 |
| --- | --- |
| `local-game-snapshot.ts:118` | 建档写 `"cultivation"` |
| `LocalGameService.ts:3123` | 载入校验 `isMainTab` |
| `AppStore.ts:14` | 内存初值 `"cultivation"` |
| `AppStore.setReady` | 换号时重置为 `"cultivation"` |
| `AppStore.selectTab` | 只改内存，不落盘 |

## 4 设计

### 4.1 恢复点选在 `setReady`

`setReady` 是"某份存档成为了当前存档"的唯一入口——启动、导入、重置三条路都走它。把恢复放在这里，而不是放在首帧渲染或 `subscribe` 里，意味着三条路自动都对，不需要各自记得调一次。

顺带把 `selectedTab` 从 `identityChanged` 分支里拿出来：那个分支现在负责"换号时清掉上一号的界面状态"，页签的正确值不再由它决定，而是无条件取自存档。`activeFeature` 与 `featureMessage` 仍留在分支里，它们确实只在换号时需要清。

### 4.2 页签锁着时退回修炼页

存档里合法地可以留下一个当前锁着的页签：锁定页是可以点进去的（`drawCave` 在未解锁时画 `drawLockedPage`），玩家点进洞府页看一眼门槛就退出游戏，存档记下的就是 `cave`。

解锁位只增不减（`README.md` 的存档规则明确写了门槛提高也不收回已开放的入口），所以退回只会发生在真的还没解锁的存档上，而在那种存档上直接开在一张"筑基后开启"的空页上是最差的第一屏。退回修炼页。

### 4.3 写入走 `mutate`，和另外两个设置项一样

`markPartnerUnlockNoticeSeen`（`LocalGameService.ts:343`）和 `toggleAutoSalvage`（`:353`）都是不产生事件的设置写操作，都走 `this.mutate`。页签写入同形，没有理由另开一条路径。

代价是每次点页签多一次在线结算与一次落盘。可接受：结算本身与 30 秒自动存档跑的是同一份数学，只是更频繁；落盘是一个小 JSON，而点页签的频率和装备、收取这些已经在落盘的操作是同一量级。不接受的替代方案是"只改内存，等下一次检查点顺手带走"——那会让"退出前最后一次切页签"这件最常见的操作恰好丢掉，而它正是本次要修的东西。

不发提示消息。`toggleAutoSalvage` 有 toast 是因为它改变后续行为，页签不改变任何东西。

### 4.4 store 先动，服务后写

点击的响应不等落盘：先 `store.selectTab(tab)` 让页面当帧切过去，再 `runMutation` 把它写进存档。写入失败或被 `mutationInFlight` 跳过时，界面已经是对的，只是这一次的位置没记住——下一次切页签或下一次检查点会覆盖它。反过来的顺序会让每次点击都等一次同步落盘。

### 4.5 导入与重置自动正确

- **重置**：新档的 `selectedTab` 是 `"cultivation"`，恢复出来正是修炼页。
- **导入**：恢复的是被导入那份存档自己的页签，而 `applyProgressReplacement` 随后显式 `openFeature("profile")`，所以它只是档案面板背后的底页。导入者关掉档案页时看到的是备份里那个人在忙的事，这比一律回到修炼页更接近"这份存档回来了"。

## 5 实现

### 5.1 `core/ClientTypes.ts`：两个纯函数

`ClientTypes` 已经是这类"对 state / bootstrap 求值的纯谓词"的所在地（`canRunLocalMutation`、`shouldShowPartnerUnlockNotice`、`hasSameBootstrapIdentity`）。加两个：

```ts
export function isMainTab(value: unknown): value is MainTab;
/** 存档里记的页签，锁着或不合法时退回修炼页。 */
export function resolveRestoredTab(bootstrap: BootstrapSnapshot): MainTab;
```

`isMainTab` 是类型守卫而不是返回 `boolean`：契约里 `settings.selectedTab` 是 `string`（`shared` 不能反向依赖 `assets/`，`MainTab` 只能留在客户端侧），`resolveRestoredTab` 需要它来收窄。`LocalGameService` 里那个私有的同名 `boolean` 版本（`:3624`）改为委托，那张四个字面量的表从此只有一份。

### 5.2 `AppStore.setReady`

```ts
this.update({
  phase: "ready",
  storageStatus,
  lastSavedAt,
  bootstrap,
  errorMessage: null,
  selectedTab: resolveRestoredTab(bootstrap),
  ...(identityChanged ? { activeFeature: null, featureMessage: null } : {}),
});
```

### 5.3 `LocalGameService.selectTab`

```ts
selectTab(tab: MainTab): LocalMutationResult {
  return this.mutate((snapshot) => ({
    snapshot: { ...snapshot, settings: { ...snapshot.settings, selectedTab: tab } },
    events: [],
  }));
}
```

不校验入参：`MainTab` 已经收窄，页签来自 `drawNavigation` 里写死的四项，运行时再挡一次是给不会发生的事写分支。

### 5.4 `GameBootstrap`

`selectTab: (tab) => this.selectTab(tab)`，新方法按 §4.4 的顺序：同页签直接返回，否则先动 store 再 `runMutation`。

## 6 存档与迁移

没有。字段、初值和校验都已存在，四个合法取值不变，`GAME_CONFIG_VERSION` 保持 `local-2.12.0`，迁移链不变。`local-save-migration.test.ts` 的 53 条不应有任何变化。

老存档里的值全都是 `"cultivation"`（§1：从没有人写过它），所以老档载入后的第一屏和改动前完全一致——记忆从这次改动之后的第一次切页签开始积累。

## 7 展示

不新增任何控件、文案或动画。唯一可见的变化是启动后落在哪一页。

## 8 已知取舍

### 8.1 页签写入让"点一下看看"也留下痕迹

玩家好奇点进伴侣页，退出，下次打开就在伴侣页。这是记忆功能的定义本身，不是缺陷；但它意味着最后一次点击总是赢，哪怕那次点击是随手的。可选的缓解是"停留超过 N 秒才记"，本次不做：它把一个确定的规则换成一个玩家猜不到的规则，而猜不到的规则比偶尔记错更烦人。

### 8.2 同一份账本里另外两条空壳没动

- `wallet.immortalJade`：契约、初值、校验齐备，零产出零消耗零 UI。它和 `selectedTab` 不同——`selectedTab` 有一个明显该做的事，`immortalJade` 需要先有一个"这个货币从哪来"的答案，而本作没有内购，寻宝令已经占了"票券"这个位置。倾向删除，但那要动契约、校验和一步迁移，是独立一件事。
- `activeEffects`：校验强制为空数组。这条更像前向兼容闸门而不是空壳——未来版本写入 buff 后，旧版本会拒收而不是静默丢弃它读不懂的效果。以现在的信息看，留着比删掉合理。

### 8.3 恢复的是页签，不是滚动位置与面板内的选中项

历练页显示哪 6 关、法宝页选中哪一件、炼器页选中哪个配方都不在存档里，恢复到洞府页仍然是那一页的默认状态。把这些也记下来会让存档结构长出一层界面状态，那是另一个量级的改动，且收益远小于第一屏。

## 9 测试与验收

`test/app-store.test.ts` 现有 2 条不变，新增：

- `setReady` 带一份 `settings.selectedTab = "ranking"` 的存档后 `snapshot.selectedTab` 是 `"ranking"`。
- 存档记 `"cave"` 而 `unlocks.cave` 为假时退回 `"cultivation"`；解锁位为真时保留 `"cave"`。`partner` 同理。
- 存档记一个非法值（`"shop"`）时退回 `"cultivation"`——这一条不会来自本作的存档（校验会先拒收），钉的是 `resolveRestoredTab` 自己不假设输入合法。
- 换号（`player.id` 不同）时 `activeFeature` 与 `featureMessage` 被清掉，而页签取自新存档而不是一律 `"cultivation"`。

`test/local-save-validation.test.ts:537` 现有的"非法页签拒收存档"一条不变。

新增落盘一侧（放在已有的存档测试里）：

- `selectTab("ranking")` 后重新载入同一份存储，`snapshot.settings.selectedTab` 是 `"ranking"`。
- `selectTab` 不产生事件、不改动 `progress` 以外由结算负责的字段。

回归门禁：`pnpm typecheck`、`pnpm test`、`pnpm verify:source`、`pnpm verify:release-config` 全绿。

## 10 实施顺序

1. `core/ClientTypes.ts`：`isMainTab` 类型守卫与 `resolveRestoredTab`。
2. `AppStore.setReady`：从存档取页签。
3. `LocalGameService`：`selectTab` 写入，私有 `isMainTab` 改为委托。
4. `GameBootstrap`：`selectTab` 先动 store 再落盘。
5. 测试：`app-store.test.ts` 与存档侧各按 §9 补齐。
6. `docs/game-design-and-technical-spec.md` 与 `README.md`：说明页签随存档恢复。
7. 全门禁。

