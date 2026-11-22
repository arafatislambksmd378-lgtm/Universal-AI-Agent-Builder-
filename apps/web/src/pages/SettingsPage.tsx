import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AgentsResponse, SettingsResponse } from '@aism/core';
import { formatUsd } from '@aism/core';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  PageHeader,
  ProgressBar,
  Spinner,
  Stat,
  TextField,
} from '../components/ui';
import { useApiQuery } from '../lib/useApi';
import { useAuth } from '../context/AuthProvider';
import { ApiError, api } from '../lib/api';
import { formatDateTime, titleCase } from '../lib/format';

const INTEGRATION_TONES = {
  connected: 'ok',
  requires_configuration: 'warn',
  not_connected: 'warn',
  not_implemented: 'neutral',
} as const;

export function SettingsPage() {
  const settings = useApiQuery<SettingsResponse>('/api/settings');
  const agents = useApiQuery<AgentsResponse>('/api/agents');
  const { logout } = useAuth();

  const [form, setForm] = useState({ monthly: '', daily: '', warning: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setForm({
      monthly: (settings.data.budget.monthlyLimitCents / 100).toFixed(2),
      daily: (settings.data.budget.dailyLimitCents / 100).toFixed(2),
      warning: String(settings.data.budget.warningThresholdPct),
    });
  }, [settings.data]);

  const level2Actions = useMemo(() => {
    const map = new Map<string, { id: string; label: string; risk: string; description?: string }>();
    for (const agent of agents.data?.agents ?? []) {
      for (const action of agent.actions) {
        if (action.category === 2 && !map.has(action.id)) {
          map.set(action.id, { id: action.id, label: action.label, risk: action.risk });
        }
      }
    }
    return [...map.values()];
  }, [agents.data]);

  async function saveBudget(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setMessage(null);

    const monthlyCents = Math.round(Number(form.monthly) * 100);
    const dailyCents = Math.round(Number(form.daily) * 100);
    const warning = Number(form.warning);

    if (!Number.isFinite(monthlyCents) || monthlyCents < 0 || monthlyCents > 500) {
      setSaveError('Monthly ceiling must be between $0.00 and $5.00 (the authorised maximum).');
      return;
    }
    if (!Number.isFinite(dailyCents) || dailyCents < 0 || dailyCents > 500) {
      setSaveError('Daily cap must be between $0.00 and $5.00.');
      return;
    }
    if (!Number.isInteger(warning) || warning < 0 || warning > 100) {
      setSaveError('Warning threshold must be a whole number between 0 and 100.');
      return;
    }

    setSaving(true);
    try {
      const result = await api.put<{ message: string; budget: { monthlyLimitCents: number } }>(
        '/api/settings/budget',
        {
          monthlyLimitCents: monthlyCents,
          dailyLimitCents: dailyCents,
          warningThresholdPct: warning,
        },
      );
      setMessage(result.message);
      settings.reload();
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : 'Could not save the budget.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePermission(actionId: string, enabled: boolean) {
    setToggling(actionId);
    setToggleError(null);
    try {
      await api.put(`/api/settings/permissions/${encodeURIComponent(actionId)}`, { enabled });
      settings.reload();
    } catch (caught) {
      setToggleError(caught instanceof ApiError ? caught.message : 'Could not update the permission.');
    } finally {
      setToggling(null);
    }
  }

  if (settings.loading && !settings.data) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted">
        <Spinner className="h-4 w-4" /> Loading settings…
      </div>
    );
  }

  if (settings.error || !settings.data) {
    return (
      <div className="space-y-3 py-6">
        <Alert tone="danger">{settings.error?.message ?? 'Could not load settings.'}</Alert>
        <Button variant="secondary" onClick={settings.reload}>
          Retry
        </Button>
      </div>
    );
  }

  const data = settings.data;
  const budgetTone =
    data.budget.mode === 'hard_stop'
      ? 'danger'
      : data.budget.mode === 'warning' || data.budget.mode === 'throttled'
        ? 'warn'
        : 'ok';

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Budget, permissions, session security and integration status. Everything here writes to the database and is audited."
      />

      <Card>
        <CardHeader
          title="AI budget"
          description="A hard stop, not a target. Values above $5.00 are rejected by the API and clamped by the engine."
          action={<Badge tone={budgetTone}>{titleCase(data.budget.mode)}</Badge>}
        />
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Spent" value={formatUsd(data.budget.monthToDateCents)} hint="this month" />
          <Stat label="Remaining" value={formatUsd(data.budget.remainingCents)} />
          <Stat label="Today" value={formatUsd(data.budget.todayCents)} hint={`cap ${formatUsd(data.budget.dailyLimitCents)}`} />
        </div>
        <ProgressBar
          label="Monthly AI budget used"
          value={data.budget.utilizationPct}
          tone={budgetTone}
        />
        <form onSubmit={saveBudget} className="mt-4 grid gap-3 sm:grid-cols-3" noValidate>
          <TextField
            label="Monthly ceiling (USD)"
            name="monthly"
            inputMode="decimal"
            value={form.monthly}
            onChange={(event) => setForm({ ...form, monthly: event.target.value })}
            hint="Max 5.00"
          />
          <TextField
            label="Daily cap (USD)"
            name="daily"
            inputMode="decimal"
            value={form.daily}
            onChange={(event) => setForm({ ...form, daily: event.target.value })}
          />
          <TextField
            label="Warn at (%)"
            name="warning"
            inputMode="numeric"
            value={form.warning}
            onChange={(event) => setForm({ ...form, warning: event.target.value })}
          />
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <Button type="submit" loading={saving}>
              Save budget
            </Button>
            {message ? <span className="text-xs text-ok">{message}</span> : null}
          </div>
          {saveError ? (
            <div className="sm:col-span-3">
              <Alert tone="danger">{saveError}</Alert>
            </div>
          ) : null}
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Permissions"
          description="Level 2 writes stay off until you enable them per action. Level 3 actions (prices, refunds, cancellations, publishing, spending) can never be pre-authorised — each one needs a fresh approval in the Approval Centre."
          action={<Badge tone="neutral">{data.permissions.granted} enabled</Badge>}
        />
        {toggleError ? <Alert tone="danger">{toggleError}</Alert> : null}
        <div className="mt-2 space-y-4">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
              Always allowed · Level 1 reads ({data.permissions.level1})
            </p>
            <p className="mt-1 text-xs text-muted">
              Catalogue, order, inventory and analytics reads, plus report drafting.
            </p>
          </div>

          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
              Owner-enabled · Level 2 writes ({level2Actions.length})
            </p>
            {agents.loading && level2Actions.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Loading actions…</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {level2Actions.map((action) => {
                  const enabled = data.permissions.grants[action.id] === true;
                  const busy = toggling === action.id;
                  return (
                    <li
                      key={action.id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">{action.label}</p>
                        <p className="text-2xs text-muted">Risk: {action.risk}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={`${action.label} permission`}
                        disabled={busy}
                        onClick={() => void togglePermission(action.id, !enabled)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                          enabled ? 'bg-brand-500' : 'bg-slate-300'
                        } ${busy ? 'opacity-60' : ''}`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                            enabled ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
              Always approved · Level 3 actions ({data.permissions.level3})
            </p>
            <p className="mt-1 text-xs text-muted">
              Publishing, deletion, price changes, discounts, refunds, cancellations, customer
              messages, paid ads and any spending are locked behind the approval record.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Account & session" />
        <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted">Email</dt>
            <dd className="font-medium">{data.user.email}</dd>
          </div>
          <div>
            <dt className="text-muted">Role</dt>
            <dd className="font-medium">{titleCase(data.user.role)}</dd>
          </div>
          <div>
            <dt className="text-muted">Owner since</dt>
            <dd className="font-medium">{formatDateTime(data.user.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Session idle timeout</dt>
            <dd className="font-medium">{data.security.sessionTtlHours} hours</dd>
          </div>
          <div>
            <dt className="text-muted">Password hashing</dt>
            <dd className="font-medium">
              PBKDF2-SHA256 · {data.security.passwordIterations.toLocaleString()} iterations
            </dd>
          </div>
          <div>
            <dt className="text-muted">Secure cookie</dt>
            <dd className="font-medium">{data.security.cookieSecure ? 'Yes (HTTPS only)' : 'No (dev mode)'}</dd>
          </div>
          <div>
            <dt className="text-muted">Environment</dt>
            <dd className="font-medium">{titleCase(data.environment)}</dd>
          </div>
          <div>
            <dt className="text-muted">AI provider</dt>
            <dd className="font-medium">
              Gemini · {data.ai.configured ? 'configured' : 'not configured'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-2xs text-muted">{data.ai.note}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => void logout()}>
            Sign out of this device
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Integrations" description="Status is reported by the backend." />
        <ul className="divide-y divide-line">
          {data.integrations.map((integration) => (
            <li key={integration.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{integration.name}</p>
                <p className="mt-0.5 text-xs text-muted">{integration.detail}</p>
              </div>
              <Badge tone={INTEGRATION_TONES[integration.status]}>
                {titleCase(integration.status)}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
