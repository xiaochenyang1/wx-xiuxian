import {
  getTrialFloorDisplay,
  getTrialTowerSummary,
  selectVisibleTrialFloors,
} from "../../core/TrialTowerDisplay";
import type { AppState } from "../../core/ClientTypes";
import { canRunLocalMutation } from "../../core/ClientTypes";
import type { AppViewActions } from "../AppView";
import { COLORS } from "../primitives/Colors";
import { addLabel, createButton, drawBand } from "../primitives/Draw";
import { HorizontalTextAlignment, Node } from "cc";

export function drawTrialTowerPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
): void {
  const snapshot = state.bootstrap!;
  const mutationsEnabled = canRunLocalMutation(state);
  addLabel(
    overlay,
    getTrialTowerSummary(snapshot),
    0,
    397,
    610,
    38,
    19,
    COLORS.jade,
  );

  const floors = selectVisibleTrialFloors(snapshot.trialTower.highestFloor);
  floors.forEach((floor, index) => {
    const display = getTrialFloorDisplay(snapshot, floor);
    const y = 320 - index * 122;
    const active = display.status === "ready" || display.status === "underpowered";
    drawBand(
      overlay,
      `TrialFloor-${floor}`,
      0,
      y,
      610,
      104,
      active ? COLORS.inkGreenLight : COLORS.panel,
      active ? COLORS.goldMuted : undefined,
    );
    addLabel(
      overlay,
      display.titleText,
      -194,
      y + 27,
      206,
      30,
      18,
      display.status === "ready" ? COLORS.gold : COLORS.text,
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
      () => actions.challengeTrialTower(floor),
    );
  });
}
