# Neon Snake — Multiplayer

## 🏠 Aktuell verfügbar im lokalen Netz
**http://192.168.178.103:3000** — für alle Geräte im selben WLAN spielbar

---

Cross-device neon snake game. Multiple hosting options below.

---

## Option A: Partykit (Recommended — free, WebSocket, cross-device) ☁️

1. **Install partykit** (requires Node):
   ```bash
   npx partykit login   # login with GitHub
   npx partykit deploy
   ```
2. You'll get a URL like: `neon-snake.YOUR_USER.partykit.dev`
3. **Set `PARTYKIT_HOST`** in `index.html` (line near top of `<script>`):
   ```js
   const PARTYKIT_HOST = 'neon-snake.YOUR_USER.partykit.dev';
   ```
4. Re-deploy or host the updated `index.html` anywhere (GitHub Pages, etc.)

Anyone worldwide can join via the URL!

---

## Option B: GitHub Pages (free, no backend — same-browser tabs only)

1. Create a GitHub repo, push `index.html`
2. Go to **Settings → Pages → Deploy from branch** → `main` / root
3. Your URL: `https://YOUR_USER.github.io/REPO_NAME/`

> ⚠️ Cross-device multiplayer only works if `PARTYKIT_HOST` is set.  
> Same browser → multiple tabs still works via BroadcastChannel.

---

## Option C: Local Network (current setup)

```bash
./node/node.exe server.js 3000
```

Share `http://YOUR_LAN_IP:3000` with devices on the same WiFi.
Run `ipconfig` (Windows) to find your LAN IP.

---

## Option D: Railway / Render (free tier, public internet)

1. Push this repo to GitHub
2. **Railway**: railway.app → New Project → Deploy from GitHub → done  
   or **Render**: render.com → New Web Service → `node server.js`
3. Set `PORT` env var if needed (both platforms set it automatically)
4. Update `PARTYKIT_HOST` in `index.html` with your service URL (using `wss://`)  
   — or just use the hosted URL directly (server.js handles both HTTP + WS)

---

## How to Play

1. **Create Room** → share the 5-letter code
2. Friends open the same URL → enter code → **Join**
3. Host clicks **Start Game**
4. Controls: Arrow keys / WASD / Touch swipe
