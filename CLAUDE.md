# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `web/`:

```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build → web/dist/
npm run typecheck    # TypeScript type check (no emit)
npm run preview      # Preview production build locally
```

There are no tests. CI runs `typecheck` then `build` before deploying to GitHub Pages.

## Architecture

The entire web app is a single-page React app in `web/src/` with no routing library.

### Dual-mode data layer (`web/src/services/`)

`firebase.ts` checks if all `VITE_FIREBASE_*` env vars are present. If not, `isFirebaseConfigured` is `false`.

`data.ts` exports every data-mutating function in a **dual-mode** pattern — every function has two branches:
- `if (!isFirebaseConfigured || !db)` → read/write `localStorage` via `readLocal()`/`writeLocal()`
- else → Firestore operations

This means the app works fully offline with demo seed data. When adding a new data function, always implement both branches.

### State management (`web/src/App.tsx`)

There is no state management library. `App` holds all state:
- `user` (current `AppUser`) — from `observeAuth`
- `data` (all `CoupleData`) — from `observeCoupleData`, a real-time listener keyed on `user.coupleId`

The `run(task)` helper wraps any async mutation: clears error, calls the task, refreshes local state if not using Firebase. Pass all mutations through `run`.

### Type system (`web/src/types.ts`)

All domain types live here. Key relationships:
- `AppUser.coupleId` links a user to a couple
- Everything else uses `coupleId` as a namespace (Firestore queries filter by `where('coupleId', '==', coupleId)`)
- `ChoreTask.selfReport = true` means the claimer self-reported (creatorId === claimerId); the *partner* is the reviewer, not the creator

### Rendering

All UI is in `App.tsx` as co-located function components. No file splitting. The active tab is tracked with a single `activeTab` string, conditionally rendering one panel at a time.

### Task approval logic

| Task type | Who approves |
|-----------|-------------|
| Regular task (`selfReport` absent/false) | `creatorId === user.id` |
| Self-report (`selfReport: true`) | `claimerId !== user.id` (the partner) |

### Notifications

Stored in component state (not persisted). `localStorage` key `wishlink-seen-{userId}-{coupleId}` tracks which item keys have been shown, preventing re-notification on remount. Notifications fire when `data.wishes` or `data.tasks` change and a new item belongs to the partner.

## Deployment

Push to `main` → GitHub Actions typecheck + build + deploy to GitHub Pages. Firebase env vars are stored as GitHub Secrets (`VITE_FIREBASE_*`). The `vite.config.ts` sets `base: './'` for relative asset paths on Pages.
