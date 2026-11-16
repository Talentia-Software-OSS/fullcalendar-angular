
# @talentia/fullcalendar

A FullCalendar component for Angular, based on FullCalendar v4 (`@fullcalendar/core` 4.4.x), with keyboard accessibility support.

## Compatibility

| @talentia/fullcalendar | Angular |
| ---------------------- | ------- |
| 4.4.18                 | 21.x    |
| 4.4.14 - 4.4.17        | 20.x    |
| 4.4.12 - 4.4.13        | 19.x    |
| 4.4.10 - 4.4.11        | 18.x    |
| 4.4.9                  | 17.x    |
| 4.4.7 - 4.4.8          | 16.x    |
| 4.4.6                  | 15.x    |

## Install

Install the library and its peer dependencies (`@fullcalendar/core` 4.4.x and `fast-deep-equal` 3.1.x), plus the FullCalendar v4 plugins you need:

```bash
npm install @talentia/fullcalendar @fullcalendar/core@~4.4.2 fast-deep-equal@~3.1.3
npm install @fullcalendar/daygrid@~4.4.2 @fullcalendar/interaction@~4.4.2
```

## Usage

Import `FullCalendarModule` in your `NgModule` (or in the `imports` of a standalone component):

```ts
import { NgModule } from '@angular/core';
import { FullCalendarModule } from '@talentia/fullcalendar';

@NgModule({
  imports: [FullCalendarModule],
  declarations: [MyComponent]
})
export class MyModule { }
```

```ts
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

export class MyComponent {
  calendarPlugins = [dayGridPlugin, interactionPlugin];
  events = [{ title: 'Meeting', start: '2026-11-10' }];

  onDateClick(arg) { /* ... */ }
}
```

```html
<full-calendar
  defaultView="dayGridMonth"
  [plugins]="calendarPlugins"
  [events]="events"
  (dateClick)="onDateClick($event)">
</full-calendar>
```

The component inputs and outputs mirror the FullCalendar v4 options and callbacks one-for-one: the list of supported names is in
[`fullcalendar-options.ts`](projects/fullcalendar/src/lib/fullcalendar-options.ts). See the
[FullCalendar v4 docs](https://fullcalendar.io/docs/v4) for their meaning.

Changes made in place to `header`, `footer`, `events`, `eventSources` and `resources` are detected with a deep comparison
(`ngDoCheck`) and applied to the live calendar. The library is tested with zone.js-based change detection: since Angular 21
new applications are zoneless by default, add `provideZoneChangeDetection()` to the providers of `bootstrapApplication`
(or of your app configuration).

The notification callbacks `datesRender`, `datesDestroy`, `viewSkeletonRender`, `viewSkeletonDestroy` and `loading`,
when fired by a render started from an Angular lifecycle hook (first render, input changes, destroy), are emitted in a
microtask: handlers can safely update template-bound state without `ExpressionChangedAfterItHasBeenCheckedError` (NG0100).
All the other callbacks (e.g. `eventRender`, `dayRender`) are emitted synchronously.

## Accessibility

Unlike the official FullCalendar v4 Angular component, this fork makes the calendar keyboard-navigable: day cells, time slots,
resource rows and events become tab stops only when activating them does something (`selectable`, `(dateClick)`,
`(eventClick)`), and are activated with Enter/Space. The details are documented in
[`fullcalendar-accessibility.ts`](projects/fullcalendar/src/lib/fullcalendar-accessibility.ts).

## Build

Run `npm run build` to build the library. The build artifacts will be stored in the `dist/fullcalendar` directory.
Run `npm run watch` to build the library in watch mode, `npm run lint` to lint it.
Run `npm run start` to build the library and serve the demo app (`projects/demo`) on [localhost:4200](http://localhost:4200).
To test the library in a consumer app, see the [Contributor Guide](CONTRIBUTORS.md) for `npm link`.

This project currently uses [Angular CLI](https://github.com/angular/angular-cli) version 21.2.25.

## Reference

This project is forked from [fullcalendar/fullcalendar-angular](https://github.com/fullcalendar/fullcalendar-angular)
(v4 branch), originally built by [irustm](https://github.com/irustm) in partnership with the maintainers of FullCalendar
(formerly `ng-fullcalendar`).
