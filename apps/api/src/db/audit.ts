import { newId } from '../lib/crypto';
import { execute, queryAll, type Db } from './client';

export type AuditActor = 'owner' | 'system' | 'agent' | 'webhook';
export type AuditOutcome = 'success' | 'failure' | 'denied';

export interface AuditInput {
  actorType: AuditActor;
  actorId?: string | null;
  storeId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  requestId?: string | null;
  now: string;
}

export interface AuditRow {
  id: string;
  created_at: string;
  actor_type: AuditActor;
  actor_id: string | null;
  store_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  outcome: AuditOutcome;
  metadata: string | null;
  ip: string | null;
  request_id: string | null;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  actorType: AuditActor;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  outcome: AuditOutcome;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
}

export async function writeAudit(db: Db, input: AuditInput): Promise<void> {
  await execute(
    db,
    `INSERT INTO audit_logs (id, created_at, actor_type, actor_id, store_id, action, target_type, target_id, outcome, metadata, ip, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId('aud'),
      input.now,
      input.actorType,
      input.actorId ?? null,
      input.storeId ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      input.outcome,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ip ?? null,
      input.requestId ?? null,
    ],
  );
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function toAuditEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    outcome: row.outcome,
    metadata: parseMetadata(row.metadata),
    requestId: row.request_id,
  };
}

export async function listAudit(
  db: Db,
  options: { limit: number; before?: string | null },
): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit), 1), 100);
  const rows = options.before
    ? await queryAll<AuditRow>(
        db,
        `SELECT * FROM audit_logs WHERE created_at < ? ORDER BY created_at DESC, id DESC LIMIT ?`,
        [options.before, limit],
      )
    : await queryAll<AuditRow>(
        db,
        `SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ?`,
        [limit],
      );
  return rows.map(toAuditEntry);
}
