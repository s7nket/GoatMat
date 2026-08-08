# Development

Everything needed to build, run and release GoatMat. For what the app *is*, see
the [README](../README.md).

Private Android app for running a trading business: purchases, sales, stock,
party balances and reports. Not published to any store — the APK is handed out
directly.

- **App:** Expo SDK 57 / React Native 0.86 / expo-router / TypeScript
- **Data:** Supabase (hosted Postgres) with Row Level Security
- **Distribution:** EAS Build → `.apk` → GitHub Releases → sideload

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Project setup, design system, database schema, auth, tab shell | **done** |
| 1 | Products, suppliers, customers CRUD | **done** |
| 2 | Purchase + sale entry, live stock | **done** |
| 3 | PDF kaccha bill, WhatsApp share | **done** |
| 4 | Offline outbox + sync | **done** |
| 5 | Date-range reports | **done** |
| 6 | Payments / udhaar ledger | **done** |
| 7 | EAS build + GitHub Release | **done** — [v1.0.0](https://github.com/s7nket/GoatMat/releases/latest) |

Phases 4 and 6 are JavaScript only, so they ship as over-the-air updates —
no reinstall.

## Releasing

```bash
npx eas-cli@latest build --platform android --profile production
```

Produces a universal APK (~104 MB). Download it, rename it `GoatMat-vX.Y.Z.apk`,
and attach it to a GitHub release tagged from `main`.

Needed only when something native changes — a new library, the icon, a
permission, or the version in `app.json`. Everything else goes out as:

```bash
npx eas-cli@latest update --branch production --environment production --platform android --message "what changed"
```

`--platform android` matters: without it the export includes web, which
prerenders the app in Node, where Supabase auth touches `window` and the
publish fails.

Installed apps pick that up on next launch. `runtimeVersion` follows
`app.json`'s `version`, so an update can never reach a binary too old to run
it — bump the version and you owe everyone a new APK.

Build secrets live in EAS, not in the repo. After changing `.env`:

```bash
npx eas-cli@latest env:push --path .env --environment production
```

## First-time setup

### 1. Node

React Native 0.86 requires Node `^20.19.4 || ^22.13.0 || ^24.3.0`. Anything
older prints `EBADENGINE` warnings on install and can fail at bundle time.
Check with `node --version` and upgrade from https://nodejs.org if needed.

### 2. Supabase project

1. Create a project at [supabase.com](https://supabase.com) — region **Mumbai (ap-south-1)**.
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](../supabase/schema.sql), run it.
   *Already ran an earlier copy?* Run the numbered migrations you have not applied
   yet, in order — [`002_members_auto_provision.sql`](../supabase/002_members_auto_provision.sql),
   [`003_bill_entry.sql`](../supabase/003_bill_entry.sql),
   [`004_business_profile.sql`](../supabase/004_business_profile.sql),
   [`005_idempotent_bills.sql`](../supabase/005_idempotent_bills.sql),
   [`006_multi_tenant.sql`](../supabase/006_multi_tenant.sql),
   [`007_payments.sql`](../supabase/007_payments.sql).
   Run them in order. All are safe to re-run.
3. Go to **Authentication → Providers → Email** and turn **off** "Enable sign-ups".
   This app has no sign-up screen — accounts only exist because you made them.
4. **Authentication → Users → Add user** for each person. Confirm the email.

That is the whole flow. A trigger creates each new user's profile, so there is
no UUID to copy and no SQL to run per person. Every account starts with its own
empty set of books.

### 3. Local env

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → Data API**. `.env` is gitignored.

The anon key is public by design — it ships inside the APK and anyone can read
it out. RLS is what protects the data. **Never** put the `service_role` key in
this project.

### 4. Run it

```bash
npm install
```

```bash
npx expo start
```

Install **Expo Go** on an Android phone, scan the QR code. Edits reload live.

> Changed `.env`? Restart with `npx expo start -c` — env values are inlined
> into the bundle and the cache holds the old ones.

## Layout

```
src/
  app/                  expo-router routes (file path = URL)
    _layout.tsx         providers, font loading, auth gate
    sign-in.tsx
    (tabs)/             Home, Sales, Purchases, Parties, Stock
  components/ui/        the whole component kit
  lib/
    supabase.ts         client
    auth.tsx            session + profile context
    offline.tsx         connectivity, outbox state, pending overlays
    outbox.ts           the queue itself: backoff, retries, failed jobs
    queries.ts          react-query hooks
    format.ts           money, dates, pieces
    database.types.ts   mirrors supabase/schema.sql
  theme/tokens.ts       every colour, size, shadow in the app
supabase/schema.sql     run this in Supabase Studio
```

## One business per user

Each account is its own tenant. Every row carries an `owner_id`, defaulted by
Postgres to `auth.uid()` — the app never sends it, so a client bug cannot write
into someone else's books. RLS is `owner_id = auth.uid() and is_active()`.

There are no staff and no shared data. Two accounts cannot see each other's
products, customers, stock or bills, and bill numbers run 1, 2, 3 within each
business rather than interleaving across all of them.

Sign-ups stay **disabled**. Accounts are created by hand in Supabase Studio;
a trigger gives each new user their own profile.

## Managing people

Everything happens in Supabase Studio — the app has no admin screen and needs
no redeploy.

| To do this | Go here |
|---|---|
| Add an owner | **Authentication → Users → Add user**. Their profile and empty books appear automatically. |
| Set their display name | On the same dialog, add `full_name` to user metadata. Otherwise it is derived from the email. |
| Revoke access | **Table Editor → profiles**, set `active` to `false`. |
| Restore access | Set `active` back to `true`. |
| Remove permanently | Delete the auth user. This **fails** while they still have bills — `owner_id` references them and nothing cascades, on purpose. |

Revoking beats deleting. `active = false` cuts every read and write instantly
but leaves the data intact, so it can be turned back on. Deletion is blocked by
the foreign key precisely so a business cannot be destroyed with one click in a
table editor.

Either takes effect on their next request — no need to touch their phone.

## Offline

Saving never touches the network. Every write goes into an outbox in
AsyncStorage, and a worker sends it when there is signal — immediately if
there is, later if not. The screen behaves the same either way, so there is no
separate offline path that only gets exercised somewhere with no bars.

The phone generates each row's UUID before sending. A request can succeed on
the server and still fail on the way back, and without a client-side id the
retry would write a second bill that nobody would ever notice.

Reads come from the query cache, persisted to disk and rehydrated at launch.
Stock and party balances are server views, so they are as old as the last
sync — the unsent queue is folded back over them at render time. That is what
stops someone overselling stock they already sold an hour ago.

Three things still need a connection, and say so rather than failing quietly:

| Blocked offline | Why |
|---|---|
| Sending a bill PDF | A queued bill has no bill number yet |
| Voiding a bill | It changes a row only the server holds |
| Reports | They reach back over months never cached on the phone |

**Testing it:** airplane mode. The dev-only simulate switch was removed once
the queue was verified — a control in Settings that deliberately breaks the app
is not worth the support conversation.

## Rules that keep the data honest

- **Stock is never stored.** `stock_view` computes bought − sold. It cannot drift.
- **Bill totals are never typed.** A trigger recalculates `total_amount` from the
  line items on every insert, update and delete.
- **Bills are append-only.** To fix one, void it (`voided_at`) and enter a new
  one. Voided bills stay for the audit trail and drop out of every view.
- **Bills are written in one transaction.** `create_sale` / `create_purchase`
  insert the header and its lines together, so a dropped connection can never
  leave a zero-total orphan bill behind.

## Opening stock

Stock you already own before using the app is entered as a purchase, not typed
in. Add a supplier called `Opening Stock`, record one purchase dated today with
your real counts, and use whatever you actually paid as the rate (0 if unknown).
Stock is then correct from day one and the books still balance.
- **No raw values in screens.** Colours, spacing and type come from
  `src/theme/tokens.ts`; money and dates go through `src/lib/format.ts`.

## Checks

```bash
npx tsc --noEmit
```
