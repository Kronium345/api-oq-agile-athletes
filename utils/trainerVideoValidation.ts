const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONGO_OBJECT_ID = /^[0-9a-f]{24}$/i;

function isValidMemberId(value: string): boolean {
  return UUID_LIKE.test(value) || MONGO_OBJECT_ID.test(value);
}

export function parseAssignedMemberIds(raw: unknown):
  | { ok: true; ids: string[] }
  | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true as const, ids: [] };
  }

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false as const, error: 'assignedMemberIds must be a JSON array of user ids' };
    }
  }

  if (!Array.isArray(parsed)) {
    return { ok: false as const, error: 'assignedMemberIds must be a JSON array of user ids' };
  }

  const ids: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'string' || !entry.trim()) {
      return {
        ok: false as const,
        error: 'assignedMemberIds must contain non-empty string user ids',
      };
    }
    const id = entry.trim();
    if (!isValidMemberId(id)) {
      return { ok: false as const, error: `Invalid assignedMemberIds entry: ${id}` };
    }
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }

  return { ok: true as const, ids };
}

export function validateTrainerVideoTitle(title: unknown):
  | { ok: true; title: string }
  | { ok: false; error: string } {
  if (typeof title !== 'string' || !title.trim()) {
    return { ok: false as const, error: 'title is required' };
  }
  const trimmed = title.trim();
  if (trimmed.length > 120) {
    return { ok: false as const, error: 'title must be 120 characters or fewer' };
  }
  return { ok: true as const, title: trimmed };
}

export function validateTrainerVideoDescription(description: unknown):
  | { ok: true; description: string | null }
  | { ok: false; error: string } {
  if (description === undefined || description === null || description === '') {
    return { ok: true as const, description: null };
  }
  if (typeof description !== 'string') {
    return { ok: false as const, error: 'description must be a string' };
  }
  const trimmed = description.trim();
  if (trimmed.length > 2000) {
    return { ok: false as const, error: 'description must be 2000 characters or fewer' };
  }
  return { ok: true as const, description: trimmed || null };
}

export function canMemberPlayVideo(video: { assignedMemberIds: string[] }, memberId: string): boolean {
  return video.assignedMemberIds.includes(memberId);
}
