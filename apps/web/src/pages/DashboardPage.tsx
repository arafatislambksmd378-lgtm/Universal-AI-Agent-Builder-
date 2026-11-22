import type { DashboardSummary } from '@aism/core';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  Spinner,
  Stat,
} from '../components/ui';
import { useApiQuery } from '../lib/useApi';
import { formatDateTime, formatRelative, formatUsd, outcomeTone, titleCase } from '../lib/format';

const INTEGRATION_TONES = {
  connected: 'ok',
  requires_configuration: 'warn',
  not_connected: 'warn',
  not_implemented: 'neutral',
} as const;

export function DashboardPage() {
  const { data, error, loading, reload } = useApiQuery<DashboardSummary>('/api/dashboard/summary');

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted">
        <Spinner className="h-4 w-4" /> Loading store summary…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-3 py-6">
        <Alert tone="danger" title="Could not load the dashboard">
          {error?.message ?? 'Unknown error'}
        </Alert>
        <Button variant="secondary" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  const budgetTone =
    data.aiUsage.mode === 'hard_stop'
      ? 'danger'
      : data.aiUsage.mode === 'warning' || data.aiUsage.mode === 'throttled'
        ? 'warn'
        : 'ok';

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Control room"
        title="Store operations"
        description="Every figure below is read from this deployment's database. Where a source does not exist yet, the card says so instead of inventing a number."
        action={
          <Button variant="secondary" onClick={reload} aria-label="Refresh dashboard data">
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader
            title="Shopify store"
            description={data.store.note}
            action={<Badge tone="warn">Not connected</Badge>}
          />
          <EmptyState
            title="No store linked"
            description="Products, orders and inventory sync will populate after the OAuth installation in Phase 02. Until then 0 rows exist, and this dashboard shows no derived metrics."
          />
        </Card>

        <Card>
          <CardHeader
            title="AI budget guard"
            description={data.aiUsage.note}
            action={<Badge tone={budgetTone}>{titleCase(data.aiUsage.mode)}</Badge>}
          />
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Spent" value={formatUsd(data.aiUsage.monthToDateCents)} hint="this month" />
            <Stat
              label="Ceiling"
              value={formatUsd(data.aiUsage.monthlyLimitCents)}
              hint={`${formatUsd(data.aiUsage.dailyLimitCents)}/day cap`}
            />
            <Stat
              label="Remaining"
              value={formatUsd(data.aiUsage.remainingCents)}
              hint={`${data.aiUsage.utilizationPct}% used`}
              tone={data.aiUsage.mode === 'hard_stop' ? 'danger' : 'neutral'}
            />
          </div>
          <div className="mt-3">
            <ProgressBar
              label="Monthly AI budget used"
              value={data.aiUsage.utilizationPct}
              tone={budgetTone}
            />
          </div>
          <p className="mt-2 text-2xs text-muted">
            {data.aiUsage.monthToDateRequests} AI requests recorded. Requests are blocked before any
            paid provider could be reached.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Stat
            label="Agents registered"
            value={String(data.agents.registered)}
            hint={`${data.agents.executable} can execute tasks today`}
          />
          <p className="mt-3 text-2xs leading-relaxed text-muted">
            Registrations define least-privilege actions. Execution arrives in Phase 03.
          </p>
          <Link to="/agents" className="mt-3 inline-block text-xs font-medium text-brand-600">
            View agent registry →
          </Link>
        </Card>
        <Card>
          <Stat label="Pending approvals" value="—" hint="not available yet" />
          <p className="mt-3 text-2xs leading-relaxed text-muted">{data.approvals.note}</p>
        </Card>
        <Card>
          <Stat
            label="Build progress"
            value={`${data.roadmap.complete}/${data.roadmap.total}`}
            hint="phases complete"
          />
          <p className="mt-3 text-2xs leading-relaxed text-muted">
            Current: {data.roadmap.currentPhase.title} ({titleCase(data.roadmap.currentPhase.status)})
          </p>
          <Link to="/roadmap" className="mt-3 inline-block text-xs font-medium text-brand-600">
            See what is real →
          </Link>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Integrations"
          description="Status is asserted by the backend, not inferred from configuration guesses."
        />
        <ul className="divide-y divide-line">
          {data.integrations.map((integration) => (
            <li key={integration.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{integration.name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{integration.detail}</p>
              </div>
              <Badge tone={INTEGRATION_TONES[integration.status]}>
                {titleCase(integration.status)}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Recent activity"
          description="Real audit records written by this API — sign-ins, settings changes and failures."
          action={
            <Link to="/activity" className="text-xs font-medium text-brand-600">
              All activity
            </Link>
          }
        />
        {data.activity.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            description="Authentication and settings changes appear here as soon as they happen."
          />
        ) : (
          <ul className="divide-y divide-line">
            {data.activity.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">{titleCase(entry.action)}</p>
                  <p className="text-2xs text-muted">
                    {entry.actorType} · {formatDateTime(entry.createdAt)} ·{' '}
                    {formatRelative(entry.createdAt)}
                  </p>
                </div>
                <Badge tone={outcomeTone(entry.outcome)}>{entry.outcome}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="pb-2 text-center text-2xs text-muted">
        Data generated {formatDateTime(data.generatedAt)} · API v0.1.0 · Phase 01
      </p>
    </div>
  );
}
