# Group Expense Tracker

A small React + Vite app for four people to track shared expenses. Sign-in and
storage use Supabase, so everyone sees the same list on any device.

## What it does

- Sign in with one of the four group accounts
- Add and delete expenses, each split between any subset of the group
- Show total spending, each person's paid amount, share and balance
- Suggest who should pay whom to settle up
- Filter expenses by payer
- Update live when another member adds or deletes an expense
- Rename people (display names are saved on your own device only)

## Set up

### 1. Supabase

1. Create a Supabase project (or use the existing one).
2. In **Authentication → Users**, create the four accounts listed in
   [`src/lib/members.js`](src/lib/members.js) and give each a password.
3. Turn off public sign-ups in **Authentication → Sign In / Providers**, so only
   those four accounts can get in.
4. In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql).
   It creates the `group_expenses` table, its access rules and live updates.

### 2. Environment

Copy `.env.example` to `.env.local` and fill in the values from
**Project Settings → API** in Supabase:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

`.env.local` is ignored by git. The publishable key is safe to ship in the
browser; access is controlled by the rules in `supabase/schema.sql`.

### 3. Run

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Build to `dist/` |
| `npm run preview` | Serve the built app locally |
| `npm test` | Run the split and settlement unit tests |

## Project layout

- `src/App.jsx` – session handling and the tracker screen
- `src/LoginScreen.jsx` – sign-in form
- `src/lib/expenses.js` – reads and writes expenses in Supabase
- `src/lib/split.js` – share, balance and settlement maths (in whole paise)
- `src/lib/localData.js` – per-device display names and import of old browser-only data
- `src/lib/members.js` – the four group accounts
- `src/lib/people.js` – added people and the group fund
- `src/DatePicker.jsx` – in-page calendar for the date field
- `src/theme.css` – dark and gold theme with the background image
- `supabase/schema.sql` – database table and access rules

## Deploy to GitHub Pages

The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
tests, builds and publishes the app on every push to `main`.

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open **Settings → Secrets and variables → Actions → Variables** and add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` with the values from `.env.local`.
4. Push to `main`, or run the workflow from the **Actions** tab. The site appears at
   `https://<your-user>.github.io/<repo-name>/`.

`vite.config.js` uses a relative `base`, so the build works under any Pages path.

## Troubleshooting

On macOS, if `npm run build` fails with "Cannot find native binding", the files
in `node_modules` may carry the quarantine flag. Clear it with:

```bash
xattr -dr com.apple.quarantine node_modules
```
