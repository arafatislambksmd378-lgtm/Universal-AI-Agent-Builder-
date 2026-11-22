import { describe, expect, it } from 'vitest';
import type {
  DashboardSummary,
  SettingsResponse,
  AgentsResponse,
  RoadmapResponse,
  ActivityResponse,
} from '@aism/core';
import { createOwnerSession, createTestContext, request } from './helpers';

async function getJson<T>(response: Response): Promise<T> {
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as T;
}

describe('dashboard summary', () => {
  it('reports honest empty states instead of invented figures', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const summary = await getJson<DashboardSummary>(
      await request(ctx, '/api/dashboard/summary', { cookie: session.cookie }),
    );

    expect(summary.store.available).toBe(false);
    expect(summary.catalogue).toMatchObject({ available: false, products: null, orders: null });
    expect(summary.approvals).toMatchObject({ available: false, pending: null });
    expect(summary.aiUsage.monthToDateCents).toBe(0);
    expect(summary.aiUsage.monthlyLimitCents).toBe(500);
    expect(summary.aiUsage.providerConfigured).toBe(false);
    expect(summary.agents.registered).toBe(10);
    expect(summary.agents.executable).toBe(0);
    expect(summary.roadmap.total).toBe(8);
    expect(summary.roadmap.complete).toBe(1);
    expect(summary.integrations.find((entry) => entry.id === 'shopify')?.status).toBe(
      'not_implemented',
    );
  });

  it('includes the real authentication activity of this session', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const summary = await getJson<DashboardSummary>(
      await request(ctx, '/api/dashboard/summary', { cookie: session.cookie }),
    );
    expect(summary.activity.some((entry) => entry.action === 'auth.setup')).toBe(true);
  });
});

describe('settings', () => {
  it('exposes the budget, policy counts and integration truth', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const settings = await getJson<SettingsResponse>(
      await request(ctx, '/api/settings', { cookie: session.cookie }),
    );
    expect(settings.budget).toMatchObject({
      monthlyLimitCents: 500,
      dailyLimitCents: 50,
      monthToDateCents: 0,
      mode: 'normal',
    });
    expect(settings.permissions.level1).toBeGreaterThan(0);
    expect(settings.permissions.level2).toBeGreaterThan(0);
    expect(settings.permissions.level3).toBeGreaterThan(0);
    expect(settings.permissions.granted).toBe(0);
    expect(settings.security.setupComplete).toBe(true);
    expect(settings.security.passwordIterations).toBeGreaterThanOrEqual(100_000);
    expect(settings.ai.configured).toBe(false);
  });

  it('persists a lowered budget and audits the change', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const update = await request(ctx, '/api/settings/budget', {
      method: 'PUT',
      cookie: session.cookie,
      csrf: session.csrf,
      body: { monthlyLimitCents: 250, dailyLimitCents: 25, warningThresholdPct: 70 },
    });
    expect(update.status).toBe(200);

    const settings = await getJson<SettingsResponse>(
      await request(ctx, '/api/settings', { cookie: session.cookie }),
    );
    expect(settings.budget).toMatchObject({
      monthlyLimitCents: 250,
      dailyLimitCents: 25,
      warningThresholdPct: 70,
    });
    expect(settings.budget.remainingCents).toBe(250);

    const activity = await getJson<ActivityResponse>(
      await request(ctx, '/api/activity', { cookie: session.cookie }),
    );
    const entry = activity.items.find((item) => item.action === 'settings.budget.update');
    expect(entry?.outcome).toBe('success');
    expect(entry?.metadata).toMatchObject({ monthlyLimitCents: 250 });
  });

  it('cannot raise the ceiling above the authorised $5', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    for (const monthlyLimitCents of [501, 100000, -1]) {
      const response = await request(ctx, '/api/settings/budget', {
        method: 'PUT',
        cookie: session.cookie,
        csrf: session.csrf,
        body: { monthlyLimitCents, dailyLimitCents: 50, warningThresholdPct: 80 },
      });
      expect(response.status, String(monthlyLimitCents)).toBe(400);
    }
    const settings = await getJson<SettingsResponse>(
      await request(ctx, '/api/settings', { cookie: session.cookie }),
    );
    expect(settings.budget.monthlyLimitCents).toBe(500);
  });

  it('allows enabling a level-2 permission but never a level-3 one', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);

    const level2 = await request(ctx, '/api/settings/permissions/update_product_tags', {
      method: 'PUT',
      cookie: session.cookie,
      csrf: session.csrf,
      body: { enabled: true },
    });
    expect(level2.status).toBe(200);

    const level3 = await request(ctx, '/api/settings/permissions/issue_refund', {
      method: 'PUT',
      cookie: session.cookie,
      csrf: session.csrf,
      body: { enabled: true },
    });
    expect(level3.status).toBe(400);

    const readOnly = await request(ctx, '/api/settings/permissions/read_orders', {
      method: 'PUT',
      cookie: session.cookie,
      csrf: session.csrf,
      body: { enabled: true },
    });
    expect(readOnly.status).toBe(400);

    const unknown = await request(ctx, '/api/settings/permissions/launch_rocket', {
      method: 'PUT',
      cookie: session.cookie,
      csrf: session.csrf,
      body: { enabled: true },
    });
    expect(unknown.status).toBe(400);

    const settings = await getJson<SettingsResponse>(
      await request(ctx, '/api/settings', { cookie: session.cookie }),
    );
    expect(settings.permissions.granted).toBe(1);
  });

  it('can revoke a previously granted permission', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const grant = () =>
      request(ctx, '/api/settings/permissions/update_inventory_rules', {
        method: 'PUT',
        cookie: session.cookie,
        csrf: session.csrf,
        body: { enabled: true },
      });
    const revoke = () =>
      request(ctx, '/api/settings/permissions/update_inventory_rules', {
        method: 'PUT',
        cookie: session.cookie,
        csrf: session.csrf,
        body: { enabled: false },
      });
    await grant();
    expect(
      (await getJson<SettingsResponse>(await request(ctx, '/api/settings', { cookie: session.cookie })))
        .permissions.granted,
    ).toBe(1);
    await revoke();
    expect(
      (await getJson<SettingsResponse>(await request(ctx, '/api/settings', { cookie: session.cookie })))
        .permissions.granted,
    ).toBe(0);
  });
});

describe('agent registry endpoint', () => {
  it('returns all ten agents with their action policies', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const body = await getJson<AgentsResponse>(
      await request(ctx, '/api/agents', { cookie: session.cookie }),
    );
    expect(body.agents).toHaveLength(10);
    expect(body.agents.every((agent) => agent.executionStatus === 'registry_only')).toBe(true);
    const marketing = body.agents.find((agent) => agent.id === 'marketing');
    expect(marketing?.actions.some((action) => action.id === 'activate_paid_ads')).toBe(true);
    const refundAction = body.agents
      .flatMap((agent) => agent.actions)
      .find((action) => action.id === 'issue_refund');
    expect(refundAction?.requiresApproval).toBe(true);
  });
});

describe('roadmap endpoint', () => {
  it('reflects the real phase state', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const body = await getJson<RoadmapResponse>(
      await request(ctx, '/api/roadmap', { cookie: session.cookie }),
    );
    expect(body.summary).toMatchObject({ total: 8, complete: 1, planned: 7 });
    const foundation = body.phases.find((phase) => phase.id === 'foundation');
    expect(foundation?.status).toBe('complete');
    const shopify = body.phases.find((phase) => phase.id === 'shopify');
    expect(shopify?.completed).toEqual([]);
  });
});

describe('activity feed', () => {
  it('paginates and validates the limit', async () => {
    const ctx = createTestContext();
    const session = await createOwnerSession(ctx);
    const body = await getJson<ActivityResponse>(
      await request(ctx, '/api/activity?limit=1', { cookie: session.cookie }),
    );
    expect(body.items).toHaveLength(1);
    expect(body.nextBefore).toBeTruthy();

    const invalid = await request(ctx, '/api/activity?limit=9999', { cookie: session.cookie });
    expect(invalid.status).toBe(400);
  });
});
