# Doubloon Tap — Build Plan

Build a Telegram Mini App with a full server-authoritative backend on Lovable Cloud (Postgres + TanStack server functions). All economy logic lives server-side; the client only displays results.

## 1. Backend setup

- Enable **Lovable Cloud** (Postgres + auth + storage).
- Add secret **`TELEGRAM_BOT_TOKEN`** (needed to verify Telegram `initData` HMAC). User will paste it from @BotFather.
- Optional secret **`ADMIN_TELEGRAM_IDS`** — comma-separated Telegram user IDs allowed into the admin page.

## 2. Database schema (migration)

```text
users          id (telegram_id PK), username, first_name, last_name, photo_url,
               balance, energy, energy_max, energy_regen_per_sec,
               tap_value, tap_multiplier_permanent, multitap_level,
               energy_limit_level, last_energy_update, streak_day,
               last_daily_claim, referred_by, created_at
referrals      referrer_id, referred_id (unique), reward_paid, created_at
tasks_done     user_id, task_id (composite PK), completed_at
withdrawals    id, user_id, amount_dbl, amount_usdt, method, address,
               status (pending/approved/rejected/paid), created_at, reviewed_at
audit_log      id, user_id, action, delta, meta jsonb, created_at
```

RLS: users can only read their own row via server fns (no direct client Supabase access — everything goes through server fns keyed on verified Telegram ID). Grants for `authenticated` + `service_role`.

Server-side config table `economy_config` holds task rewards, boost costs, milestone rewards (config-driven, not hardcoded).

## 3. Auth: Telegram initData verification

- Middleware `requireTelegramUser` reads `X-Telegram-Init-Data` header, verifies HMAC-SHA256 signature against `TELEGRAM_BOT_TOKEN`, checks `auth_date` freshness (< 24h), returns `{ telegramId, user }` in context.
- All game endpoints require this middleware — the client's balance claims are ignored.

## 4. Server functions (`src/lib/game.functions.ts`, thin wrappers)

- `getSession` — upsert user, regenerate energy lazily, return full state + referral link.
- `tap({ taps })` — server checks energy, deducts, credits `tap_value * tap_multiplier`, writes audit row. Simple per-user rate cap (max taps/second) to blunt bots.
- `claimDaily` — streak logic based on `last_daily_claim`.
- `buyBoost({ boostId })` — deducts balance, applies boost (multitap+1, energy_limit+1, etc.).
- `completeTask({ taskId })` — checks channel-join tasks aren't already claimed; credits reward.
- `getReferrals` — list invited friends + milestone progress (50-friend → +25,000 DBL, permanent 2×).
- `requestWithdraw({ amount, method, address })` — Zod-validated, address format check per network, inserts pending row.
- `getLeaderboard` — top 100 by balance (public projection).

## 5. Telegram bot `/start ref_<id>` handling

Server route `POST /api/public/telegram/webhook` (HMAC-secured with a derived secret token). On `/start ref_<id>` it stores the pending referral so `getSession` credits it after the invitee opens the app.

Registers webhook against `project--<id>-dev.lovable.app` on first admin visit (setWebhook via bot token).

## 6. Front-end — 4-tab Mini App

Route `/` renders the Mini App. Loads `telegram-web-app.js` from Telegram CDN via root `head()`. Uses TanStack Query + server fns; no `localStorage` economy state.

- **Earn tab**: big coin (tap animation + haptic), energy ring, balance, streak card.
- **Tasks tab**: server-driven task list, "Join & Verify" opens channel via `Telegram.WebApp.openTelegramLink`.
- **Friends tab**: personal `t.me/DoubloonTapBot?start=ref_<id>` link, invited list, 50-friend milestone progress.
- **Boosts tab**: Multitap, Energy Limit, milestone card.
- **Wallet tab**: DBL→USDT (server rate), method picker (Binance/Bybit/USDT-TRC20/BEP20), withdrawal form + history.

Dark, coin-gold themed design system in `src/styles.css` (semantic oklch tokens, no ad-hoc classes). Mobile-first, Telegram viewport aware.

## 7. Admin page `/admin`

Gated by `ADMIN_TELEGRAM_IDS` (checked server-side via same initData middleware). Approve/reject withdrawals, user lookup, manual balance adjust, broadcast message via bot.

## 8. Security / hardening (included in v1)

- Zod validation on every input.
- Per-user tap-rate cap and idempotency key on tap/boost.
- Withdrawal address regex per network.
- Audit log on every balance change.
- Helmet-equivalent security headers on server routes.
- Server-side error logging via existing `reportLovableError`.

## 9. SEO / metadata

Root `head()` updated with real title, description, OG/Twitter tags for @DoubloonTapBot. `sitemap.xml` + `robots.txt` per template rules.

## Deferred (called out but NOT built in v1)

Real USDT payout execution, KYC, exchange payout API, Telegram Stars, leaderboard cosmetics beyond top-100, i18n, offline earnings, spin wheel, seasonal events, PostgreSQL migration tooling (already on Postgres via Cloud), CI/tests.

---

**Confirm to proceed** and I will:
1. Enable Lovable Cloud.
2. Ask you to paste the `TELEGRAM_BOT_TOKEN` from @BotFather.
3. Ship the schema, server fns, UI, and admin page.
