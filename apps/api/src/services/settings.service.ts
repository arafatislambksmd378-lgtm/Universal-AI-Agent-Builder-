import {
  ACTIONS,
  AGENTS,
  defaultGrants,
  listActionPolicies,
  type BudgetUpdateResponse,
  type SettingsResponse,
} from '@aism/core';
import type { Db } from '../db/client';
import { getSetting, putSetting, setBudgetConfig } from '../db/settings';
import { writeAudit } from '../db/audit';
import { resolvedPasswordIterations } from './auth.service';
import { budgetSnapshot } from './budget.service';
import type { AuthContext, Env } from '../env';
import { getUserProfile } from './auth.service';
import { SESSION_TTL_MS } from '../middleware/auth';
import { buildIntegrations } from './integrations.service';

const GRANTS_KEY = 'permissions.grants';

export async function readGrants(
  db: Db,
): Promise<Record<string, boolean>> {
  const stored = await getSetting<Record<string, boolean>>(db, GRANTS_KEY);
  return { ...defaultGrants(), ...(stored ?? {}) };
}

export async function collectSettings(params: {
  db: Db;
  env: Env;
  auth: AuthContext;
  now: Date;
}): Promise<SettingsResponse> {
  const { db, env, auth, now } = params;
  const [snapshot, profile, grants] = await Promise.all([
    budgetSnapshot(db, now),
    getUserProfile(db, auth.user.id),
    readGrants(db),
  ]);
  const policies = listActionPolicies();
  const grantedCount = Object.entries(grants).filter(
    ([actionId, enabled]) => enabled === true && actionId in ACTIONS,
  ).length;

  return {
    environment: env.ENVIRONMENT ?? 'unknown',
    appName: env.APP_NAME ?? 'AI Store Manager',
    user: {
      ...auth.user,
      createdAt: profile?.created_at ?? null,
    },
    budget: snapshot.view,
    ai: {
      provider: 'gemini',
      configured: false,
      note: 'Gemini integration is not implemented yet (Phase 03). No AI requests are being made or billed.',
    },
    integrations: buildIntegrations(env),
    security: {
      passwordIterations: resolvedPasswordIterations(env),
      sessionTtlHours: SESSION_TTL_MS / (60 * 60 * 1000),
      cookieSecure: env.COOKIE_SECURE !== 'false',
      setupComplete: true,
    },
    permissions: {
      level1: policies.filter((policy) => policy.category === 1).length,
      level2: policies.filter((policy) => policy.category === 2).length,
      level3: policies.filter((policy) => policy.category === 3).length,
      granted: grantedCount,
      grants: Object.fromEntries(
        Object.entries(grants).filter(
          ([actionId, enabled]) => enabled === true && actionId in ACTIONS,
        ),
      ),
    },
  };
}

export async function updateBudget(params: {
  db: Db;
  auth: AuthContext;
  input: { monthlyLimitCents: number; dailyLimitCents: number; warningThresholdPct: number };
  now: Date;
  ip: string | null;
  requestId: string;
}): Promise<BudgetUpdateResponse> {
  const { db, auth, input, now, ip, requestId } = params;
  await setBudgetConfig(db, input, now.toISOString());
  await writeAudit(db, {
    actorType: 'owner',
    actorId: auth.user.id,
    action: 'settings.budget.update',
    targetType: 'budget_limit',
    targetId: 'global',
    outcome: 'success',
    metadata: {
      monthlyLimitCents: input.monthlyLimitCents,
      dailyLimitCents: input.dailyLimitCents,
      warningThresholdPct: input.warningThresholdPct,
    },
    ip,
    requestId,
    now: now.toISOString(),
  });
  const snapshot = await budgetSnapshot(db, now);
  return {
    budget: snapshot.view,
    message: 'Budget limits updated.',
  };
}

export async function setGrant(params: {
  db: Db;
  auth: AuthContext;
  actionId: string;
  enabled: boolean;
  now: Date;
  ip: string | null;
  requestId: string;
}): Promise<{ grants: Record<string, boolean> }> {
  const { db, auth, actionId, enabled, now, ip, requestId } = params;
  const grants = await readGrants(db);
  if (enabled) grants[actionId] = true;
  else delete grants[actionId];
  await putSetting(db, GRANTS_KEY, grants, auth.user.id, now.toISOString());
  await writeAudit(db, {
    actorType: 'owner',
    actorId: auth.user.id,
    action: 'settings.permission.update',
    targetType: 'permission',
    targetId: actionId,
    outcome: 'success',
    metadata: { enabled },
    ip,
    requestId,
    now: now.toISOString(),
  });
  return { grants };
}

export function agentCount(): number {
  return AGENTS.length;
}
