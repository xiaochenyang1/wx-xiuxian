// `PlatformAdapter` imports `cc/env` at module scope. Tests only reference the
// adapter as a type, so the module is erased at runtime and never loaded; this
// shim exists purely so `tsc` can resolve it outside the Cocos Creator editor.
declare module "cc/env" {
  export const DEBUG: boolean;
  export const DEV: boolean;
  export const WECHAT: boolean;
}
