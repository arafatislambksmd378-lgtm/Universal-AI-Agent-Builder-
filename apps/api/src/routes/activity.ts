import { Hono } from 'hono';
import type { ActivityResponse } from '@aism/core';
import type { AppBindings } from '../env';
import { requireAuth } from '../middleware/auth';
import { activityQuerySchema, parseQuery } from '../lib/validation';
import { listAudit } from '../db/audit';

export const activityRoutes = new Hono<AppBindings>();

activityRoutes.get('/', requireAuth, async (c) => {
  const query = parseQuery(c, activityQuerySchema);
  const items = await listAudit(c.env.DB, { limit: query.limit, before: query.before ?? null });
  const body: ActivityResponse = {
    items,
    nextBefore: items.length === query.limit ? items[items.length - 1]?.createdAt ?? null : null,
  };
  return c.json(body);
});
