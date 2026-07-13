import { EventEmitter } from '@angular/core';
import { Calendar } from '@fullcalendar/core';

export interface FullCalendarAccessibilityDeps {
  isSelectable: () => boolean;
  dateClick: EventEmitter<any>;
  eventClick: EventEmitter<any>;
}

/*
Fix: FullCalendar (v4 through at least v6) never declares its day-grid/timeline <table> markup as
data tables with associated headers, nor marks the purely positional ones as presentational, and
never makes day cells / events / resource rows keyboard-focusable or activatable at all. This
class patches the DOM after every render to fix both, and owns the keyboard interaction layer
(Tab/Arrow/Enter) that makes the calendar usable without a mouse.

Kept as a plain class (not an Angular service) instantiated once per FullCalendarComponent — a
page can have more than one calendar, and this has no state worth sharing across instances.
*/
export class FullCalendarAccessibility {
  private calendar: Calendar | null = null;
  private observer?: MutationObserver;
  private patchScheduled = false;
  private keydownListener?: (ev: KeyboardEvent) => void;
  private focusInListener?: (ev: FocusEvent) => void;
  private focusOutListener?: (ev: FocusEvent) => void;
  private resourceHighlightEl?: HTMLElement;

  constructor(private root: HTMLElement, private deps: FullCalendarAccessibilityDeps) {}

  // Called once the Calendar instance exists and has rendered for the first time.
  attach(calendar: Calendar) {
    this.calendar = calendar;
    this.patch();

    // Primary trigger: the component wires datesRender/viewSkeletonRender to call schedulePatch()
    // (cheaper and more targeted than scanning on every DOM mutation, since those fire exactly
    // when FullCalendar (re)builds the header/body table skeleton).
    //
    // Fallback: a MutationObserver, in case some rebuild path doesn't go through those hooks. Its
    // callback only re-patches when an added node actually looks like calendar table markup,
    // instead of unconditionally rescanning the whole tree on any mutation. Attribute writes done
    // by patch() don't trigger childList mutations, so this cannot loop on itself.
    //
    // .fc-event/.fc-list-item are included separately from table/th: events are fetched
    // asynchronously and rendered into cells/rows that already exist in the skeleton
    // (renderFgEvents/renderSegs), so their insertion is a childList mutation whose added node is
    // a plain <a>/<div>/<tr>, matching neither "table" nor "th" — and it does NOT re-fire
    // datesRender/viewSkeletonRender (those only fire on a view/date-range change, not on an event
    // data refresh). Without this, newly-loaded events would never become keyboard-focusable.
    //
    // tr[data-resource-id] is the same story for resource-timeline: ResourceTimelineView builds
    // its <table><tbody> skeleton once up front, then inserts each resource's <tr> into that
    // already-existing tbody as resource data arrives asynchronously — a childList mutation whose
    // added node is a bare <tr>, matching none of the above either.
    //
    // .fc-scroller style attribute changes are watched too: FullCalendar sizes each scroller's
    // height via inline style in its own async layout pass, in at least two steps (confirmed by
    // tracing: an initial estimate right after resource rows are inserted, then a final settled
    // height once resource data fully loads). patch()'s scrollable-region-focusable sweep (see
    // below) reads scrollHeight/clientHeight to decide whether a scroller needs tabindex="0" —
    // without watching this, a patch triggered by the row insertion above can run before the
    // final height lands, permanently miss the container's real overflow state (it only re-runs
    // on further table/th/event/resource-row insertions, none of which recur afterwards), and
    // leave a genuinely scrollable resource-area column unreachable by keyboard.
    this.observer = new MutationObserver((mutations) => {
      const hasRelevantMarkup = mutations.some((mutation) => {
        if (mutation.type === 'attributes') {
          return (mutation.target as Element).classList?.contains('fc-scroller');
        }
        return Array.from(mutation.addedNodes).some((node) =>
          node instanceof Element && (
            node.matches('table, th, .fc-event, .fc-list-item, tr[data-resource-id]') ||
            !!node.querySelector('table, th, .fc-event, .fc-list-item, tr[data-resource-id]')
          )
        );
      });
      if (hasRelevantMarkup) this.schedulePatch();
    });
    this.observer.observe(this.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

    this.keydownListener = (ev: KeyboardEvent) => this.handleKeydown(ev);
    this.root.addEventListener('keydown', this.keydownListener);

    // A time-column's/resource-row's focus ring alone only shows WHICH DAY (or resource) is
    // focused, not which time slot / date the arrow-key cursor is on within it (the aria-label
    // updates, but that's silent for sighted users). Highlighting the current slot's shared row,
    // or a decorative overlay over the currently-selected day column, gives that a visible home —
    // appearing only while the cell has focus and clearing the moment focus leaves it.
    this.focusInListener = (ev: FocusEvent) => {
      const target = ev.target as HTMLElement;
      const kind = target.dataset && target.dataset['tfA11yKind'];
      if (kind === 'time-column') this.highlightTimeColumnSlot(target);
      else if (kind === 'resource-row') {
        // Tab landing on a row is a real DOM focus change, so the browser already scrolls the
        // row itself into view vertically — but the row's stored day-index cursor (see
        // moveResourceRowDayIndex) is virtual, not a focus target, so nothing scrolls the
        // .fc-scroller horizontally to follow it. Without this, tabbing into a row whose cursor
        // sits outside the current horizontal scroll position leaves the highlighted cell
        // offscreen until an arrow key is pressed.
        //
        // Scroll BEFORE positioning the highlight: updateResourceRowHighlight reads the column's
        // current getBoundingClientRect(), so calling it first would capture the pre-scroll
        // position and leave the overlay exactly one scroll-step off from the real column
        // (confirmed empirically: a 70px offset, matching one day-column's width).
        this.scrollResourceRowCursorIntoView(target);
        this.updateResourceRowHighlight(target);
      }
    };
    this.focusOutListener = (ev: FocusEvent) => {
      const target = ev.target as HTMLElement;
      const kind = target.dataset && target.dataset['tfA11yKind'];
      if (kind === 'time-column') this.clearTimeColumnSlotHighlight();
      else if (kind === 'resource-row') this.hideResourceRowHighlight();
    };
    this.root.addEventListener('focusin', this.focusInListener);
    this.root.addEventListener('focusout', this.focusOutListener);
  }

  schedulePatch() {
    if (this.patchScheduled) return;
    this.patchScheduled = true;
    queueMicrotask(() => {
      this.patchScheduled = false;
      this.patch();
    });
  }

  destroy() {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.keydownListener) {
      this.root.removeEventListener('keydown', this.keydownListener);
      this.keydownListener = undefined;
    }
    if (this.focusInListener) {
      this.root.removeEventListener('focusin', this.focusInListener);
      this.focusInListener = undefined;
    }
    if (this.focusOutListener) {
      this.root.removeEventListener('focusout', this.focusOutListener);
      this.focusOutListener = undefined;
    }
    if (this.resourceHighlightEl) {
      this.resourceHighlightEl.remove();
      this.resourceHighlightEl = undefined;
    }
    this.calendar = null;
  }

  /*
  Two independent tables are involved for scope/role: the header row (<th>, e.g. fc-day-header in
  dayGrid, unclassed in resource-timeline) and the per-week/day/resource body grids (<table> with
  <td> cells only, no <th> at all). Neither carries scope/role, so this patches both after every
  render. All observed <th> are column headers (no scope="row" case found across dayGrid/timeGrid/
  resource-timeline views), hence the unqualified selector below.
  */
  private patch() {
    const root = this.root;
    root.querySelectorAll('th:not([scope])').forEach((th) => th.setAttribute('scope', 'col'));
    root.querySelectorAll('table:not([role])').forEach((table) => {
      if (!table.querySelector('th')) {
        table.setAttribute('role', 'presentation');
      }
    });

    // th.fc-axis is TimeGrid's own empty corner cell, sitting above the hour-label column in
    // week/day view — genuinely decorative (it labels no column of its own), but still a real
    // <th> given scope="col" by the generic rule just above, so it reads as an unnamed column
    // header (axe: empty-table-header). That rule specifically requires visible TEXT — unlike
    // most axe rules, it has no aria-label/aria-labelledby fallback (confirmed in axe-core's own
    // rule definition: `any: ['has-visible-text']`, no alternates) — so labelling it instead of
    // declaring it non-header content wouldn't satisfy it. role="presentation" is the accurate
    // fix: it removes the cell from being interpreted as a header at all, matching what it is.
    root.querySelectorAll<HTMLElement>('th.fc-axis:not([role])').forEach((th) => {
      th.setAttribute('role', 'presentation');
    });

    // Some FullCalendar-generated wrapper divs (.fc-scroller) scroll their content but have no
    // focusable descendant of their own — e.g. resource-timeline's resource-area (name/portrait
    // column) scroller, or a header-row scroller with no interactive cells — making them
    // unreachable by keyboard entirely (axe: scrollable-region-focusable). A plain tabindex="0"
    // on the scroller itself is the standard fix; skipped whenever the scroller already contains
    // a focusable element (e.g. resource-row, event) to avoid a redundant, do-nothing tab stop.
    root.querySelectorAll<HTMLElement>('.fc-scroller:not([tabindex])').forEach((scroller) => {
      const isScrollable = scroller.scrollWidth > scroller.clientWidth + 1 || scroller.scrollHeight > scroller.clientHeight + 1;
      if (!isScrollable) return;
      const hasFocusableContent = !!scroller.querySelector('[tabindex]:not([tabindex="-1"]), button, a[href], input, select, textarea');
      if (!hasFocusableContent) {
        scroller.setAttribute('tabindex', '0');
      }
    });

    // Events first: date cells below need to know which events they contain before deciding
    // whether they're worth being a tab stop.
    //
    // eventClick's click delegation matches component.fgSegSelector, which most views default to
    // '.fc-event-container > *' (i.e. .fc-event) — but ListView overrides it to '.fc-list-item'
    // (verified in @fullcalendar/list): the list view's clickable unit is the whole row, and its
    // small colored dot carries .fc-event/.fc-event-dot purely for styling, not as the click
    // target. Both selectors need marking so every view's real event-click target is covered.
    //
    // Daygrid-style events (month view, and the all-day strip in week/day views) are visually
    // overlaid on top of their date cell, but live in a SEPARATE table from that cell's own
    // background table — so as plain flat tab stops they'd land far away from their date cell in
    // Tab order (confirmed manually: dozens of Tab presses past every other date cell before
    // reaching one). Instead they get tabindex=-1 (reachable only via ArrowDown from their owning
    // date cell, see handleKeydown) so they never appear in the ambient Tab order at all.
    // TimeGrid's own timed events (real appointments, already at a precise, unambiguous position),
    // resource-timeline's own events (verified: ResourceRow renders its own TimelineLane INTO
    // that resource's own <tr> — real DOM descendants of the resource row, not a separate table,
    // so Tab already reaches them right after their row), and list-view rows (already a flat,
    // correctly-ordered list) don't have this problem and stay as ordinary tabindex=0 stops.
    const canEventClick = this.deps.eventClick.observed;
    if (canEventClick) {
      root.querySelectorAll<HTMLElement>('.fc-event:not([data-tf-a11y-kind]), .fc-list-item:not([data-tf-a11y-kind])').forEach((event) => {
        const isDaygridStyleEvent = event.matches('.fc-event') && !event.closest('.fc-time-grid') && !event.closest('.fc-time-area');
        event.setAttribute('tabindex', isDaygridStyleEvent ? '-1' : '0');
        event.setAttribute('role', 'button');
        event.setAttribute('data-tf-a11y-kind', 'event');
      });
    }

    // Day cells drive dateClick/selectable through FullCalendar's own PUBLIC select() API
    // (Calendar.prototype.select, explicitly marked "// public method" in @fullcalendar/core) —
    // it dispatches the exact same 'select' output a real drag-select would, so there's no
    // dependency on the interaction plugin's internal, undocumented hit-testing at all.
    //
    // TimeGrid (week/day views) reuses daygrid's DayBgRow to render its own .fc-day background
    // column, one per day, spanning every hour (verified: TimeGrid._renderColumns / colEls) — a
    // single date alone doesn't carry a time there, so it gets the arrow-key time-slot-picking
    // treatment (markTimeColumn) instead of the plain day treatment (markDateCell).
    //
    // resource-timeline's own shared day-background column is excluded here too (.closest
    // ('.fc-slats') — verified: unlike TimeGrid, where .fc-bg/.fc-slats are siblings, resource-
    // timeline nests its .fc-day cells INSIDE .fc-slats). It's handled entirely via the
    // resource-row block below instead, since a single point in that column can't identify which
    // resource it belongs to (it's shared by every row) the way TimeGrid's column can (there's
    // only ever one implicit "resource" — the view itself).
    //
    // A cell with neither a dateClick/selectable action NOR any event to reach would be a tab
    // stop that does nothing, so it's skipped entirely.
    const canDateClick = this.deps.isSelectable() || this.deps.dateClick.observed;
    root.querySelectorAll<HTMLElement>('.fc-day[data-date]:not([data-tf-a11y-kind])').forEach((cell) => {
      if (cell.closest('.fc-time-grid')) {
        if (canDateClick) this.markTimeColumn(cell);
        return;
      }
      if (cell.closest('.fc-slats')) {
        return;
      }
      const events = canEventClick ? this.getDayCellEvents(cell) : [];
      if (!canDateClick && events.length === 0) return;
      this.markDateCell(cell, events, canDateClick);
    });

    // resource-timeline: the shared day-background column above can't represent "this date for
    // this resource" (queryHit resolves the resource purely from the click's Y position within
    // that column, shared by every row), but ResourceTimelineView gives each resource its own
    // single-row-height <tr data-resource-id> in the time area (event lane) — a safe per-resource
    // anchor. Arrow Left/Right move a per-row "current date" cursor across the visible day
    // columns; Enter/Space calls calendar.select({start, end, resourceId}) — resourceId isn't one
    // of core's recognized STANDARD_PROPS, so it passes straight through into the dateSpan as a
    // "leftover" prop (verified in parseOpenDateSpan/refineProps), and @fullcalendar/resource-
    // common's registered dateSpanTransforms then resolve it into the real resource object on the
    // emitted 'select' event — no coordinate math needed to identify the resource at all.
    if (canDateClick) {
      root.querySelectorAll<HTMLElement>('.fc-time-area .fc-rows tr[data-resource-id]:not([data-tf-a11y-kind])').forEach((row) => {
        row.setAttribute('tabindex', '0');
        // role="group", not "button": this row can itself contain real interactive events (see
        // the .fc-event tabindex=0 treatment above) — a button role forbids focusable
        // descendants (axe: "nested-interactive"), which a resource row with a booked event
        // would otherwise violate. Our own Enter/Arrow handling reads data-tf-a11y-kind, not the
        // ARIA role, so this has no functional effect.
        row.setAttribute('role', 'group');
        row.setAttribute('data-tf-a11y-kind', 'resource-row');
        row.setAttribute('data-tf-a11y-day-index', '0');
        this.updateResourceRowAriaLabel(row);
      });
    }
  }

  private markDateCell(cell: HTMLElement, events: HTMLElement[], hasOwnAction: boolean) {
    const dateStr = cell.getAttribute('data-date');
    const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(this.parseCalendarDateAttr(dateStr));
    cell.setAttribute('tabindex', '0');
    if (hasOwnAction) {
      // Enter/Space selects the whole day (see activateDateCell) — a real, direct action.
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', dateLabel);
    } else {
      // No dateClick/selectable bound: this cell exists only as an entry point into its own
      // events — ArrowDown reaches the first one (see handleKeydown).
      cell.setAttribute('role', 'group');
      cell.setAttribute('aria-label', `${dateLabel}, ${events.length} event${events.length === 1 ? '' : 's'}`);
    }
    cell.setAttribute('data-tf-a11y-kind', 'date');
  }

  private markTimeColumn(cell: HTMLElement) {
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('role', 'button');
    cell.setAttribute('data-tf-a11y-kind', 'time-column');
    cell.setAttribute('data-tf-a11y-slot-index', '0');
    this.updateTimeColumnAriaLabel(cell);
  }

  // data-date is either a date-only ISO string ("2026-07-12", used by daygrid-style day cells and
  // by resource-timeline's own day columns at day/month/year zoom) or a full ISO datetime
  // ("2026-07-12T00:00:00", used by resource-timeline's .fc-major/.fc-minor slats at week/day
  // zoom). `new Date(str)` parses the date-only form as UTC midnight — which shifts to the
  // previous day once formatted in a negative-UTC-offset local timezone — but parses the datetime
  // form as local time per spec (no such bug). So only the date-only form needs manual parsing.
  private parseCalendarDateAttr(dateStr: string): Date {
    if (dateStr.includes('T')) return new Date(dateStr);
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  // Daygrid-style events (tabindex=-1, see patch()) are visually overlaid on their date cell but
  // live in a different table, so there's no DOM parent/child relationship to walk — geometric
  // containment (does the event's center point fall within the cell's rect) is the only reliable
  // way to find which date cell owns a given event, and vice versa.
  private getDayCellEvents(cell: HTMLElement): HTMLElement[] {
    const root = this.root;
    const cellRect = cell.getBoundingClientRect();
    return Array.from(root.querySelectorAll<HTMLElement>('[data-tf-a11y-kind="event"][tabindex="-1"]'))
      .filter((event) => this.rectContainsCenter(cellRect, event.getBoundingClientRect()))
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.top - rb.top || ra.left - rb.left;
      });
  }

  private getOwningDateCell(event: HTMLElement): HTMLElement | null {
    const root = this.root;
    const eventRect = event.getBoundingClientRect();
    const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-tf-a11y-kind="date"]'));
    return cells.find((cell) => this.rectContainsCenter(cell.getBoundingClientRect(), eventRect)) ?? null;
  }

  private rectContainsCenter(container: DOMRect, target: DOMRect): boolean {
    const cx = target.left + target.width / 2;
    const cy = target.top + target.height / 2;
    return cx >= container.left && cx <= container.right && cy >= container.top && cy <= container.bottom;
  }

  // The time-slot rows shared by every day column in the current timeGrid view (see
  // TimeGrid.renderSlatRowHtml — one <tr data-time="HH:mm:ss"> per slotDuration increment,
  // top-to-bottom already matching chronological order).
  private getTimeSlots(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>('.fc-slats tr[data-time]'));
  }

  private getTimeColumnSlotIndex(column: HTMLElement, slots: HTMLElement[]): number {
    const stored = Number(column.getAttribute('data-tf-a11y-slot-index')) || 0;
    return Math.min(stored, Math.max(slots.length - 1, 0));
  }

  private updateTimeColumnAriaLabel(column: HTMLElement) {
    const dateStr = column.getAttribute('data-date');
    const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(this.parseCalendarDateAttr(dateStr));
    const slots = this.getTimeSlots();
    const timeStr = slots[this.getTimeColumnSlotIndex(column, slots)]?.getAttribute('data-time');
    const timeLabel = timeStr ? this.formatTimeOfDay(timeStr) : '';
    column.setAttribute('aria-label', [dateLabel, timeLabel].filter(Boolean).join(', '));
  }

  private formatTimeOfDay(timeStr: string): string {
    const [hour, minute] = timeStr.split(':').map(Number);
    return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(2000, 0, 1, hour, minute));
  }

  private moveTimeColumnSlotIndex(column: HTMLElement, delta: number) {
    const slots = this.getTimeSlots();
    const maxIndex = Math.max(slots.length - 1, 0);
    const next = Math.min(Math.max(this.getTimeColumnSlotIndex(column, slots) + delta, 0), maxIndex);
    column.setAttribute('data-tf-a11y-slot-index', next?.toString() ?? '0');
    this.updateTimeColumnAriaLabel(column);
    this.highlightTimeColumnSlot(column);
  }

  // .fc-slats time rows are shared by every day column, so there's no way to visually mark "this
  // time, for this day" alone — but combined with the focused day-column's own focus ring, a
  // highlighted row reads as a crosshair: the row shows which time, the column's focus ring shows
  // which day. Only ever one column is focused at a time, so a shared highlight class is enough.
  private highlightTimeColumnSlot(column: HTMLElement) {
    this.clearTimeColumnSlotHighlight();
    const slots = this.getTimeSlots();
    slots[this.getTimeColumnSlotIndex(column, slots)]?.classList.add('tf-a11y-time-slot-cursor');
  }

  private clearTimeColumnSlotHighlight() {
    this.root.querySelectorAll('.tf-a11y-time-slot-cursor').forEach((el) => el.classList.remove('tf-a11y-time-slot-cursor'));
  }

  // Built entirely from the cell's own data-date + the selected slot's data-time — no
  // getBoundingClientRect(), no coordinate math, no dependency on the interaction plugin's
  // internal hit-testing. calendar.select(start, end) is FullCalendar's own public, documented
  // API and fires the exact same 'select' output a real drag-select would.
  private activateTimeColumn(column: HTMLElement) {
    const slots = this.getTimeSlots();
    const slot = slots[this.getTimeColumnSlotIndex(column, slots)];
    if (!slot) return;

    const dateStr = column.getAttribute('data-date');
    const timeStr = slot.getAttribute('data-time');
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute, second] = timeStr.split(':').map(Number);
    const start = new Date(year, month - 1, day, hour, minute, second);
    const end = new Date(start.getTime() + this.getSlotDurationMs(slots));
    this.calendar?.select(start, end);
  }

  // Infers the configured slotDuration from two adjacent slot rows rather than hardcoding a
  // default, so it stays correct whatever slotDuration the consumer configures.
  private getSlotDurationMs(slots: HTMLElement[]): number {
    const fallback = 30 * 60 * 1000;
    const t0 = slots[0]?.getAttribute('data-time');
    const t1 = slots[1]?.getAttribute('data-time');
    if (!t0 || !t1) return fallback;
    const toMs = (t: string) => {
      const [h, m, s] = t.split(':').map(Number);
      return ((h * 60 + m) * 60 + (s || 0)) * 1000;
    };
    const diff = toMs(t1) - toMs(t0);
    return diff > 0 ? diff : fallback;
  }

  private activateDateCell(cell: HTMLElement) {
    const dateStr = cell.getAttribute('data-date');
    this.calendar?.select(this.parseCalendarDateAttr(dateStr));
  }

  // The resource-timeline day columns visible in the current view, left-to-right (DOM order
  // already matches date order). .fc-day covers daygrid-style zoom (month/year); .fc-major/
  // .fc-minor cover genuine timeline-slat zoom (week/day) — both carry data-date, hence the
  // generic td[data-date] selector rather than a class-specific one.
  private getResourceTimelineDayColumns(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>('.fc-slats td[data-date]'));
  }

  private getResourceRowDayIndex(row: HTMLElement, dayColumns: HTMLElement[]): number {
    const stored = Number(row.getAttribute('data-tf-a11y-day-index')) || 0;
    return Math.min(stored, Math.max(dayColumns.length - 1, 0));
  }

  // The time-area row (ResourceRow's own <tr>) carries no visible text of its own — the
  // resource's name lives in the parallel spreadsheet row, matched by the same data-resource-id.
  // Prefer .fc-cell-text (FullCalendar's own plain-text resource label) over the row's full
  // textContent: HCM often renders a rich portrait widget in that cell (photo, job title, etc.)
  // whose text would otherwise bleed into the label.
  private updateResourceRowAriaLabel(row: HTMLElement) {
    const root = this.root;
    const resourceId = row.getAttribute('data-resource-id');
    const labelRow = resourceId ? root.querySelector(`.fc-resource-area tr[data-resource-id="${CSS.escape(resourceId)}"]`) : null;
    const resourceLabel = (labelRow?.querySelector('.fc-cell-text') ?? labelRow)?.textContent?.trim() ?? '';

    const dayColumns = this.getResourceTimelineDayColumns();
    const dateStr = dayColumns[this.getResourceRowDayIndex(row, dayColumns)]?.getAttribute('data-date');
    const dateLabel = dateStr
      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(this.parseCalendarDateAttr(dateStr))
      : '';

    row.setAttribute('aria-label', [resourceLabel, dateLabel].filter(Boolean).join(' — '));
  }

  private moveResourceRowDayIndex(row: HTMLElement, delta: number) {
    const dayColumns = this.getResourceTimelineDayColumns();
    const maxIndex = Math.max(dayColumns.length - 1, 0);
    const next = Math.min(Math.max(this.getResourceRowDayIndex(row, dayColumns) + delta, 0), maxIndex);
    row.setAttribute('data-tf-a11y-day-index', next?.toString() ?? '0');
    this.updateResourceRowAriaLabel(row);
    // The day-column cursor is purely virtual (an index stored on the row, not a real focus
    // target — the row itself keeps DOM focus), so nothing native ever scrolls the timeline's
    // horizontal .fc-scroller to follow it. Without this, the cursor walks off the edge of the
    // visible (clipped) area with no way back into view except undoing every keystroke.
    //
    // Scroll BEFORE positioning the highlight: updateResourceRowHighlight reads the column's
    // current getBoundingClientRect(), so calling it first would capture the pre-scroll position
    // and leave the overlay exactly one scroll-step off from the real column (confirmed
    // empirically: a 70px offset, matching one day-column's width).
    this.scrollResourceRowCursorIntoView(row);
    this.updateResourceRowHighlight(row);
  }

  // scrollIntoView on the day column itself is enough: it walks up to the nearest scrollable
  // ancestor (.fc-scroller, overflow:auto) and adjusts its scrollLeft — FullCalendar's own
  // ScrollJoiner then re-syncs the header's separate scroller to match (verified empirically:
  // both scrollers end up at the same scrollLeft shortly after). Shared by both arrow-key
  // movement (moveResourceRowDayIndex) and Tab landing on a different row (focusInListener),
  // since either way the row's stored cursor can be outside the current horizontal scroll
  // position.
  private scrollResourceRowCursorIntoView(row: HTMLElement) {
    const dayColumns = this.getResourceTimelineDayColumns();
    const column = dayColumns[this.getResourceRowDayIndex(row, dayColumns)];
    column?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  // Built entirely from the row's own data-resource-id + the selected column's data-date — no
  // getBoundingClientRect(), no coordinate math. calendar.select({start, end, resourceId}) is
  // FullCalendar's own public select() API; resourceId flows through to the emitted 'select'
  // event via @fullcalendar/resource-common's dateSpanTransforms (see patch()).
  private activateResourceRow(row: HTMLElement) {
    const dayColumns = this.getResourceTimelineDayColumns();
    const dayColumn = dayColumns[this.getResourceRowDayIndex(row, dayColumns)];
    if (!dayColumn) return;

    const resourceId = row.getAttribute('data-resource-id');
    const dateStr = dayColumn.getAttribute('data-date');
    const start = this.parseCalendarDateAttr(dateStr);
    const end = dateStr.includes('T')
      ? new Date(start.getTime() + this.getSlotDurationMs(this.getTimeSlots()))
      : undefined;

    this.calendar?.select(end ? { start, end, resourceId } : { start, resourceId });
  }

  // Purely decorative (unlike the click activation above, a slightly-off pixel here never breaks
  // anything functionally): .fc-slats rows are shared by every day column and the resource row
  // spans the full width, so neither element alone can highlight "this date, for this resource" —
  // a small overlay positioned at their intersection can. Reuses one lazily-created element rather
  // than creating/destroying a node on every keystroke.
  private ensureResourceHighlightEl(): HTMLElement {
    if (!this.resourceHighlightEl) {
      const el = document.createElement('div');
      el.className = 'tf-a11y-resource-cell-cursor';
      el.style.position = 'fixed';
      el.style.pointerEvents = 'none';
      el.style.display = 'none';
      el.style.zIndex = '1000';
      document.body.appendChild(el);
      this.resourceHighlightEl = el;
    }
    return this.resourceHighlightEl;
  }

  private updateResourceRowHighlight(row: HTMLElement) {
    const dayColumns = this.getResourceTimelineDayColumns();
    const column = dayColumns[this.getResourceRowDayIndex(row, dayColumns)];
    if (!column) {
      this.hideResourceRowHighlight();
      return;
    }
    const rowRect = row.getBoundingClientRect();
    const colRect = column.getBoundingClientRect();
    const el = this.ensureResourceHighlightEl();
    el.style.left = `${colRect.left}px`;
    el.style.top = `${rowRect.top}px`;
    el.style.width = `${colRect.width}px`;
    el.style.height = `${rowRect.height}px`;
    el.style.display = 'block';
  }

  private hideResourceRowHighlight() {
    if (this.resourceHighlightEl) {
      this.resourceHighlightEl.style.display = 'none';
    }
  }

  /*
  Events aren't natively keyboard-activatable, and carry no public API to trigger their click
  behavior directly. Replaying the plain 'click' event FullCalendar's own eventClick delegation
  already listens for reuses its existing logic without touching @fullcalendar/core. Date cells,
  time-columns and resource-rows instead call FullCalendar's own public calendar.select() (see
  activateDateCell/activateTimeColumn/activateResourceRow) — no synthetic mouse events at all.
  */
  private handleKeydown(ev: KeyboardEvent) {
    // Intentionally checks ev.target directly, NOT closest(): .fc-event can contain nested
    // interactive content (portrait/popover components with their own buttons/links). Walking up
    // to the nearest marked ancestor would hijack Enter/Space meant for that nested control and
    // replay a click on the outer event cell instead.
    const target = ev.target as HTMLElement;
    const kind = target.dataset['tfA11yKind'];
    if (!kind) return;

    // A date cell's daygrid-style events aren't separate Tab stops (see patch()) — ArrowDown
    // reaches the first one; ArrowLeft/Right then cycle between siblings and ArrowUp/Escape
    // return to the owning cell. Enter/Space only selects the day itself when the cell actually
    // has that action (role="button" — see markDateCell).
    if (kind === 'date') {
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        this.getDayCellEvents(target)[0]?.focus();
        return;
      }
      if ((ev.key === 'Enter' || ev.key === ' ') && target.getAttribute('role') === 'button') {
        ev.preventDefault();
        this.activateDateCell(target);
        return;
      }
      // ArrowUp has no defined action on a date cell (its own daygrid-style events, if any, are
      // reached via ArrowDown, not Up) — left unhandled, the browser's default action scrolls the
      // page instead of doing nothing, the same failure mode as the ArrowDown-with-no-event case
      // above (confirmed by reproduction: scrollTop moved from 0 to 40 on a plain ArrowDown before
      // this fix). Suppressing it keeps the page still.
      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
      }
      return;
    }

    if (kind === 'event') {
      if (target.tabIndex === -1) {
        if (ev.key === 'ArrowUp' || ev.key === 'Escape') {
          ev.preventDefault();
          this.getOwningDateCell(target)?.focus();
          return;
        }
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
          const cell = this.getOwningDateCell(target);
          if (cell) {
            const siblings = this.getDayCellEvents(cell);
            const next = siblings[siblings.indexOf(target) + (ev.key === 'ArrowRight' ? 1 : -1)];
            if (next) {
              ev.preventDefault();
              next.focus();
            }
          }
          return;
        }
      }
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return;
      }
      // ArrowDown has no further action here (a sub-nav event, tabindex=-1, is already the leaf
      // below its date cell; a flat tabindex=0 event — TimeGrid's own timed events, list-view
      // rows — never had Up/Down semantics at all) — left unhandled, the browser's default
      // action scrolls the nearest scrollable ancestor instead of doing nothing, confirmed by
      // reproduction (list view: scrollTop moved from 0 to 39 on a plain ArrowDown before this
      // fix). Suppressing it keeps the page still.
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault();
      }
      return;
    }

    // A time-column's shared background spans every hour of the day (see patch()) — ArrowUp/Down
    // cycle through the real time-slot rows before Enter/Space activates the currently-selected
    // one.
    if (kind === 'time-column') {
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        this.moveTimeColumnSlotIndex(target, ev.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        this.activateTimeColumn(target);
      }
      return;
    }

    // A resource-row spans every visible day column (see patch()) — ArrowLeft/Right cycle
    // through the real day columns before Enter/Space activates the currently-selected one for
    // that specific resource.
    if (kind === 'resource-row') {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        this.moveResourceRowDayIndex(target, ev.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        this.activateResourceRow(target);
        return;
      }
      // ArrowUp/Down have no defined meaning on a resource-row (day navigation is Left/Right
      // only) — left unhandled, the browser's default action is to scroll the nearest scrollable
      // ancestor (.fc-scroller) vertically, dragging the whole row along with it while the day
      // cursor's decorative overlay (positioned via a one-off getBoundingClientRect() snapshot,
      // see updateResourceRowHighlight) stays put, visibly separating from the row it belongs to.
      // Suppressing the default keeps the row — and the cursor overlaid on it — exactly in place.
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault();
      }
    }
  }
}
