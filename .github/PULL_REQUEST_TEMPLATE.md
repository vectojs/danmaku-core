<!-- Conventional Commit title, for example: feat(scheduler): add vertical lane packing -->

## What and why

<!-- Describe the engine problem and link the issue: Closes #123. -->

## Changes

-

## Public API and behavior compatibility

<!-- Describe exports, Scheduler/pool/track/preset semantics, and migration impact. -->

## Verification

- [ ] `bun run format:check`
- [ ] `bun run lint`
- [ ] `bun test`
- [ ] `bun run build`
- [ ] `npm pack --dry-run`

## Checklist

- [ ] Added a Changeset for a public package/API/behavior change.
- [ ] Updated `README.md` and `CHANGELOG.md` when behavior or responsibilities changed.
- [ ] Added deterministic tests for pool, scheduler, preset, or track semantics.
- [ ] Kept the package renderer-agnostic and independent from VectoJS, Canvas, DOM, and browser layers.
- [ ] Wrote documentation and non-obvious code comments in English.
