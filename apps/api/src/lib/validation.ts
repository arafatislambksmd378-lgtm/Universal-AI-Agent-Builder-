import type { Context } from 'hono';
import { z } from 'zod';
import { badRequest } from './errors';

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'Password is too long');

export const setupSchema = z.object({
  setupToken: z.string().min(8).max(512),
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().max(120).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});

export const budgetUpdateSchema = z.object({
  monthlyLimitCents: z.number().int().min(0).max(500),
  dailyLimitCents: z.number().int().min(0).max(500),
  warningThresholdPct: z.number().int().min(0).max(100),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime({ offset: true }).optional(),
});

export function issueSummary(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Parse a JSON body against a schema, rejecting malformed input with a 400. */
export async function parseJsonBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest('Some fields are invalid', issueSummary(result.error));
  }
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(c: Context, schema: T): z.infer<T> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(c.req.query())) params[key] = value;
  const result = schema.safeParse(params);
  if (!result.success) {
    throw badRequest('Invalid query parameters', issueSummary(result.error));
  }
  return result.data;
}
