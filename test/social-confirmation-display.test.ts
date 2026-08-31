import { describe, expect, it } from "vitest";
import {
  EMPTY_SOCIAL_CONFIRMATION_STATE,
  getPartnerConfirmationDisplay,
  getSectConfirmationDisplay,
  reconcileSocialConfirmationState,
} from "../assets/scripts/core/SocialConfirmationDisplay";

describe("permanent social selection confirmation", () => {
  it("describes the selected partner and irreversible consequence", () => {
    expect(getPartnerConfirmationDisplay("jun_rulan")).toEqual({
      kind: "partner",
      id: "jun_rulan",
      title: "确认结缘",
      displayName: "君如兰",
      detailText: "青云剑侍",
      bonusText: "初始核心加成 · 修为 +1.2%",
      irreversibleText: "结缘后不可更换道侣",
      persistenceText: "确认后立即写入本地存档",
      confirmLabel: "确认结缘",
      cancelLabel: "再想想",
    });
    expect(getPartnerConfirmationDisplay(null)).toBeNull();
  });

  it("describes the selected sect and irreversible consequence", () => {
    expect(getSectConfirmationDisplay("danxia")).toEqual({
      kind: "sect",
      id: "danxia",
      title: "确认拜入",
      displayName: "丹霞谷",
      detailText: "灵田丹火，财源广进",
      bonusText: "初始核心加成 · 灵石 +1.2%",
      irreversibleText: "拜入后不可改投其他宗门",
      persistenceText: "确认后立即写入本地存档",
      confirmLabel: "确认拜入",
      cancelLabel: "再想想",
    });
    expect(getSectConfirmationDisplay(null)).toBeNull();
  });

  it("keeps only the pending choice owned by the current view", () => {
    const pending = { partnerId: "su_wanqing", sectId: "qingyun" } as const;

    expect(
      reconcileSocialConfirmationState(pending, {
        selectedTab: "partner",
        activeFeature: null,
        viewChanged: false,
        partnerAlreadySelected: false,
        sectAlreadySelected: false,
      }),
    ).toEqual({ partnerId: "su_wanqing", sectId: null });
    expect(
      reconcileSocialConfirmationState(pending, {
        selectedTab: "cultivation",
        activeFeature: "sect",
        viewChanged: false,
        partnerAlreadySelected: false,
        sectAlreadySelected: false,
      }),
    ).toEqual({ partnerId: null, sectId: "qingyun" });
  });

  it("clears pending choices after navigation, dismissal, or a committed choice", () => {
    const pending = { partnerId: "lu_xinghe", sectId: "wanxiang" } as const;
    const base = {
      selectedTab: "partner" as const,
      activeFeature: null,
      viewChanged: false,
      partnerAlreadySelected: false,
      sectAlreadySelected: false,
    };

    expect(
      reconcileSocialConfirmationState(pending, {
        ...base,
        viewChanged: true,
      }),
    ).toBe(EMPTY_SOCIAL_CONFIRMATION_STATE);
    expect(
      reconcileSocialConfirmationState(pending, {
        ...base,
        partnerAlreadySelected: true,
      }),
    ).toEqual({ partnerId: null, sectId: null });
  });
});
