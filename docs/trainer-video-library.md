# Trainer video library

Coaches upload short training clips; clients watch clips assigned to them. Video bytes live in **object storage**; MongoDB stores metadata only.

Set `EXPO_PUBLIC_USE_TRAINER_MOCKS=false` in the Expo app when these routes are live.

---

## Storage recommendation

| Option | Verdict |
|--------|---------|
| **MongoDB GridFS** | No — poor fit for large video streaming and signed URLs |
| **AWS S3** | Works; **egress fees** add up when clients replay clips |
| **Google Cloud Storage** | Same egress concern as S3 |
| **Cloudflare R2 (recommended)** | S3-compatible API, **no egress fees**, presigned GET URLs, low storage cost |
| **Local disk (`uploads/`)** | Dev only — Render/ephemeral disks, no CDN, not multi-instance safe |

This API supports **`TRAINER_VIDEO_STORAGE=local`** (default when R2 is not configured) and **`TRAINER_VIDEO_STORAGE=r2`** for production.

### R2 setup (production)

1. Cloudflare dashboard → R2 → Create bucket (private; no public access).
2. Create API token with Object Read & Write on that bucket.
3. Set env on Render:

```env
TRAINER_VIDEO_STORAGE=r2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=agile-athletes-trainer-videos
TRAINER_VIDEO_API_BASE_URL=https://api-oq-agile-athletes.onrender.com
TRAINER_VIDEO_SIGNED_URL_TTL_SEC=3600
TRAINER_VIDEO_MAX_BYTES=104857600
```

Optional: `R2_ENDPOINT` if you use a custom endpoint (default `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).

### Local dev

Without R2 vars, uploads go to `uploads/trainer-videos/{trainerId}/{videoId}.mp4`.  
`playUrl` is a short-lived JWT stream URL:

`GET /trainers/content/play/:videoId?token=...`

---

## Data model (`trainer_videos`)

| Field | Type | Notes |
|-------|------|--------|
| `videoId` | string (UUID) | Primary id returned as `id` |
| `trainerId` | string | Owner trainer profile id |
| `userId` | string | Trainer's auth user id |
| `title` | string | Required |
| `description` | string \| null | Optional |
| `storageKey` | string | e.g. `trainer-videos/{trainerId}/{videoId}.mp4` |
| `thumbnailKey` | string \| null | Reserved for future ffmpeg poster |
| `durationSec` | number \| null | Reserved for future ffprobe |
| `mimeType` | string | `video/mp4`, `video/quicktime`, … |
| `assignedMemberIds` | string[] | **User ids** (UUID strings in this API) |
| `createdAt` / `updatedAt` | ISO date | |

`playUrl` and `thumbnailUrl` are **not stored** — regenerated on every list/detail response.

---

## Access rules

1. **`/trainers/me/content/*`** — requires Bearer auth + trainer profile (`requireTrainer`). CRUD only on own `trainerId`.
2. **`GET /trainers/content/assigned`** — videos where `assignedMemberIds` contains `req.userId`.
3. **`GET /trainers/:trainerId/content`** — same filter, scoped to that trainer (MVP: assigned-only).
4. **`playUrl`** — R2 presigned URL (1h default) or local JWT stream; member must be assigned or be the owning trainer.

---

## Endpoints

All routes are under `/trainers` (same mount as PT network).

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `GET` | `/trainers/me/content` | Trainer | List own videos |
| `POST` | `/trainers/me/content` | Trainer | Multipart upload |
| `PUT` | `/trainers/me/content/:videoId` | Trainer | Update metadata / assignees |
| `DELETE` | `/trainers/me/content/:videoId` | Trainer | Delete DB + object |
| `GET` | `/trainers/content/assigned` | User | Assigned videos (any coach) |
| `GET` | `/trainers/:trainerId/content` | User | Assigned videos from one coach |
| `GET` | `/trainers/content/play/:videoId` | Token | Local dev stream only |

### `POST /trainers/me/content` (multipart)

**Fields**

- `video` — file (`video/mp4`, `video/quicktime`; max 100MB default)
- `title` — string (required)
- `description` — optional string
- `assignedMemberIds` — JSON string array of user ids, e.g. `'["uuid-1","uuid-2"]'`

**Response 201**

```json
{
  "success": true,
  "video": {
    "id": "…",
    "trainerId": "…",
    "title": "RDL cues",
    "description": "…",
    "playUrl": "https://…signed…",
    "thumbnailUrl": null,
    "durationSec": null,
    "assignedMemberIds": ["…"],
    "createdAt": "2026-08-28T12:00:00.000Z"
  }
}
```

### `PUT /trainers/me/content/:videoId`

```json
{
  "title": "Updated title",
  "description": "Optional",
  "assignedMemberIds": ["64f…", "64a…"]
}
```

### `GET /trainers/content/assigned`

```json
{
  "success": true,
  "videos": [{ "id": "…", "title": "…", "playUrl": "https://…", "trainerId": "…" }]
}
```

---

## Expo integration

| Mobile file | Role |
|-------------|------|
| `services/trainerContentApi.ts` | API client |
| `app/trainer/library.tsx` | Coach upload & manage |
| `app/trainer/assigned.tsx` | Client playback list |
| `app/trainer/[id].tsx` | Trainer profile video section |

Example upload (same pattern as form coach / body scan):

```typescript
const form = new FormData();
form.append('video', {
  uri: localUri,
  name: 'clip.mp4',
  type: 'video/mp4',
} as any);
form.append('title', 'RDL cues');
form.append('description', 'Brace core, hinge hips');
form.append('assignedMemberIds', JSON.stringify([memberUserId]));

const res = await fetch(`${API_BASE}/trainers/me/content`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

List assigned clips:

```typescript
const res = await fetch(`${API_BASE}/trainers/content/assigned`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { videos } = await res.json();
// Pass videos[i].playUrl to expo-av Video source
```

---

## Env reference

```env
# local | r2 — defaults to r2 when R2_* vars are set, else local
TRAINER_VIDEO_STORAGE=local
TRAINER_VIDEO_MAX_BYTES=104857600
TRAINER_VIDEO_SIGNED_URL_TTL_SEC=3600
TRAINER_VIDEO_API_BASE_URL=https://api-oq-agile-athletes.onrender.com

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
# R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com

# MONGO_TRAINER_VIDEOS_COLLECTION=trainer_videos
```

---

## Future enhancements

- ffmpeg/ffprobe after upload → `durationSec`, `thumbnailUrl`
- Public catalogue flag on videos (currently assigned-only for clients)
- Presigned POST uploads (direct client → R2) if API memory becomes a bottleneck
