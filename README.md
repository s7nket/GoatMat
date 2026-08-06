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
| 1 | Products, suppliers, customers CRUD | next |
| 2 | Purchase + sale entry, live stock | |
| 3 | PDF kaccha bill, WhatsApp share | |
| 4 | Offline outbox + sync | |
| 5 | Date-range reports | |
| 6 | Payments / udhaar ledger | |
| 7 | EAS build + GitHub Release | |

## First-time setup

### 1. Node

React Native 0.86 requires Node `^20.19.4 || ^22.13.0 || ^24.3.0`. Anything
older prints `EBADENGINE` warnings on install and can fail at bundle time.
Check with `node --version` and upgrade from https://nodejs.org if needed.

### 2. Supabase project

1. Create a project at [supabase.com](https://supabase.com) — region **Mumbai (ap-south-1)**.
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql), run it.
   *Already ran an earlier copy?* Run
   [`supabase/002_members_auto_provision.sql`](supabase/002_members_auto_provision.sql) too.
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
- **No raw values in screens.** Colours, spacing and type come from
  `src/theme/tokens.ts`; money and dates go through `src/lib/format.ts`.

## Checks

```bash
npx tsc --noEmit
```
