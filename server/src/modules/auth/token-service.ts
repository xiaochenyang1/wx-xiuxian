import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { AuthTokens } from "@cultivation-diary/shared";
import { AppError } from "../../common/app-error";
import type { AppConfig } from "../../config/env";

export interface SessionIdentity {
  sessionId: string;
  accountId: string;
  playerId: string;
  createdAt: Date;
  refreshExpiresAt: Date;
}

export interface AccessIdentity {
  sessionId: string;
  accountId: string;
  playerId: string;
}

export class TokenService {
  constructor(private readonly config: AppConfig) {}

  issue(session: SessionIdentity): AuthTokens {
    const issuedAtSeconds = Math.floor(session.createdAt.getTime() / 1000);
    const accessExpiresAt = new Date(
      (issuedAtSeconds + this.config.accessTokenTtlSeconds) * 1000,
    );
    const accessToken = jwt.sign(
      {
        sub: session.accountId,
        sessionId: session.sessionId,
        playerId: session.playerId,
        type: "access",
        iat: issuedAtSeconds,
        exp: Math.floor(accessExpiresAt.getTime() / 1000),
      },
      this.config.accessTokenSecret,
      { algorithm: "HS256" },
    );

    return {
      accessToken,
      accessTokenExpiresAt: accessExpiresAt.toISOString(),
      refreshToken: this.createRefreshToken(session.sessionId),
      refreshTokenExpiresAt: session.refreshExpiresAt.toISOString(),
    };
  }

  verifyAccessToken(token: string): AccessIdentity {
    let payload: string | JwtPayload;

    try {
      payload = jwt.verify(token, this.config.accessTokenSecret, {
        algorithms: ["HS256"],
      });
    } catch {
      throw unauthenticated();
    }

    if (
      typeof payload === "string" ||
      payload.type !== "access" ||
      typeof payload.sub !== "string" ||
      typeof payload.sessionId !== "string" ||
      typeof payload.playerId !== "string"
    ) {
      throw unauthenticated();
    }

    return {
      accountId: payload.sub,
      sessionId: payload.sessionId,
      playerId: payload.playerId,
    };
  }

  createRefreshToken(sessionId: string): string {
    const proof = createHmac("sha256", this.config.refreshTokenSecret)
      .update(`refresh:${sessionId}`)
      .digest("base64url");
    return `${sessionId}.${proof}`;
  }

  parseRefreshToken(token: string): { sessionId: string; tokenHash: string } {
    const separator = token.indexOf(".");
    if (separator <= 0 || separator === token.length - 1) {
      throw sessionExpired();
    }

    const sessionId = token.slice(0, separator);
    const expected = this.createRefreshToken(sessionId);
    const receivedBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw sessionExpired();
    }

    return { sessionId, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}

function unauthenticated(): AppError {
  return new AppError("UNAUTHENTICATED", "登录状态无效，请重新登录", 401, false);
}

function sessionExpired(): AppError {
  return new AppError("SESSION_EXPIRED", "会话已过期，请重新登录", 401, false);
}
