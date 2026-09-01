import { EXPEDITION_STAGE_CONFIGS } from "@cultivation-diary/shared";
import {
  getExpeditionStageDisplay,
  getExpeditionSummary,
  getTreasureHuntText,
  selectVisibleExpeditionStages,
} from "../../core/ExpeditionDisplay";
import type { AppState } from "../../core/ClientTypes";
import { canRunLocalMutation } from "../../core/ClientTypes";
import type { AppViewActions } from "../AppView";
import { COLORS } from "../primitives/Colors";
import { addLabel, createButton, drawBand } from "../primitives/Draw";
import { HorizontalTextAlignment, Node } from "cc";
import { formatLargeNumber } from "../../core/ClientNumber";

export function drawExpeditionPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
): void {
  const snapshot = state.bootstrap!;
  const mutationsEnabled = canRunLocalMutation(state);
  addLabel(
    overlay,
    getExpeditionSummary(snapshot),
    -75,
    404,
    430,
    26,
    17,
    COLORS.jade,
  );
  // The payout line sits between the summary and the first stage row, whose band
  // reaches up to y=372 — so 383 is the whole gap there is. It is wider than the
  // summary above it because six outcomes on one line need the room, and still
  // ends left of the 寻宝 button at x=232.
  addLabel(
    overlay,
    getTreasureHuntText(snapshot),
    -90,
    383,
    460,
    20,
    13,
    COLORS.textMuted,
  );
  const treasureTokens =
    snapshot.inventory.stacks.find(
      (stack) => stack.itemConfigId === "treasure_token",
    )?.quantity ?? "0";
  createButton(
    overlay,
    `寻宝 ${formatLargeNumber(treasureTokens)}`,
    232,
    397,
    130,
    44,
    {
      fill: COLORS.inkGreenLight,
      stroke: COLORS.gold,
      fontSize: 15,
      enabled: mutationsEnabled,
    },
    () => actions.huntTreasure(),
  );

  const visible = selectVisibleExpeditionStages(
    snapshot.expedition.clearedStageIds.length,
  );
  visible.forEach((config, row) => {
    const display = getExpeditionStageDisplay(snapshot, config);
    const y = 320 - row * 122;
    // The row keeps the stage's number in the whole campaign, not in the window,
    // so scrolling past the first screen does not renumber 白骨荒原 as "1".
    const stageNumber = EXPEDITION_STAGE_CONFIGS.indexOf(config) + 1;
    const active =
      display.status === "ready" ||
      display.status === "underpowered" ||
      display.status === "cleared";
    drawBand(
      overlay,
      `Expedition-${config.id}`,
      0,
      y,
      610,
      104,
      active ? COLORS.inkGreenLight : COLORS.panel,
      active ? COLORS.goldMuted : undefined,
    );
    addLabel(
      overlay,
      `${stageNumber}. ${config.displayName}`,
      -194,
      y + 27,
      206,
      30,
      18,
      display.status === "cleared" ? COLORS.gold : COLORS.text,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      display.requirementText,
      20,
      y + 27,
      150,
      28,
      15,
      display.status === "underpowered" ? COLORS.red : COLORS.textMuted,
    );
    addLabel(
      overlay,
      display.rewardText,
      -94,
      y - 16,
      400,
      42,
      13,
      COLORS.textMuted,
      false,
      2,
      HorizontalTextAlignment.LEFT,
      "fixed",
    );
    addLabel(
      overlay,
      display.statusText,
      186,
      y - 28,
      115,
      25,
      13,
      display.status === "underpowered" ? COLORS.red : COLORS.jade,
    );
    createButton(
      overlay,
      display.actionText,
      244,
      y + 24,
      96,
      42,
      {
        fill: active ? COLORS.inkGreen : COLORS.panel,
        stroke: COLORS.goldMuted,
        fontSize: 15,
        enabled: mutationsEnabled && display.actionEnabled,
      },
      () =>
        display.status === "cleared"
          ? actions.sweepExpedition(config.id)
          : actions.challengeExpedition(config.id),
    );
  });
}
