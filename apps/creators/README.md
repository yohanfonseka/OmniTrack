# CreatorTrack (creatortrack.lk)

Creators connect Instagram, TikTok and YouTube; the app pulls their stats from each platform's official API daily; brands browse verified headline stats and, with a verified email, see full reports and download PDFs. Free for creators, always. See [SPEC.md](SPEC.md) for the product spec (Iterations 1 and 2).

This is a **separate app** from the OmniTrack agency app in the repo root: its own users, its own Firestore database (`creatortrack`) and its own Cloud Run service (`creatortrack`). Nothing is shared.

## Run locally

```bash
cd apps/creators
bun install
cp .env.example .env   # then edit ADMIN_EMAILS
bun run dev            # http://localhost:3100
```

With the example `.env`:
- data lives in memory and is lost on restart;
- **demo mode** is on, so "Connect" creates a demo account with generated numbers (labelled "Demo data" everywhere) instead of going to the real platform;
- emails (verification links, invites) are printed to the terminal instead of sent.

Sign up with an address listed in `ADMIN_EMAILS` and confirm it to get the Admin page.

```bash
bun run test   # API tests (in-memory store, demo providers)
bun run lint   # type-check
bun run build  # production build → dist/
```

## How it works

| Piece | Where |
|---|---|
| Sign-up, login, Google sign-in, email verification, password reset | `server/auth.ts`, `server/routes/auth.ts` |
| Platform connections (official OAuth) | `server/providers/` (`instagram.ts`, `tiktok.ts`, `google.ts` for YouTube + Google sign-in, `demo.ts`) |
| Daily sync, token refresh, reconnect emails, referral credit | `server/sync.ts` |
| Engagement rate and history | `server/metrics.ts`: engagement = (likes + comments) ÷ followers, averaged over the 12 most recent posts |
| Directory search (cached 2 min to keep Firestore reads low), view/search counters, report-view log | `server/directory.ts` |
| Who sees what on a profile | `server/routes/public.ts` → `accessFor()` |
| PDF report (brands, stamped with their name) and media kit (creators) | `server/pdf.ts` |
| Admin: invites (single, bulk CSV), creators, brands, referrers | `server/routes/admin.ts` |
| Scheduled jobs | `server/routes/internal.ts` |
| Frontend (React + Tailwind) | `src/` |

Every full-report view by a brand is recorded in `brandViews` (brand, creator, first/last viewed). Iteration 2's daily free report and paid unlocks build on that collection.

## Deploy (Cloud Run, project `omnitrack-507708`)

### 1. One-time setup

```bash
# Separate Firestore database for this app
gcloud firestore databases create --database=creatortrack --location=asia-southeast1

# Secrets
printf '%s' "$(openssl rand -base64 32)" | gcloud secrets create ct-token-key --data-file=-
printf '%s' "$(openssl rand -hex 24)"    | gcloud secrets create ct-internal-secret --data-file=-
printf '%s' 're_xxx'                     | gcloud secrets create ct-resend-key --data-file=-
# …and ct-google-secret, ct-instagram-secret, ct-tiktok-secret once you have them
```

The Cloud Run service account needs `roles/datastore.user` and `roles/secretmanager.secretAccessor`.

### 2. Build and deploy

Create a Cloud Build trigger with build config `apps/creators/cloudbuild.yaml` and an included-files filter of `apps/creators/**`, so it only rebuilds when this app changes. Then set the service's configuration once:

```bash
gcloud run services update creatortrack --region=asia-southeast1 \
  --set-env-vars=BASE_URL=https://creatortrack.lk,FIRESTORE_DATABASE_ID=creatortrack,FIREBASE_PROJECT_ID=omnitrack-507708,ADMIN_EMAILS=you@example.com,EMAIL_FROM="CreatorTrack <hello@creatortrack.lk>",GOOGLE_CLIENT_ID=…,INSTAGRAM_APP_ID=…,TIKTOK_CLIENT_KEY=… \
  --set-secrets=TOKEN_ENCRYPTION_KEY=ct-token-key:latest,INTERNAL_SECRET=ct-internal-secret:latest,RESEND_API_KEY=ct-resend-key:latest,GOOGLE_CLIENT_SECRET=ct-google-secret:latest,INSTAGRAM_APP_SECRET=ct-instagram-secret:latest,TIKTOK_CLIENT_SECRET=ct-tiktok-secret:latest
```

In production the server refuses to start without `BASE_URL`, `TOKEN_ENCRYPTION_KEY`, `INTERNAL_SECRET`, Firestore and `RESEND_API_KEY`, and with `DEMO_MODE` set. A platform with no credentials shows "Coming soon", so you can launch with only the platforms that have passed review.

Map the domain: `gcloud beta run domain-mappings create --service=creatortrack --domain=creatortrack.lk --region=asia-southeast1`.

### 3. Scheduled jobs (Cloud Scheduler)

```bash
URL=https://creatortrack.lk
SECRET=$(gcloud secrets versions access latest --secret=ct-internal-secret)
gcloud scheduler jobs create http ct-daily-sync    --location=asia-southeast1 --schedule="17 2 * * *"  --time-zone=Asia/Colombo --uri=$URL/internal/sync          --http-method=POST --headers=x-internal-secret=$SECRET --attempt-deadline=30m
gcloud scheduler jobs create http ct-weekly-digest --location=asia-southeast1 --schedule="23 9 * * 1"  --time-zone=Asia/Colombo --uri=$URL/internal/weekly-digest --http-method=POST --headers=x-internal-secret=$SECRET --attempt-deadline=30m
gcloud scheduler jobs create http ct-cleanup       --location=asia-southeast1 --schedule="41 3 * * *"  --time-zone=Asia/Colombo --uri=$URL/internal/cleanup       --http-method=POST --headers=x-internal-secret=$SECRET
```

## Platform apps: redirect URIs to register

| Platform | Where | Redirect URI | Scopes / products |
|---|---|---|---|
| Google sign-in | Google Cloud → APIs & Services → Credentials (OAuth client, Web) | `https://creatortrack.lk/api/auth/google/callback` | `openid email profile` |
| YouTube | same OAuth client | `https://creatortrack.lk/api/connect/youtube/callback` | Enable **YouTube Data API v3** and **YouTube Analytics API**; scopes `youtube.readonly`, `yt-analytics.readonly` (needs Google verification) |
| Instagram | developers.facebook.com → app → Instagram → API setup with Instagram login | `https://creatortrack.lk/api/connect/instagram/callback` | `instagram_business_basic`, `instagram_business_manage_insights` (App Review) |
| TikTok | developers.tiktok.com → app → Login Kit | `https://creatortrack.lk/api/connect/tiktok/callback` | `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list` (app review) |

All three reviews ask for the privacy policy (`/privacy`), terms (`/terms`) and data-deletion instructions (`/data-deletion`) URLs. The wording on those pages is a **draft** and must be approved before submitting.

## Costs at launch

Platform APIs are free. Cloud Run scales to zero; Firestore's free daily allowance covers early traffic (directory reads are cached; view counters are batched once a minute); Resend's free tier covers ~3,000 emails a month.
