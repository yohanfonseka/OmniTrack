# OmniTrack

Multi-tenant digital agency campaign monitoring platform with drill-down pacing, health engine, and multi-platform analytics.

## Architecture

- **Frontend**: Vite + React SPA (`src/`), calling the API under `/api/*`.
- **Backend**: Express server (`server.ts`, `server/`) that holds application state in memory and persists it to **Cloud Firestore** via the Firebase Admin SDK (`server/firestore.ts`). All Firestore reads/writes happen server-side only — the browser never talks to Firestore directly.
- **Database**: Firestore. Security rules (`firestore.rules`) deny all client SDK access; only the backend's Admin SDK (which bypasses rules) can read/write.

## Run Locally

**Prerequisites:** Node.js (or [Bun](https://bun.sh)), and Google Cloud credentials with access to the Firestore project referenced in `firebase-applet-config.json`.

1. Install dependencies:
   `bun install` (or `npm install`)
2. Authenticate for Firestore access. Either:
   - Run `gcloud auth application-default login`, or
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to point at a service account key with Firestore access.
3. Run the app:
   `bun run dev` (or `npm run dev`)

The server listens on `PORT` (defaults to `3000`).

## Build & Deploy

```
bun run build   # vite build (frontend) + esbuild bundle (server -> dist/server.cjs)
bun run start   # node dist/server.cjs, serves the built frontend + API
```

On GCP (Cloud Run, GCE, App Engine, etc.) the attached service account is picked up automatically via Application Default Credentials — no key file needs to be deployed. That service account needs Firestore read/write access (e.g. the `Cloud Datastore User` / `Firebase Admin` IAM role) on the target project.

**Important:** application state lives in the server process's memory (hydrated from Firestore on boot). Only run a single instance — running multiple replicas will cause them to diverge and overwrite each other's writes in Firestore.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port the server listens on | `3000` |
| `NODE_ENV` | `production` serves the built `dist/` assets instead of the Vite dev server | - |
| `FIREBASE_PROJECT_ID` | Overrides the project ID from `firebase-applet-config.json` | from config file |
| `FIRESTORE_DATABASE_ID` | Overrides the Firestore database ID from `firebase-applet-config.json` | from config file |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a service account key file (only needed outside GCP, or to override the attached service account) | Application Default Credentials |
