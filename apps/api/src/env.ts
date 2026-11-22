/** Bindings and variables available to every request. */
export interface Env {
  DB: D1Database;
  ENVIRONMENT?: 'development' | 'staging' | 'production' | string;
  APP_NAME?: string;
  /** Comma-separated list of allowed browser origins (e.g. https://app.example.com). */
  APP_ORIGIN?: string;
  /** One-time token that allows creating the first owner account. */
  SETUP_TOKEN?: string;
  /** Reserved for HMAC use (webhooks, signed links). Never sent to the browser. */
  SESSION_SECRET?: string;
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error' | string;
  /** "false" only for local development over http. */
  COOKIE_SECURE?: string;
  /**
   * "none" is required when the web app is served from a different site
   * (e.g. pages.dev → workers.dev). Same-registrable-domain deployments keep
   * the stricter "lax" default.
   */
  COOKIE_SAMESITE?: string;
  PASSWORD_ITERATIONS?: string;
}

export interface AuthContext {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: 'owner' | 'operator' | 'viewer';
  };
  session: {
    id: string;
    csrfToken: string;
    expiresAt: string;
  };
}

export interface AppBindings {
  Bindings: Env;
  Variables: {
    requestId: string;
    logger: Logger;
    auth?: AuthContext;
  };
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}
