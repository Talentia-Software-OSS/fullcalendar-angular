# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@talentia/fullcalendar` is a **fork of the FullCalendar v4 Angular library**, pinned to
`@fullcalendar/core` 4.4.2 and Angular 20. It is essentially only consumed by Talentia's own HCM
application (the `tsb` and `tf-scheduler`/`tf-calendar` pages there) — treat that as the primary,
de facto consumer when judging the impact/priority of a change, even though the package is
published as a general-purpose library. There is only one Angular workspace project, the library
itself (`projects/fullcalendar`) — there is no demo app in `src/` despite what `CONTRIBUTORS.md`
says.

This fork exists for two reasons:

1. **Keep the Angular wrapper current** — the official `fullcalendar-angular` package lags behind
   on Angular version support, so this fork is upgraded independently (currently Angular 20) while
   staying on the FullCalendar v4 core the HCM app depends on.
2. **Add accessibility support** — keyboard navigation/activation is entirely absent from the
   official FullCalendar v4 Angular wrapper, and remains absent in later official versions too.
   `fullcalendar-accessibility.ts` (see below) is this fork's own addition, not something ported
   from upstream.

## Commands

```bash
npm run build          # clean:build + build:prod — production library build
npm run build:dev      # development build
npm run watch          # clean:build then watch:lib (rebuilds on save)
npm run watch:lib      # ng build --configuration development --watch (no clean first)
npm run lint           # ng lint (whole workspace)
npm run lint:lib-fix   # ng lint @talentia/fullcalendar --fix
npm run madge:lib      # circular-dependency check over the lib's TS sources
```

There is **no test framework** in this repo (no Jest/Karma/e2e config wired up) and no `test`
architect target in `angular.json`. Verification of behavior is manual — see the "Manual
verification" pattern below.

When iterating on the library while it's consumed elsewhere (e.g. the HCM app), keep
`npm run watch:lib` running and use `npm link` (see `CONTRIBUTORS.md`) to point the consumer at
this build.

## Architecture

Everything lives in `projects/fullcalendar/src/lib/`:

- **`fullcalendar.component.ts`** — `FullCalendarComponent`, the `<full-calendar>` wrapper.
  - Constructs the real `Calendar` (from `@fullcalendar/core`) once, in `ngAfterViewInit`.
  - `buildOptions()` assembles the options object passed to `new Calendar(...)` from two generated
    lists in `fullcalendar-options.ts`: `INPUT_NAMES` (mapped from `@Input()`s) and `OUTPUT_NAMES`
    (mapped to `EventEmitter.emit` callbacks). Outputs are wired first so inputs of the same name
    can override them.
  - Change detection to the live `Calendar` instance is intentionally *not* done via `ngOnChanges`
    alone: `ngDoCheck` (fires far more often, before `ngOnChanges`) diff-checks inputs listed in
    `INPUT_IS_DEEP` (`header`, `footer`, `events`, `eventSources`, `resources`) via `deepEqual`
    against a cached `deepCopy`, since Angular's default reference-equality change detection misses
    in-place mutations of these. Confirmed changes accumulate in `dirtyProps` and are flushed to
    `calendar.mutateOptions(...)` in `ngAfterContentChecked` (not `ngOnChanges`), which runs after
    both `ngDoCheck` and `ngOnChanges` in the same cycle.
  - `@Input()`/`@Output()` names are meant to mirror the FullCalendar v4 options/callbacks
    one-for-one (see the `TODO` comment in the component: ideally regenerated per core version
    bump, currently maintained by hand).

- **`fullcalendar-options.ts`** — the `INPUT_NAMES` / `OUTPUT_NAMES` / `INPUT_IS_DEEP` arrays
  described above. **The public docs point at this file as the index of supported options** — if
  it moves, update the docs link.

- **`fullcalendar-accessibility.ts`** — `FullCalendarAccessibility`, a plain class (not an Angular
  service; a page can host more than one calendar and each instance is independent) owning all
  keyboard-accessibility behavior layered on top of FullCalendar v4, which upstream never makes
  keyboard-navigable. One instance per `FullCalendarComponent`, created in `ngAfterViewInit` and
  `attach()`ed right after the first `calendar.render()`. Responsibilities:
  - Adds `scope`/`role` to header/body `<table>` markup FullCalendar never declares itself.
  - Re-patches the DOM after every render: primarily via `datesRender`/`viewSkeletonRender` hooks
    wired in the component (cheapest, most targeted trigger), with a `MutationObserver` fallback
    for markup that appears without refiring those two events (async event data, resource rows).
  - Marks day cells / events / resource-timeline rows as tab stops **only when activating them
    would do something** (`selectable`/`dateClick.observed`/`eventClick.observed`) — never
    unconditionally.
  - Activation prefers FullCalendar's own public APIs over synthetic events: day cells, time
    columns and resource rows call `calendar.select(...)`; events (which have no public activation
    API) get a replayed native `click`.
  - This file is dense with comments explaining *why* — non-obvious FullCalendar v4 internals
    (verified by reading `node_modules/@fullcalendar/{core,daygrid,timegrid,interaction}` source)
    that justify each DOM-patch decision. Read them before changing this file; don't strip them.
  - Design background and out-of-scope decisions for this subsystem are recorded in
    `docs/superpowers/specs/2026-07-12-keyboard-accessible-action-cells-design.md` and the paired
    plan in `docs/superpowers/plans/`.

- **`utils.ts`** — `deepCopy`, a minimal clone (arrays/plain objects/Dates only) used by the deep
  change-detection path above. Deliberately not a third-party dependency.

- **`fullcalendar.module.ts`** / **`public-api.ts`** — `FullCalendarModule` (non-standalone,
  declares/exports `FullCalendarComponent`) and the package's public export surface.

## Working in this codebase

- This is a DOM-patch/wrapper library, not a fork of `@fullcalendar/core` itself — behavior changes
  should replay FullCalendar's existing public APIs or native events rather than modifying
  `node_modules/@fullcalendar/*` or depending on its private/internal classes.
- Any new option added to FullCalendar's actual API surface needs a matching `@Input()`/`@Output()`
  in `fullcalendar.component.ts` **and** an entry in `INPUT_NAMES`/`OUTPUT_NAMES` (and
  `INPUT_IS_DEEP` if it's a plain object/array a consumer might mutate in place) in
  `fullcalendar-options.ts` — adding one without the other silently drops the value.
- Since there's no automated test suite, manually verify accessibility/interaction changes against
  a real running consumer (keyboard-only navigation: Tab reaches the right elements, Enter/Space/
  Arrow keys behave as documented in `fullcalendar-accessibility.ts`'s comments) rather than
  asserting success from a successful build alone.
