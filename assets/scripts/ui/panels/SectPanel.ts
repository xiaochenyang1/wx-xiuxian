import {
  SECT_ABSOLUTE_MAX_LEVEL,
  SECT_CONFIGS,
  equipmentBandForLevel,
  getItemConfig,
  sectDonationYield,
  sectMaxLevelForBand,
  type SectId,
} from "@cultivation-diary/shared";
import type { SectConfirmationDisplay } from "../../core/SocialConfirmationDisplay";
import {
  sectBatchDisplay,
  sectProgressText,
  selectedSect,
  socialBonusText,
} from "../../core/SocialDisplay";
import type { AppState } from "../../core/ClientTypes";
import type { AppViewActions } from "../AppView";
import { COLORS } from "../primitives/Colors";
import { addLabel, createButton, drawBand } from "../primitives/Draw";
import { HorizontalTextAlignment, Node } from "cc";

export interface SectConfirmationControls {
  readonly display: SectConfirmationDisplay | null;
  begin(sectId: SectId): void;
  cancel(): void;
  confirm(): void;
}

export function drawSectPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
  confirmation: SectConfirmationControls,
): void {
  const snapshot = state.bootstrap!;
  const current = selectedSect(snapshot);
  if (current) {
    drawBand(overlay, "SectCurrent", 0, 205, 610, 300, COLORS.inkGreenLight, COLORS.gold);
    addLabel(overlay, current.displayName, 0, 295, 420, 48, 30, COLORS.gold, true);
    addLabel(overlay, current.description, 0, 244, 500, 34, 18, COLORS.text);
    addLabel(
      overlay,
      `声望 Lv.${snapshot.sect.level}　${socialBonusText(current, snapshot.sect.level)}`,
      0,
      188,
      520,
      36,
      19,
      COLORS.jade,
    );
    addLabel(overlay, sectProgressText(snapshot), 0, 140, 500, 32, 17, COLORS.textMuted);

    const donationText = ["wood", "stone", "spiritual_herb"]
      .map((itemConfigId) => {
        const owned =
          snapshot.inventory.stacks.find((stack) => stack.itemConfigId === itemConfigId)
            ?.quantity ?? "0";
        return `${getItemConfig(itemConfigId).displayName} ${owned}/5`;
      })
      .join("　");
    addLabel(overlay, `每次捐献：${donationText}`, 0, 32, 580, 36, 16, COLORS.textMuted);
    const band = equipmentBandForLevel(snapshot.progress.level);
    // The yield is band-scaled, so the panel has to quote it rather than the 100
    // it used to hardcode — a 天阶 donation is worth ten 凡阶 ones.
    addLabel(
      overlay,
      `本段位每次贡献 +${sectDonationYield(band)}`,
      0,
      -2,
      580,
      32,
      15,
      COLORS.textMuted,
    );
    const bandMaxLevel = sectMaxLevelForBand(band);
    const donateEnabled = snapshot.sect.level < bandMaxLevel;
    const batch = sectBatchDisplay(snapshot);
    createButton(
      overlay,
      donateEnabled
        ? "捐献物资"
        : snapshot.sect.level >= SECT_ABSOLUTE_MAX_LEVEL
          ? "已圆满"
          : "段位已满",
      -100,
      -70,
      182,
      62,
      {
        fill: COLORS.inkGreen,
        stroke: COLORS.gold,
        text: COLORS.gold,
        fontSize: 19,
        enabled: donateEnabled,
      },
      () => actions.donateToSect(1),
    );
    createButton(
      overlay,
      batch.actionText,
      100,
      -70,
      182,
      62,
      {
        fill: COLORS.panel,
        stroke: batch.enabled ? COLORS.gold : COLORS.goldMuted,
        text: batch.enabled ? COLORS.gold : COLORS.textMuted,
        fontSize: 17,
        enabled: batch.enabled,
      },
      () => actions.donateToSect(batch.times),
    );
    addLabel(overlay, "宗门选择会写入本地存档，当前不可改投", 0, -155, 560, 34, 15, COLORS.textMuted);
    return;
  }

  if (confirmation.display) {
    drawSectConfirmation(overlay, confirmation);
    return;
  }

  addLabel(
    overlay,
    snapshot.progress.level >= 11
      ? "选择一方宗门拜入，获得持续挂机加成"
      : "达到 Lv.11 后可拜入宗门",
    0,
    397,
    590,
    38,
    18,
    COLORS.jade,
  );
  SECT_CONFIGS.forEach((config, index) => {
    const y = 260 - index * 205;
    drawBand(overlay, `Sect-${config.id}`, 0, y, 610, 166, COLORS.panel, COLORS.goldMuted);
    addLabel(
      overlay,
      config.displayName,
      -192,
      y + 44,
      180,
      34,
      21,
      COLORS.gold,
      true,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      config.description,
      -192,
      y + 2,
      330,
      30,
      16,
      COLORS.text,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );
    addLabel(
      overlay,
      `初始加成 ${socialBonusText(config, 1)}`,
      -192,
      y - 42,
      330,
      30,
      15,
      COLORS.jade,
      false,
      1,
      HorizontalTextAlignment.LEFT,
    );
    createButton(
      overlay,
      "拜入",
      230,
      y,
      100,
      52,
      { fill: COLORS.inkGreen, stroke: COLORS.goldMuted, fontSize: 17 },
      () => confirmation.begin(config.id),
    );
  });
}

function drawSectConfirmation(
  overlay: Node,
  controls: SectConfirmationControls,
): void {
  const display = controls.display!;
  addLabel(overlay, display.title, 0, 397, 590, 42, 24, COLORS.gold, true);
  addLabel(overlay, display.displayName, 0, 280, 520, 56, 34, COLORS.text, true);
  addLabel(overlay, display.detailText, 0, 224, 520, 36, 18, COLORS.textMuted);
  addLabel(overlay, display.bonusText, 0, 152, 540, 42, 20, COLORS.jade, true);
  addLabel(overlay, display.irreversibleText, 0, 74, 540, 38, 19, COLORS.gold, true);
  addLabel(overlay, display.persistenceText, 0, 34, 540, 30, 15, COLORS.textMuted);
  createButton(
    overlay,
    display.cancelLabel,
    -135,
    -52,
    230,
    60,
    { fill: COLORS.panel, stroke: COLORS.goldMuted, fontSize: 18 },
    () => controls.cancel(),
  );
  createButton(
    overlay,
    display.confirmLabel,
    135,
    -52,
    230,
    60,
    { fill: COLORS.red, stroke: COLORS.gold, fontSize: 18 },
    () => controls.confirm(),
  );
}
