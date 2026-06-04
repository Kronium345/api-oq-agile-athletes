# Onboarding & auth API (backend)



Base URL: `https://api-oq-agile-athletes.onrender.com` (or your Render host).

## Important: user id

This API uses UUID `userId` values, not MongoDB ObjectIds. Every auth/onboarding response includes **`_id`** equal to **`userId`** so the mobile app can keep using `user._id` in paths.

Set **`JWT_SECRET`** on Render. Tokens are signed JWTs (`Authorization: Bearer <token>`). Without `JWT_SECRET`, tokens fall back to raw `userId` (legacy dev only).

## Flow (mobile app)

```
POST /auth/register  →  store result + token
  → PATCH /user/:id/gender
  → PATCH /user/:id/experience
  → PUT   /user/:id/avatar  (multipart or preset URL JSON)
  → PATCH /user/:id/weight
  → home
```

Resume (`GET /user/:id`): missing `gender` → `/gender`; missing `experience` → `/experience`; missing `weight` → `/weightInput`.

## Endpoints

| Method | Path | Body | Auth |
|--------|------|------|------|
| POST | `/auth/register` | `firstName, lastName, email, password, username?` | — |
| POST | `/auth/login` | `emailOrUsername, password` | — |
| GET | `/user/:id` | — | Bearer |
| PATCH | `/user/:id/gender` | `{ gender: "Male" \| "Female" }` | Bearer |
| PATCH | `/user/:id/experience` | `{ experience: "Beginner" \| ... \| "Elite" }` | Bearer |
| PUT | `/user/:id/avatar` | multipart `avatar` **or** JSON `{ avatar: "https://..." }` | Bearer |
| PATCH | `/user/:id/weight` | `{ weight: number, unit: "kg" \| "lbs" }` | Bearer |
| PUT | `/user/:id/username` | `{ username }` | Bearer |

### Register (201)

```json
{
  "result": {
    "_id": "<uuid>",
    "userId": "<uuid>",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "gender": null,
    "experience": null,
    "avatar": null,
    "weight": null,
    "unit": "kg"
  },
  "token": "<jwt>"
}
```

### Login (200 / 404 / 401)

Same `{ result, token }` shape as register.

### GET user (200)

Returns the user object directly (fields at top level), including `_id`, `gender`, `experience`, `weight`, `avatar`.

### Avatar preset (JSON)

```http
PUT /user/:id/avatar
Authorization: Bearer …
Content-Type: application/json

{ "avatar": "https://img.icons8.com/..." }
```

### Avatar upload (multipart)

```http
PUT /user/:id/avatar
Authorization: Bearer …
Content-Type: multipart/form-data

avatar: <file>
```

Uploaded files are stored under `uploads/avatars/` and served at `/uploads/avatars/...`.

## Legacy routes (unchanged)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/auth/signup` | `{ name, email, password }` → `{ success, token, user }` |
| POST | `/auth/signin` | `{ email, password }` |
| GET | `/auth/current-user` | Bearer |

## Frontend config

Point `api/axios.js` `baseURL` to this API. Use `result` + `token` from register/login; persist `user` with `_id` for onboarding PATCH paths.

## Not in scope (this repo)

- `POST /auth/google` — not added (per request)
- Arcjet middleware — not added
- Email password reset — not added (can add later)
