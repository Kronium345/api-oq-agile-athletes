# Recovery Toolkit — Guided Breathing (Backend)

Mind Center → Recovery Toolkit sessions sync here and feed **habit metrics** into
Performance Hub. Breathing does **not** alter `recoveryScore` in V1.

```text
Expo Recovery Toolkit
   │  Bearer auth
   ▼
POST/GET /recovery/*
   │
   ├── recovery_sessions (Mongo)
   └── Performance Hub today / weekly-summary (counts + suggestion)
```

Wellness-only copy: no diagnosis, no “treats anxiety”, no physiological guarantees.

---

## Endpoints

All require `Authorization: Bearer <token>`. Scoped to `req.userId`.

### `GET /recovery/protocols`

Static MVP catalog (6 protocols) + shared disclaimer.

```json
{
  "success": true,
  "data": {
    "protocols": [ { "id": "stress_reset", "name": "Stress Reset", "rhythm": {...}, ... } ],
    "disclaimer": "..."
  }
}
```

App may also ship the catalog locally; this endpoint supports remote updates later.

### `POST /recovery/sessions`

Create a session, or update when `sessionId` is sent (started → completed/abandoned).

```json
{
  "protocolId": "stress_reset",
  "status": "completed",
  "startedAt": "2026-07-16T10:00:00.000Z",
  "completedAt": "2026-07-16T10:02:00.000Z",
  "durationSec": 120,
  "plannedDurationSec": 120,
  "context": "mind_center",
  "athleteMode": "after_training",
  "moodBefore": 2,
  "moodAfter": 4
}
```

| Field | Notes |
|-------|--------|
| `status` | `started` \| `completed` \| `abandoned` |
| `context` | `mind_center` \| `performance_hub` \| `ai_coach` \| `notification` \| `other` |
| `moodBefore` / `moodAfter` | Optional 1–5 |
| `stressBefore` / `stressAfter` | Optional 1–10 |

Response: `{ "success": true, "data": { "id": "...", ... } }`

### `GET /recovery/sessions?limit=20&from=&to=`

`from` / `to` accept ISO timestamps or `YYYY-MM-DD`.

### `GET /recovery/summary?period=7|30`

```json
{
  "success": true,
  "data": {
    "completedCount": 5,
    "streakDays": 3,
    "breathingSessionsToday": 1,
    "topProtocols": [{ "protocolId": "stress_reset", "count": 3, "name": "Stress Reset" }],
    "suggestedProtocolId": "sleep_wind_down",
    "note": "Breathing session counts reflect recovery habits, not measured physiological recovery."
  }
}
```

---

## Performance Hub extensions

### `GET /performance/today`

Adds (does not change scoring):

```json
{
  "breathingSessionsToday": 1,
  "suggestedBreathingProtocolId": "stress_reset",
  "suggestedNextAction": "Take a 2-minute Stress Reset session."
}
```

Stress recommendations may include `protocolId` + `deepLink` for the Toolkit UI.

### `GET /performance/weekly-summary`

Adds:

```json
{
  "breathingSessionsWeek": 5,
  "narrative": "... You completed 5 recovery breathing sessions this week."
}
```

---

## Expo sync sketch

```ts
async function syncBreathingSession(apiBase: string, token: string, body: object) {
  const res = await fetch(`${apiBase}/recovery/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || 'Failed to sync session');
  return json.data;
}
```

Offline-first: write local log first, then POST when online (same pattern as Performance Hub).

Deep link from Performance Hub / AI Coach:

`/(drawer)/recovery/breathing?protocol=stress_reset&source=performance_hub`

---

## Env

```bash
# MONGO_RECOVERY_SESSIONS_COLLECTION=recovery_sessions
```

---

## Product decisions already applied (V1)

| Decision | Choice |
|----------|--------|
| Affect `recoveryScore`? | **No** — separate habit metric |
| Premium enforcement on POST? | **No** — app gates UI |
| Mood capture | Optional fields supported |
| Medical claims in API | Avoided |
