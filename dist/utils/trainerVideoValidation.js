const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONGO_OBJECT_ID = /^[0-9a-f]{24}$/i;
function isValidMemberId(value) {
    return UUID_LIKE.test(value) || MONGO_OBJECT_ID.test(value);
}
export function parseAssignedMemberIds(raw) {
    if (raw === undefined || raw === null || raw === '') {
        return { ok: true, ids: [] };
    }
    let parsed = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            return { ok: false, error: 'assignedMemberIds must be a JSON array of user ids' };
        }
    }
    if (!Array.isArray(parsed)) {
        return { ok: false, error: 'assignedMemberIds must be a JSON array of user ids' };
    }
    const ids = [];
    for (const entry of parsed) {
        if (typeof entry !== 'string' || !entry.trim()) {
            return {
                ok: false,
                error: 'assignedMemberIds must contain non-empty string user ids',
            };
        }
        const id = entry.trim();
        if (!isValidMemberId(id)) {
            return { ok: false, error: `Invalid assignedMemberIds entry: ${id}` };
        }
        if (!ids.includes(id)) {
            ids.push(id);
        }
    }
    return { ok: true, ids };
}
export function validateTrainerVideoTitle(title) {
    if (typeof title !== 'string' || !title.trim()) {
        return { ok: false, error: 'title is required' };
    }
    const trimmed = title.trim();
    if (trimmed.length > 120) {
        return { ok: false, error: 'title must be 120 characters or fewer' };
    }
    return { ok: true, title: trimmed };
}
export function validateTrainerVideoDescription(description) {
    if (description === undefined || description === null || description === '') {
        return { ok: true, description: null };
    }
    if (typeof description !== 'string') {
        return { ok: false, error: 'description must be a string' };
    }
    const trimmed = description.trim();
    if (trimmed.length > 2000) {
        return { ok: false, error: 'description must be 2000 characters or fewer' };
    }
    return { ok: true, description: trimmed || null };
}
export function canMemberPlayVideo(video, memberId) {
    return video.assignedMemberIds.includes(memberId);
}
