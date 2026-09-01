import { getPartnerConfig, PARTNER_ABSOLUTE_MAX_LEVEL } from "../config/partner";
import { getSectConfig, SECT_ABSOLUTE_MAX_LEVEL } from "../config/sect";
import type { LoadoutBonuses } from "./loadout";

/**
 * Both functions take the absolute cap rather than the band cap, and neither
 * accepts a band. Band is derived from the player's level, which is mutable
 * runtime state; these two answer only "given a level, what does it produce".
 * The band gate lives at the mutation entry points and in the display layer.
 */
export function calculatePartnerBonuses(partner: { partnerId: string | null; level: number }): LoadoutBonuses {
  const result = emptyBonuses();
  if (partner.partnerId === null) {
    if (partner.level !== 0) throw new RangeError("Unchosen partner must be level 0");
    return result;
  }
  if (
    !Number.isInteger(partner.level) ||
    partner.level < 1 ||
    partner.level > PARTNER_ABSOLUTE_MAX_LEVEL
  ) {
    throw new RangeError("Partner level is out of range");
  }
  const config = getPartnerConfig(partner.partnerId);
  const bonus = config.bonusPerLevelBp * partner.level;
  if (config.bonusStat === "experience") result.experienceBonusBp = bonus;
  if (config.bonusStat === "spirit_stone") result.spiritStoneBonusBp = bonus;
  if (config.bonusStat === "drop") result.dropBonusBp = bonus;
  return result;
}

export function calculateSectBonuses(sect: { sectId: string | null; level: number }): LoadoutBonuses {
  const result = emptyBonuses();
  if (sect.sectId === null) {
    if (sect.level !== 0) throw new RangeError("Unjoined sect must be level 0");
    return result;
  }
  if (
    !Number.isInteger(sect.level) ||
    sect.level < 1 ||
    sect.level > SECT_ABSOLUTE_MAX_LEVEL
  ) {
    throw new RangeError("Sect level is out of range");
  }
  const config = getSectConfig(sect.sectId);
  const bonus = config.bonusPerLevelBp * sect.level;
  if (config.bonusStat === "experience") result.experienceBonusBp = bonus;
  if (config.bonusStat === "spirit_stone") result.spiritStoneBonusBp = bonus;
  if (config.bonusStat === "drop") result.dropBonusBp = bonus;
  return result;
}

function emptyBonuses(): LoadoutBonuses {
  return { powerBonusBp: 0, experienceBonusBp: 0, spiritStoneBonusBp: 0, dropBonusBp: 0 };
}
