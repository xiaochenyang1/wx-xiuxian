import type {
  AutoSalvageQuality,
  BootstrapSnapshot,
} from "@cultivation-diary/shared";

export interface AutoSalvageControlDisplay {
  readonly quality: AutoSalvageQuality;
  readonly label: string;
  readonly active: boolean;
}

export function getAutoSalvageControls(
  settings: BootstrapSnapshot["settings"],
): readonly AutoSalvageControlDisplay[] {
  return [
    {
      quality: "common",
      label: "普通自动",
      active: settings.autoSalvageCommon,
    },
    {
      quality: "uncommon",
      label: "优秀自动",
      active: settings.autoSalvageUncommon,
    },
  ];
}
