/**
 * DTOs shared by the Worker API and the React client.
 * Keeping them in one place means a backend change breaks the typecheck of the
 * UI instead of silently producing an empty screen.
 */

import type { BudgetMode } from './budget';
import type { PhaseRecord, PhaseStatus } from './roadmap';
import type { PermissionCategory, RiskLevel } from './types';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  environment: string;
  time: string;
  checks: {
    database: { ok: boolean; latencyMs: number; migrationsApplied: number; error?: string };
  };
  features: {
    shopify: boolean;
    ai: boolean;
    automation: boolean;
  };
}

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: 'owner' | 'operator' | 'viewer';
}

export interface SessionView {
  csrfToken: string;
  expiresAt: string;
}

export interface MeResponse {
  user: PublicUser;
  session: SessionView;
  environment: string;
  setupComplete: boolean;
}

export interface AuthSessionResponse extends MeResponse {
  user: PublicUser;
}

export interface ActivityEntryView {
  id: string;
  createdAt: string;
  actorType: 'owner' | 'system' | 'agent' | 'webhook';
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  outcome: 'success' | 'failure' | 'denied';
  metadata: Record<string, unknown> | null;
  requestId: string | null;
}

export interface ActivityResponse {
  items: ActivityEntryView[];
  nextBefore: string | null;
}

export interface IntegrationStatus {
  id: string;
  name: string;
  status: 'connected' | 'not_connected' | 'not_implemented' | 'requires_configuration';
  detail: string;
}

export interface BudgetView {
  monthlyLimitCents: number;
  dailyLimitCents: number;
  warningThresholdPct: number;
  monthToDateCents: number;
  todayCents: number;
  remainingCents: number;
  utilizationPct: number;
  mode: BudgetMode;
}

export interface DashboardSummary {
  generatedAt: string;
  store: { available: boolean; status: string; connectedStores: number; note: string };
  catalogue: {
    available: boolean;
    products: number | null;
    orders: number | null;
    inventoryAlerts: number | null;
    note: string;
  };
  approvals: { available: boolean; pending: number | null; note: string };
  agents: { registered: number; executable: number };
  aiUsage: BudgetView & { monthToDateRequests: number; providerConfigured: boolean; note: string };
  activity: ActivityEntryView[];
  roadmap: {
    complete: number;
    total: number;
    currentPhase: { title: string; status: PhaseStatus };
  };
  integrations: IntegrationStatus[];
}

export interface SettingsResponse {
  environment: string;
  appName: string;
  user: PublicUser & { createdAt: string | null };
  budget: BudgetView;
  ai: { provider: 'gemini'; configured: boolean; note: string };
  integrations: IntegrationStatus[];
  security: {
    passwordIterations: number;
    sessionTtlHours: number;
    cookieSecure: boolean;
    setupComplete: boolean;
  };
  permissions: {
    level1: number;
    level2: number;
    level3: number;
    granted: number;
    grants: Record<string, boolean>;
  };
}

export interface AgentActionView {
  id: string;
  label: string;
  category: PermissionCategory;
  risk: RiskLevel;
  requiresApproval: boolean;
}

export interface AgentView {
  id: string;
  number: string;
  name: string;
  mission: string;
  responsibilities: string[];
  dependencies: Array<{
    name: string;
    status: 'available' | 'requires_configuration' | 'not_implemented';
  }>;
  actions: AgentActionView[];
  executionStatus: 'registry_only';
}

export interface AgentsResponse {
  agents: AgentView[];
  note: string;
}

export interface RoadmapResponse {
  phases: PhaseRecord[];
  summary: {
    total: number;
    complete: number;
    inProgress: number;
    planned: number;
    blocked: number;
  };
}

export interface BudgetUpdateResponse {
  budget: BudgetView;
  message: string;
}
