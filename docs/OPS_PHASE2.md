# Aura — operations phase 2 (Developer Portal & Admin)

**Status:** Documented, **not** in current build scope. Boards first.

## Shape

Two web apps over one API:

1. **Developer Portal** — orgs, submit versions, preflight, analytics (aggregate-first)  
2. **Admin Console** — review, approve/reject, suspend/remove, audit log  

## Principles

- Immutable release artifacts (hash change = new version)  
- State-machine workflow (no free-form status edits)  
- Evidence-linked decisions  
- Least privilege; reversible suspension before hard delete  
- No raw cross-game player IDs to developers  

## Near-term bridge

`games/*/manifest.json` stubs are the hook. Do not build portal UI until Free Play for all three titles is solid.
