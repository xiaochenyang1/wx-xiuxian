import {
  SECT_CONFIGS,
  SECT_MAX_LEVEL,
  getItemConfig,
} from "@cultivation-diary/shared";
import {
  sectProgressText,
  selectedSect,
  socialBonusText,
} from "../../core/SocialDisplay";
import type { AppState } from "../../core/ClientTypes";
import type { AppViewActions } from "../AppView";
import { COLORS } from "../primitives/Colors";
import { addLabel, createButton, drawBand } from "../primitives/Draw";
import { HorizontalTextAlignment, Node } from "cc";

export function drawSectPanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
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
    addLabel(overlay, `每次捐献：${donationText}`, 0, 20, 580, 36, 16, COLORS.textMuted);
    createButton(
      overlay,
      snapshot.sect.level >= SECT_MAX_LEVEL ? "已圆满" : "捐献物资",
      0,
      -70,
      190,
      62,
      {
        fill: COLORS.inkGreen,
        stroke: COLORS.gold,
        text: COLORS.gold,
        fontSize: 19,
        enabled: snapshot.sect.level < SECT_MAX_LEVEL,
      },
      () => actions.donateToSect(),
    );
    addLabel(overlay, "宗门选择会写入本地存档，当前不可改投", 0, -155, 560, 34, 15, COLORS.textMuted);
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
      () => actions.joinSect(config.id),
    );
  });
}
