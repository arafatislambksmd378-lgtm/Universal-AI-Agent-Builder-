import { AGENTS, ROADMAP, type DashboardSummary } from '@aism/core';
import type { Db } from '../db/client';
import { listAudit } from '../db/audit';
import type { Env } from '../env';
import { budgetSnapshot } from './budget.service';
import { buildIntegrations } from './integrations.service';

/**
 * Everything on the dashboard is derived from real rows. Where a data source
 * does not exist yet the value is null and `available` is false — the UI renders
 * an honest empty state instead of a plausible-looking number.
 */
export async function collectDashboard(params: {
  db: Db;
  env: Env;
  now: Date;
}): Promise<DashboardSummary> {
  const { db, env, now } = params;
  const [snapshot, activity] = await Promise.all([
    budgetSnapshot(db, now),
    listAudit(db, { limit: 8 }),
  ]);

  const currentPhase = ROADMAP.find((phase) => phase.status !== 'complete') ?? ROADMAP[ROADMAP.length - 1]!;
  const executable = AGENTS.filter((agent) =>
    agent.dependencies.every((dependency) => dependency.status === 'available'),
  ).length;

  return {
    generatedAt: now.toISOString(),
    store: {
      available: false,
      status: 'not_connected',
      connectedStores: 0,
      note: 'No Shopify store is connected. OAuth installation arrives in Phase 02.',
    },
    catalogue: {
      available: false,
      products: null,
      orders: null,
      inventoryAlerts: null,
      note: 'No catalogue data exists until the Shopify sync in Phase 02. Nothing is estimated or simulated.',
    },
    approvals: {
      available: false,
      pending: null,
      note: 'The approval centre is part of Phase 03. No agent can request actions yet.',
    },
    agents: {
      registered: AGENTS.length,
      executable,
    },
    aiUsage: {
      ...snapshot.view,
      monthToDateRequests: snapshot.monthRequestCount,
      providerConfigured: false,
      note: 'Gemini is not connected yet, so AI spend is genuinely $0.00.',
    },
    activity,
    roadmap: {
      complete: ROADMAP.filter((phase) => phase.status === 'complete').length,
      total: ROADMAP.length,
      currentPhase: { title: currentPhase.title, status: currentPhase.status },
    },
    integrations: buildIntegrations(env),
  };
}
