# 📌 SyncBoard - Real-Time Collaborative Sticky Note Board

SyncBoard is a full-stack, real-time sticky-note collaboration board where multiple users can open the application in separate browser tabs or devices and instantly observe each other's edits, movements, color changes, and mouse cursors.

Built with **React**, **Vite**, **Native WebSockets (`ws`)**, and **Node.js/Express**, SyncBoard features **Optimistic UI**, **Version-based Conflict Resolution**, **JSON State Persistence**, and **Automatic Reconnection**.

---

## 🚀 Key Features

1. **Real-Time Sticky Notes**:
   - Create, edit, move, recolor, and delete notes instantly across all connected tabs.
2. **Live Remote Cursors**:
   - Track mouse movements of other online users in real-time with custom color labels (e.g., "User 1", "User 2").
   - Throttled cursor position broadcasts for smooth performance and low network load.
3. **Online User Count**:
   - Live badge displaying current online sessions (e.g., `🟢 2 users online`).
4. **Optimistic UI Updates**:
   - Local state updates immediately upon user input/drag without waiting for server roundtrips.
5. **Deterministic Conflict Resolution**:
   - Each note maintains an integer `version`. Outdated concurrent edits trigger a `CONFLICT` alert and synchronize the client with the server's authoritative state.
6. **Server State Persistence**:
   - Notes, text, colors, positions, and version numbers persist across server restarts in `server/data/state.json`.
7. **Auto-Reconnection & State Synchronization**:
   - Seamlessly reconnects on network loss and synchronizes the latest canvas board state.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, JavaScript (ES6+), Vanilla CSS (Design Tokens, Glassmorphism, Responsive Grid), Lucide Icons.
- **Backend**: Node.js 18+, Express, native `ws` WebSocket library, CORS.
- **Persistence**: Local server file `server/data/state.json` (No external database or paid services).

---

## 📁 Project Structure

```
SyncBoard/
├── client/                      # Frontend React + Vite app
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx       # Top header, user count, status, add note button
│   │   │   ├── Board.jsx        # Canvas grid, sticky note container, cursors layer
│   │   │   ├── StickyNote.jsx   # Draggable note, editor, color dots, version tag
│   │   │   └── RemoteCursor.jsx # Remote mouse pointer SVG and user tag
│   │   ├── hooks/
│   │   │   └── useWebSocket.js  # WS connection hook, status, auto-reconnect
│   │   ├── utils/
│   │   │   └── ids.js           # ID generator, throttle helper, note color palette
│   │   ├── App.jsx              # Main layout, optimistic state reducers, conflict handler
│   │   ├── main.jsx             # React DOM root
│   │   └── index.css            # Complete design system & custom animations
│   ├── index.html               # Entry HTML with modern Google Fonts (Inter & Outfit)
│   ├── vite.config.js           # Vite dev server configuration (Port 3000)
│   └── package.json             # Frontend dependencies
│
├── server/                      # Backend Node.js + Express + WS server
│   ├── data/
│   │   └── state.json           # JSON persistent storage file
│   ├── server.js                # Express & HTTP server entrypoint (Port 5000)
│   ├── websocket.js             # Native WS connection manager, broadcasting, router
│   ├── stateManager.js          # In-memory note CRUD, versions & conflict detection
│   ├── persistence.js          # Asynchronous debounced JSON disk IO
│   └── package.json             # Backend dependencies
│
├── .env.example                 # Environment variables template
├── .gitignore                   # Git ignore file
├── vercel.json                  # Vercel deployment configuration
├── package.json                 # Root orchestration scripts
└── README.md                    # Main documentation
```

---

## 🔌 WebSocket Message Protocol

All WebSocket communication uses JSON messages structured with `type`, `operationId`, `clientId`, and `payload`:

| Client → Server | Description |
| :--- | :--- |
| `CONNECT` | Initial handshake request. |
| `CREATE_NOTE` | Creates a new sticky note on the board. |
| `UPDATE_NOTE` | Edits note text or color (includes note `version`). |
| `MOVE_NOTE` | Updates note position coordinates `x` and `y`. |
| `DELETE_NOTE` | Removes a sticky note by `noteId`. |
| `CURSOR_MOVE` | Sends debounced `x`, `y` mouse coordinates. |
| `REQUEST_STATE` | Requests current authoritative board state. |

| Server → Client | Description |
| :--- | :--- |
| `INITIAL_STATE` | Sent on connection with existing notes and user list. |
| `NOTE_CREATED` | Broadcasts newly created note to all clients. |
| `NOTE_UPDATED` | Broadcasts updated note content/color and incremented version. |
| `NOTE_MOVED` | Broadcasts updated note position. |
| `NOTE_DELETED` | Broadcasts note deletion event. |
| `CURSOR_UPDATE` | Broadcasts remote user cursor position. |
| `USER_JOINED` / `USER_LEFT` | Updates online user list and counter. |
| `CONFLICT` | Sent to client when an operation version mismatch occurs. |
| `STATE_SYNC` | Authoritative full state synchronization. |

---

## ⚡ Conflict Resolution Strategy

SyncBoard uses a **Version-based Conflict Resolution** model:
1. Each note has an integer `version` field (starts at `1`).
2. When a client modifies a note, it transmits the `version` it edited.
3. The server compares `clientVersion` with `serverVersion`:
   - **Version Match (`clientVersion === serverVersion`)**: Server accepts the change, increments version (`serverVersion + 1`), saves to disk, and broadcasts `NOTE_UPDATED`.
   - **Version Mismatch (`clientVersion !== serverVersion`)**: Server rejects the update, emits a `CONFLICT` message to the offending client with `serverNote`, and broadcasts `STATE_SYNC`.
4. The client UI immediately displays a conflict alert toast and flashes the conflicted note while reverting local state to the server's authoritative version.

---

## 📦 Installation & Local Development

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Start Backend Server
```bash
npm run server
# Or for auto-reload during development:
npm run server:dev
```
Backend runs on `http://localhost:5000` (WebSocket on `ws://localhost:5000`).

### 3. Start Frontend Client
```bash
npm run client
```
Frontend runs on `http://localhost:3000`.

---

## 🚀 Deployment (Vercel & Cloud)

- **Frontend (Vercel)**:
  - Root directory: `client` (or root with `npm run build`)
  - Build command: `npm run build`
  - Output directory: `dist`
  - Environment variable: `VITE_WS_URL=wss://your-backend-server.com`
- **Backend**:
  - Deploy Node.js server to Render, Railway, Fly.io, or VPS.
