# DevOps portfolio roadmap — Agile Athletes

Discussion notes for strengthening a **Junior DevOps Engineer** application using Agile Athletes as the anchor project. This is a planning document — not an implementation checklist to execute in one sprint.

---

## The short answer

**Yes — Agile Athletes strengthens a DevOps application**, but it is not a “DevOps project” by itself today. It is a **production software project that already demonstrates many DevOps principles**. The goal is to make that operational work **visible, repeatable, and documented**.

---

## What you already have (recruiter view)

| Signal | Agile Athletes today |
|--------|----------------------|
| Git / version control | ✅ GitHub repos |
| Production deployments | ✅ Render API, live stores |
| Automated mobile builds | ✅ EAS Build |
| Cloud hosting | ✅ Render, MongoDB Atlas, Cloudflare R2 |
| Secrets management | ✅ Render + EAS environment variables |
| Release management | ✅ App Store + Play Store |
| Real users & integrations | ✅ Auth, RevenueCat, HealthKit, AI, webhooks |
| CI/CD (full pipeline) | ⚠️ Partial — EAS yes; API tests not automated in CI |
| Docker | ❌ |
| Infrastructure as Code | ❌ |
| Observability / monitoring | ⚠️ Limited unless added |
| Incident response docs | ⚠️ Informal experience, not written down |

**What impresses interviewers most:** you have shipped and operated an end-to-end product — store reviews, OAuth, env vars, hotfixes, privacy policy, production bugs. That is operational experience many juniors lack.

---

## Target story for interviews

Present **two layers** of the same product:

1. **Agile Athletes** — Full-stack mobile product (engineering, cloud, auth, releases, maintenance).
2. **Agile Athletes Platform** — Infrastructure, automation, monitoring, and runbooks behind the app.

> “I built a real application **and** I know how to operate it.”

---

## Phase 0 — Document what you already do (1–2 days)

Before adding tools, capture what you already operate:

- Render API + environment variables
- MongoDB Atlas
- Cloudflare R2 (trainer videos)
- EAS → App Store / Play Store
- Stripe, OAuth, RevenueCat, push, etc.

**Deliverables**

- Architecture diagram (Expo → API → Mongo, R2, Stripe, third-party AI)
- Deploy runbook (how API and mobile ship today)
- 2–3 real incident stories (Sign-In SHA-1, review rejections, cold starts, env misconfig)

**Interview prep question:** *“Tell me about a production issue.”*

---

## Phase 1 — CI first (highest ROI, lowest risk)

Add **GitHub Actions** to the API repo:

```
Push / PR
  → npm ci
  → npm run build
  → npm test
  → (optional) lint
```

**Stretch:** Deploy to Render only after tests pass on `main` (deploy hook or Action).

**Portfolio line:** *Automated build and test pipeline on every PR.*

**Feasibility:** High — repo already has `build` and `test` scripts.

---

## Phase 2 — Dockerise the backend

**Dockerfile**

- Multi-stage: `npm ci` → `tsc` → slim runtime
- `HEALTHCHECK` on a `/health` route
- Non-root user
- `.dockerignore` (exclude `.env`, `node_modules`, `dist` if rebuilt in image)

**Local dev**

```yaml
# docker-compose.yml (conceptual)
services:
  api:
    build: .
    ports: ["4000:4000"]
    env_file: .env
```

**Production paths (pick one for portfolio)**

| Path | Trade-off |
|------|-----------|
| Docker on Render | Easiest migration; same host |
| VPS + Docker Compose | Stronger DevOps story; more ops burden |
| Build image in CI, deploy to Render | Good middle ground |

**Portfolio line:** *Containerised Node.js API with reproducible builds.*

---

## Phase 3 — Secrets & configuration

Already partly done via Render + EAS.

**Formalise**

- Never commit `.env`
- Group env vars in docs: `auth`, `db`, `storage`, `payments`, `ai`
- Optional: Doppler / 1Password Secrets Automation

**Portfolio line:** *Secrets managed per environment; no credentials in source control.*

---

## Phase 4 — Observability

Start small; expand later.

**Tier 1 (easy)**

- Uptime monitor on API health URL (Better Stack, UptimeRobot, etc.)
- Sentry on API + Expo
- Structured request logging (`requestId`, route, status, duration)

**Tier 2 (stronger)**

- Prometheus `/metrics` or OpenTelemetry
- Grafana Cloud (free tier)
- Alerts: API down, 5xx spike, webhook failures

**Portfolio line:** *Health checks, error tracking, and uptime alerts.*

---

## Phase 5 — Infrastructure as Code

Separate repo or `/infra` folder: **Agile Athletes Platform**

**Terraform / OpenTofu** — start with one provider:

- Cloudflare R2 bucket + token policy (or document manual + IaC for DNS)
- DNS records (custom domain)
- Optional: VPS (Hetzner / DigitalOcean) + firewall

Do not terraform everything on day one. One resource type is enough to start.

**Portfolio line:** *Infrastructure defined as code; environments reproducible from Git.*

**Note:** MongoDB Atlas and Render can be partially or fully managed outside Terraform at junior level — document what is IaC vs platform-managed.

---

## Phase 6 — Reverse proxy & HTTPS (if leaving pure PaaS)

If API moves to a VPS:

```
Internet → Nginx (TLS) → Docker API → MongoDB Atlas / R2
```

- Let's Encrypt (Certbot or Caddy)
- Rate limiting, upload size limits (relevant for trainer video uploads)
- Staging vs production hostnames

**Portfolio line:** *TLS termination, routing, and edge hardening.*

**Skip early if staying on Render** — Render handles TLS; Nginx is optional for the story unless you move off PaaS.

---

## Phase 7 — Release & deployment workflow

| Layer | Target |
|-------|--------|
| API | GH Actions → test → deploy |
| Mobile | EAS Build on tag or promote workflow |
| Stores | EAS Submit + release checklist |

**Staging environment**

- Second Render service or `api-staging.*`
- Separate MongoDB database / Stripe test keys
- Expo preview or internal channel

**Portfolio line:** *Staging and production with separate secrets and deploy paths.*

---

## Phase 8 — Operational artefacts

Suggested `/docs/ops/` (or portfolio site section):

1. Architecture diagram
2. Deploy runbook
3. Incident postmortems (short — 3 real examples)
4. Rollback plan (previous Render deploy / EAS build)
5. Backup note (MongoDB Atlas backups)

---

## Suggested timeline

| Week | Focus |
|------|--------|
| 1 | GitHub Actions: test + build on PR |
| 2 | Dockerfile + local `docker compose up` |
| 3 | Health endpoint + Sentry + uptime monitor |
| 4 | Ops docs + architecture diagram |
| 5–6 | Terraform for R2 or DNS (or VPS) |
| 7+ | Optional VPS + Nginx |

---

## CV / portfolio bullets (examples)

- Containerised Node.js API; CI runs tests on every PR
- Production API on Render with environment-based configuration
- Cloudflare R2 object storage for trainer media; secrets via platform env vars
- Uptime monitoring and error tracking for API availability
- Documented runbooks and incident response for store releases and OAuth

---

## What not to do early

- **Kubernetes** — overkill at current scale; be ready to explain *why not*
- **Big-bang retrofit** — incremental changes read better in interviews
- **Fake incidents** — real App Store / OAuth / permission stories are stronger

---

## Interview framing (one paragraph)

> Agile Athletes started as a product I shipped solo. I am formalising the platform layer — CI, containers, observability, and IaC — so deployments are repeatable and production issues are detectable. I am targeting junior DevOps roles where operational ownership matters as much as coding.

---

## Feasibility snapshot (integrating from current stack)

See section below for effort, risk, and what fits Render + Atlas + EAS without derailing the product.

### Overall verdict

| Initiative | Feasibility | Effort | Risk to live app |
|------------|-------------|--------|------------------|
| GitHub Actions CI | **Very high** | Low (hours) | None |
| Ops docs + diagrams | **Very high** | Low (days) | None |
| Uptime + Sentry | **Very high** | Low (hours–1 day) | Low |
| Docker local + CI build | **High** | Medium (1–2 days) | None if Render unchanged |
| Docker on Render | **High** | Medium (1 day) | Low–medium (test staging first) |
| Staging environment | **High** | Medium (1–2 days) | Low if separate service/DB |
| Terraform (R2/DNS) | **Medium** | Medium (2–5 days learning) | Low if applied carefully |
| VPS + Nginx + Compose | **Medium** | High (3–7 days) | Medium — migration risk |
| Prometheus + Grafana | **Medium** | Medium (2–4 days) | Low |
| Full K8s | **Low** (for now) | Very high | High — not recommended yet |

### Constraints specific to this API repo

- **Render:** Native Node deploy works today; Docker on Render is supported and is the natural first container step without leaving PaaS.
- **MongoDB Atlas:** Usually stays managed; Terraform optional; backups via Atlas UI is fine to document.
- **Cloudflare R2:** Good Terraform candidate; bucket already exists — import or document drift.
- **EAS / mobile:** Keep separate from API CI; EAS already covers mobile build automation.
- **Secrets:** Many integrations (Stripe, Gemini, R2, JWT) — staging must duplicate *test* keys, not production.
- **Video uploads:** Any proxy/body-size limits affect trainer content — note in Nginx/VPS phase if pursued.

### Recommended integration order (if starting now)

1. GitHub Actions (no production change)
2. Document ops + architecture (no production change)
3. Sentry + uptime monitor (minimal code)
4. Dockerfile + compose for local parity
5. Staging Render service
6. Docker deploy to Render (staging → production)
7. Terraform for Cloudflare/DNS when comfortable
8. VPS/Nginx only if you want a deliberate migration story

### Time budget (realistic, part-time)

- **Minimal credible DevOps layer:** 2–3 weekends (CI + docs + monitoring + Dockerfile)
- **Strong junior portfolio:** 1–2 months part-time (add staging, Render Docker, basic Terraform)
- **Full “Platform” project:** 2–3 months part-time (VPS, IaC breadth, dashboards, runbooks)

None of this requires pausing product features; the highest-ROI items are CI, documentation, and monitoring — all low risk to live users.

---

## Related docs in this repo

- `docs/trainer-video-library.md` — R2 storage setup (already operational)
- `.env.example` — environment variable reference for API
