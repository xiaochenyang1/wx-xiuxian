import {
  PARTNER_MAX_LEVEL,
  SECT_MAX_LEVEL,
  getPartnerConfig,
  getSectConfig,
  partnerBondRequirement,
  sectContributionRequirement,
  type BootstrapSnapshot,
  type PartnerConfig,
  type SectConfig,
} from "@cultivation-diary/shared";

export function socialBonusText(
  config: PartnerConfig | SectConfig,
  level: number,
): string {
  const label =
    config.bonusStat === "experience"
      ? "修为"
      : config.bonusStat === "spirit_stone"
        ? "灵石"
        : "掉落";
  return `${label} +${(config.bonusPerLevelBp * level) / 100}%`;
}

export function partnerProgressText(snapshot: BootstrapSnapshot): string {
  if (snapshot.partner.partnerId === null) return "尚未结缘";
  if (snapshot.partner.level >= PARTNER_MAX_LEVEL) return "亲密已圆满";
  const required = partnerBondRequirement(snapshot.partner.level + 1);
  return `亲密 ${snapshot.partner.bond}/${required}`;
}

export function sectProgressText(snapshot: BootstrapSnapshot): string {
  if (snapshot.sect.sectId === null) return "尚未拜入宗门";
  if (snapshot.sect.level >= SECT_MAX_LEVEL) return "宗门声望已圆满";
  const required = sectContributionRequirement(snapshot.sect.level + 1);
  return `贡献 ${snapshot.sect.contribution}/${required}`;
}

export function selectedPartner(snapshot: BootstrapSnapshot): PartnerConfig | null {
  return snapshot.partner.partnerId === null
    ? null
    : getPartnerConfig(snapshot.partner.partnerId);
}

export function selectedSect(snapshot: BootstrapSnapshot): SectConfig | null {
  return snapshot.sect.sectId === null ? null : getSectConfig(snapshot.sect.sectId);
}
