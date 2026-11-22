import type { RoadmapResponse } from '@aism/core';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '../components/ui';
import { useApiQuery } from '../lib/useApi';
import { titleCase } from '../lib/format';

const STATUS_TONES = {
  complete: 'ok',
  in_progress: 'brand',
  planned: 'neutral',
  blocked: 'danger',
} as const;

export function RoadmapPage() {
  const { data, error, loading, reload } = useApiQuery<RoadmapResponse>('/api/roadmap');

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Delivery"
        title="Build roadmap"
        description="A machine-generated record of what is actually implemented. Phases only move to complete when their tests pass."
        action={
          <Button variant="secondary" onClick={reload}>
            Refresh
          </Button>
        }
      />

      {error ? <Alert tone="danger">{error.message}</Alert> : null}
      {loading && !data ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted">
          <Spinner className="h-4 w-4" /> Loading roadmap…
        </div>
      ) : null}

      {data ? (
        <>
          <Alert tone="brand">
            {data.summary.complete} of {data.summary.total} phases complete ·{' '}
            {data.summary.planned} planned · {data.summary.blocked} blocked
          </Alert>
          <ol className="space-y-3">
            {data.phases.map((phase) => (
              <Card as="li" key={phase.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-widest text-muted">
                      Phase {String(phase.number).padStart(2, '0')}
                    </p>
                    <h2 className="mt-0.5 text-sm font-semibold text-ink">{phase.title}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{phase.summary}</p>
                  </div>
                  <Badge tone={STATUS_TONES[phase.status]}>{titleCase(phase.status)}</Badge>
                </div>

                {phase.completed.length > 0 ? (
                  <div className="mt-3">
                    <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                      Delivered
                    </h3>
                    <ul className="mt-1 space-y-1">
                      {phase.completed.map((item) => (
                        <li key={item} className="flex gap-2 text-xs text-ink">
                          <span aria-hidden="true" className="text-ok">
                            ✓
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {phase.outstanding.length > 0 ? (
                  <div className="mt-3">
                    <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                      Outstanding
                    </h3>
                    <ul className="mt-1 space-y-1">
                      {phase.outstanding.map((item) => (
                        <li key={item} className="flex gap-2 text-xs text-muted">
                          <span aria-hidden="true">○</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Card>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}
