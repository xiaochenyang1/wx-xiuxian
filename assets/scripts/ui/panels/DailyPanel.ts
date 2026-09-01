import {
  DAILY_IMMORTAL_JADE_TOTAL,
  DAILY_TASK_CONFIGS,
  IMMORTAL_JADE_SHOP_ROWS,
} from "@cultivation-diary/shared";
import type { AppState } from "../../core/ClientTypes";
import {
  getDailyCheckInDisplay,
  getDailyTaskDisplay,
  getImmortalJadeShopDisplay,
} from "../../core/DailyDisplay";
import type { AppViewActions } from "../AppView";
import { COLORS } from "../primitives/Colors";
import { addLabel, createButton, drawBand } from "../primitives/Draw";
import { HorizontalTextAlignment, Node } from "cc";

/** Row pitch shared by the task list and the exchange list. */
const ROW_STEP = 64;

/**
 * Earning and spending on one page, so the loop closes inside a single screen
 * rather than costing a second entry point (§10.2 of the daily-loop design).
 */
export function drawDailyPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
): void {
  const snapshot = state.bootstrap!;
  const checkIn = getDailyCheckInDisplay(snapshot);

  addLabel(overlay, checkIn.headerText, 0, 404, 600, 40, 21, COLORS.gold, true);
  addLabel(
    overlay,
    checkIn.lockedText ?? checkIn.description,
    -170,
    350,
    340,
    34,
    16,
    checkIn.lockedText ? COLORS.textMuted : COLORS.text,
    false,
    1,
    HorizontalTextAlignment.LEFT,
    "fixed",
  );
  createButton(
    overlay,
    checkIn.buttonText,
    218,
    350,
    150,
    54,
    {
      fill: checkIn.canCheckIn ? COLORS.inkGreen : COLORS.panel,
      stroke: checkIn.canCheckIn ? COLORS.gold : COLORS.goldMuted,
      text: checkIn.canCheckIn ? COLORS.gold : COLORS.textMuted,
      fontSize: 17,
      enabled: checkIn.canCheckIn,
    },
    () => actions.checkInDaily(),
  );

  DAILY_TASK_CONFIGS.forEach((config, index) => {
    const taskState = snapshot.daily.tasks.find(
      (task) => task.taskConfigId === config.id,
    );
    const y = 280 - index * ROW_STEP;
    drawBand(overlay, `DailyTask-${config.id}`, 0, y, 620, 58, COLORS.panel);
    // A row the save does not carry yet is drawn from the config so the list
    // never has a hole in it; the next cross-day roll fills the state in.
    const display = getDailyTaskDisplay(
      taskState ?? { taskConfigId: config.id, progress: "0", claimedAt: null },
    );
    addLabel(
      overlay,
      display.title,
      -190,
      y + 10,
      260,
      30,
      17,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    addLabel(
      overlay,
      display.progressText,
      -190,
      y - 16,
      260,
      26,
      14,
      display.canClaim ? COLORS.jade : COLORS.textMuted,
      false,
      1,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    addLabel(
      overlay,
      display.rewardText,
      60,
      y,
      150,
      30,
      15,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.RIGHT,
      "fixed",
    );
    createButton(
      overlay,
      display.buttonText,
      230,
      y,
      126,
      48,
      {
        fill: display.canClaim ? COLORS.inkGreen : COLORS.panelStrong,
        stroke: display.canClaim ? COLORS.gold : COLORS.goldMuted,
        text: display.canClaim ? COLORS.gold : COLORS.textMuted,
        fontSize: 16,
        enabled: display.canClaim,
      },
      () => actions.claimDailyTask(config.id),
    );
  });

  addLabel(overlay, "仙玉兑换", 0, -60, 600, 38, 20, COLORS.gold, true);
  IMMORTAL_JADE_SHOP_ROWS.forEach((row, index) => {
    const display = getImmortalJadeShopDisplay(snapshot, row);
    const y = -105 - index * ROW_STEP;
    drawBand(overlay, `JadeShop-${row.id}`, 0, y, 620, 58, COLORS.panel);
    addLabel(
      overlay,
      display.title,
      -190,
      y + 10,
      260,
      30,
      17,
      COLORS.text,
      true,
      1,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    addLabel(
      overlay,
      display.description,
      -190,
      y - 16,
      300,
      26,
      14,
      COLORS.textMuted,
      false,
      1,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    addLabel(
      overlay,
      display.priceText,
      60,
      y,
      150,
      30,
      15,
      COLORS.gold,
      false,
      1,
      HorizontalTextAlignment.RIGHT,
      "fixed",
    );
    createButton(
      overlay,
      display.buttonText,
      230,
      y,
      126,
      48,
      {
        fill: display.canExchange ? COLORS.inkGreen : COLORS.panelStrong,
        stroke: display.canExchange ? COLORS.gold : COLORS.goldMuted,
        text: display.canExchange ? COLORS.gold : COLORS.textMuted,
        fontSize: 15,
        enabled: display.canExchange,
      },
      () => actions.exchangeImmortalJade(row.id),
    );
  });

  addLabel(
    overlay,
    `每日上限 仙玉 ${DAILY_IMMORTAL_JADE_TOTAL}，次日零点重置`,
    0,
    -320,
    600,
    32,
    14,
    COLORS.textMuted,
  );
}
