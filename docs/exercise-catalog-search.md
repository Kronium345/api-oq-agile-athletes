# Exercise Catalog — Server-Side Search (Option B)

Server-side search is now live on the existing endpoint. This fixes the "missing
exercises" problem (e.g. searching **push-up** used to fail because the app only
searched the pages it had already loaded — it never reached `push-up` / id `0662`).

The backend now queries ExerciseDB directly by name / body part / target / equipment
and returns matching exercises with the same shape the app already renders.

---

## What changed on the backend

- **Same endpoint, new optional inputs.** `POST /api/exercise-recognition/enhance`
  now accepts `search`, `bodyPart`, `target`, and `equipment` in the body.
- **Backwards compatible.** If you send **none** of those fields, behaviour is
  unchanged (the old paginated "browse everything" flow with Clarifai enhancement).
- **Search mode is fast.** When any filter is present, the server hits ExerciseDB's
  name/filter routes and **skips Clarifai** (results come back in well under a second).
  Images still stream through the existing proxy, so no visual change.
- Filters **combine**: e.g. `search: "push-up"` + `bodyPart: "chest"` returns only
  chest push-ups.

No new endpoint, no auth change (this route is public, same as today).

---

## Request

`POST /api/exercise-recognition/enhance`

```jsonc
{
  "search": "push-up",   // optional — matches exercise NAME (substring, case-insensitive)
  "bodyPart": "chest",   // optional — e.g. chest, back, upper arms, lower legs, waist
  "target": "pectorals", // optional — e.g. pectorals, triceps, biceps, lats
  "equipment": "body weight", // optional — e.g. body weight, dumbbell, barbell, cable
  "limit": 20,            // optional (default 100, max 500) — page size
  "offset": 0             // optional (default 0) — page start
}
```

- Send **at least one** of `search` / `bodyPart` / `target` / `equipment` to enter
  search mode. Sending only `limit`/`offset` (or an empty body) keeps the old browse
  behaviour.
- `search` is a **substring** match on the name, so `"push"` matches `push-up`,
  `close-grip push-up`, `cable pushdown`, etc.

## Response

Same exercise shape as the current `/enhance` response, plus richer pagination:

```jsonc
{
  "success": true,
  "message": "Found 39 matching exercises",
  "count": 5,
  "exercises": [
    {
      "id": "0662",
      "name": "push-up",
      "gifUrl": "/api/exercise-recognition/image/0662",
      "bodyPart": "chest",
      "equipment": "body weight",
      "target": "pectorals",
      "instructions": ["Start in a high plank position ...", "..."],
      "secondaryMuscles": ["triceps", "deltoids", "core"]
    }
    // ...
  ],
  "pagination": {
    "limit": 5,
    "offset": 0,
    "total": 39,        // total matches (search mode only)
    "hasMore": true,
    "nextOffset": 5     // pass as `offset` for the next page, or null when done
  }
}
```

> `gifUrl` is a **relative** path. Prefix it with your API base URL, exactly as the
> app already does for browsed exercises (e.g. `https://<api-host>${gifUrl}`).

### Error responses

- `400` — `{ success: false, message: "RapidAPI key is required" }` (server config issue).
- `429` / `403` — `{ success: false, message: "RapidAPI rate limit exceeded..." , exercises: [] }`.
  Treat like the existing quota handling: show a retry/soft-fail state.
- No matches → `200` with `exercises: []` and `total: 0` (not an error).

---

## What the frontend needs to do (small change)

The backend can't retro-fit the app's local search — the app currently filters
in memory over already-loaded pages. To actually use server-side search, wire the
search box (and any filter chips) to the endpoint:

### 1. When the user types in the search box (debounced), call the server

```ts
async function searchExercises(params: {
  search?: string;
  bodyPart?: string;
  target?: string;
  equipment?: string;
  limit?: number;
  offset?: number;
}) {
  const res = await fetch(`${API_BASE}/api/exercise-recognition/enhance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 20, offset: 0, ...params }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json; // { exercises, count, pagination }
}
```

### 2. Recommended UX

- **Debounce** input ~300–400ms before firing the request.
- When the search box is **empty and no filters are active**, keep the existing
  browse/pagination flow (don't send `search`). When it becomes non-empty, switch to
  calling with `search` and **replace** the list with server results.
- **Paginate search results** with `pagination.nextOffset`: on "load more", call again
  with the same `search` and `offset: nextOffset`, then append. Stop when
  `hasMore === false` (or `nextOffset === null`).
- Render `exercises` exactly as today — the object shape is identical, and `gifUrl`
  still points at the image proxy.

### 3. Optional filter chips

If you expose body-part / equipment filters, pass them through as `bodyPart`,
`target`, or `equipment`. They combine with `search`.

That's the whole client change: send the query, render the returned list, and use
`nextOffset` for paging. No changes to how images are loaded or how exercise cards
are displayed.

---

## Quick manual test (curl)

```bash
curl -X POST "$API_BASE/api/exercise-recognition/enhance" \
  -H "Content-Type: application/json" \
  -d '{ "search": "push-up", "limit": 5, "offset": 0 }'
# → { success: true, total: 39, ... "push-up" (0662) included }

curl -X POST "$API_BASE/api/exercise-recognition/enhance" \
  -H "Content-Type: application/json" \
  -d '{ "search": "push-up", "bodyPart": "chest", "limit": 20 }'
# → 24 matches, all bodyPart = chest
```
