import deepEqual from 'fast-deep-equal';
import { Component, ElementRef, SimpleChanges, AfterViewInit, DoCheck, OnChanges, AfterContentChecked, OnDestroy, input, output, inject } from '@angular/core';
import { Calendar, BusinessHoursInput, ConstraintInput, EventApi, PluginDef } from '@fullcalendar/core';
import { INPUT_NAMES, INPUT_IS_DEEP, OUTPUT_NAMES } from './fullcalendar-options';
import { deepCopy } from './utils';

type DateInput = any;
type DurationInput = any;
type FormatterInput = any;
type DateRangeInput = any;
type RawLocale = any;
type LocaleSingularArg = any;
type OverlapFunc = any;
type AllowFunc = any;
type CustomButtonInput = any;
type ButtonIconsInput = any;
type CellInfo = any;
type ButtonTextCompoundInput = any;
type ToolbarInput = any;
type ViewOptionsInput = any;
type EventSourceInput = any;
type EventInputTransformer = any;
type EventSourceErrorResponseHandler = any;
type EventSourceSuccessResponseHandler = any;

@Component({
  standalone: false,
  selector: 'full-calendar',
  template: ''
})
export class FullCalendarComponent implements AfterViewInit, DoCheck, OnChanges, AfterContentChecked, OnDestroy {
  private element = inject(ElementRef);


  readonly deepChangeDetection = input<boolean>();

  private calendar: Calendar;
  private dirtyProps: any = {};
  private deepCopies: any = {};

  ngAfterViewInit() {
    this.calendar = new Calendar(this.element.nativeElement, this.buildOptions());
    this.calendar.render();
  }

  private buildOptions() {
    const options = {};

    OUTPUT_NAMES.forEach(outputName => {
      options[outputName] = (...args) => {
        this[outputName].emit(...args);
      };
    });

    // do after outputs, so that inputs with same name override
    INPUT_NAMES.forEach(inputName => {
      let inputVal = this[inputName];

      if (inputVal !== undefined) { // unfortunately FC chokes when some props are set to undefined

        if (this.deepChangeDetection() && INPUT_IS_DEEP[inputName]) {
          inputVal = deepCopy(inputVal);
          this.deepCopies[inputName] = inputVal; // side effect!
        }

        options[inputName] = inputVal;
      }
    });

    return options;
  }

  /*
  called before ngOnChanges, allows us to manually detect input changes.
  called much more often than ngOnChanges.
  */
  ngDoCheck() {
    if (this.calendar && this.deepChangeDetection()) { // not the initial render AND we do deep-mutation checks
      const { deepCopies } = this;

      for (const inputName in INPUT_IS_DEEP) {
        // eslint-disable-next-line no-prototype-builtins
        if (INPUT_IS_DEEP.hasOwnProperty(inputName)) {
          const inputVal = this[inputName];

          if (inputVal !== undefined) { // unfortunately FC chokes when some props are set to undefined
            if (!deepEqual(inputVal, deepCopies[inputName])) {
              const copy = deepCopy(inputVal);
              deepCopies[inputName] = copy;
              this.dirtyProps[inputName] = copy;
            }
          }
        }
      }
    }
  }

  /*
  called with confirmed changes to input references
  */
  ngOnChanges(changes: SimpleChanges) {
    if (this.calendar) { // not the initial render

      for (const inputName in changes) {
        // eslint-disable-next-line no-prototype-builtins
        if (changes.hasOwnProperty(inputName)) {
          if (this.deepCopies[inputName] === undefined) { // not already handled in ngDoCheck
            this.dirtyProps[inputName] = changes[inputName].currentValue;
          }
        }
      }
    }
  }

  ngAfterContentChecked() {
    const { dirtyProps } = this; // hold on to reference before clearing

    if (Object.keys(dirtyProps).length > 0) {
      this.dirtyProps = {}; // clear first, in case the rerender causes new dirtiness
      this.calendar.mutateOptions(dirtyProps, [], false, deepEqual);
    }
  }

  ngOnDestroy() {
    if (this.calendar) {
      this.calendar.destroy();
    }
    this.calendar = null;
  }

  public getApi(): Calendar {
    return this.calendar;
  }

  /*
  TODO: the following Inputs/Outputs should be automatically rewritten for each version bump
  of the core project. A script will be written to overwrite the actualy source code here.
  It is usually good to put a class's property declarations BEFORE the methods, but in this case,
  since the properties will be programmatically generated, better to put them after.
  */

  readonly header = input<boolean | ToolbarInput>();
  readonly footer = input<boolean | ToolbarInput>();
  readonly customButtons = input<{ [name: string]: CustomButtonInput }>();
  readonly buttonIcons = input<boolean | ButtonIconsInput>();
  readonly themeSystem = input<'standard' | string>();
  readonly bootstrapFontAwesome = input<boolean | ButtonIconsInput>();
  readonly firstDay = input<number>();
  readonly dir = input<'ltr' | 'rtl' | 'auto'>();
  readonly weekends = input<boolean>();
  readonly hiddenDays = input<number[]>();
  readonly fixedWeekCount = input<boolean>();
  readonly weekNumbers = input<boolean>();
  readonly weekNumbersWithinDays = input<boolean>();
  readonly weekNumberCalculation = input<'local' | 'ISO' | ((m: Date) => number)>();
  readonly businessHours = input<BusinessHoursInput>();
  readonly showNonCurrentDates = input<boolean>();
  readonly height = input<number | 'auto' | 'parent' | (() => number)>();
  readonly contentHeight = input<number | 'auto' | (() => number)>();
  readonly aspectRatio = input<number>();
  readonly handleWindowResize = input<boolean>();
  readonly windowResizeDelay = input<number>();
  readonly eventLimit = input<boolean | number>();
  readonly eventLimitClick = input<'popover' | 'week' | 'day' | string | ((cellinfo: CellInfo, jsevent: Event) => void)>();
  readonly timeZone = input<string | boolean>();
  readonly now = input<DateInput | (() => DateInput)>();
  readonly defaultView = input<string>();
  readonly allDaySlot = input<boolean>();
  readonly allDayText = input<string>();
  readonly slotDuration = input<DurationInput>();
  readonly slotLabelFormat = input<FormatterInput>();
  readonly slotLabelInterval = input<DurationInput>();
  readonly snapDuration = input<DurationInput>();
  readonly scrollTime = input<DurationInput>();
  readonly minTime = input<DurationInput>();
  readonly maxTime = input<DurationInput>();
  readonly slotEventOverlap = input<boolean>();
  readonly listDayFormat = input<FormatterInput | boolean>();
  readonly listDayAltFormat = input<FormatterInput | boolean>();
  readonly noEventsMessage = input<string>();
  readonly defaultDate = input<DateInput>();
  readonly nowIndicator = input<boolean>();
  readonly visibleRange = input<((currentDate: Date) => DateRangeInput) | DateRangeInput>();
  readonly validRange = input<DateRangeInput>();
  readonly dateIncrement = input<DurationInput>();
  readonly dateAlignment = input<string>();
  readonly duration = input<DurationInput>();
  readonly dayCount = input<number>();
  readonly locales = input<RawLocale[]>();
  readonly locale = input<LocaleSingularArg>();
  readonly eventTimeFormat = input<FormatterInput>();
  readonly columnHeader = input<boolean>();
  readonly columnHeaderFormat = input<FormatterInput>();
  readonly columnHeaderText = input<string | ((date: DateInput) => string)>();
  readonly columnHeaderHtml = input<string | ((date: DateInput) => string)>();
  readonly titleFormat = input<FormatterInput>();
  readonly weekLabel = input<string>();
  readonly displayEventTime = input<boolean>();
  readonly displayEventEnd = input<boolean>();
  readonly eventLimitText = input<string | ((eventCnt: number) => string)>();
  readonly dayPopoverFormat = input<FormatterInput>();
  readonly navLinks = input<boolean>();
  readonly selectable = input<boolean>();
  readonly selectMirror = input<boolean>();
  readonly unselectAuto = input<boolean>();
  readonly unselectCancel = input<string>();
  readonly defaultAllDayEventDuration = input<DurationInput>();
  readonly defaultTimedEventDuration = input<DurationInput>();
  readonly cmdFormatter = input<string>();
  readonly defaultRangeSeparator = input<string>();
  readonly selectConstraint = input<ConstraintInput>();
  readonly selectOverlap = input<boolean | OverlapFunc>();
  readonly selectAllow = input<AllowFunc>();
  readonly selectMinDistance = input<number>();
  readonly editable = input<boolean>();
  readonly eventStartEditable = input<boolean>();
  readonly eventDurationEditable = input<boolean>();
  readonly eventConstraint = input<ConstraintInput>();
  readonly eventOverlap = input<boolean | OverlapFunc>();
  readonly eventAllow = input<AllowFunc>();
  readonly eventClassName = input<string[] | string>();
  readonly eventClassNames = input<string[] | string>();
  readonly eventBackgroundColor = input<string>();
  readonly eventBorderColor = input<string>();
  readonly eventTextColor = input<string>();
  readonly eventColor = input<string>();
  readonly events = input<EventSourceInput>();
  readonly eventSources = input<EventSourceInput[]>();
  readonly allDayDefault = input<boolean>();
  readonly startParam = input<string>();
  readonly endParam = input<string>();
  readonly lazyFetching = input<boolean>();
  readonly nextDayThreshold = input<DurationInput>();
  readonly eventOrder = input<string | ((a: EventApi, b: EventApi) => number) | (string | ((a: EventApi, b: EventApi) => number))[]>();
  readonly rerenderDelay = input<number | null>();
  readonly dragRevertDuration = input<number>();
  readonly dragScroll = input<boolean>();
  readonly longPressDelay = input<number>();
  readonly eventLongPressDelay = input<number>();
  readonly droppable = input<boolean>();
  readonly dropAccept = input<string | ((draggable: any) => boolean)>();
  readonly eventDataTransform = input<EventInputTransformer>();
  readonly allDayMaintainDuration = input<boolean>();
  readonly eventResizableFromStart = input<boolean>();
  readonly timeGridEventMinHeight = input<number>();
  readonly allDayHtml = input<string>();
  readonly eventDragMinDistance = input<number>();
  readonly eventSourceFailure = input<EventSourceErrorResponseHandler>();
  readonly eventSourceSuccess = input<EventSourceSuccessResponseHandler>();
  readonly forceEventDuration = input<boolean>();
  readonly progressiveEventRendering = input<boolean>();
  readonly selectLongPressDelay = input<number>();
  readonly timeZoneParam = input<string>();
  readonly titleRangeSeparator = input<string>();
  // compound OptionsInput...
  readonly buttonText = input<ButtonTextCompoundInput>();
  readonly views = input<{ [viewId: string]: ViewOptionsInput }>();
  readonly plugins = input<(PluginDef | string)[]>();
  // scheduler...
  readonly schedulerLicenseKey = input<string>();
  readonly resources = input<any>();
  readonly resourceLabelText = input<string>();
  readonly resourceOrder = input<any>();
  readonly filterResourcesWithEvents = input<any>();
  readonly resourceText = input<any>();
  readonly resourceGroupField = input<any>();
  readonly resourceGroupText = input<any>();
  readonly resourceAreaWidth = input<any>();
  readonly resourceColumns = input<any>();
  readonly resourcesInitiallyExpanded = input<any>();
  readonly slotWidth = input<any>();
  readonly datesAboveResources = input<any>();
  readonly googleCalendarApiKey = input<string>();
  readonly refetchResourcesOnNavigate = input<boolean>();
  readonly eventResourceEditable = input<boolean>();

  readonly windowResize = output<any>();
  readonly dateClick = output<any>();
  readonly eventClick = output<any>();
  readonly eventMouseEnter = output<any>();
  readonly eventMouseLeave = output<any>();
  readonly select = output<any>();
  readonly unselect = output<any>();
  readonly loading = output<any>();
  readonly eventPositioned = output<any>();
  readonly eventDragStart = output<any>();
  readonly eventDragStop = output<any>();
  readonly eventDrop = output<any>();
  readonly eventResizeStart = output<any>();
  readonly eventResizeStop = output<any>();
  readonly eventResize = output<any>();
  readonly drop = output<any>();
  readonly eventReceive = output<any>();
  readonly eventLeave = output<any>();
  readonly _destroyed = output<any>();
  readonly navLinkDayClick = output<any>();
  readonly navLinkWeekClick = output<any>();
  // TODO: make these inputs...
  readonly viewSkeletonRender = output<any>();
  readonly viewSkeletonDestroy = output<any>();
  readonly datesRender = output<any>();
  readonly datesDestroy = output<any>();
  readonly dayRender = output<any>();
  readonly eventRender = output<any>();
  readonly eventDestroy = output<any>();
  readonly resourceRender = output<any>();
}
