# Embedded sync hub and in-app admin (feasibility)

Status: proposal, not implemented. Written 2026-10-24.

Goal: let non-technical users turn their desktop into the sync server with one
click from the Sync screen, set an admin password, and manage devices from a new
top-level **Admin** view instead of the browser admin pages. The main concerns
are firewall rules, finding the computer's address, and keeping the flow simple.

Verdict: feasible. The backend uses the same stack as the desktop app (Axum
0.8.9, sqlx 0.9 SQLite, Tokio), and the desktop toolchain (`rust-toolchain.toml`,
Rust 1.96) builds the backend's 2024 edition. The server can run inside the
desktop process at a cost of roughly 1-2 MB. Firewall handling is the only part
that cannot be fully automated; it can be reduced to one explained Windows
permission prompt.

## Repositories involved

| Path (from the `Time Tracker` workspace root) | Role |
|---|---|
| `time tracker/` | Desktop Tauri app (this repo) |
| `Time-Tracker-Backend/` | Standalone Rust sync server, separate git repo |
| `Time Tracker Moblie/` | Android app, separate git repo |

## Current state

Backend (`Time-Tracker-Backend/src`):

- `main.rs` requires `TIME_TRACKER_ADMIN_PASSWORD` from the environment and
  binds `0.0.0.0:8765` with no shutdown path.
- `db/mod.rs` uses `DATABASE_URL = "sqlite://server.db"`, relative to the
  working directory. `log.rs` writes `logs/info.log` and `logs/error.log`
  relative to the working directory.
- `admin/mod.rs` serves server-rendered HTML under `/admin`. Auth is an unsalted
  SHA-256 compare of the password and a single permanent session token stored in
  `admin_session`, sent as a `Path=/admin; HttpOnly; SameSite=Strict` cookie.
  Logout clears the cookie but does not rotate the token. There is no JSON admin
  API.
- `apiv1/mod.rs`: `/v1/check` returns the exact string
  `Time Tracker Backend v1`. `/v1/devices` returns only active devices and needs
  an active device's bearer token, so pending devices are only visible through
  the HTML admin. New registrations start inactive and need admin approval.

Desktop (`time tracker/`):

- `src-tauri/src/sync.rs`: `normalize_server_ip` strips scheme, path, and
  port, and `sync_server_url` always builds `http://{ip}:8765/v1/{path}`. The
  user-entered port is discarded. `check` compares the `/v1/check` body exactly.
- `ensure_sync_enabled` disables sync in debug builds.
- `src/Screens/Sync.tsx` asks the user to type a server IP, then register, then
  wait for admin approval.
- `src/App.tsx` defines top-level views in the `View` union; an `"admin"` view
  would be added there.
- NSIS installs per user (no elevation), registers an HKCU Run key, and the app
  lives in the tray. The exe path is stable across updater installs.
- `tauri-plugin-single-instance` is active, which matters for any self-relaunch.

Android (`Time Tracker Moblie/`): `SyncManager.kt` hard-codes
`http://$ip:8765`.

## Recommended architecture

Merge the backend into this repo as a Rust crate with both a library and a
binary (for example `server/`), using `git subtree add` to keep history.

- The binary keeps the current standalone and PM2 deployment working.
- `src-tauri` depends on the library and starts it on the Tokio runtime when
  hosting is enabled.
- Shipping the server inside the app makes "download and set up" a toggle.
  Avoid a Tauri sidecar binary (second exe, second firewall rule, process
  supervision) and avoid downloading the server on demand (SmartScreen,
  version skew, failure modes).
- `AGENTS.md` currently excludes backend changes from the desktop changelog.
  Once the hub ships inside the desktop app, hub changes are desktop-facing and
  that rule needs updating.

### Backend changes

| Today | Change |
|---|---|
| Password from env var | Passed in by the host; stored as a salted Argon2 hash in the server DB |
| `sqlite://server.db` relative to cwd | Path supplied by the host, e.g. `%APPDATA%\time-tracker\hub\server.db` |
| `logs/` relative to cwd | Routed to the desktop logger or a host-supplied directory |
| Runs until killed | Start/stop handle using Axum graceful shutdown, for the toggle and for updater restarts |
| HTML-only admin | Add JSON `/admin/api/*` with bearer session tokens; keep HTML pages for standalone use |
| `/v1/check` fixed string | Add `/v1/info` returning server ID, name, and version. Keep `/v1/check` unchanged because existing clients compare it exactly |
| Single permanent admin session | Rotate the session on password change and logout |

### Admin panel

- A React `Admin` view backed by the JSON admin API: approve or deactivate,
  rename, delete devices, browse logs, and show a pending-device count badge.
- Hosting locally: unlock once with the admin password, then remember the
  session. Remote hub: the same view works after entering that hub's password.
- When the app enables hosting, it registers its own device and marks it active
  directly, skipping the approval step for the owner.
- Tray notification for pending devices ("Pixel 8 wants to sync - Approve").
- Prototype shortcut: open the existing HTML admin in a separate Tauri window.
  It cannot be iframed in the main window because the `SameSite=Strict` cookie
  is blocked in a cross-site frame.

## Firewall

Default Windows behavior when the app first listens on a non-loopback address:
Windows shows a "Windows Security Alert" dialog. **Allow** needs admin rights;
**Cancel** creates inbound **block** rules for the exe, which silently break
sync. The dialog can appear behind the app window.

Recommended approach:

1. Before starting the listener, explain that Windows will ask for permission.
2. Run one elevated command via `ShellExecuteExW` with the `runas` verb using
   `netsh` or PowerShell. Use a Microsoft-signed tool instead of relaunching the
   app elevated because:
   - The UAC prompt shows a verified Microsoft publisher instead of "Unknown
     publisher" for an unsigned app.
   - `tauri-plugin-single-instance` would forward an elevated relaunch to the
     running instance.
3. In that one elevated command:
   - Allow inbound TCP 8765 for the app's exe.
   - Allow inbound UDP 5353 for mDNS discovery.
   - Delete existing block rules Windows created for the exe.
4. Scope the rules to the program, all profiles, `remoteip=LocalSubnet`. This
   works when the home network is marked Public, which is common, while
   rejecting non-local traffic.
5. Read rule state without elevation (`INetFwPolicy2` through the `windows`
   crate, or `netsh advfirewall firewall show rule`) to show "allowed /
   blocked / not set up" with a Fix button.

Not solvable in code; handle with detection and help text:

- Third-party security suites (Norton, Bitdefender and similar) with their own
  firewall. Loopback bypasses the firewall, so a self-test is not meaningful;
  the real signal is the first remote device connecting. Show "Waiting for your
  first device..." and a troubleshooting card after a timeout.
- Guest or mesh Wi-Fi with client isolation.
- Linux `.deb`: `ufw` is usually inactive on desktop Ubuntu; document it.
- Sync away from home requires port forwarding and often fails behind CGNAT.
  Out of scope for v1. Tailscale is the easy path later, but its `100.64.0.0/10`
  addresses are not `LocalSubnet` and need a separate opt-in rule.

## Finding the address

- Primary address: open a UDP socket, `connect` it to a public IP (no packets
  are sent), and read `local_addr`. This picks the default-route adapter and
  skips WSL, Hyper-V, Docker, and VPN adapters. Fallback: enumerate adapters
  and keep private IPv4 ranges (`192.168.0.0/16`, `10.0.0.0/8`,
  `172.16.0.0/12`), excluding `169.254.0.0/16`.
- The address changes when DHCP leases change, which breaks every client. Handle
  this in layers:
  1. mDNS/DNS-SD advertisement (for example `_timetracker._tcp` with the
     `mdns-sd` crate). Desktop gets a "Find hubs on my network" list; Android
     uses `NsdManager`.
  2. Clients store the hub's server ID from `/v1/info`, not only its address.
     When the saved address fails, rediscover by ID and update silently.
  3. QR code for phones encoding address, port, server ID, and a one-time
     pairing code. A valid pairing code can auto-approve the device.
- Keep port 8765. Clients discard user-entered ports today, so a configurable
  port needs client changes first. Detect "port already in use" and report it
  clearly.

## UX

- Do not use "server", "IP", or "port" in the main flow. Use "sync hub" and
  "address"; raw details go under Advanced.
- Sync screen flow:
  1. Two cards: "Make this computer the sync hub" and "Connect to an existing
     hub" (discovered hubs listed under it).
  2. Set and confirm the admin password. Provide "Reset admin password" on the
     hosting computer, since the owner already has file access.
  3. Turn on: start the server, self-register, self-approve, initial upload.
     Reuse the existing preparing-sync UI.
  4. Allow other devices: firewall explanation, then the single UAC prompt.
  5. Connect devices: QR code, address, and "Other computers on this Wi-Fi will
     see this hub automatically."
  6. The top-level Admin view appears with a pending badge.
- Guardrails:
  - If discovery finds an existing hub, offer to connect to it instead of
    creating a second hub that splits data.
  - Explain that devices sync while the hub computer is on; clients already
    queue and retry.
  - Warn when the hub is a laptop that changes networks.
  - Disabling hosting or uninstalling must not delete the hub database
    without an explicit choice; offer a backup.
  - Sync is disabled in debug builds, so hosting needs its own dev path,
    possibly through the existing demo mocks.

## Security

- Plain HTTP on the LAN is acceptable for v1, but device tokens and the admin
  password travel unencrypted.
- Restrict `/admin` to loopback by default, with an "Allow admin from other
  computers" toggle.
- The password hash moves from memory to disk, so use salted Argon2 instead of
  the current unsalted SHA-256.
- Rotate the admin session on password change and logout.

## Phases

| Phase | Scope | Rough size |
|---|---|---|
| 1. Merge and host | Backend crate in this repo; host-supplied paths and password; start/stop; self-approval; "Make this computer the hub" card | 3-5 days |
| 2. Admin panel | JSON admin API; React Admin view with approve, rename, delete, logs, and pending badge; remote hub login | 3-4 days |
| 3. Networking | Address detection; firewall state and single elevation; QR code; mDNS on desktop and Android; rediscovery by server ID | 4-6 days |
| 4. Polish | Auto-approving pairing codes; tray notifications; two-hub detection; troubleshooting card; password reset | 2-4 days |

Phase 1 alone delivers hosting from the Sync screen. Phase 3 makes it true
one-click setup.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| User cancels the Windows firewall dialog | High without the plan, low with it | Explain first, pre-create rules, remove block rules |
| Third-party firewall or client-isolated Wi-Fi | Medium | First-device wait state and troubleshooting card |
| Hub address changes | High over time | mDNS plus server-ID rediscovery |
| Two hubs on one network | Medium | Discovery check before enabling hosting |
| Hub computer asleep | High | Expectation text; clients already retry |
