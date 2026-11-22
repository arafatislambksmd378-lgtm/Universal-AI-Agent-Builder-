import type { AgentsResponse } from '@aism/core';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  PageHeader,
  Spinner,
} from '../components/ui';
import { useApiQuery } from '../lib/useApi';
import { titleCase } from '../lib/format';

const CATEGORY_LABELS = {
  1: 'Level 1 · automatic read',
  2: 'Level 2 · owner-enabled write',
  3: 'Level 3 · approval required',
} as const;

const DEPENDENCY_TONES = {
  available: 'ok',
  requires_configuration: 'warn',
  not_implemented: 'neutral',
} as const;

export function AgentsPage() {
  const { data, error, loading, reload } = useApiQuery<AgentsResponse>('/api/agents');

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Agent system"
        title="Agent registry"
        description="Each agent is a module with an explicit, least-privilege action set. Nothing in this list can execute yet — Phase 03 adds the orchestrator, Gemini reasoning and the tool executor."
        action={
          <Button variant="secondary" onClick={reload}>
            Refresh
          </Button>
        }
      />

      {data ? <Alert tone="brand">{data.note}</Alert> : null}
      {error ? <Alert tone="danger">{error.message}</Alert> : null}

      {loading && !data ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted">
          <Spinner className="h-4 w-4" /> Loading agent registry…
        </div>
      ) : null}

      <div className="space-y-3">
        {data?.agents.map((agent) => (
          <Card key={agent.id}>
            <CardHeader
              title={`Agent ${agent.number} · ${agent.name}`}
              description={agent.mission}
              action={<Badge tone="neutral">Registry only</Badge>}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                  Responsibilities
                </h3>
                <ul className="mt-1.5 space-y-1">
                  {agent.responsibilities.map((responsibility) => (
                    <li key={responsibility} className="flex gap-2 text-xs leading-relaxed text-ink">
                      <span aria-hidden="true" className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                      {responsibility}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <div>
                  <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                    Dependencies
                  </h3>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {agent.dependencies.map((dependency) => (
                      <li key={dependency.name}>
                        <Badge tone={DEPENDENCY_TONES[dependency.status]}>
                          {dependency.name} · {titleCase(dependency.status)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                    Requestable actions ({agent.actions.length})
                  </h3>
                  <ul className="mt-1.5 space-y-1">
                    {agent.actions.map((action) => (
                      <li
                        key={action.id}
                        className="flex items-center justify-between gap-2 text-2xs text-ink"
                      >
                        <span>{action.label}</span>
                        <span className="shrink-0 text-muted">{CATEGORY_LABELS[action.category]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
