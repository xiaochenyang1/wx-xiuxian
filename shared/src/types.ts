export type BigNumberString = string;

export const BASIS_POINTS = 10_000;
export const MICROS_PER_UNIT = 1_000_000;
export const MICROS_PER_SECOND = 1_000_000;
export const SECONDS_PER_MINUTE = 60;
export const MAX_OFFLINE_SECONDS = 86_400;

export interface ApiSuccess<T> {
  requestId: string;
  serverTime: string;
  playerVersion: string;
  data: T;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export interface ApiFailure {
  requestId: string;
  serverTime: string;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
