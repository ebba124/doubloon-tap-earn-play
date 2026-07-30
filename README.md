# Doubloon Tap: Earn & Play

# Doubloon Tap — Full Project Description

**Bot:** `@DoubloonTapBot` · **Channels:** `t.me/Doublooncommunity`, `t.me/Doubloontap`

A Telegram Mini App implementing a tap-to-earn game, backed by a real server and database — not just front-end mockup logic.

---

## Architecture

```
┌─────────────────┐      HTTPS       ┌──────────────────┐
│  Telegram Mini   │ ───────────────▶│   Node.js API     │
│  App (HTML/JS)   │◀─────────────── │   (Express)       │
│  runs in Telegram│   JSON + initData│                   │
│  WebView         │                  └────────┬──────────┘
└─────────────────┘                            │
                                                ▼
                                       ┌──────────────────┐
                                       │  SQLite database  │
                                       │  (doubloon.db)     │
                                       └──────────────────┘
                                                ▲
                                                │
                                       ┌──────────────────┐
                                       │  Telegram Bot      │
                                       │  (long-polling)    │
                                       │  catches /start     │
                                       └──────────────────┘
```

## Front-end — `doubloon-tap.html`

Single self-contained file, no build step, loaded directly over HTTPS.

- **Earn** — tap coin, energy ring, daily streak bonus
- **Tasks** — join-channel tasks linking to your real channels
- **Friends** — personalized referral link, invited-friends list
- **Boosts** — Multitap, Energy Limit, Invite-50-friends milestone (+25,000 DBL, permanent 2× tap)
- **Wallet** — balance→USDT conversion, payout method picker (Binance/Bybit/USDT), withdrawal request
- Real Telegram profile (name, photo, username) via the official `telegram-web-app.js` SDK; haptic feedback; native Telegram link opening

## Backend — `doubloon-bot-server/`

- **`db.js`** — SQLite schema (users, referrals, withdrawals). Energy regenerates lazily on read. Task rewards and boost costs are defined server-side only, so the client can never dictate its own payout.
- **`verifyTelegram.js`** — validates Telegram's signed `initData` (HMAC-SHA256 against the bot token) so identity and balance can't be spoofed from the browser.
- **`server.js`** — the bot (catches `/start ref_<id>` for referral crediting) + the API: `/api/session`, `/api/tap`, `/api/boost`, `/api/claim-daily`, `/api/task/complete`, `/api/withdraw`, `/api/me`.

**Data flow (a tap):** app sends `POST /api/tap` with the signed `initData` header → server verifies signature → identifies the real user → checks energy in the database → deducts energy, adds tap value to balance → returns the real numbers → app renders them.

## Current status

| Piece | Status |
|---|---|
| Front-end UI (all 4 tabs) | ✅ Built |
| Backend API + database | ✅ Built and tested |
| Front-end ↔ backend connection | ⏳ Not yet wired — HTML still uses localStorage |
| Deployment | ⏳ Needs hosting (front-end + backend separately) |
| Real USDT payout execution | ⏳ Requests are logged only; needs exchange integration |

---

## Roadmap to a mature, production-grade system

### Security & infrastructure
- Rate limiting per verified user (not per IP)
- Schema validation on every request body (zod/joi)
- Withdrawal address format validation per network
- Helmet.js security headers, proper secrets management
- Audit log table for every balance-changing action
- Move from SQLite to PostgreSQL for real concurrent load, with a migrations tool (Prisma/Knex/Drizzle)
- Automated backups, idempotency keys on tap/boost endpoints
- Anti-multi-accounting and anti-bot tap detection
- Process manager/containerization (pm2 or Docker), structured logging + error tracking (Pino/Sentry), health check endpoint, staging vs. production environments
- Simple admin dashboard: review/approve withdrawals, look up user history, manually adjust balances
- Unit + integration test suite, CI pipeline (GitHub Actions)

### Payments (to make withdrawals real)
- A funded exchange/custodial wallet account
- Exchange institutional/merchant payout API integration (not personal API keys)
- KYC/identity verification before withdrawal (Sumsub, Onfido, etc.)
- Manual review/admin approval step, at least initially
- Legal review of money-transmission regulations in your jurisdiction

### Engagement & retention features
- Global + friends leaderboard
- Daily rotating quests (separate from one-time Tasks)
- Offline earnings ("You earned X while away")
- Combo/streak tap multiplier
- Daily spin wheel / chest for small random bonuses

### Social & growth features
- Referral tiers (bigger bonuses unlocked at invite milestones, beyond the 50-friend one)
- Squads/clans with group leaderboards
- Shareable stats card for posting outside Telegram
- **Telegram Stars integration** — Telegram's native in-app currency; genuinely real, simple payments (Telegram handles the transaction, you just verify it) for selling boosts/energy refills — far simpler than exchange/crypto integration

### Progression systems
- XP/levels separate from balance, with cosmetic unlocks
- Achievements/badges
- Seasonal events (time-limited multipliers or visual themes)

### Quality-of-life polish
- Bot-sent notifications ("Energy full!", "Streak resets in 1 hour")
- Settings tab (language, notifications, reset progress)
- Multi-language support (Afaan Oromo + English via a simple i18n layer)
- Tap sound effects (toggleable)

### Admin/operator tools
- Broadcast tool for announcements via the bot
- Config-driven economy (reward/cost values in a config table, not hardcoded)

---

For a portfolio repo, the strongest next moves are: **finish the front-end↔backend wiring**, add **rate limiting + input validation + a basic admin page + a test suite** (shows engineering maturity), and build **leaderboard + offline earnings + daily quests + Telegram Stars payments** (shows real product thinking with one fully legitimate payment integration).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9390d4bf-9dc1-4ad9-a917-86e1a29d318d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
