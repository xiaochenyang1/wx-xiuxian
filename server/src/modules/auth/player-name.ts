import { randomInt } from "node:crypto";
import { AppError } from "../../common/app-error";

const NAME_STEMS = [
  "青岚",
  "玄微",
  "云栖",
  "星河",
  "灵枢",
  "霁月",
  "澄心",
  "凌霄",
  "长宁",
  "明夷",
  "昭玄",
  "无尘",
] as const;

const NAME_ENDINGS = ["子", "客", "真人", "散人", "居士", "道人"] as const;
const NAME_POOL_SIZE = NAME_STEMS.length * NAME_ENDINGS.length;
const RESERVED_FRAGMENTS = ["系统", "管理员", "官方", "客服", "gm", "微信", "腾讯"] as const;
const ALLOWED_NAME_CHARACTERS = /^[\p{Script=Han}A-Za-z0-9]+$/u;
const segmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });

// Serializes every operation that can claim or release a globally unique player name.
export const PLAYER_NAME_ADVISORY_LOCK_ID = 2_026_080_501;

export interface ValidatedPlayerName {
  displayName: string;
  displayNameKey: string;
}

export class PlayerNameGenerator {
  constructor(private readonly offset = randomInt(NAME_POOL_SIZE)) {}

  candidate(attempt: number): ValidatedPlayerName {
    if (!Number.isInteger(attempt) || attempt < 0) {
      throw new RangeError("Name generation attempt must be a non-negative integer");
    }

    const poolIndex = (this.offset + attempt) % NAME_POOL_SIZE;
    const stem = NAME_STEMS[poolIndex % NAME_STEMS.length] ?? NAME_STEMS[0];
    const endingIndex = Math.floor(poolIndex / NAME_STEMS.length);
    const ending = NAME_ENDINGS[endingIndex] ?? NAME_ENDINGS[0];
    const suffix = attempt < NAME_POOL_SIZE ? "" : String(1000 + (attempt % 9000));

    return validatePlayerName(`${stem}${ending}${suffix}`);
  }
}

export function validatePlayerName(input: string): ValidatedPlayerName {
  if (input !== input.trim()) {
    throw invalidName("道号首尾不能包含空白");
  }

  const displayName = input.normalize("NFKC");
  const length = [...segmenter.segment(displayName)].length;

  if (length < 2 || length > 12) {
    throw invalidName("道号长度必须为 2 至 12 个字符");
  }
  if (!ALLOWED_NAME_CHARACTERS.test(displayName)) {
    throw invalidName("道号只能包含中文、英文字母和数字");
  }

  const displayNameKey = displayName.toLocaleLowerCase("en-US");
  if (RESERVED_FRAGMENTS.some((fragment) => displayNameKey.includes(fragment))) {
    throw invalidName("道号包含系统保留词");
  }

  return { displayName, displayNameKey };
}

function invalidName(message: string): AppError {
  return new AppError("NAME_INVALID", message, 400, false);
}
