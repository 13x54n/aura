# Aura — operations phase 2 (Developer Portal & Admin)

**Status:** Documented, **not** in current build scope. Boards first.

## Shape

Two web apps over one API:

1. **Developer Portal** — orgs, submit versions, preflight, analytics (aggregate-first)  
2. **Admin Console** — review, approve/reject, suspend/remove, audit log  

## Principles

- Immutable release artifacts (hash change = new version)  
- State-machine workflow (no free-form status edits): `DRAFT → VALIDATING → READY → IN REVIEW → APPROVED → SCHEDULED → ROLLOUT → LIVE → SUSPENDED → REMOVED`  
- Org-scoped RBAC for studios; separate workforce IdP for admins; step-up for suspend/remove  
- Evidence-linked decisions  
- Least privilege; reversible suspension before hard delete  
- No raw cross-game player IDs to developers  

## Near-term bridge

`games/*/manifest.json` stubs are the hook. Do not build portal UI until Free Play for all three titles is solid.

When portal lands, **icon/cover ship inside each version manifest** so the store never invents art.
