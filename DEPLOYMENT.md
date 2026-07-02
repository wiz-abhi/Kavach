# Deploying Kavach

**Frontend → Vercel · Backend → Render.**

> Why not the backend on Vercel? The backend runs a persistent WebSocket server and
> background broadcast loops for the live feed. Vercel is serverless (no long-lived
> sockets/intervals), so the backend needs a persistent host — Render.

Deploy the **backend first**, get its URL, then deploy the frontend pointed at it.
Both connect to the **same AuraDB instance you already loaded**, so no data reload is needed.

---

## 1. Backend on Render

**Option A — Blueprint (uses `render.yaml`, recommended):**
1. Push this repo to GitHub (already done).
2. Render dashboard → **New +** → **Blueprint** → connect the `Kavach` repo.
3. Render reads `render.yaml` and creates the `kavach-backend` web service. When prompted, enter the secret env vars:
   - `NEO4J_URI` = `neo4j+s://<your-instance>.databases.neo4j.io`
   - `NEO4J_USERNAME` = your AuraDB username
   - `NEO4J_PASSWORD` = your AuraDB password
   - `ANTHROPIC_API_KEY` = *(optional — leave blank; copilot falls back to rules)*
4. **Create** and wait for the deploy. Note the service URL, e.g. `https://kavach-backend.onrender.com`.

**Option B — manual:** New + → Web Service → repo → set **Root Directory** `backend`,
**Build** `npm install`, **Start** `npm start`, add the same env vars.

**Verify:** open `https://<your-backend>.onrender.com/api/health` → `{"ok":true,"neo4j":"connected"}`.

> ⚠️ Render free services **spin down after ~15 min idle** (cold start ~50s). Before demoing,
> open the `/api/health` URL once to wake it, then load the dashboard.

---

## 2. Frontend on Vercel

1. Vercel dashboard → **Add New** → **Project** → import the `Kavach` repo.
2. Set **Root Directory** to `frontend` (click Edit → select `frontend`).
3. Framework preset auto-detects **Next.js**. Leave build/output defaults.
4. Add **Environment Variables** (these are inlined at build time, so set them *before* deploying):
   - `NEXT_PUBLIC_API_URL` = `https://<your-backend>.onrender.com`
   - `NEXT_PUBLIC_WS_URL` = `wss://<your-backend>.onrender.com/api/live-feed`
     *(note `wss://`, not `ws://` — Render serves over TLS)*
5. **Deploy.** Open the Vercel URL — the dashboard should populate from the Render backend.

If you later change the backend URL, update the two env vars in Vercel and **redeploy**
(NEXT_PUBLIC_* values are baked in at build time).

---

## 3. Post-deploy smoke test

1. Backend `/api/health` returns connected.
2. Frontend loads, stats show account/transaction counts, live feed ticks.
3. **Run Detection** → 4 rings. **Why Graph?**, **Investigate**, **Ask Copilot** all respond.
4. **Inject Fraud Ring** → **Run Detection** → new ring caught.

---

## Notes

- **CORS** is open (`app.use(cors())`), so the Vercel origin can call the Render backend as-is.
- The backend needs no generator files at runtime — it only talks to AuraDB, which already
  holds the loaded dataset.
- To reset demo state on the deployed DB, run `npm run reset` locally against the same AuraDB
  (it points at the same instance via your local `backend/.env`).
