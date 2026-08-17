import {
  getPartnerConfig,
  getSectConfig,
  type PartnerId,
  type SectId,
} from "@cultivation-diary/shared";
import type { FeaturePanel, MainTab } from "./ClientTypes";
import { socialBonusText } from "./SocialDisplay";

export interface SocialConfirmationState {
  readonly partnerId: PartnerId | null;
  readonly sectId: SectId | null;
}

export interface SocialConfirmationViewContext {
  readonly selectedTab: MainTab;
  readonly activeFeature: FeaturePanel | null;
  readonly viewChanged: boolean;
  readonly partnerAlreadySelected: boolean;
  readonly sectAlreadySelected: boolean;
}

interface SocialConfirmationDisplayBase {
  readonly title: string;
  readonly displayName: string;
  readonly detailText: string;
  readonly bonusText: string;
  readonly irreversibleText: string;
  readonly persistenceText: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

export interface PartnerConfirmationDisplay
  extends SocialConfirmationDisplayBase {
  readonly kind: "partner";
  readonly id: PartnerId;
}

export interface SectConfirmationDisplay extends SocialConfirmationDisplayBase {
  readonly kind: "sect";
  readonly id: SectId;
}

export const EMPTY_SOCIAL_CONFIRMATION_STATE: SocialConfirmationState = {
  partnerId: null,
  sectId: null,
};

export function reconcileSocialConfirmationState(
  state: SocialConfirmationState,
  context: SocialConfirmationViewContext,
): SocialConfirmationState {
  if (context.viewChanged) return EMPTY_SOCIAL_CONFIRMATION_STATE;
  return {
    partnerId:
      !context.partnerAlreadySelected &&
      context.selectedTab === "partner" &&
      context.activeFeature === null
        ? state.partnerId
        : null,
    sectId:
      !context.sectAlreadySelected && context.activeFeature === "sect"
        ? state.sectId
        : null,
  };
}

export function getPartnerConfirmationDisplay(
  partnerId: PartnerId | null,
): PartnerConfirmationDisplay | null {
  if (partnerId === null) return null;
  const config = getPartnerConfig(partnerId);
  return {
    kind: "partner",
    id: config.id,
    title: "确认结缘",
    displayName: config.displayName,
    detailText: config.epithet,
    bonusText: `初始核心加成 · ${socialBonusText(config, 1)}`,
    irreversibleText: "结缘后不可更换道侣",
    persistenceText: "确认后立即写入本地存档",
    confirmLabel: "确认结缘",
    cancelLabel: "再想想",
  };
}

export function getSectConfirmationDisplay(
  sectId: SectId | null,
): SectConfirmationDisplay | null {
  if (sectId === null) return null;
  const config = getSectConfig(sectId);
  return {
    kind: "sect",
    id: config.id,
    title: "确认拜入",
    displayName: config.displayName,
    detailText: config.description,
    bonusText: `初始核心加成 · ${socialBonusText(config, 1)}`,
    irreversibleText: "拜入后不可改投其他宗门",
    persistenceText: "确认后立即写入本地存档",
    confirmLabel: "确认拜入",
    cancelLabel: "再想想",
  };
}
