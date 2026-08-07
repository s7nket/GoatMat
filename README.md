# GoatMat

Private Android app for running the goat-mat trading business: purchases, sales,
stock, party balances and reports. Not published to any store — the APK is
handed out directly.

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
| 4 | Offline outbox + sync | next |
| 5 | Date-range reports | **done** |
| 6 | Payments / udhaar ledger | |
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
npx eas-cli@latest update --branch production --message "what changed"
```

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
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql), run it.
   *Already ran an earlier copy?* Run the numbered migrations you have not applied
   yet, in order — [`002_members_auto_provision.sql`](supabase/002_members_auto_provision.sql),
   [`003_bill_entry.sql`](supabase/003_bill_entry.sql),
   [`004_business_profile.sql`](supabase/004_business_profile.sql). All are safe to re-run.
3. Go to **Authentication → Providers → Email** and turn **off** "Enable sign-ups".
   This app has no sign-up screen — accounts only exist because you made them.
4. **Authentication → Users → Add user** for each person. Confirm the email.

That is the whole flow. A trigger creates the matching `members` row on every
new auth user, so there is no UUID to copy and no SQL to run per person. The
first user created becomes `owner`; everyone after is `staff`.

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
    (tabs)/             Home, Sales, Purchases, Parties, Reports
  components/ui/        the whole component kit
  lib/
    supabase.ts         client
    auth.tsx            session + membership context
    queries.ts          react-query hooks
    format.ts           money, dates, pieces
    database.types.ts   mirrors supabase/schema.sql
  theme/tokens.ts       every colour, size, shadow in the app
supabase/schema.sql     run this in Supabase Studio
```

## Managing people

Everything happens in Supabase Studio — the app has no admin screen and needs
no redeploy.

| To do this | Go here |
|---|---|
| Add someone | **Authentication → Users → Add user**. Their membership row appears automatically. |
| Set their display name | On the same dialog, add `full_name` to user metadata. Otherwise it is derived from the email. |
| Revoke access | **Table Editor → members**, set `active` to `false`. |
| Restore access | Set `active` back to `true`. |
| Remove permanently | Delete the auth user. The membership row cascades away. |

Revoking beats deleting: `active = false` cuts every read and write instantly
while their name stays attached to the bills they entered. Deleting a user who
already recorded sales leaves those bills with a dangling `created_by`.

The change takes effect on their next request — no need to touch their phone.

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
