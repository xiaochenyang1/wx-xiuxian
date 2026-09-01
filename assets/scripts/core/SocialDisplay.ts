import {
  PARTNER_ABSOLUTE_MAX_LEVEL,
  SECT_ABSOLUTE_MAX_LEVEL,
  equipmentBandForLevel,
  getEquipmentBandConfig,
  getPartnerConfig,
  getSectConfig,
  partnerBondRequirement,
  partnerMaxLevelForBand,
  sectContributionRequirement,
  sectDonationYield,
  sectMaxLevelForBand,
  type BootstrapSnapshot,
  type EquipmentBand,
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

/** The band a player must reach to lift a cap they are currently sitting on. */
function nextBandText(band: EquipmentBand): string {
  return `需突破至${getEquipmentBandConfig((band + 1) as EquipmentBand).displayName}`;
}

export function partnerProgressText(snapshot: BootstrapSnapshot): string {
  if (snapshot.partner.partnerId === null) return "尚未结缘";
  if (snapshot.partner.level >= PARTNER_ABSOLUTE_MAX_LEVEL) return "亲密已圆满";
  const band = equipmentBandForLevel(snapshot.progress.level);
  if (snapshot.partner.level >= partnerMaxLevelForBand(band)) return nextBandText(band);
  const required = partnerBondRequirement(snapshot.partner.level + 1);
  return `亲密 ${snapshot.partner.bond}/${required}`;
}

export function sectProgressText(snapshot: BootstrapSnapshot): string {
  if (snapshot.sect.sectId === null) return "尚未拜入宗门";
  if (snapshot.sect.level >= SECT_ABSOLUTE_MAX_LEVEL) return "宗门声望已圆满";
  const band = equipmentBandForLevel(snapshot.progress.level);
  if (snapshot.sect.level >= sectMaxLevelForBand(band)) return nextBandText(band);
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

export interface SocialBatchDisplay {
  /** Payments one tap would make. 0 when the tap has nothing to do. */
  readonly times: number;
  readonly actionText: string;
  readonly enabled: boolean;
}

/** Cost of one 双修丹 / one donation is fixed; these are the batch divisors. */
const SECT_DONATION_MATERIAL_IDS = ["wood", "stone", "spiritual_herb"] as const;
const SECT_DONATION_MATERIAL_QUANTITY = 5;

function stackQuantity(snapshot: BootstrapSnapshot, itemConfigId: string): string {
  return (
    snapshot.inventory.stacks.find((stack) => stack.itemConfigId === itemConfigId)
      ?.quantity ?? "0"
  );
}

/**
 * Payments still owed to reach `bandMaxLevel` from where the track stands. A sum
 * rather than a division because `100n²` is not linear in n; the partner's `100n`
 * would divide cleanly but shares the loop so the two panels cannot drift.
 */
function paymentsToBandCap(input: {
  level: number;
  progress: number;
  bandMaxLevel: number;
  yieldPerPayment: number;
  requirement: (targetLevel: number) => number;
}): number {
  let owed = -input.progress;
  for (let level = input.level + 1; level <= input.bandMaxLevel; level += 1) {
    owed += input.requirement(level);
  }
  if (owed <= 0) return 1;
  return Math.ceil(owed / input.yieldPerPayment);
}

/**
 * How many payments one batch tap makes: whichever runs out first, the player's
 * stock or the band cap. Mirrors the 悟道 panel's second button, which offers
 * exactly the levels the reserve can already pay for.
 */
export function partnerBatchDisplay(snapshot: BootstrapSnapshot): SocialBatchDisplay {
  const band = equipmentBandForLevel(snapshot.progress.level);
  const bandMaxLevel = partnerMaxLevelForBand(band);
  if (
    snapshot.partner.partnerId === null ||
    snapshot.partner.level >= bandMaxLevel
  ) {
    return { times: 0, actionText: "批量双修", enabled: false };
  }
  const owned = Number(stackQuantity(snapshot, "dual_cultivation_pill"));
  const times = Math.min(
    owned,
    paymentsToBandCap({
      level: snapshot.partner.level,
      progress: snapshot.partner.bond,
      bandMaxLevel,
      yieldPerPayment: partnerBondRequirement(1),
      requirement: partnerBondRequirement,
    }),
  );
  if (times < 1) return { times: 0, actionText: "批量双修", enabled: false };
  return { times, actionText: `批量双修 x${times}`, enabled: true };
}

export function sectBatchDisplay(snapshot: BootstrapSnapshot): SocialBatchDisplay {
  const band = equipmentBandForLevel(snapshot.progress.level);
  const bandMaxLevel = sectMaxLevelForBand(band);
  if (snapshot.sect.sectId === null || snapshot.sect.level >= bandMaxLevel) {
    return { times: 0, actionText: "批量捐献", enabled: false };
  }
  const affordable = SECT_DONATION_MATERIAL_IDS.reduce(
    (fewest, itemConfigId) =>
      Math.min(
        fewest,
        Math.floor(
          Number(stackQuantity(snapshot, itemConfigId)) /
            SECT_DONATION_MATERIAL_QUANTITY,
        ),
      ),
    Number.POSITIVE_INFINITY,
  );
  const times = Math.min(
    affordable,
    paymentsToBandCap({
      level: snapshot.sect.level,
      progress: snapshot.sect.contribution,
      bandMaxLevel,
      yieldPerPayment: sectDonationYield(band),
      requirement: sectContributionRequirement,
    }),
  );
  if (times < 1) return { times: 0, actionText: "批量捐献", enabled: false };
  return { times, actionText: `批量捐献 x${times}`, enabled: true };
}
