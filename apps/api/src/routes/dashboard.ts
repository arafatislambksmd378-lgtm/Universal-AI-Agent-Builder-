import { Hono } from 'hono';
import type { AppBindings } from '../env';
import { requireAuth } from '../middleware/auth';
import { collectDashboard } from '../services/dashboard.service';

export const dashboardRoutes = new Hono<AppBindings>();

dashboardRoutes.get('/summary', requireAuth, async (c) => {
  const summary = await collectDashboard({ db: c.env.DB, env: c.env, now: new Date() });
  return c.json(summary);
});
