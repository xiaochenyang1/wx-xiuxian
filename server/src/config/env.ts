export type NodeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  redisUrl: string;
  enableDevAuth: boolean;
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  wechatAppId: string | null;
  wechatAppSecret: string | null;
  corsAllowedOrigins: string[];
}

const DEVELOPMENT_ACCESS_TOKEN_SECRET = "development-access-token-secret-change-before-release";
const DEVELOPMENT_REFRESH_TOKEN_SECRET = "development-refresh-token-secret-change-before-release";

export function loadAppConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = parseNodeEnvironment(environment.NODE_ENV);
  const enableDevAuth = parseBoolean(
    environment.ENABLE_DEV_AUTH,
    nodeEnv === "development",
    "ENABLE_DEV_AUTH",
  );

  if (nodeEnv === "production" && enableDevAuth) {
    throw new Error("ENABLE_DEV_AUTH must be false in production");
  }

  const accessTokenSecret = readSecret(
    environment.ACCESS_TOKEN_SECRET,
    nodeEnv,
    DEVELOPMENT_ACCESS_TOKEN_SECRET,
    "ACCESS_TOKEN_SECRET",
  );
  const refreshTokenSecret = readSecret(
    environment.REFRESH_TOKEN_SECRET,
    nodeEnv,
    DEVELOPMENT_REFRESH_TOKEN_SECRET,
    "REFRESH_TOKEN_SECRET",
  );
  const wechatAppId = readOptionalString(environment.WECHAT_APP_ID);
  const wechatAppSecret = readOptionalString(environment.WECHAT_APP_SECRET);
  const accessTokenTtlSeconds = parsePositiveInteger(
    environment.ACCESS_TOKEN_TTL_SECONDS,
    15 * 60,
    "ACCESS_TOKEN_TTL_SECONDS",
  );
  const refreshTokenTtlSeconds = parsePositiveInteger(
    environment.REFRESH_TOKEN_TTL_SECONDS,
    30 * 24 * 60 * 60,
    "REFRESH_TOKEN_TTL_SECONDS",
  );

  if ((wechatAppId === null) !== (wechatAppSecret === null)) {
    throw new Error("WECHAT_APP_ID and WECHAT_APP_SECRET must be configured together");
  }
  if (refreshTokenTtlSeconds <= accessTokenTtlSeconds) {
    throw new Error("REFRESH_TOKEN_TTL_SECONDS must be greater than ACCESS_TOKEN_TTL_SECONDS");
  }

  return {
    nodeEnv,
    host: environment.HOST?.trim() || "127.0.0.1",
    port: parsePort(environment.PORT),
    logLevel: environment.LOG_LEVEL?.trim() || "info",
    databaseUrl:
      environment.DATABASE_URL?.trim() ||
      "postgresql://cultivation:cultivation_dev@127.0.0.1:5432/cultivation_diary",
    redisUrl: environment.REDIS_URL?.trim() || "redis://127.0.0.1:6379",
    enableDevAuth,
    accessTokenSecret,
    refreshTokenSecret,
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
    wechatAppId,
    wechatAppSecret,
    corsAllowedOrigins: parseCorsOrigins(environment.CORS_ALLOWED_ORIGINS),
  };
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  const normalized = value?.trim() || "development";

  if (normalized !== "development" && normalized !== "test" && normalized !== "production") {
    throw new Error(`Unsupported NODE_ENV: ${normalized}`);
  }

  return normalized;
}

function parsePort(value: string | undefined): number {
  const port = value === undefined || value.trim() === "" ? 3000 : Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

function parseBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function readSecret(
  value: string | undefined,
  nodeEnv: NodeEnvironment,
  developmentFallback: string,
  name: string,
): string {
  const secret = value?.trim() || (nodeEnv === "production" ? "" : developmentFallback);

  if (secret.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }

  return secret;
}

function readOptionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined || value.trim() === "" ? fallback : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }

  return parsed;
}

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value.split(",").map((entry) => {
    const candidate = entry.trim();
    let url: URL;

    try {
      url = new URL(candidate);
    } catch {
      throw new Error(`Invalid CORS origin: ${candidate}`);
    }

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.origin !== candidate
    ) {
      throw new Error(`Invalid CORS origin: ${candidate}`);
    }

    return url.origin;
  });
}
