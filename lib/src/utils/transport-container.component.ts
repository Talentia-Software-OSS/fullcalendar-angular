import {
  Component,
  Input,
  ViewEncapsulation,
  ViewChild,
  TemplateRef,
  ElementRef,
  OnChanges,
  AfterViewInit,
  OnDestroy,
  SimpleChanges
} from '@angular/core';

const dummyContainer = document.createDocumentFragment();

@Component({
  selector: 'transport-container',
  templateUrl: './transport-container.component.html',
  encapsulation: ViewEncapsulation.None
})
export class TransportContainerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() inPlaceOf!: HTMLElement; // required
  @Input() elTag!: string; // required
  @Input() elClasses?: string[];
  @Input() elStyle?: Record<string, unknown>;
  @Input() elAttrs?: Record<string, unknown>;
  @Input() template!: TemplateRef<any>; // required
  @Input() renderProps?: any;

  @ViewChild('rootEl') rootElRef!: ElementRef;

  ngAfterViewInit() {
    const rootEl = this.rootElRef.nativeElement;

    replaceEl(rootEl, this.inPlaceOf);
    applyElAttrs(rootEl, undefined, this.elAttrs);
  }

  ngOnChanges(changes: SimpleChanges) {
    const rootEl = this.rootElRef.nativeElement;

    // ngOnChanges is called before ngAfterViewInit (and before DOM initializes)
    // so make sure rootEl is defined before doing anything
    if (rootEl) {
      // If the ContentContainer's tagName changed, it will create a new DOM element in its
      // original place. Detect this and re-replace.
      if (this.inPlaceOf.parentNode !== dummyContainer) {
        replaceEl(rootEl, this.inPlaceOf);
        applyElAttrs(rootEl, undefined, this.elAttrs);
      } else {
        const elAttrsChange = changes['elAttrs'];

        if (elAttrsChange) {
          applyElAttrs(rootEl, elAttrsChange.previousValue, elAttrsChange.currentValue);
        }
      }
    }
  }

  ngOnDestroy() {
    dummyContainer.removeChild(this.inPlaceOf);
  }
}

function replaceEl(subject: Element, inPlaceOf: Element): void {
  inPlaceOf.parentNode?.insertBefore(subject, inPlaceOf.nextSibling);
  dummyContainer.appendChild(inPlaceOf);
}

function applyElAttrs(
  el: Element,
  previousAttrs: Record<string, any> = {},
  currentAttrs: Record<string, any> = {}
): void {
  for (const attrName in previousAttrs) {
    if (!(attrName in currentAttrs)) {
      el.removeAttribute(attrName);
    }
  }

  for (const attrName in currentAttrs) {
    el.setAttribute(attrName, currentAttrs[attrName]);
  }
}
