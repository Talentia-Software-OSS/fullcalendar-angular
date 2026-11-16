import { Component } from '@angular/core';
import { FullCalendarModule } from '@talentia/fullcalendar';
import { EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

interface LogEntry {
  id: number;
  text: string;
}

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  imports: [FullCalendarModule]
})
export class AppComponent {
  title = 'Talentia FullCalendar';
  plugins = [dayGridPlugin, timeGridPlugin, interactionPlugin];
  header = { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' };
  defaultDate = new Date();
  weekends = true;
  showCalendar = true;
  events: EventInput[] = [
    { title: 'Team meeting', start: this.dayOffset(0, 9), end: this.dayOffset(0, 10) },
    { title: 'Review', start: this.dayOffset(2, 14), end: this.dayOffset(2, 15, 30) },
    { title: 'Training', start: this.dayOffset(4), allDay: true },
    { title: 'Holiday', start: this.dayOffset(8), end: this.dayOffset(10), allDay: true }
  ];
  /** Updated from (datesRender): shown in the template (see the NG0100 note in app.component.html). */
  currentRange = '';
  datesRenderCount = 0;
  log: LogEntry[] = [];
  private logId = 0;
  private addedCount = 0;

  onDatesRender(arg: { view: { title: string } }): void {
    this.currentRange = arg.view.title;
    this.datesRenderCount++;
  }

  onDateClick(arg: { dateStr: string }): void {
    this.addLog(`dateClick: ${arg.dateStr}`);
  }

  onSelect(arg: { startStr: string; endStr: string }): void {
    this.addLog(`select: ${arg.startStr} → ${arg.endStr}`);
  }

  onEventClick(arg: { event: { title: string } }): void {
    this.addLog(`eventClick: ${arg.event.title}`);
  }

  onReadOnlyEventClick(arg: { event: { title: string } }): void {
    this.addLog(`eventClick (read-only calendar): ${arg.event.title}`);
  }

  /** In-place mutation of [events]: picked up thanks to [deepChangeDetection]="true". */
  addEvent(): void {
    this.addedCount++;
    this.events.push({ title: `Added #${this.addedCount}`, start: this.dayOffset(1 + this.addedCount), allDay: true });
    this.addLog(`events.push → Added #${this.addedCount}`);
  }

  clearLog(): void {
    this.log = [];
  }

  private addLog(text: string): void {
    this.log = [{ id: ++this.logId, text }, ...this.log].slice(0, 15);
  }

  private dayOffset(days: number, hours?: number, minutes = 0): Date {
    const d = new Date();
    d.setHours(hours ?? 0, hours === undefined ? 0 : minutes, 0, 0);
    d.setDate(d.getDate() + days);
    return d;
  }
}
