import { Hono } from 'hono';
import { ROADMAP, roadmapSummary, type RoadmapResponse } from '@aism/core';
import type { AppBindings } from '../env';
import { requireAuth } from '../middleware/auth';

export const roadmapRoutes = new Hono<AppBindings>();

roadmapRoutes.get('/', requireAuth, async (c) => {
  const body: RoadmapResponse = {
    phases: [...ROADMAP],
    summary: roadmapSummary(),
  };
  return c.json(body);
});
