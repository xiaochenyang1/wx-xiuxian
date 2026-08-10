# 洞府系统与 AppView 拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 4627 行的 `AppView.ts` 拆成原语与面板模块，然后让洞府五座建筑可升级并产生真实数值加成。

**Architecture:** 洞府加成走与功法法宝完全相同的管线——`shared` 里的纯函数算出 `LoadoutBonuses`，在 `refreshSnapshot` 里与装备加成求和后写进 `progress`。`settleCultivation` 不动。写入走现有 `mutate()`，先结算再改。存档新增 `cave` 字段，配版本迁移防止老档清零。

**Tech Stack:** TypeScript、Cocos Creator 3.8、vitest、pnpm。`shared/` 是独立包，`assets/scripts/` 引它。

## Global Constraints

- 存档配置版本 `GAME_CONFIG_VERSION` 从 `local-1.0.0` 升到 `local-1.1.0`；`LOCAL_SAVE_SCHEMA_VERSION` 保持 `1`。
- 建筑等级范围 `0..10`，`0` 表示未建造，`maxLevel` 统一为 `10`。
- 第 `n` 级灵石造价 `baseSpiritStoneCost * n^2`；材料需求 `baseQuantity * n`。
- 材料只用现有五种：`material_wood`、`material_stone`、`material_soil`、`material_herb`、`material_ore`（确切 id 在 Task 3 Step 1 前用 grep 确认）。
- 洞府解锁条件 `level >= 11`，与 `unlocks.cave` 一致。
- 金额一律用 `decimal()` 与 `toFixed(0)` 处理，不用 `Number` 做灵石运算。
- 每个 Task 结束前 `pnpm typecheck` 与 `pnpm test` 都必须通过。
- 不新增依赖。不写建造倒计时。不改排行榜与伴侣页。
- 新代码不加注释，除非逻辑复杂到值得一行说明——与现有文件风格一致。

## File Structure

**新建：**
- `shared/src/config/cave.ts` — 五座建筑的静态配置与造价函数
- `shared/src/domain/cave.ts` — `calculateCaveBonuses`、`addLoadoutBonuses`
- `assets/scripts/ui/primitives/Colors.ts` — `COLORS`、`withAlpha`
- `assets/scripts/ui/primitives/Draw.ts` — 绘制原语与控件工厂
- `assets/scripts/ui/primitives/Scenery.ts` — 场景与图标绘制
- `assets/scripts/ui/primitives/Format.ts` — 品质与数值格式化
- `assets/scripts/ui/panels/{Profile,Inventory,Technique,Equipment,Task,Upcoming,Cave}Panel.ts`
- `test/cave-bonuses.test.ts`、`test/cave-upgrade.test.ts`、`test/local-save-migration.test.ts`

**修改：**
- `shared/src/index.ts` — 导出两个新模块
- `shared/src/contracts/bootstrap.ts` — `BootstrapSnapshot` 加 `cave`
- `assets/scripts/services/LocalGameService.ts` — `refreshSnapshot`、`upgradeCaveBuilding`、`createInitialSave`、`parseLocalGameSave`、`isBootstrapSnapshot`
- `assets/scripts/ui/AppView.ts` — 移出原语与面板，接洞府 action
- `README.md`、`docs/game-design-and-technical-spec.md`

---

### Task 1: 抽取绘制原语到 primitives/

纯移动，零逻辑改动。这一步的价值在于后续每个面板文件都能只 import 它需要的原语。

**Files:**
- Create: `assets/scripts/ui/primitives/Colors.ts`, `Draw.ts`, `Scenery.ts`, `Format.ts`
- Modify: `assets/scripts/ui/AppView.ts`

**Interfaces:**
- Consumes: 无
- Produces: 从 `Colors.ts` 导出 `COLORS`、`withAlpha(source: Color, alpha: number): Color`；从 `Draw.ts` 导出 `addLabel`、`drawBand`、`drawProgress`、`redrawProgress`、`graphicsNode`、`createUiNode`、`setSize`、`drawOrnatePanel`、`drawPagination`、`drawPageButton`、`createButton`、`createTextInput`、`removeAndDestroy`；从 `Scenery.ts` 导出 `drawMountainLayer`、`drawAvatarPortrait`、`drawGoldenFormation`、`drawTribulationLightning`、`drawFeatureGlyph`、`drawTabIcon`、`drawPowerBanner`、`drawCurrencyChip`；从 `Format.ts` 导出 `QUALITY_NAMES`、`QUALITY_ORDER`、`qualityRank`、`qualityName`、`qualityColor`、`avatarVariantName`、`formatSignedPowerDelta`。所有签名与当前 `AppView.ts` 中的定义逐字一致，不做任何改写。

- [ ] **Step 1: 记录基线**

```bash
pnpm typecheck && pnpm test 2>&1 | tail -5
wc -l assets/scripts/ui/AppView.ts
```

记下测试数量（应为 58 个通过）和行数（4627）。这是后面每步的对照基准。

- [ ] **Step 2: 建 Colors.ts**

把 `AppView.ts:94` 的 `COLORS` 整块和 `AppView.ts:4613` 的 `withAlpha` 移过来，加 `export`。文件顶部按现有风格 import：

```ts
import { Color } from "cc";
```

- [ ] **Step 3: 建 Format.ts、Scenery.ts、Draw.ts**

按上面 Interfaces 里的清单，逐个函数从 `AppView.ts` 剪切过去并加 `export`。注意顺序：`Format.ts` 只依赖 `Colors.ts`；`Draw.ts` 依赖 `Colors.ts`；`Scenery.ts` 依赖 `Colors.ts` 与 `Draw.ts`。不要在这一步改任何函数体。

- [ ] **Step 4: 在 AppView.ts 里改成 import**

删掉已移走的定义，在顶部加 import。`pnpm typecheck` 会精确指出漏掉的引用——按它的报错逐个补齐，不要凭记忆猜。

- [ ] **Step 5: 验证行为未变**

```bash
pnpm typecheck && pnpm test
```

Expected: 58 passed，与 Step 1 完全一致。测试数量或通过数有任何变化都说明这一步不是纯移动，回退重做。

- [ ] **Step 6: 提交**

```bash
git add assets/scripts/ui/
git commit -m "refactor: extract AppView drawing primitives"
```

---

### Task 2: 逐个抽取五个现有面板

一次一个文件，一次一个提交。面板改成纯函数，不再持有 `this`。

**Files:**
- Create: `assets/scripts/ui/panels/ProfilePanel.ts`, `InventoryPanel.ts`, `TechniquePanel.ts`, `EquipmentPanel.ts`, `TaskPanel.ts`, `UpcomingPanel.ts`
- Modify: `assets/scripts/ui/AppView.ts:2426-3455`

**Interfaces:**
- Consumes: Task 1 的全部原语
- Produces: 每个面板导出一个函数，签名统一为
  ```ts
  export function drawProfilePanel(
    overlay: Node,
    state: Readonly<AppState>,
    actions: AppViewActions,
  ): void
  ```
  另五个同理：`drawInventoryPanel`、`drawTechniquePanel`、`drawEquipmentPanel`、`drawTaskPanel`、`drawUpcomingPanel`。`AppState` 与 `AppViewActions` 需从 `AppView.ts` 改为 `export interface` 才能被 panels 引用。

- [ ] **Step 1: 导出 AppState 与 AppViewActions**

在 `AppView.ts` 把 `interface AppViewActions`（`AppView.ts:144`）和 `AppState` 改成 `export interface`。仅加关键字，不改内容。

- [ ] **Step 2: 抽 UpcomingPanel.ts（最小的先做）**

移 `AppView.ts:2487-2522` 的 `drawUpcomingPanel` 和 `UPCOMING_FEATURE_COPY`。方法体里的 `this.xxx` 全部换成参数——这个面板只用 `overlay` 和常量，改动最小，适合先验证签名可行。

`AppView.drawFeaturePanel` 里对应分支改为 `drawUpcomingPanel(overlay, state, this.actions)`。`switch` 结构保持不动，不引入注册表。

- [ ] **Step 3: 验证并提交**

```bash
pnpm typecheck && pnpm test
git add assets/scripts/ui/ && git commit -m "refactor: extract upcoming feature panel"
```

Expected: 58 passed。

- [ ] **Step 4: 按同样方式抽剩下五个**

顺序：`TaskPanel`（3371-3455）→ `TechniquePanel`（3102-3217）→ `EquipmentPanel`（3218-3370）→ `InventoryPanel`（2853-3101）→ `ProfilePanel`（2523-2852）。从小到大做，每个都重复 Step 2-3 的完整循环：抽出 → 改 `this` 为参数 → 改 switch 分支 → typecheck + test → 单独提交。

翻页相关的 `this.showPage` 调用改为通过 `actions` 传入的回调。`PagedList` 和 `showPage` 本身留在 `AppView`，不要移进面板。

`drawOfflineSettlement`（3456）和 `drawPartnerUnlockNotice`（3563）不是 feature 面板，留在 `AppView`。

- [ ] **Step 5: 确认瘦身结果**

```bash
wc -l assets/scripts/ui/AppView.ts assets/scripts/ui/panels/*.ts assets/scripts/ui/primitives/*.ts
```

`AppView.ts` 应落在 1500 行上下。若明显高于 2000 行，说明有面板没抽干净，检查是否有辅助方法该跟着面板走。

---

### Task 3: shared 洞府配置与加成纯函数

先做纯函数，不碰存档。这一步的产出可以完全独立测试。

**Files:**
- Create: `shared/src/config/cave.ts`, `shared/src/domain/cave.ts`, `test/cave-bonuses.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Consumes: `LoadoutBonuses` from `shared/src/domain/loadout.ts`
- Produces:
  ```ts
  export type CaveBuildingId =
    | "spirit_array" | "spirit_field" | "alchemy_room"
    | "crafting_room" | "seclusion_room";

  export interface CaveBuildingConfig {
    readonly id: CaveBuildingId;
    readonly displayName: string;
    readonly maxLevel: number;
    readonly bonusStat: "experience" | "spirit_stone" | "drop" | "power";
    readonly bonusPerLevelBp: number;
    readonly baseSpiritStoneCost: number;
    readonly materials: ReadonlyArray<{ itemConfigId: string; baseQuantity: number }>;
  }

  export const CAVE_BUILDING_CONFIGS: readonly CaveBuildingConfig[];
  export const CAVE_MAX_LEVEL = 10;
  export function getCaveBuildingConfig(id: string): CaveBuildingConfig;
  export function caveUpgradeCost(id: string, currentLevel: number): {
    spiritStone: number;
    materials: ReadonlyArray<{ itemConfigId: string; quantity: number }>;
  };
  export function calculateCaveBonuses(
    buildings: readonly { buildingConfigId: string; level: number }[],
  ): LoadoutBonuses;
  export function addLoadoutBonuses(a: LoadoutBonuses, b: LoadoutBonuses): LoadoutBonuses;
  ```

- [ ] **Step 1: 确认材料 id**

```bash
grep -n "displayName: \"木材\"\|displayName: \"石材\"\|displayName: \"灵土\"\|displayName: \"灵草\"\|displayName: \"矿石\"" -B 2 shared/src/config/assets.ts
```

抄下五个确切的 `id` 字符串。配置里必须用真实 id，写错会在运行时抛 `getItemConfig` 错误而不是编译期报错。

- [ ] **Step 2: 写失败测试**

`test/cave-bonuses.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  CAVE_MAX_LEVEL,
  calculateCaveBonuses,
  caveUpgradeCost,
  getCaveBuildingConfig,
} from "../shared/src/config/cave";

describe("cave bonuses", () => {
  it("gives no bonus for unbuilt buildings", () => {
    const bonuses = calculateCaveBonuses([
      { buildingConfigId: "spirit_array", level: 0 },
    ]);
    expect(bonuses).toEqual({
      fixedPower: "0",
      experienceBonusBp: 0,
      spiritStoneBonusBp: 0,
      dropBonusBp: 0,
    });
  });

  it("routes each building to its own bonus dimension", () => {
    expect(
      calculateCaveBonuses([{ buildingConfigId: "spirit_field", level: 1 }])
        .spiritStoneBonusBp,
    ).toBeGreaterThan(0);
    expect(
      calculateCaveBonuses([{ buildingConfigId: "alchemy_room", level: 1 }])
        .dropBonusBp,
    ).toBeGreaterThan(0);
    expect(
      BigInt(
        calculateCaveBonuses([{ buildingConfigId: "crafting_room", level: 1 }])
          .fixedPower,
      ),
    ).toBeGreaterThan(0n);
  });

  it("sums bonuses across buildings on the same dimension", () => {
    const both = calculateCaveBonuses([
      { buildingConfigId: "spirit_array", level: 2 },
      { buildingConfigId: "seclusion_room", level: 3 },
    ]);
    const array = calculateCaveBonuses([
      { buildingConfigId: "spirit_array", level: 2 },
    ]);
    const seclusion = calculateCaveBonuses([
      { buildingConfigId: "seclusion_room", level: 3 },
    ]);
    expect(both.experienceBonusBp).toBe(
      array.experienceBonusBp + seclusion.experienceBonusBp,
    );
  });

  it("scales bonus linearly with level", () => {
    const one = calculateCaveBonuses([
      { buildingConfigId: "spirit_array", level: 1 },
    ]).experienceBonusBp;
    const three = calculateCaveBonuses([
      { buildingConfigId: "spirit_array", level: 3 },
    ]).experienceBonusBp;
    expect(three).toBe(one * 3);
  });

  it("rejects levels outside 0..maxLevel", () => {
    expect(() =>
      calculateCaveBonuses([{ buildingConfigId: "spirit_array", level: -1 }]),
    ).toThrow(RangeError);
    expect(() =>
      calculateCaveBonuses([
        { buildingConfigId: "spirit_array", level: CAVE_MAX_LEVEL + 1 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      calculateCaveBonuses([{ buildingConfigId: "spirit_array", level: 1.5 }]),
    ).toThrow(RangeError);
  });

  it("rejects unknown building ids", () => {
    expect(() => getCaveBuildingConfig("nope")).toThrow();
  });
});

describe("cave upgrade cost", () => {
  it("scales spirit stone by the square of the target level", () => {
    const config = getCaveBuildingConfig("spirit_array");
    const first = caveUpgradeCost("spirit_array", 0);
    const third = caveUpgradeCost("spirit_array", 2);
    expect(first.spiritStone).toBe(config.baseSpiritStoneCost);
    expect(third.spiritStone).toBe(config.baseSpiritStoneCost * 9);
  });

  it("scales materials linearly with the target level", () => {
    const first = caveUpgradeCost("spirit_field", 0);
    const fourth = caveUpgradeCost("spirit_field", 3);
    expect(fourth.materials[0]!.quantity).toBe(first.materials[0]!.quantity * 4);
  });

  it("rejects upgrading past max level", () => {
    expect(() => caveUpgradeCost("spirit_array", CAVE_MAX_LEVEL)).toThrow(RangeError);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm vitest run test/cave-bonuses.test.ts`
Expected: FAIL，报错为无法解析 `../shared/src/config/cave`。

- [ ] **Step 4: 写 config/cave.ts**

五座建筑各占一个加成维度（聚灵阵与闭关室同吃 experience，闭关室曲线更平）。数值起点：聚灵阵 `bonusPerLevelBp: 300`、灵田 `400`、炼丹房 `250`、闭关室 `150`，炼器室 `bonusPerLevelBp` 用作 `fixedPower` 的每级固定值 `50`。`baseSpiritStoneCost` 都取 `3000`。材料每座建筑配 1-2 种，`baseQuantity` 取 `5`。

`caveUpgradeCost(id, currentLevel)` 中 `targetLevel = currentLevel + 1`，`currentLevel >= maxLevel` 抛 `RangeError`。

- [ ] **Step 5: 写 domain/cave.ts**

`calculateCaveBonuses` 遍历建筑，按 `bonusStat` 累加到对应字段。等级校验：非整数、`< 0`、`> maxLevel` 抛 `RangeError`，与 `calculateTechniqueContribution` 的风格一致。`level === 0` 直接跳过。

`addLoadoutBonuses(a, b)` 返回新对象，`fixedPower` 用 `BigInt` 相加后 `toString()`——与 `loadout.ts:136` 的 `addContribution` 一致，不要用 `Number` 相加。

- [ ] **Step 6: 导出并验证**

在 `shared/src/index.ts` 加两行：

```ts
export * from "./config/cave";
export * from "./domain/cave";
```

Run: `pnpm vitest run test/cave-bonuses.test.ts && pnpm typecheck`
Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add shared/src/ test/cave-bonuses.test.ts
git commit -m "feat: add cave building config and bonus calculation"
```

---

### Task 4: 存档字段、迁移与校验

**本任务风险最高。** 迁移写错会让所有现有玩家进度清零。测试必须先写。

**Files:**
- Modify: `shared/src/contracts/bootstrap.ts`, `assets/scripts/services/LocalGameService.ts`
- Create: `test/local-save-migration.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `CAVE_BUILDING_CONFIGS`、`CAVE_MAX_LEVEL`、`getCaveBuildingConfig`
- Produces: `BootstrapSnapshot.cave: { buildings: Array<{ buildingConfigId: string; level: number }> }`；`GAME_CONFIG_VERSION === "local-1.1.0"`

- [ ] **Step 1: 写迁移测试**

`test/local-save-migration.test.ts`。先 grep 现有测试拿到构造服务的确切写法：

```bash
grep -n "new LocalGameService\|FakePlatformAdapter" test/local-save-round-trip.test.ts | head
```

按同样写法构造。测试要覆盖：

1. 种一个 `config.version: "local-1.0.0"` 且没有 `cave` 字段的完整存档（用 `adapter.seed`），载入后：等级、灵石、背包内容全部保留，`cave.buildings` 补出五座 `level: 0` 的建筑，`config.version` 变为 `local-1.1.0`。
2. 含洞府等级的存档写入再读出，等级保持一致。
3. `cave` 结构非法时拒绝载入并新建档：未知 `buildingConfigId`、`level: 11`、`level: -1`、重复 id、`buildings` 不是数组。
4. `config.version: "local-0.9.0"`（未知旧版本）仍然拒绝载入。

第 1 条是核心。构造老存档时从当前 `createInitialSave` 的结构出发，删掉 `cave`、把 version 改回 `local-1.0.0`，并塞入非默认的等级和灵石，这样"进度没丢"才有意义。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/local-save-migration.test.ts`
Expected: FAIL。老存档被判非法、`cave` 字段不存在。

- [ ] **Step 3: 加类型与初始值**

`shared/src/contracts/bootstrap.ts` 的 `BootstrapSnapshot` 加 `cave` 字段。`createInitialSave`（`LocalGameService.ts:787` 附近，紧跟 `inventory` 之后）加：

```ts
cave: {
  buildings: CAVE_BUILDING_CONFIGS.map((config) => ({
    buildingConfigId: config.id,
    level: 0,
  })),
},
```

`GAME_CONFIG_VERSION` 改为 `"local-1.1.0"`。

- [ ] **Step 4: 写迁移函数**

在 `parseLocalGameSave` 的版本断言（`LocalGameService.ts:1249`）之前插入显式迁移：

```ts
function migrateSnapshot(snapshot: unknown): unknown {
  if (typeof snapshot !== "object" || snapshot === null) return snapshot;
  const candidate = snapshot as { config?: { version?: unknown }; cave?: unknown };
  if (candidate.config?.version !== "local-1.0.0") return snapshot;
  return {
    ...candidate,
    cave: {
      buildings: CAVE_BUILDING_CONFIGS.map((config) => ({
        buildingConfigId: config.id,
        level: 0,
      })),
    },
    config: { ...candidate.config, version: GAME_CONFIG_VERSION },
  };
}
```

只认 `local-1.0.0` 这一个来源版本，其他版本原样返回并被后续校验拒绝。不要写成"缺 cave 就补"的宽松逻辑——那会掩盖真正损坏的存档。

- [ ] **Step 5: 加结构校验**

`isBootstrapSnapshot` 增加 `cave` 校验：`cave` 是对象、`buildings` 是数组、每项 `buildingConfigId` 能通过 `getCaveBuildingConfig` 查到、`level` 是 `0..CAVE_MAX_LEVEL` 的整数、id 无重复。校验风格跟着该函数里现有的 `techniques`/`equipment` 写法走。

- [ ] **Step 6: 全量验证**

```bash
pnpm vitest run test/local-save-migration.test.ts && pnpm test && pnpm typecheck
```

Expected: 新测试 PASS，原有 58 个测试仍然全绿。原有存档测试若因 version 变化而失败，是它们硬编码了 `local-1.0.0`——更新为常量引用，不要改回旧版本号。

- [ ] **Step 7: 提交**

```bash
git add shared/src/contracts/bootstrap.ts assets/scripts/services/LocalGameService.ts test/local-save-migration.test.ts
git commit -m "feat: add cave save field with explicit 1.0.0 migration"
```

---

### Task 5: upgradeCaveBuilding 与加成接线

**Files:**
- Modify: `assets/scripts/services/LocalGameService.ts:817-863`（`refreshSnapshot`）、`:256`（`expandInventory` 旁新增方法）
- Create: `test/cave-upgrade.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `calculateCaveBonuses`、`addLoadoutBonuses`、`caveUpgradeCost`、`getCaveBuildingConfig`；Task 4 的 `cave` 存档字段
- Produces: `LocalGameService.upgradeCaveBuilding(buildingConfigId: string): LocalMutationResult`

- [ ] **Step 1: 写失败测试**

`test/cave-upgrade.test.ts` 覆盖：

1. 升级成功：灵石与材料按 `caveUpgradeCost` 精确扣除，`cave.buildings` 对应项 `level` 加 1。
2. 升级后 `progress.experienceBonusBp` 确实变大（聚灵阵），`progress.experiencePerSecond` 随之变大。
3. 洞府加成与装备加成叠加：装好一件功法再升聚灵阵，`experienceBonusBp` 等于两者之和。
4. 四种拒绝：等级 < 11 抛「修为达到 Lv.11 才能开辟洞府」、已满级、灵石不足、材料不足。材料不足的 message 必须含材料名与缺口数量。
5. 任一拒绝情形下快照完全不变（对比 `JSON.stringify` 前后一致）。

准备测试数据用现有的 debug grant 通道最省事：

```bash
grep -n "grantDebug\|DebugGrantTarget" assets/scripts/services/LocalGameService.ts | head
```

按它给出的方式发灵石和材料。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/cave-upgrade.test.ts`
Expected: FAIL，`upgradeCaveBuilding` 不存在。

- [ ] **Step 3: 接加成管线**

`refreshSnapshot`（`LocalGameService.ts:818`）改为：

```ts
const loadout = calculateLoadoutBonuses({ /* 原有入参不变 */ });
const bonuses = addLoadoutBonuses(loadout, calculateCaveBonuses(snapshot.cave.buildings));
```

下面用到 `bonuses.*` 的地方全部不动。这是本次唯一需要改的加成计算点。

- [ ] **Step 4: 写 upgradeCaveBuilding**

放在 `expandInventory` 之后，结构照抄它：走 `this.mutate()`，校验失败抛 `LocalGameError`，成功返回新快照与 message。

顺序必须是：先查解锁与满级 → 再算造价 → 校验灵石 → 校验材料 → 扣费 → 改等级。材料扣除用 `setStackQuantity`，读取用 `stackQuantity`，灵石用 `decimal().minus().toFixed(0)`。

message 形如 `消耗 3000 灵石，聚灵阵提升至 Lv.1`。

- [ ] **Step 5: 验证**

```bash
pnpm vitest run test/cave-upgrade.test.ts && pnpm test && pnpm typecheck
```

Expected: 全绿。特别确认 `test/cultivation-settlement.test.ts` 仍通过——它是挂机数值的不变量守卫。

- [ ] **Step 6: 提交**

```bash
git add assets/scripts/services/LocalGameService.ts test/cave-upgrade.test.ts
git commit -m "feat: add cave building upgrade with bonus wiring"
```

---

### Task 6: CavePanel 与 UI 接线

**Files:**
- Create: `assets/scripts/ui/panels/CavePanel.ts`
- Modify: `assets/scripts/ui/AppView.ts`（`drawCaveBuildings` 移出、`AppViewActions` 加方法、洞府页调用）

**Interfaces:**
- Consumes: Task 1 原语、Task 2 的 `AppState`/`AppViewActions`、Task 5 的 `upgradeCaveBuilding`
- Produces: `export function drawCavePanel(overlay: Node, state: Readonly<AppState>, actions: AppViewActions): void`；`AppViewActions` 新增 `upgradeCaveBuilding(buildingConfigId: string): void`

- [ ] **Step 1: 把 drawCaveBuildings 移进 CavePanel.ts**

先原样移动并改为纯函数，跑 `pnpm typecheck` 确认还能编译。这一步不改行为，静态贴图照旧。

- [ ] **Step 2: 接真实数据**

改为读 `state.bootstrap.cave.buildings`：

- 等级显示实际 `level`，`0` 显示「未建造」
- 显示当前加成与下一级加成
- 显示本次升级所需灵石与材料，拥有量不足的条目用 `COLORS` 里已有的警示色标出
- `+` 按钮接 `actions.upgradeCaveBuilding(config.id)`
- 满级时按钮换成「已满级」文本
- 保留现有 `drawLockedPage` 未解锁分支

按钮在资源不足时置灰但仍可点击，点击后走正常错误路径显示原因，不要做成静默无响应。

- [ ] **Step 3: 加 action 实现**

`AppViewActions` 加 `upgradeCaveBuilding`，在 `AppView` 里按现有 `expandInventory` action 的写法实现：调服务、捕获 `LocalGameError`、走同一套 toast/提示通道。

- [ ] **Step 4: 验证**

```bash
pnpm typecheck && pnpm test
```

再用 `/run` 或 `pnpm dev` 实际打开洞府页，确认：未解锁时显示锁定页；解锁后能看到五座建筑的真实等级；灵石充足时能升级并看到修为速率变化；灵石不足时点击给出明确提示。UI 行为无法靠单测覆盖，这一步必须手动过一遍。

- [ ] **Step 5: 提交**

```bash
git add assets/scripts/ui/
git commit -m "feat: make cave buildings upgradeable"
```

---

### Task 7: 文档更新

**Files:**
- Modify: `README.md`, `docs/game-design-and-technical-spec.md`

- [ ] **Step 1: 更新 README 当前能力**

在「当前能力」列表加洞府条目，说明五座建筑、Lv.10 上限、消耗灵石与掉落材料。同时把洞府从未开放系统的描述里移除。

- [ ] **Step 2: 更新技术规格**

`docs/game-design-and-technical-spec.md` 加洞府章节：数据模型、五个加成维度、造价公式、加成合成位置。更新存档版本说明，记录 `local-1.0.0 → local-1.1.0` 的迁移。

- [ ] **Step 3: 确认 feature-rail 测试无需改动**

```bash
pnpm vitest run test/feature-rail.test.ts
```

Expected: PASS 且无需修改——洞府走主标签页，不在底部功能栏的四个未开放系统之列。若这个测试失败，说明 Task 6 误改了功能栏，回去检查。

- [ ] **Step 4: 全量验证并提交**

```bash
pnpm typecheck && pnpm test && pnpm --filter shared build
git add README.md docs/
git commit -m "docs: document cave system"
```

---

## Self-Review

**Spec coverage:** spec 第 3 节 → Task 1-2；第 4 节 → Task 3-4；第 5 节 → Task 3 + Task 5 Step 3；第 6 节 → Task 5；第 7 节 → Task 4；第 8 节 → Task 6；第 9 节 → Task 3/4/5 的测试步骤；第 10 节 → Task 7；第 11 节交付顺序 → Task 编号顺序一致。无遗漏。

**Type consistency:** `calculateCaveBonuses`、`addLoadoutBonuses`、`caveUpgradeCost`、`getCaveBuildingConfig`、`CAVE_MAX_LEVEL`、`CAVE_BUILDING_CONFIGS`、`upgradeCaveBuilding` 在 Task 3-6 中的拼写与签名一致。`cave.buildings` 的字段名 `buildingConfigId`/`level` 全程一致。

**已知风险：** Task 4 的迁移是唯一可能造成玩家数据损失的改动，测试先行且只认 `local-1.0.0` 单一来源版本。Task 6 的 UI 行为只能手动验证。
