# 📌 SyncBoard - Real-Time Collaborative Sticky Note Board

SyncBoard is a full-stack, real-time collaborative sticky note board where multiple users can open the application across different browser tabs or devices and instantly see each other's notes, edits, movements, color changes, and mouse cursors.

Built for **100% Unified Vercel Deployment** utilizing **React + Vite** and **Vercel Functions WebSocket Support** (`/api/ws`).

---

## 🚀 Key Features

1. **Real-Time Sticky Notes**:
   - Create, edit, move, recolor, and delete notes instantly across all connected tabs.
2. **Live Remote Cursors**:
   - Track mouse movements of online users in real-time with custom colored name tags (e.g., "User 1", "User 2").
   - Throttled cursor updates (30ms/50ms) to ensure high responsiveness with low network overhead.
3. **Online User Count**:
   - Live presence indicator displaying current active sessions (e.g., `🟢 2 users online`).
4. **Optimistic UI Updates**:
   - Local state updates immediately on user input/drag without waiting for network roundtrips.
5. **Deterministic Conflict Resolution**:
   - Each note maintains an integer `version` field. Outdated concurrent edits trigger a `CONFLICT` event, flashing the note red and resynchronizing to the authoritative server state.
6. **Unified Vercel Architecture**:
   - Both the React frontend and the native WebSocket backend run within a **single Vercel deployment** via Vercel Functions (`api/ws.js`).
7. **Cross-Instance State Persistence**:
   - Supports Upstash Redis / Vercel KV for multi-instance distributed sync, with local JSON file fallback for offline development.

---

## 📁 Project Architecture

```
SyncBoard/
├── api/                         # Vercel Serverless WebSocket Functions
│   ├── ws.js                    # Vercel WebSocket Function entrypoint (/api/ws)
│   ├── stateManager.js          # Authoritative note state & conflict resolution
│   └── store.js                 # Upstash Redis / Vercel KV store + local fallback
│
├── client/                      # Frontend React 18 + Vite App
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx       # Header, connection badge, user count, add note
│   │   │   ├── Board.jsx        # Canvas grid, note container, cursor layer, toasts
│   │   │   ├── StickyNote.jsx   # Draggable card, text editor, color picker, version tag
│   │   │   └── RemoteCursor.jsx # Live SVG cursor pointer & user tag
│   │   ├── hooks/
│   │   │   └── useWebSocket.js  # Environment-aware WS hook (/api/ws, auto-reconnect)
│   │   ├── utils/
│   │   │   └── ids.js           # ID generator, throttle helper, note color palette
│   │   ├── App.jsx              # Main layout, optimistic state reducers, conflict handler
│   │   ├── main.jsx             # React DOM root
│   │   └── index.css            # Design system, sticky note themes, animations
│   ├── index.html               # HTML entry with Google Fonts (Inter & Outfit)
│   ├── vite.config.js           # Vite dev config with /api/ws proxy (Port 3000)
│   └── package.json             # Frontend dependencies
│
├── server/                      # Local standalone dev server (optional local runner)
│   ├── server.js                # Express & WS server on port 5000
│   ├── websocket.js             # Local standalone websocket handler
│   ├── stateManager.js          # In-memory note state manager
│   ├── persistence.js          # Local disk IO helper
│   └── data/
│       └── state.json           # Local persistent JSON file
│
├── .env.example                 # Environment variables template
├── .gitignore                   # Git ignore file
├── vercel.json                  # Vercel deployment & rewrite configuration
├── package.json                 # Root dependencies (@upstash/redis, ws) & scripts
└── README.md                    # Project documentation
```

---

## 🔌 WebSocket Connection Architecture

### 1. Client Implementation
- **File**: [`client/src/hooks/useWebSocket.js`](file:///d:/SyncBoard/client/src/hooks/useWebSocket.js)
- **Local Development URL**: `ws://${window.location.host}/api/ws` (proxied via Vite on `http://localhost:3000`) or `ws://localhost:5000/api/ws`.
- **Production URL**: `wss://${window.location.host}/api/ws` (Same-origin secure WebSocket on Vercel).

### 2. Server Implementation
- **File**: [`api/ws.js`](file:///d:/SyncBoard/api/ws.js)
- **Endpoint**: `/api/ws` (Native Vercel WebSocket Function).

---

## ⚡ Conflict Resolution & Versioning

SyncBoard uses a **Version-based Conflict Resolution** model:
1. Each note has an integer `version` field (starts at `1`).
2. When a client modifies a note, it transmits the `version` it edited.
3. The server validates `clientVersion` against `serverVersion`:
   - **Match (`clientVersion === serverVersion`)**: Server accepts the change, increments version (`serverVersion + 1`), saves to store, and broadcasts `NOTE_UPDATED`.
   - **Mismatch (`clientVersion !== serverVersion`)**: Server rejects the update, emits a `CONFLICT` message to the client with `serverNote`, and broadcasts `STATE_SYNC`.
4. The client UI immediately displays a conflict toast and flashes the conflicted note red while synchronizing to the server's authoritative version.

---

## 💻 Local Development

### 1. Install All Dependencies
```bash
npm run install:all
```

### 2. Run Local Development Server
Open two terminals:

**Terminal 1 (Backend Server)**:
```bash
npm run server:dev
```
*Runs backend server on `http://localhost:5000` (`ws://localhost:5000/api/ws`)*

**Terminal 2 (Frontend Client)**:
```bash
npm run client
```
*Runs Vite dev server on `http://localhost:3000` (automatically proxies `/api/ws` to port 5000).*

---

## 🚀 Deploying to Vercel (All-in-One Deployment)

Because SyncBoard utilizes Vercel Functions WebSocket support, the entire application deploys directly to Vercel without requiring external backend servers.

### Step 1: Push Code to GitHub
Ensure all code is committed and pushed to your GitHub repository.

### Step 2: Import Project into Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New..." $\rightarrow$ "Project"**.
2. Select your `realtime-syncboard` repository.
3. Vercel automatically detects the configuration from [`vercel.json`](file:///d:/SyncBoard/vercel.json).
4. Click **"Deploy"**.

### Step 3 (Optional for Multi-Instance Production Scaling): Add Upstash Redis
If multiple users connect across different global edge regions:
1. In your Vercel Project dashboard, go to the **Storage** tab.
2. Click **"Connect Store" $\rightarrow$ "Upstash Redis"**.
3. Vercel will automatically configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Redeploy — SyncBoard will automatically use Redis for multi-instance cross-tab synchronization!
