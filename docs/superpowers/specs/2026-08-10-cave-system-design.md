# 洞府系统与 AppView 拆分设计

日期：2026-08-10

## 1. 背景

洞府页当前是静态贴图。`AppView.drawCaveBuildings` 画出五座建筑，等级全部写死 `Lv.1`，`+` 按钮没有任何行为。玩家在 Lv.11 解锁洞府后，看到的是一个不能交互的界面。

同时 `assets/scripts/ui/AppView.ts` 已达 4627 行，占仓库 TypeScript 代码的 44%。绘制原语、布局、交互、分页状态全部集中在一个文件里。直接把洞府的建筑升级 UI 加进去会让该文件继续膨胀。

本设计包含两部分：先拆分 `AppView`，再实现洞府系统。拆分是洞府的前置条件，不是独立的重构任务。

## 2. 目标与非目标

### 目标

1. 把 `AppView.ts` 拆到约 1500 行，绘制原语和功能面板各自独立成文件。
2. 让洞府五座建筑可升级，升级产生真实的数值收益。
3. 让掉落材料（木材、石材、灵土、灵草、矿石）产生有效需求。
4. 老存档（`local-1.0.0`）在引入洞府字段后不丢进度。

### 非目标

- 不做建造倒计时或异步建造队列。
- 不做建筑专属的产出资源流（不新增资源类型）。
- 不改动排行榜和伴侣页。
- 不引入面板注册表机制，`drawFeaturePanel` 保持显式 `switch`。
- 不补 `assets/resources/art/backgrounds/cave.png`，继续走现有缺图降级逻辑。

## 3. AppView 拆分

### 3.1 目标结构

```text
assets/scripts/ui/
  AppView.ts              约 1500 行 — 生命周期、状态编排、主页、header、导航、表现队列
  primitives/
    Colors.ts             COLORS、withAlpha
    Draw.ts               drawBand / addLabel / drawProgress / redrawProgress / graphicsNode /
                          createUiNode / setSize / drawOrnatePanel / drawPagination / drawPageButton /
                          createButton / createTextInput / removeAndDestroy
    Scenery.ts            drawMountainLayer / drawAvatarPortrait / drawGoldenFormation /
                          drawTribulationLightning / drawFeatureGlyph / drawTabIcon /
                          drawPowerBanner / drawCurrencyChip
    Format.ts             QUALITY_NAMES / QUALITY_ORDER / qualityRank / qualityName / qualityColor /
                          avatarVariantName / formatSignedPowerDelta
  panels/
    ProfilePanel.ts       源 AppView.ts:2523-2852
    InventoryPanel.ts     源 AppView.ts:2853-3101
    TechniquePanel.ts     源 AppView.ts:3102-3217
    EquipmentPanel.ts     源 AppView.ts:3218-3370
    TaskPanel.ts          源 AppView.ts:3371-3455
    UpcomingPanel.ts      源 AppView.ts:2487-2522，含 UPCOMING_FEATURE_COPY
    CavePanel.ts          新增
```

### 3.2 面板签名

所有面板导出为纯函数，不持有 `this`：

```ts
export function drawProfilePanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
): void
```

现有 `drawXxxPanel` 方法只依赖 `overlay`、`state` 和少量回调，改为显式传参后依赖关系可直接从签名读出，无需读实现。

`AppView.drawFeaturePanel` 内部仍是显式 `switch`，每个分支调用对应的外部函数。不引入注册表。

### 3.3 分页状态归属

`PagedList`（`AppView.ts:180`）与 `showPage`（`AppView.ts:1003`）继续由 `AppView` 持有。面板通过 `actions` 上的翻页回调请求换页，不各自持有 UI 状态。

### 3.4 拆分顺序

每一步结束后 `pnpm typecheck` 与 `pnpm test` 必须通过，才能进入下一步。

1. 抽 `primitives/`，纯移动，不改任何逻辑。
2. 逐个抽面板，一次一个文件，一次一个提交。
3. 全部抽完后新建 `CavePanel.ts`。

## 4. 洞府数据模型

### 4.1 存档字段

`BootstrapSnapshot` 新增：

```ts
cave: {
  buildings: Array<{
    buildingConfigId: string;
    level: number;
  }>;
}
```

只存实例数据（id 与等级），显示名、加成、造价全部从静态配置查表。与现有 `techniques`/`equipment` 的做法一致，日后调数值不需要迁移存档。

`level` 取值 `0..10`，`0` 表示未建造。

### 4.2 建筑配置

新建 `shared/src/config/cave.ts`：

```ts
export type CaveBuildingId =
  | "spirit_array"
  | "spirit_field"
  | "alchemy_room"
  | "crafting_room"
  | "seclusion_room";

export interface CaveBuildingConfig {
  id: CaveBuildingId;
  displayName: string;
  maxLevel: number;
  bonusStat: "experience" | "spirit_stone" | "drop" | "power";
  bonusPerLevelBp: number;
  baseSpiritStoneCost: number;
  materials: ReadonlyArray<{ itemConfigId: string; baseQuantity: number }>;
}
```

五座建筑各占一个不重叠的加成维度，避免只升单一最优建筑：

| 建筑 | 加成维度 | 说明 |
|---|---|---|
| 聚灵阵 | `experienceBonusBp` | 修为速率，主升目标 |
| 灵田 | `spiritStoneBonusBp` | 灵石产出 |
| 炼丹房 | `dropBonusBp` | 掉落频率 |
| 炼器室 | `fixedPower` | 战力 |
| 闭关室 | `experienceBonusBp` | 与聚灵阵同维度，曲线更平，作为次选 |

`maxLevel` 统一为 10。

### 4.3 造价

第 `n` 级（从 `n-1` 升到 `n`）的灵石造价为 `baseSpiritStoneCost * n^2`，沿用背包扩容 `5000 * n^2` 的手感。

材料需求为 `baseQuantity * n`，随等级线性增长。材料取自现有掉落池：木材、石材、灵土、灵草、矿石。不新增材料类型。

## 5. 加成合成

`shared/src/domain/cave.ts` 新增纯函数：

```ts
export function calculateCaveBonuses(
  buildings: readonly { buildingConfigId: string; level: number }[],
): LoadoutBonuses
```

复用 `loadout.ts` 已有的 `LoadoutBonuses` 类型与求和语义。`level === 0` 的建筑不产生任何加成。非法等级（负数、超过 `maxLevel`、非整数）抛 `RangeError`，与 `calculateTechniqueContribution` 的行为一致。

`LocalGameService.refreshSnapshot`（`LocalGameService.ts:817`）是仓库中唯一计算加成的位置。修改为：

```ts
const loadout = calculateLoadoutBonuses({ ... });
const cave = calculateCaveBonuses(snapshot.cave.buildings);
const bonuses = addLoadoutBonuses(loadout, cave);
```

其余部分不变。`settleCultivation` 及其全部现有测试不受影响——洞府只是多了一个加成来源，管线本身没有变化。

## 6. 写入路径

`LocalGameService` 新增：

```ts
upgradeCaveBuilding(buildingConfigId: string): LocalMutationResult
```

结构对齐 `expandInventory`（`LocalGameService.ts:256`），走现有 `this.mutate()`。

`mutate` 在回调执行前先按当前效率结算挂机收益，因此新加成不会被追溯应用到升级之前的挂机时间。这是 `docs/game-design-and-technical-spec.md:129` 的明确要求。

### 错误处理

沿用 `LocalGameError`，四种拒绝情形：

| 情形 | 提示 |
|---|---|
| 洞府未解锁 | 修为达到 Lv.11 才能开辟洞府 |
| 已达 `maxLevel` | 该建筑已达到最高等级 |
| 灵石不足 | 灵石不足，还需 N 灵石 |
| 材料不足 | 缺少 X，还需 N 个 |

材料不足必须指出缺哪一种、还缺多少，玩家需要知道该去刷什么。

## 7. 存档迁移

### 7.1 风险

`parseLocalGameSave` 对 `config.version` 做硬断言（`LocalGameService.ts:1249`）：

```ts
config.version === GAME_CONFIG_VERSION
```

新增 `cave` 字段后，老存档缺该字段且版本号不匹配，校验会判定存档非法并创建新档，导致所有现有玩家进度清零。这是本次改动风险最高的一处。

### 7.2 处理

1. `GAME_CONFIG_VERSION` 从 `local-1.0.0` 升到 `local-1.1.0`。
2. `parseLocalGameSave` 增加显式迁移：识别到 `local-1.0.0` 的存档时，补入全部 `level: 0` 的五座建筑，改写 `config.version`，再进入正常校验。
3. 未知版本号仍然拒绝载入并创建新档。

存档信封的 `schemaVersion` 保持 `1`，因为信封结构没有变化，变的是快照内容。

迁移必须是显式函数，不静默猜测旧字段含义，符合 `docs/game-design-and-technical-spec.md:141`。

### 7.3 新增校验

`isBootstrapSnapshot` 增加 `cave` 校验：必须是对象，`buildings` 是数组，每项 `buildingConfigId` 是已知建筑 id，`level` 是 `0..maxLevel` 的整数，且无重复 id。

## 8. UI 行为

`drawCaveBuildings`（`AppView.ts:2317`）迁入 `panels/CavePanel.ts`，并从静态改为读 `state.bootstrap.cave`：

- 等级显示实际 `level`，`level === 0` 显示「未建造」。
- 每座建筑显示当前加成与下一级加成。
- `+` 按钮接 `actions.upgradeCaveBuilding(id)`。
- 显示本次升级所需灵石与材料，拥有量不足的条目标红。
- 资源不足时按钮置灰但仍可点击，点击后走正常错误路径显示原因，不静默无响应。
- 已满级时按钮替换为「已满级」文本。

洞府页保留现有的未解锁分支（`drawLockedPage`）。

## 9. 测试计划

全部测试运行在纯 Node 下，沿用 `test/support/fake-platform-adapter.ts`，时间从入参注入，不需要 Cocos 环境。

### shared 纯函数（`test/cave-bonuses.test.ts`）

- 五座建筑各自的加成落在正确的维度上。
- 多座建筑加成正确累加。
- `level: 0` 不产生加成。
- 非法等级抛 `RangeError`。
- 造价曲线：第 n 级灵石造价等于 `base * n^2`，材料等于 `baseQuantity * n`。

### 服务层（`test/cave-upgrade.test.ts`）

- 升级成功后灵石与材料被正确扣除。
- 升级后 `progress.experienceBonusBp` 等字段确实变化。
- 四种拒绝情形各自抛出正确的 `LocalGameError`。
- 升级失败时快照完全不变。
- 洞府加成与装备加成正确叠加。

### 存档（扩充 `test/local-save-round-trip.test.ts` 与 `test/local-save-validation.test.ts`）

- `local-1.0.0` 老存档能载入，补出全 0 级洞府，等级与背包等进度不丢。
- 含洞府的快照写入再读出保持一致。
- `cave` 字段结构非法（未知 id、越界等级、重复 id）时拒绝载入。
- 未知 `config.version` 仍然拒绝载入。

老存档迁移是风险最高的一项，必须有测试兜住。

## 10. 文档更新

- `README.md` 的「当前能力」增加洞府条目。
- `docs/game-design-and-technical-spec.md` 增加洞府章节，并更新存档版本说明。
- `test/feature-rail.test.ts` 不需要改动：洞府走主标签页，不在底部功能栏的四个未开放系统之列。

## 11. 交付顺序

1. `primitives/` 抽取。
2. 五个现有面板逐个抽取。
3. `shared/src/config/cave.ts` 与 `shared/src/domain/cave.ts` 及其测试。
4. 存档字段、迁移与校验及其测试。
5. `upgradeCaveBuilding` 及其测试。
6. `panels/CavePanel.ts` 与 UI 接线。
7. 文档更新。

第 1、2 步是纯重构，不应改变任何行为。第 3 步之后每一步都带测试。
