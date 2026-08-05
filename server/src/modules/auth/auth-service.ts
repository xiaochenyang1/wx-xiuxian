import type {
  AuthLoginResult,
  BootstrapSnapshot,
  RefreshSessionResult,
} from "@cultivation-diary/shared";
import { AppError } from "../../common/app-error";
import { hashRequest, sha256 } from "../../common/hash";
import type { AppConfig } from "../../config/env";
import {
  AuthRepository,
  type ExternalIdentity,
} from "./auth-repository";
import { TokenService, type AccessIdentity } from "./token-service";
import type { WechatCodeExchanger } from "./wechat-client";
import { BootstrapService } from "../bootstrap/bootstrap-service";

export interface DevLoginInput {
  accountId: string;
  deviceKey?: string;
}

export interface WechatLoginInput {
  code: string;
  deviceKey?: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface AuthOperationResult<T> {
  playerVersion: string;
  data: T;
}

export interface AuthServicePort {
  loginDev(
    input: DevLoginInput,
    idempotencyKey: string,
  ): Promise<AuthOperationResult<AuthLoginResult>>;
  loginWechat(
    input: WechatLoginInput,
    idempotencyKey: string,
  ): Promise<AuthOperationResult<AuthLoginResult>>;
  refresh(
    input: RefreshInput,
    idempotencyKey: string,
  ): Promise<AuthOperationResult<RefreshSessionResult>>;
  bootstrap(authorization: string | undefined): Promise<{
    playerVersion: string;
    data: BootstrapSnapshot;
  }>;
  authenticate(authorization: string | undefined): Promise<AccessIdentity>;
}

export class AuthService implements AuthServicePort {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: AuthRepository,
    private readonly tokenService: TokenService,
    private readonly bootstrapService: BootstrapService,
    private readonly wechatCodeExchanger: WechatCodeExchanger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async loginDev(
    input: DevLoginInput,
    idempotencyKey: string,
  ): Promise<AuthOperationResult<AuthLoginResult>> {
    if (!this.config.enableDevAuth) {
      throw new AppError("ROUTE_NOT_FOUND", "接口不存在", 404, false);
    }

    const accountId = normalizeDevAccountId(input.accountId);
    return this.loginWithIdentity(
      {
        openId: `dev:${accountId}`,
        unionId: null,
      },
      input.deviceKey,
      idempotencyKey,
      hashRequest({ method: "dev", accountId, deviceKey: input.deviceKey ?? null }),
    );
  }

  async loginWechat(
    input: WechatLoginInput,
    idempotencyKey: string,
  ): Promise<AuthOperationResult<AuthLoginResult>> {
    const identity = await this.wechatCodeExchanger.exchange(input.code);
    return this.loginWithIdentity(
      identity,
      input.deviceKey,
      idempotencyKey,
      hashRequest({
        method: "wechat",
        openId: identity.openId,
        codeHash: sha256(input.code),
        deviceKey: input.deviceKey ?? null,
      }),
    );
  }

  async refresh(
    input: RefreshInput,
    idempotencyKey: string,
  ): Promise<AuthOperationResult<RefreshSessionResult>> {
    const parsed = this.tokenService.parseRefreshToken(input.refreshToken);
    const now = this.clock();
    const session = await this.repository.refresh({
      currentSessionId: parsed.sessionId,
      currentRefreshTokenHash: parsed.tokenHash,
      idempotencyKey,
      requestHash: hashRequest({ refreshTokenHash: parsed.tokenHash }),
      now,
      sessionExpiresAt: addSeconds(now, this.config.refreshTokenTtlSeconds),
      idempotencyExpiresAt: addSeconds(now, this.config.accessTokenTtlSeconds),
      createRefreshTokenHash: (sessionId) => this.refreshTokenHashForSession(sessionId),
    });
    const bootstrap = await this.bootstrapService.getSnapshot(
      session.accountId,
      session.playerId,
    );

    return {
      playerVersion: bootstrap.playerVersion,
      data: {
        tokens: this.tokenService.issue(session),
        bootstrap: bootstrap.snapshot,
      },
    };
  }

  async authenticate(authorization: string | undefined): Promise<AccessIdentity> {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      throw new AppError("UNAUTHENTICATED", "请先登录", 401, false);
    }

    const identity = this.tokenService.verifyAccessToken(match[1]);
    await this.repository.assertActiveSession(identity);
    return identity;
  }

  async bootstrap(authorization: string | undefined): Promise<{
    playerVersion: string;
    data: BootstrapSnapshot;
  }> {
    const identity = await this.authenticate(authorization);
    const result = await this.bootstrapService.getSnapshot(
      identity.accountId,
      identity.playerId,
    );
    return { playerVersion: result.playerVersion, data: result.snapshot };
  }

  private async loginWithIdentity(
    identity: ExternalIdentity,
    deviceKey: string | undefined,
    idempotencyKey: string,
    requestHashValue: string,
  ): Promise<AuthOperationResult<AuthLoginResult>> {
    const now = this.clock();
    const persistence = await this.repository.login({
      identity,
      idempotencyKey,
      requestHash: requestHashValue,
      deviceKeyHash: deviceKey ? sha256(deviceKey) : null,
      now,
      sessionExpiresAt: addSeconds(now, this.config.refreshTokenTtlSeconds),
      idempotencyExpiresAt: addSeconds(now, this.config.accessTokenTtlSeconds),
      createRefreshTokenHash: (sessionId) => this.refreshTokenHashForSession(sessionId),
    });
    const bootstrap = await this.bootstrapService.getSnapshot(
      persistence.session.accountId,
      persistence.session.playerId,
    );

    return {
      playerVersion: bootstrap.playerVersion,
      data: {
        isNewPlayer: persistence.isNewPlayer,
        tokens: this.tokenService.issue(persistence.session),
        bootstrap: bootstrap.snapshot,
      },
    };
  }

  private refreshTokenHashForSession(sessionId: string): string {
    return this.tokenService.hashRefreshToken(
      this.tokenService.createRefreshToken(sessionId),
    );
  }
}

function normalizeDevAccountId(value: string): string {
  if (
    value !== value.trim() ||
    value.length < 1 ||
    value.length > 64 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  ) {
    throw new AppError(
      "INVALID_REQUEST",
      "开发账号标识只能包含英文字母、数字、点、下划线和连字符",
      400,
      false,
    );
  }

  return value.toLowerCase();
}

function addSeconds(value: Date, seconds: number): Date {
  return new Date(value.getTime() + seconds * 1000);
}
