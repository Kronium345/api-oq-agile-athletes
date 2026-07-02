import axios from 'axios';
const EXERCISEDB_HOST = 'exercisedb.p.rapidapi.com';
const EXERCISEDB_BASE = `https://${EXERCISEDB_HOST}`;
/** Upstream returns at most this many rows for name/filter endpoints in one call. */
const UPSTREAM_FETCH_CAP = 300;
/** True when the request carries any server-side search/filter criteria. */
export function hasCatalogFilters(query) {
    return Boolean(query.search || query.bodyPart || query.target || query.equipment);
}
/** Maps a raw ExerciseDB row to the client shape used across the app (proxied GIF, no Clarifai). */
export function mapExerciseToEnhanced(exercise) {
    const instructions = Array.isArray(exercise.instructions)
        ? exercise.instructions
        : exercise.instructions
            ? [exercise.instructions]
            : ['No instructions available'];
    return {
        id: exercise.id,
        name: exercise.name,
        gifUrl: `/api/exercise-recognition/image/${exercise.id}`,
        bodyPart: exercise.bodyPart || 'Not specified',
        equipment: exercise.equipment || 'Not specified',
        target: exercise.target || 'Not specified',
        instructions,
        secondaryMuscles: exercise.secondaryMuscles || [],
    };
}
function rateLimitErrorFromStatus(status, data) {
    if (status === 429) {
        return {
            status: 429,
            message: 'RapidAPI rate limit exceeded. Please upgrade your plan or wait for quota reset.',
            data,
        };
    }
    if (status === 403) {
        return {
            status: 403,
            message: 'RapidAPI plan quota exhausted. Please upgrade your plan.',
            data,
        };
    }
    return null;
}
/**
 * Resolves the primary upstream endpoint for the query. Name search takes priority,
 * then bodyPart, target, and equipment. Remaining criteria are applied in-memory so
 * callers can combine (e.g. name + bodyPart) even though ExerciseDB has no combined route.
 */
function buildPrimaryUrl(query) {
    const params = `limit=${UPSTREAM_FETCH_CAP}&offset=0`;
    const enc = (value) => encodeURIComponent(value.trim().toLowerCase());
    if (query.search) {
        return `${EXERCISEDB_BASE}/exercises/name/${enc(query.search)}?${params}`;
    }
    if (query.bodyPart) {
        return `${EXERCISEDB_BASE}/exercises/bodyPart/${enc(query.bodyPart)}?${params}`;
    }
    if (query.target) {
        return `${EXERCISEDB_BASE}/exercises/target/${enc(query.target)}?${params}`;
    }
    return `${EXERCISEDB_BASE}/exercises/equipment/${enc(query.equipment || '')}?${params}`;
}
function matchesFilter(value, expected) {
    if (!expected)
        return true;
    return (value || '').trim().toLowerCase() === expected.trim().toLowerCase();
}
/**
 * Server-side search over the ExerciseDB catalog. Returns client-ready exercises with
 * proxied GIF URLs plus pagination metadata. Does not call Clarifai (kept fast for search).
 */
export async function searchExerciseCatalog(query) {
    const url = buildPrimaryUrl(query);
    let raw = [];
    try {
        const response = await axios.get(url, {
            headers: {
                'X-RapidAPI-Key': query.apiKey,
                'X-RapidAPI-Host': EXERCISEDB_HOST,
            },
            validateStatus: (status) => status < 500,
        });
        const rateLimitError = rateLimitErrorFromStatus(response.status, response.data);
        if (rateLimitError) {
            return { exercises: [], total: 0, hasMore: false, nextOffset: null, rateLimitError };
        }
        const data = response.data;
        if (Array.isArray(data)) {
            raw = data;
        }
        else {
            // ExerciseDB returns {} / error object for no matches on some routes.
            raw = [];
        }
    }
    catch (error) {
        const status = error?.response?.status;
        const rateLimitError = status ? rateLimitErrorFromStatus(status, error.response?.data) : null;
        if (rateLimitError) {
            return { exercises: [], total: 0, hasMore: false, nextOffset: null, rateLimitError };
        }
        throw error;
    }
    // Apply any remaining criteria in-memory so filters combine (e.g. search + bodyPart).
    const filtered = raw.filter((exercise) => matchesFilter(exercise.bodyPart, query.bodyPart) &&
        matchesFilter(exercise.target, query.target) &&
        matchesFilter(exercise.equipment, query.equipment));
    const total = filtered.length;
    const offset = Math.max(0, query.offset);
    const page = filtered.slice(offset, offset + query.limit);
    const hasMore = offset + query.limit < total;
    return {
        exercises: page.map(mapExerciseToEnhanced),
        total,
        hasMore,
        nextOffset: hasMore ? offset + page.length : null,
    };
}
