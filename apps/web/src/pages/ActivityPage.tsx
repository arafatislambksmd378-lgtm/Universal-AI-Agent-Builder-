import { useCallback, useEffect, useState } from 'react';
import type { ActivityEntryView, ActivityResponse } from '@aism/core';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Spinner,
} from '../components/ui';
import { ApiError, apiRequest } from '../lib/api';
import { formatDateTime, formatRelative, outcomeTone, titleCase } from '../lib/format';

export function ActivityPage() {
  const [items, setItems] = useState<ActivityEntryView[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (before?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const query = `/api/activity?limit=25${before ? `&before=${encodeURIComponent(before)}` : ''}`;
      const page = await apiRequest<ActivityResponse>(query);
      setItems((previous) => (before ? [...previous, ...page.items] : page.items));
      setNextBefore(page.nextBefore);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Activity monitor"
        title="Audit trail"
        description="Append-only records of what this system did and who asked for it. Agent task execution will stream here in Phase 03; read-only progress is never fabricated."
        action={
          <Button variant="secondary" onClick={() => void load(null)}>
            Refresh
          </Button>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardHeader title={`${items.length} record${items.length === 1 ? '' : 's'}`} />
        {loading && items.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted">
            <Spinner className="h-4 w-4" /> Loading audit records…
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Sign-ins, permission changes and failed attempts are all recorded here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((entry) => {
              const isOpen = expanded === entry.id;
              return (
                <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink">{titleCase(entry.action)}</p>
                      <p className="mt-0.5 text-2xs text-muted">
                        {entry.actorType}
                        {entry.actorId ? ` · ${entry.actorId.slice(0, 12)}…` : ''} ·{' '}
                        {formatDateTime(entry.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="hidden text-2xs text-muted sm:inline">
                        {formatRelative(entry.createdAt)}
                      </span>
                      <Badge tone={outcomeTone(entry.outcome)}>{entry.outcome}</Badge>
                    </div>
                  </button>
                  {isOpen ? (
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-surface p-3 text-2xs">
                      <dt className="text-muted">Target</dt>
                      <dd className="truncate text-ink">
                        {entry.targetType ?? '—'}
                        {entry.targetId ? ` · ${entry.targetId}` : ''}
                      </dd>
                      <dt className="text-muted">Request</dt>
                      <dd className="truncate text-ink">{entry.requestId ?? '—'}</dd>
                      <dt className="text-muted">Metadata</dt>
                      <dd className="col-span-1 break-words text-ink">
                        {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                      </dd>
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {nextBefore ? (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => void load(nextBefore)} loading={loading}>
              Load older records
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
