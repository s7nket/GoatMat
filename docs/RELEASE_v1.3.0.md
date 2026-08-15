# GoatMat v1.3.0 — Release Notes

**Release date:** 15 August 2026  
**Platform:** Android (APK — internal distribution)  
**Build profile:** Production  
**Branch:** `Sanket-Features`

---

## 📦 Installation

1. Download `GoatMat-v1.3.0.apk`
2. On your Android phone, go to **Settings → Install unknown apps** and allow your file manager or browser
3. Open the APK file and tap **Install**
4. Open **GoatMat** — sign in with your business account

> ⚠️ If you have a previous version installed, uninstall it first if you run into any issues after upgrading.

---

## ✨ What's New in v1.3.0

### 🗺️ Area Calculator Tab *(new)*
Work out exactly how many mats a floor needs — no guesswork.

- Enter room **Length × Width** in feet, or switch to **Total sq ft** mode
- Pick any product → instantly see:
  - Number of mats required
  - Total area covered (sq ft)
  - Cost at the product's default rate
  - Whether current stock is enough to cover the job
- Leftover sq ft shown when the room doesn't divide evenly
- A mat with no dimensions set says so clearly instead of crashing

### 📐 Mat Dimensions on Products *(new)*
Products now store their real physical size.

- **Width (ft)** and **Length (ft)** fields added to the product form
- Used by the Area Calculator automatically
- Existing products work fine — dimensions default to "not set"

### 🎨 Per-Line Colour on Bills *(from v1.2)*
Each line on a bill now carries its own colour.

- One product card with multiple colour rows (Red, Green, etc.)
- Colour picker shows available stock per colour on sales — turns red at zero
- Per-colour oversell guard prevents selling more than you have
- Bill detail and PDF print colour per line (e.g. *Goat Mat · Red*)
- Stock tab groups by product → colour sub-rows beneath

### 🛡️ Stock Guards *(from v1.2)*
- Purchase and sale bills validated against live stock before saving
- Offline queued bills re-checked when connectivity returns

### 💳 Payments & Advances *(from v1.1)*
- Record UTR / cheque number against UPI and bank transfers
- Advance payments tracked separately — settle bills from an existing advance
- Advance refund support

### 🖨️ PDF Bills *(from v1.1)*
- Warranty and payment terms printed on customer bills
- Colour per line printed in the PDF

---

## 🗃️ Database Migrations Required

If upgrading an existing Supabase project, run these in the SQL Editor **in order**:

| File | What it does |
|------|-------------|
| `supabase/011_bill_terms.sql` | Adds warranty & terms to business profile |
| `supabase/013_line_colour.sql` | Moves colour from product to bill line |
| `supabase/014_mat_size.sql` | Adds `width_ft` / `length_ft` to products |

> All migrations are **safe to re-run** (idempotent).

---

## 📋 Package Versions

| Package | Version |
|---------|---------|
| Expo SDK | 57.0.13 |
| React Native | 0.86.2 |
| Expo Router | 57.0.13 |
| Supabase JS | 2.112.x |
| TanStack Query | 5.101.x |

---

## 🔗 Links
- [Expo Build](https://expo.dev/accounts/s7nkets-team/projects/GoatMat/builds/1c525365-3c89-4224-ab94-26c0ba99f2b3)
- [GitHub Repository](https://github.com/s7nket/GoatMat)
