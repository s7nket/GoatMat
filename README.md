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
3. Go to **Authentication → Providers → Email** and turn **off** "Enable sign-ups".
   This app has no sign-up screen; accounts are created by hand.
4. **Authentication → Users → Add user** for each person. Confirm the email.
5. Back in **SQL Editor**, put each user on the roster — nothing is readable
   until this row exists:

   ```sql
   insert into members (user_id, full_name, role)
   values ('<paste-the-user-uuid>', 'Your Name', 'owner');
   ```

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
