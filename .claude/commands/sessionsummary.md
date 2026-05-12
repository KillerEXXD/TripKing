---
description: Session summary — what was built, deployed, and pushed for TripKing this session
---

You have the full conversation context — use it as the PRIMARY source. Git is supplementary (exact commit hashes).

## Steps

1. From your conversation memory, identify: what the user asked for, what was planned/designed, what was implemented (files, features), what was deployed (migrations applied, edge functions deployed), what was tested, and any issues hit & resolved.

2. Get commit hashes (TripKing is one repo; backend work usually lands on `main` via a throwaway worktree):

```bash
cd /c/Apps/TripKing && git log --oneline origin/main --since="6 hours ago" --no-merges
```

(If a feature/work branch was used — e.g. the other session's `feat/places-ui` / `feat/driver-kyc` — note it, but the canonical history is `origin/main`.)

3. Note uncommitted work / leftover worktrees: `git status --short` and `git worktree list`.

4. Present in this format (keep it under ~25 lines):

---

### Session Summary — TripKing

**What was done:** [1–2 sentences covering ALL session work — from your memory, not git.]

**Key actions:**
- [one bullet per significant thing — planned X, implemented Y, applied migration NNN, deployed edge fn Z, ran smokes, fixed W; include non-code work too — investigations, decisions]

**Commits pushed (origin/main):**
- `hash` message

**Deployed:** [migrations applied (NNN_…), edge functions redeployed, Supabase secrets set, or "nothing"]

**Smokes run:** [which `test-*.cjs`, pass/fail, or "none"]

**Uncommitted / loose worktrees:** [list, or "clean"]

**Context used:** ~X% *(70%+ if the conversation was compacted; 40–60% if long with full history; 15–30% short)*

---

Rules: conversation context is the source of truth (you were there); each commit is one line; if no commits, say "no changes"; no file lists / no deep breakdowns.
