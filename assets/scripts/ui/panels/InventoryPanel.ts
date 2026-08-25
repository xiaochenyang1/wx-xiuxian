import { countOccupiedBagSlots } from "@cultivation-diary/shared";
import { formatLargeNumber } from "../../core/ClientNumber";
import type { AppState } from "../../core/ClientTypes";
import { canRunLocalMutation } from "../../core/ClientTypes";
import { getAutoSalvageControls } from "../../core/AutoSalvageDisplay";
import { getHarvestBatchDisplay, getHarvestEntryDetailText } from "../../core/HarvestBatchDisplay";
import { getInventoryItemUseDisplay } from "../../core/InventoryDisplay";
import type { AppViewActions, PanelPaging } from "../AppView";
import { COLORS } from "../primitives/Colors";
import {
  addLabel,
  createButton,
  createToggle,
  drawBand,
  drawPagination,
} from "../primitives/Draw";
import {
  QUALITY_ORDER,
  qualityColor,
  qualityName,
  qualityRank,
} from "../primitives/Format";
import { HorizontalTextAlignment, Node } from "cc";

export function drawInventoryPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
  paging: PanelPaging,
): void {
  const data = state.bootstrap!;
  const mutationsEnabled = canRunLocalMutation(state);
  const usedSlots = countOccupiedBagSlots(data);
  const stackWindow = paging.window(
    "inventoryStacks",
    data.inventory.stacks.length,
    4,
  );
  const harvestWindow = paging.window(
    "harvestChest",
    data.harvestChest.entries.length,
    4,
  );
  const harvestBatch = getHarvestBatchDisplay(data);
  drawBand(overlay, "BagSummary", 0, 390, 620, 92, COLORS.inkGreen);
  addLabel(
    overlay,
    `行囊 ${usedSlots} / ${data.inventory.bagCapacity}`,
    -165,
    404,
    280,
    38,
    23,
    COLORS.text,
    true,
    1,
    HorizontalTextAlignment.LEFT,
  );
  addLabel(
    overlay,
    `灵石 ${formatLargeNumber(data.wallet.spiritStone)}`,
    -165,
    370,
    280,
    30,
    17,
    COLORS.gold,
    false,
    1,
    HorizontalTextAlignment.LEFT,
  );
  if (data.inventory.bagCapacity < 200) {
    const purchaseIndex = (data.inventory.bagCapacity - 50) / 10 + 1;
    const cost = 5_000 * purchaseIndex * purchaseIndex;
    createButton(
      overlay,
      `扩展 +10（${formatLargeNumber(String(cost))}）`,
      178,
      390,
      250,
      58,
      {
        fill: COLORS.inkGreenLight,
        stroke: COLORS.gold,
        fontSize: 17,
        enabled: mutationsEnabled,
      },
      () => actions.expandInventory(),
    );
  } else {
    addLabel(overlay, "容量已满", 205, 390, 190, 38, 18, COLORS.jade);
  }

  addLabel(
    overlay,
    "堆叠道具",
    -245,
    310,
    180,
    34,
    20,
    COLORS.jade,
    true,
    1,
    HorizontalTextAlignment.LEFT,
  );
  drawPagination(
    overlay,
    "InventoryStackPager",
    190,
    310,
    stackWindow.page,
    stackWindow.pageCount,
    () => paging.show("inventoryStacks", stackWindow.page - 1),
    () => paging.show("inventoryStacks", stackWindow.page + 1),
  );
  if (data.inventory.stacks.length === 0) {
    addLabel(overlay, "行囊中暂无堆叠道具", 0, 253, 540, 40, 18, COLORS.textMuted);
  } else {
    data.inventory.stacks
      .slice(stackWindow.start, stackWindow.end)
      .forEach((stack, index) => {
        const y = 258 - index * 54;
        const useDisplay = getInventoryItemUseDisplay(
          stack.itemConfigId,
          data.progress.status,
        );
        const directlyUsable = useDisplay.visible;
        drawBand(overlay, `Stack-${stack.itemConfigId}`, 0, y, 600, 46, COLORS.panel);
        addLabel(
          overlay,
          stack.displayName,
          directlyUsable ? -180 : -155,
          y,
          directlyUsable ? 220 : 280,
          32,
          17,
          COLORS.text,
          false,
          1,
          HorizontalTextAlignment.LEFT,
        );
        addLabel(
          overlay,
          `× ${formatLargeNumber(stack.quantity)}`,
          directlyUsable ? 70 : 190,
          y,
          directlyUsable ? 100 : 190,
          32,
          18,
          COLORS.gold,
          true,
          1,
          HorizontalTextAlignment.RIGHT,
        );
        if (directlyUsable) {
          createButton(
            overlay,
            useDisplay.enabled ? "使用1" : useDisplay.label,
            190,
            y,
            78,
            40,
            {
              fill: COLORS.inkGreenLight,
              stroke: COLORS.goldMuted,
              fontSize: 15,
              enabled: mutationsEnabled && useDisplay.enabled,
            },
            () => actions.useInventoryItem(stack.itemConfigId),
          );
          if (stack.quantity !== "1") {
            createButton(
              overlay,
              "批量使用",
              278,
              y,
              100,
              40,
              {
                fill: COLORS.inkGreen,
                stroke: COLORS.goldMuted,
                fontSize: 14,
                enabled: mutationsEnabled && useDisplay.enabled,
              },
              () => actions.useAllInventoryItems(stack.itemConfigId),
            );
          }
        }
      });
  }

  addLabel(
    overlay,
    `收获箱 ${data.harvestChest.pendingCount} / 100`,
    -238,
    35,
    144,
    36,
    18,
    COLORS.jade,
    true,
    1,
    HorizontalTextAlignment.LEFT,
  );
  getAutoSalvageControls(data.settings).forEach((control, index) => {
    createToggle(
      overlay,
      `AutoSalvage-${control.quality}`,
      control.label,
      index === 0 ? -86 : 40,
      35,
      116,
      36,
      control.active,
      { enabled: mutationsEnabled, fontSize: 14 },
      () => actions.toggleAutoSalvage(control.quality),
    );
  });
  drawPagination(
    overlay,
    "HarvestChestPager",
    225,
    35,
    harvestWindow.page,
    harvestWindow.pageCount,
    () => paging.show("harvestChest", harvestWindow.page - 1),
    () => paging.show("harvestChest", harvestWindow.page + 1),
  );
  addLabel(
    overlay,
    `可收 ${harvestBatch.collectibleCount} · 普优 ${harvestBatch.salvageableCount}`,
    -190,
    -5,
    210,
    30,
    14,
    harvestBatch.blockedEquipmentCount > 0 ? COLORS.gold : COLORS.textMuted,
  );
  createButton(
    overlay,
    `全部收取 ${harvestBatch.collectibleCount}`,
    42,
    -5,
    150,
    36,
    {
      fill: COLORS.inkGreenLight,
      stroke: COLORS.goldMuted,
      fontSize: 14,
      enabled: mutationsEnabled && harvestBatch.collectibleCount > 0,
    },
    () => actions.collectAllHarvest(),
  );
  createButton(
    overlay,
    `分解普优 ${harvestBatch.salvageableCount}`,
    218,
    -5,
    170,
    36,
    {
      fill: COLORS.red,
      stroke: COLORS.goldMuted,
      fontSize: 14,
      enabled: mutationsEnabled && harvestBatch.salvageableCount > 0,
    },
    () => actions.salvageLowQualityHarvest(),
  );
  if (data.harvestChest.entries.length === 0) {
    drawBand(overlay, "HarvestEmpty", 0, -105, 600, 110, COLORS.panel);
    addLabel(overlay, "暂无待处理收获", 0, -88, 480, 38, 20, COLORS.text);
    addLabel(
      overlay,
      "挂机法宝与未收录功法会在这里等待处理",
      0,
      -124,
      540,
      32,
      16,
      COLORS.textMuted,
    );
    return;
  }

  data.harvestChest.entries
    .slice(harvestWindow.start, harvestWindow.end)
    .forEach((entry, index) => {
      const y = -70 - index * 86;
      drawBand(overlay, `Harvest-${entry.id}`, 0, y, 610, 78, COLORS.panel);
      const quality = qualityName(entry.quality);
      addLabel(
        overlay,
        `${quality} · ${entry.displayName}`,
        -165,
        y + 13,
        300,
        30,
        17,
        qualityColor(entry.quality),
        true,
        1,
        HorizontalTextAlignment.LEFT,
      );
      addLabel(
        overlay,
        getHarvestEntryDetailText(data, entry),
        -165,
        y - 16,
        300,
        25,
        15,
        COLORS.textMuted,
        false,
        1,
        HorizontalTextAlignment.LEFT,
      );
      createButton(
        overlay,
        "收取",
        106,
        y,
        100,
        48,
        {
          fill: COLORS.inkGreenLight,
          stroke: COLORS.goldMuted,
          fontSize: 16,
          enabled: mutationsEnabled,
        },
        () => actions.transferHarvest(entry.id),
      );
      if (qualityRank(entry.quality) < QUALITY_ORDER.rare) {
        createButton(
          overlay,
          "分解",
          231,
          y,
          100,
          48,
          {
            fill: COLORS.red,
            stroke: COLORS.goldMuted,
            fontSize: 16,
            enabled: mutationsEnabled,
          },
          () => actions.salvageHarvest(entry.id),
        );
      } else {
        addLabel(overlay, "已保护", 231, y, 100, 32, 15, COLORS.gold);
      }
    });
}
