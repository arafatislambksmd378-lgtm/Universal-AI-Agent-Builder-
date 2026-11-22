import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../env';
import { createLogger } from '../lib/logger';

/** Assigns a request id, a redacting logger and logs the outcome of every request. */
export const requestContext: MiddlewareHandler<AppBindings> = async (c, next) => {
  const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.set(
    'logger',
    createLogger({
      level: c.env.LOG_LEVEL ?? 'info',
      requestId,
      route: `${c.req.method} ${new URL(c.req.url).pathname}`,
    }),
  );

  const started = Date.now();
  let status = 500;
  try {
    await next();
    status = c.res.status;
  } catch (error) {
    status = 500;
    throw error;
  } finally {
    c.get('logger').info('request.completed', {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status,
      durationMs: Date.now() - started,
    });
    if (c.res) c.res.headers.set('x-request-id', requestId);
  }
};
