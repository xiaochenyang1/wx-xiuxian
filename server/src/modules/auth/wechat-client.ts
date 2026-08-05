import { AppError } from "../../common/app-error";
import type { AppConfig } from "../../config/env";
import type { ExternalIdentity } from "./auth-repository";

export interface WechatCodeExchanger {
  exchange(code: string): Promise<ExternalIdentity>;
}

interface WechatCodeResponse {
  openid?: unknown;
  unionid?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
}

export class HttpWechatCodeExchanger implements WechatCodeExchanger {
  constructor(private readonly config: AppConfig) {}

  async exchange(code: string): Promise<ExternalIdentity> {
    if (!this.config.wechatAppId || !this.config.wechatAppSecret) {
      throw new AppError(
        "WECHAT_AUTH_UNAVAILABLE",
        "微信登录配置尚未完成",
        503,
        true,
      );
    }

    const query = new URLSearchParams({
      appid: this.config.wechatAppId,
      secret: this.config.wechatAppSecret,
      js_code: code,
      grant_type: "authorization_code",
    });

    let response: Response;
    try {
      response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query}`, {
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new AppError("WECHAT_AUTH_UNAVAILABLE", "微信登录服务暂时不可用", 503, true);
    }

    if (!response.ok) {
      throw new AppError("WECHAT_AUTH_UNAVAILABLE", "微信登录服务暂时不可用", 503, true);
    }

    let payload: WechatCodeResponse;
    try {
      payload = (await response.json()) as WechatCodeResponse;
    } catch {
      throw new AppError("WECHAT_AUTH_UNAVAILABLE", "微信登录响应无效", 503, true);
    }
    if (typeof payload.errcode === "number" && payload.errcode !== 0) {
      throw new AppError("UNAUTHENTICATED", "微信登录凭证无效，请重试", 401, false);
    }
    if (typeof payload.openid !== "string" || payload.openid.length === 0) {
      throw new AppError("WECHAT_AUTH_UNAVAILABLE", "微信登录响应无效", 503, true);
    }

    return {
      openId: payload.openid,
      unionId: typeof payload.unionid === "string" ? payload.unionid : null,
    };
  }
}
