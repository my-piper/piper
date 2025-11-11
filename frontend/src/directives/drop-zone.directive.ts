import {
  Directive,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from "@angular/core";
import { DropZoneHub } from "src/services/drop-zone.hub";

@Directive({
  selector: "[dropZone]",
})
export class DropZoneDirective implements OnInit, OnDestroy {
  @Output()
  drop = new EventEmitter<{
    top: number;
    left: number;
    payload: any;
  }>();

  constructor(
    private dropZoneService: DropZoneHub,
    private hostRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    const { nativeElement: el } = this.hostRef;
    this.dropZoneService.register(el, this);
  }

  ngOnDestroy(): void {
    const { nativeElement: el } = this.hostRef;
    this.dropZoneService.remove(el);
  }
}
