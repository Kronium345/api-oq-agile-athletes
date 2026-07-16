export interface ValidationError {
  field: string;
  message: string;
}

const PROTOCOL_ID_RE = /^[a-z0-9_]+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const STATUSES = new Set(['started', 'completed', 'abandoned']);
const CONTEXTS = new Set([
  'mind_center',
  'performance_hub',
  'ai_coach',
  'notification',
  'other',
]);

function asOptionalNumber(value: unknown, field: string, min: number, max: number): {
  ok: true;
  value: number | undefined;
} | { ok: false; error: ValidationError } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined };
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    return {
      ok: false,
      error: { field, message: `${field} must be a number between ${min} and ${max}` },
    };
  }
  return { ok: true, value: n };
}

function asIso(value: unknown, field: string, required: boolean): {
  ok: true;
  value: string | undefined;
} | { ok: false; error: ValidationError } {
  if (value === undefined || value === null || value === '') {
    if (required) {
      return { ok: false, error: { field, message: `${field} is required (ISO-8601)` } };
    }
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'string' || !ISO_RE.test(value) || Number.isNaN(Date.parse(value))) {
    return { ok: false, error: { field, message: `${field} must be a valid ISO-8601 timestamp` } };
  }
  return { ok: true, value: value };
}

export interface RecoverySessionBody {
  sessionId?: string;
  protocolId: string;
  status: 'started' | 'completed' | 'abandoned';
  startedAt: string;
  completedAt?: string;
  durationSec?: number;
  plannedDurationSec?: number;
  context?: string;
  athleteMode?: string;
  moodBefore?: number;
  moodAfter?: number;
  stressBefore?: number;
  stressAfter?: number;
  device?: { platform?: string; appVersion?: string };
}

export function validateRecoverySessionBody(
  body: Record<string, unknown>
): { ok: true; input: RecoverySessionBody } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const protocolId =
    typeof body.protocolId === 'string' ? body.protocolId.trim().toLowerCase() : '';
  if (!protocolId || !PROTOCOL_ID_RE.test(protocolId)) {
    errors.push({
      field: 'protocolId',
      message: 'protocolId is required (lowercase snake_case id)',
    });
  }

  const statusRaw = typeof body.status === 'string' ? body.status.trim().toLowerCase() : '';
  if (!STATUSES.has(statusRaw)) {
    errors.push({
      field: 'status',
      message: 'status must be started, completed, or abandoned',
    });
  }

  const started = asIso(body.startedAt, 'startedAt', true);
  if (started.ok === false) errors.push(started.error);

  const completed = asIso(body.completedAt, 'completedAt', false);
  if (completed.ok === false) errors.push(completed.error);

  if (
    statusRaw === 'completed' &&
    (completed.ok === false || !completed.value)
  ) {
    errors.push({
      field: 'completedAt',
      message: 'completedAt is required when status is completed',
    });
  }

  const duration = asOptionalNumber(body.durationSec, 'durationSec', 0, 3600);
  if (duration.ok === false) errors.push(duration.error);

  const planned = asOptionalNumber(body.plannedDurationSec, 'plannedDurationSec', 1, 3600);
  if (planned.ok === false) errors.push(planned.error);

  const moodBefore = asOptionalNumber(body.moodBefore, 'moodBefore', 1, 5);
  if (moodBefore.ok === false) errors.push(moodBefore.error);

  const moodAfter = asOptionalNumber(body.moodAfter, 'moodAfter', 1, 5);
  if (moodAfter.ok === false) errors.push(moodAfter.error);

  const stressBefore = asOptionalNumber(body.stressBefore, 'stressBefore', 1, 10);
  if (stressBefore.ok === false) errors.push(stressBefore.error);

  const stressAfter = asOptionalNumber(body.stressAfter, 'stressAfter', 1, 10);
  if (stressAfter.ok === false) errors.push(stressAfter.error);

  let context: string | undefined;
  if (body.context !== undefined && body.context !== null && body.context !== '') {
    if (typeof body.context !== 'string' || !CONTEXTS.has(body.context.trim())) {
      errors.push({
        field: 'context',
        message:
          'context must be mind_center, performance_hub, ai_coach, notification, or other',
      });
    } else {
      context = body.context.trim();
    }
  }

  let athleteMode: string | undefined;
  if (typeof body.athleteMode === 'string' && body.athleteMode.trim()) {
    athleteMode = body.athleteMode.trim().slice(0, 64);
  }

  let sessionId: string | undefined;
  if (typeof body.sessionId === 'string' && body.sessionId.trim()) {
    sessionId = body.sessionId.trim();
  }

  let device: { platform?: string; appVersion?: string } | undefined;
  if (body.device && typeof body.device === 'object' && !Array.isArray(body.device)) {
    const d = body.device as Record<string, unknown>;
    device = {
      platform: typeof d.platform === 'string' ? d.platform.slice(0, 32) : undefined,
      appVersion: typeof d.appVersion === 'string' ? d.appVersion.slice(0, 32) : undefined,
    };
  }

  if (errors.length) return { ok: false, errors };

  if (started.ok === false || completed.ok === false) {
    return { ok: false, errors: [{ field: 'startedAt', message: 'Invalid timestamps' }] };
  }

  return {
    ok: true,
    input: {
      sessionId,
      protocolId,
      status: statusRaw as RecoverySessionBody['status'],
      startedAt: started.value!,
      completedAt: completed.value,
      durationSec: duration.ok === true ? duration.value : undefined,
      plannedDurationSec: planned.ok === true ? planned.value : undefined,
      context,
      athleteMode,
      moodBefore: moodBefore.ok === true ? moodBefore.value : undefined,
      moodAfter: moodAfter.ok === true ? moodAfter.value : undefined,
      stressBefore: stressBefore.ok === true ? stressBefore.value : undefined,
      stressAfter: stressAfter.ok === true ? stressAfter.value : undefined,
      device,
    },
  };
}

export function resolveSummaryPeriod(value: unknown): 7 | 30 {
  if (value === '30' || value === 30) return 30;
  return 7;
}
