# Local Go setup + Netlify deploy

## 1) Run everything with Docker Compose (recommended)

If you do not want local Go/ffmpeg setup, use Docker:

```bash
docker compose up --build
```

Or via npm scripts:

```bash
npm run docker:up
```

App URLs:

- Web app: `http://localhost:3000`
- Go API: `http://localhost:8080`

Stop containers:

```bash
docker compose down
```

## 2) Install local dependencies (non-Docker option)

- Node/npm (already required for this app)
- Go 1.22+
- ffprobe (required by `server/internal/jobs/probe.go`)
- Netlify CLI (`npm i -g netlify-cli`) or use the Netlify UI

On macOS (Homebrew):

```bash
brew install go ffmpeg
```

`ffprobe` is included with `ffmpeg`.

## 3) Run locally

Start Go API:

```bash
npm run go:run
```

In another terminal, start web dev:

```bash
npm run web
```

By default, the app calls:

- `EXPO_PUBLIC_API_URL` if set
- otherwise `http://localhost:8080`

If needed, set it explicitly:

```bash
EXPO_PUBLIC_API_URL=http://localhost:8080 npm run web
```

## 4) Deploy web app to Netlify

This repo includes `netlify.toml`:

- Build command: `npm run build:web`
- Publish directory: `dist`
- SPA redirect: `/* -> /index.html`

Deploy options:

- Connect repo in Netlify UI and deploy
- or CLI:

```bash
netlify deploy --build
netlify deploy --prod --build
```

## 5) Configure API URL in Netlify

Set environment variable in Netlify site settings:

- Key: `EXPO_PUBLIC_API_URL`
- Value: your deployed Go API base URL (for example `https://api.your-domain.com`)

Then trigger a new deploy.

## Important architecture note

Netlify is great for hosting the Expo web output, but this Go service should run on a dedicated backend host (Render, Fly.io, Railway, ECS, etc.), not Netlify Functions, because:

- it accepts large multipart uploads
- it depends on `ffprobe`
- it uses in-memory queued jobs and polling endpoints
