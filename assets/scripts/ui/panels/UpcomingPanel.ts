import type { UpcomingFeaturePanel } from "../../core/ClientTypes";
import { COLORS } from "../primitives/Colors";
import { addLabel, drawBand, graphicsNode } from "../primitives/Draw";
import { Node } from "cc";

interface UpcomingFeatureCopy {
  readonly title: string;
  readonly summary: string;
  readonly detail: string;
}

export const UPCOMING_FEATURE_COPY: Readonly<
  Record<UpcomingFeaturePanel, UpcomingFeatureCopy>
> = {
  alchemy: {
    title: "炼丹房",
    summary: "消耗草药与灵石炼制丹药",
    detail: "当前版本可通过挂机掉落获得突破丹，尚不能自行炼制。",
  },
  crafting: {
    title: "炼器室",
    summary: "消耗材料与强化石打造法宝",
    detail: "当前版本法宝只能通过挂机掉落获得，强化石暂无用途。",
  },
  sect: {
    title: "宗门",
    summary: "加入宗门、领取宗门任务与贡献",
    detail: "宗门需要多人数据支撑，当前单机版本尚未开放。",
  },
  expedition: {
    title: "历练",
    summary: "派遣角色外出历练换取资源",
    detail: "当前版本的资源产出集中在修炼挂机与掉落。",
  },
};

export function drawUpcomingPanel(
  overlay: Node,
  feature: UpcomingFeaturePanel,
): void {
  const copy = UPCOMING_FEATURE_COPY[feature];

  const lock = graphicsNode(overlay, "UpcomingLock", 0, 190);
  lock.strokeColor = COLORS.goldMuted;
  lock.lineWidth = 8;
  lock.arc(0, 30, 58, Math.PI, 0, false);
  lock.stroke();
  lock.fillColor = COLORS.inkGreenLight;
  lock.roundRect(-78, -84, 156, 122, 12);
  lock.fill();
  lock.fillColor = COLORS.gold;
  lock.circle(0, -22, 12);
  lock.fill();
  lock.rect(-5, -55, 10, 35);
  lock.fill();

  drawBand(overlay, "UpcomingNotice", 0, 10, 566, 96, COLORS.inkGreen, COLORS.goldMuted);
  addLabel(overlay, "尚未开放", 0, 34, 420, 44, 26, COLORS.gold, true);
  addLabel(overlay, copy.summary, 0, -16, 520, 36, 18, COLORS.jade);
  addLabel(overlay, copy.detail, 0, -104, 560, 76, 17, COLORS.textMuted, false, 2);
  addLabel(
    overlay,
    "后续版本开放后，此处会替换为真实功能。",
    0,
    -196,
    560,
    36,
    15,
    COLORS.textMuted,
  );
}
