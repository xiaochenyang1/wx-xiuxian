import type { ChosenAvatarVariant } from "@cultivation-diary/shared";
import { formatLargeNumber } from "../../core/ClientNumber";
import type { AppState } from "../../core/ClientTypes";
import { canRunLocalMutation } from "../../core/ClientTypes";
import type { AppViewActions } from "../AppView";
import { COLORS } from "../primitives/Colors";
import {
  addLabel,
  createButton,
  createTextInput,
  drawBand,
} from "../primitives/Draw";
import { avatarVariantName } from "../primitives/Format";
import { drawAvatarPortrait } from "../primitives/Scenery";
import { HorizontalTextAlignment, Node } from "cc";

export interface ProfileDraftState {
  avatar(): ChosenAvatarVariant | null;
  name(): string | null;
  nameSource(): string | null;
  setAvatar(value: ChosenAvatarVariant | null): void;
  setName(value: string | null): void;
  setNameSource(value: string | null): void;
  selectAvatar(value: ChosenAvatarVariant): void;
}

export interface ProfileResetControls {
  armed(): boolean;
  pending(): boolean;
  arm(): void;
  cancel(): void;
  confirm(): void;
}

export type ProfileBackupAction = "import" | "recovery";

export interface ProfileBackupControls {
  armed(): ProfileBackupAction | null;
  pending(): boolean;
  recoveryAvailable(): boolean;
  copy(): void;
  arm(action: ProfileBackupAction): void;
  cancel(): void;
  confirm(): void;
}

export interface ProfileResetControlDisplay {
  readonly description: string;
  readonly primaryLabel: string;
  readonly cancelLabel: string | null;
  readonly enabled: boolean;
}

export function getProfileResetControlDisplay(
  armed: boolean,
  enabled = true,
  pending = false,
): ProfileResetControlDisplay {
  if (pending) {
    return {
      description: "正在重置本地进度，请稍候",
      primaryLabel: "正在重置",
      cancelLabel: null,
      enabled: false,
    };
  }
  if (!enabled) {
    return {
      description: "当前状态暂时无法重置本地进度",
      primaryLabel: armed ? "确认重置" : "重置进度",
      cancelLabel: armed ? "取消" : null,
      enabled: false,
    };
  }
  return armed
    ? {
        description: "此操作会永久清除本机存档并从 Lv.1 重新开始",
        primaryLabel: "确认重置",
        cancelLabel: "取消",
        enabled: true,
      }
    : {
        description: "当前进度仅保存在本机，可在此重新开始",
        primaryLabel: "重置本地进度",
        cancelLabel: null,
        enabled: true,
      };
}

export function drawProfilePanel(
  overlay: Node,
  state: Readonly<AppState>,
  actions: AppViewActions,
  drafts: ProfileDraftState,
  backup: ProfileBackupControls,
  reset: ProfileResetControls,
): void {
  const data = state.bootstrap!;
  const player = data.player;
  const operationsEnabled =
    canRunLocalMutation(state) && !backup.pending() && !reset.pending();
  const recoveryAvailable = backup.recoveryAvailable();

  drawBand(overlay, "AvatarProfile", 0, 302, 620, 220, COLORS.inkGreen);
  addLabel(
    overlay,
    "角色形象",
    -25,
    376,
    430,
    38,
    22,
    COLORS.gold,
    true,
    1,
    HorizontalTextAlignment.LEFT,
  );
  drawAvatarPortrait(overlay, player.avatarVariant, -225, 300, 1.8);

  if (player.avatarVariant === "neutral") {
    addLabel(
      overlay,
      "首次选择后将永久确定",
      70,
      334,
      390,
      34,
      17,
      COLORS.textMuted,
    );
    createButton(
      overlay,
      drafts.avatar() === "male" ? "已选男修" : "男修形象",
      5,
      278,
      150,
      58,
      {
        fill:
          drafts.avatar() === "male"
            ? COLORS.inkGreen
            : COLORS.inkGreenLight,
        stroke: COLORS.jade,
        fontSize: 18,
      },
      () => drafts.selectAvatar("male"),
    );
    createButton(
      overlay,
      drafts.avatar() === "female" ? "已选女修" : "女修形象",
      190,
      278,
      150,
      58,
      {
        fill:
          drafts.avatar() === "female"
            ? COLORS.inkGreen
            : COLORS.inkGreenLight,
        stroke: COLORS.gold,
        fontSize: 18,
      },
      () => drafts.selectAvatar("female"),
    );
    const avatarDraft = drafts.avatar();
    if (avatarDraft) {
      createButton(
        overlay,
        `确认${avatarVariantName(avatarDraft)}`,
        98,
        216,
        335,
        44,
        {
          fill: COLORS.red,
          stroke: COLORS.goldMuted,
          fontSize: 16,
          enabled: operationsEnabled,
        },
        () => actions.chooseAvatar(drafts.avatar()!),
      );
    }
  } else {
    drafts.setAvatar(null);
    addLabel(
      overlay,
      `${avatarVariantName(player.avatarVariant)} · 已确定`,
      70,
      318,
      390,
      42,
      23,
      COLORS.text,
      true,
    );
    addLabel(
      overlay,
      "角色形象不可再次修改",
      70,
      274,
      390,
      32,
      17,
      COLORS.textMuted,
    );
  }

  drawBand(overlay, "RenameProfile", 0, 18, 620, 324, COLORS.panel);
  addLabel(
    overlay,
    "道号",
    -245,
    140,
    120,
    38,
    22,
    COLORS.gold,
    true,
    1,
    HorizontalTextAlignment.LEFT,
  );
  addLabel(
    overlay,
    `当前：${player.displayName}`,
    48,
    140,
    450,
    36,
    18,
    COLORS.text,
    false,
    1,
    HorizontalTextAlignment.LEFT,
  );

  const renameCardQuantity =
    data.inventory.stacks.find((item) => item.itemConfigId === "rename_card")
      ?.quantity ?? "0";
  addLabel(
    overlay,
    player.freeRenameAvailable
      ? "可免费修改 1 次"
      : `持有改名卡 ${formatLargeNumber(renameCardQuantity)} 张`,
    -15,
    92,
    530,
    34,
    17,
    player.freeRenameAvailable ? COLORS.jade : COLORS.textMuted,
  );

  if (drafts.nameSource() === null) {
    drafts.setNameSource(player.displayName);
    drafts.setName(player.displayName);
  } else if (drafts.nameSource() !== player.displayName) {
    drafts.setNameSource(player.displayName);
  }
  const nameInput = createTextInput(
    overlay,
    drafts.name() ?? player.displayName,
    "输入新的道号",
    -66,
    27,
    420,
    60,
    (value) => {
      drafts.setName(value);
    },
    (value) => actions.renamePlayer(value),
    operationsEnabled,
  );
  createButton(
    overlay,
    "确认改名",
    226,
    27,
    126,
    60,
    {
      fill: COLORS.inkGreenLight,
      stroke: COLORS.gold,
      fontSize: 17,
      enabled: operationsEnabled,
    },
    () => actions.renamePlayer(nameInput.string),
  );
  addLabel(
    overlay,
    "2 至 12 个中文、英文字母或数字",
    -65,
    -27,
    420,
    30,
    15,
    COLORS.textMuted,
  );

  const resetDisplay = getProfileResetControlDisplay(
    reset.armed(),
    operationsEnabled,
    reset.pending(),
  );
  drawBand(overlay, "AccountProfile", 0, -290, 620, 238, COLORS.panel);
  addLabel(
    overlay,
    "本地存档",
    -245,
    -205,
    120,
    38,
    22,
    COLORS.gold,
    true,
    1,
    HorizontalTextAlignment.LEFT,
  );
  addLabel(
    overlay,
    `当前角色：${player.displayName} · 仅保存在本机`,
    48,
    -205,
    450,
    36,
    18,
    COLORS.text,
    false,
    1,
    HorizontalTextAlignment.LEFT,
  );
  addLabel(
    overlay,
    backup.pending()
      ? "正在处理本地存档"
      : backup.armed() === "import"
        ? "将用剪贴板备份覆盖当前进度"
        : backup.armed() === "recovery"
          ? "将恢复上次导入前的进度"
          : "存档备份与恢复",
    0,
    -251,
    540,
    30,
    16,
    backup.armed() ? COLORS.gold : COLORS.textMuted,
    false,
    1,
    HorizontalTextAlignment.CENTER,
    "fixed",
  );
  if (backup.pending()) {
    createButton(
      overlay,
      "正在处理",
      0,
      -293,
      280,
      46,
      {
        fill: COLORS.panelStrong,
        stroke: COLORS.goldMuted,
        fontSize: 17,
        enabled: false,
      },
      () => {},
    );
  } else if (backup.armed()) {
    createButton(
      overlay,
      "取消",
      -145,
      -293,
      250,
      46,
      { fill: COLORS.panelStrong, stroke: COLORS.goldMuted, fontSize: 17 },
      () => backup.cancel(),
    );
    createButton(
      overlay,
      backup.armed() === "import" ? "确认导入" : "确认恢复",
      145,
      -293,
      250,
      46,
      { fill: COLORS.red, stroke: COLORS.goldMuted, fontSize: 17 },
      () => backup.confirm(),
    );
  } else {
    createButton(
      overlay,
      "复制备份",
      -194,
      -293,
      176,
      46,
      {
        fill: COLORS.inkGreenLight,
        stroke: COLORS.jade,
        fontSize: 16,
        enabled: operationsEnabled,
      },
      () => backup.copy(),
    );
    createButton(
      overlay,
      "剪贴板导入",
      0,
      -293,
      176,
      46,
      {
        fill: COLORS.inkGreenLight,
        stroke: COLORS.gold,
        fontSize: 16,
        enabled: operationsEnabled,
      },
      () => backup.arm("import"),
    );
    createButton(
      overlay,
      recoveryAvailable ? "恢复导入前" : "暂无回退",
      194,
      -293,
      176,
      46,
      {
        fill: COLORS.panelStrong,
        stroke: COLORS.goldMuted,
        fontSize: 16,
        enabled: operationsEnabled && recoveryAvailable,
      },
      () => backup.arm("recovery"),
    );
  }
  addLabel(
    overlay,
    resetDisplay.description,
    0,
    -339,
    550,
    30,
    14,
    reset.armed() ? COLORS.gold : COLORS.textMuted,
    false,
    1,
    HorizontalTextAlignment.CENTER,
    "fixed",
  );
  if (resetDisplay.cancelLabel) {
    createButton(
      overlay,
      resetDisplay.cancelLabel,
      -145,
      -382,
      250,
      44,
      { fill: COLORS.panelStrong, stroke: COLORS.goldMuted, fontSize: 17 },
      () => reset.cancel(),
    );
    createButton(
      overlay,
      resetDisplay.primaryLabel,
      145,
      -382,
      250,
      44,
      {
        fill: COLORS.red,
        stroke: COLORS.goldMuted,
        fontSize: 17,
        enabled: resetDisplay.enabled,
      },
      () => reset.confirm(),
    );
  } else {
    createButton(
      overlay,
      resetDisplay.primaryLabel,
      0,
      -382,
      280,
      44,
      {
        fill: COLORS.red,
        stroke: COLORS.goldMuted,
        fontSize: 17,
        enabled: resetDisplay.enabled,
      },
      () => reset.arm(),
    );
  }
}
