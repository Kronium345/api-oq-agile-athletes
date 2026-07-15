# Body Scan — Node API (Expo integration)

Body Scan is proxied through this Node API so the Expo app never talks to Form Coach
directly (auth, rate limits, URL hiding, scan history).

```
Expo app
   │  POST /api/body-scan  (multipart + Bearer token)
   ▼
Node API
   │  auth · validate · prefill · rate limit · persist
   ▼
Form Coach  POST /body-scan
```

Requires `FORM_COACH_API_URL` (same host as form analysis). Disable with
`BODY_SCAN_ENABLED=false`.

---

## Endpoints

### `GET /api/body-scan/health` (public)

Feature flag + Form Coach reachability.

```json
{ "success": true, "enabled": true, "ready": true, "message": "Body scan available" }
```

Use this (or a local feature flag) before showing the Body Scan UI.

### `POST /api/body-scan` (auth required)

`Content-Type: multipart/form-data`

| Field | Required | Notes |
|---|---|---|
| `front_image` | **yes** | JPG / PNG / WEBP, max 15MB |
| `side_image` | no | Improves depth estimation |
| `height_cm` | yes* | 120–230 |
| `weight_kg` | yes* | 30–300 |
| `age` | yes* | 16–90 |
| `sex` | yes* | `male` or `female` |

\* Prefill from profile when omitted: `weight` (+ `unit` → kg) and `gender` → sex.
Height and age almost always still need to be sent from the client today.

**Headers:** `Authorization: Bearer <token>`

**Success (200):** Form Coach fields passed through, plus a saved `scan` row:

```jsonc
{
  "success": true,
  "body_fat_percent": 18.4,
  "bmi": 23.1,
  "measurements_cm": { "waist": 81.2, "chest": 98.5 },
  "confidence": "medium",
  "warnings": [],
  "disclaimer": "...",
  "scan": {
    "id": "uuid",
    "createdAt": "2026-07-15T...",
    "bodyFatPercent": 18.4,
    "bmi": 23.1,
    "measurementsCm": { "waist": 81.2 },
    "confidence": "medium",
    "warnings": [],
    "disclaimer": "...",
    "usedSideView": true,
    "heightCm": 178,
    "weightKg": 75,
    "age": 28,
    "sex": "male"
  }
}
```

**Do not invent medical meaning in the app** — show `disclaimer`, `warnings`, and
`confidence` as returned.

**Errors**

| Status | Meaning |
|---|---|
| `400` | Missing/invalid fields or images |
| `401` | Not logged in |
| `413` | Image > 15MB |
| `429` | Daily scan limit (default 8/day) |
| `502` | Network / Form Coach failure (retryable) |
| `503` | Feature disabled or Form Coach waking up |

Photos are **not** stored — only measurements + Form Coach JSON.

### `GET /api/body-scan/history?limit=20` (auth)

```json
{ "success": true, "scans": [ /* same scan shape as above */ ] }
```

### `GET /api/body-scan/latest` (auth)

```json
{ "success": true, "scan": { /* … */ } | null }
```

Use history/latest for BF% / waist trend charts.

---

## Expo fetch example

```ts
async function runBodyScan(params: {
  frontUri: string;
  sideUri?: string;
  heightCm: number;
  weightKg: number;
  age: number;
  sex: 'male' | 'female';
  token: string;
}) {
  const form = new FormData();
  form.append('front_image', {
    uri: params.frontUri,
    name: 'front.jpg',
    type: 'image/jpeg',
  } as any);
  if (params.sideUri) {
    form.append('side_image', {
      uri: params.sideUri,
      name: 'side.jpg',
      type: 'image/jpeg',
    } as any);
  }
  form.append('height_cm', String(params.heightCm));
  form.append('weight_kg', String(params.weightKg));
  form.append('age', String(params.age));
  form.append('sex', params.sex);

  const res = await fetch(`${API_BASE}/api/body-scan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.token}` },
    // Do NOT set Content-Type — boundary is set automatically
    body: form,
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Body scan failed');
  }
  return json;
}
```

Timeouts: allow **30–60s** (Render cold starts). Show a loading state; on `503`/`502`,
offer retry.

---

## Ops knobs

```bash
FORM_COACH_API_URL=https://agile-athletes-ai-form-coach.onrender.com
FORM_COACH_TIMEOUT_MS=120000
BODY_SCAN_ENABLED=true          # set false to kill switch
BODY_SCAN_RATE_LIMIT_PER_DAY=8
# BODY_SCAN_RATE_LIMIT_DISABLED=true
```

Curl smoke test against Form Coach (not Node):

```bash
curl -X POST "$FORM_COACH_API_URL/body-scan" \
  -F "front_image=@front.jpg" \
  -F "height_cm=178" \
  -F "weight_kg=75" \
  -F "age=28" \
  -F "sex=male"
```
