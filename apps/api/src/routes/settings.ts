import { Hono } from 'hono';
import { z } from 'zod';
import { getActionPolicy, isActionId, type ActionPolicy } from '@aism/core';
import type { AppBindings } from '../env';
import { requireAuth, requireCsrf } from '../middleware/auth';
import { enforceUserRateLimit } from '../middleware/rate-limit';
import { badRequest } from '../lib/errors';
import { budgetUpdateSchema, parseJsonBody } from '../lib/validation';
import { clientIp } from '../lib/rate-limit';
import { collectSettings, setGrant, updateBudget } from '../services/settings.service';

export const settingsRoutes = new Hono<AppBindings>();

settingsRoutes.use('*', requireAuth);

settingsRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth) throw new Error('requireAuth did not set context');
  const settings = await collectSettings({
    db: c.env.DB,
    env: c.env,
    auth,
    now: new Date(),
  });
  return c.json(settings);
});

settingsRoutes.put('/budget', requireCsrf, async (c) => {
  await enforceUserRateLimit(c, 'settings_budget', 20, 60);
  const auth = c.get('auth');
  if (!auth) throw new Error('requireAuth did not set context');
  const input = await parseJsonBody(c, budgetUpdateSchema);
  const result = await updateBudget({
    db: c.env.DB,
    auth,
    input,
    now: new Date(),
    ip: clientIp(c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null),
    requestId: c.get('requestId'),
  });
  return c.json(result);
});

const grantSchema = z.object({ enabled: z.boolean() });

settingsRoutes.put('/permissions/:actionId', requireCsrf, async (c) => {
  await enforceUserRateLimit(c, 'settings_permission', 30, 60);
  const auth = c.get('auth');
  if (!auth) throw new Error('requireAuth did not set context');
  const actionId = c.req.param('actionId');
  if (!isActionId(actionId)) throw badRequest('Unknown action.');
  const policy: ActionPolicy = getActionPolicy(actionId);
  if (policy.category !== 2) {
    throw badRequest(
      policy.category === 3
        ? 'Level 3 actions always require a fresh approval and cannot be pre-authorised.'
        : 'Level 1 actions are read-only and need no grant.',
    );
  }
  const input = await parseJsonBody(c, grantSchema);
  const result = await setGrant({
    db: c.env.DB,
    auth,
    actionId,
    enabled: input.enabled,
    now: new Date(),
    ip: clientIp(c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null),
    requestId: c.get('requestId'),
  });
  return c.json({
    ...result,
    message: input.enabled
      ? `${policy.label} enabled for approved automation.`
      : `${policy.label} disabled.`,
  });
});
