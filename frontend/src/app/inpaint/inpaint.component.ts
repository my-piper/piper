import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { plainToInstance } from "class-transformer";
import { first } from "lodash";
import { delay, finalize, map } from "rxjs";
import { Artefact } from "src/models/artefacts";
import { HttpService } from "src/services/http.service";
import { UI_DELAY } from "src/ui-kit/consts";

type Image = { source: string; mask?: string };

@Component({
  selector: "app-inpaint",
  templateUrl: "./inpaint.component.html",
  styleUrls: ["./inpaint.component.scss"],
})
export class InpaintComponent implements OnDestroy {
  progress = { saving: false };

  source!: string;
  mask!: string;

  drawing = false;
  last: { x: number; y: number } = null;
  ratio: number;

  brushSizeControl = this.fb.control(40);
  form = this.fb.group({
    brushSize: this.brushSizeControl,
  });

  @ViewChild("cursorRef")
  cursorRef: ElementRef<HTMLDivElement>;

  @ViewChild("sourceRef")
  sourceRef: ElementRef<HTMLImageElement>;

  @ViewChild("maskRef")
  maskRef: ElementRef<HTMLImageElement>;

  @ViewChild("paintRef")
  paintRef: ElementRef<HTMLCanvasElement>;

  @Output()
  saved = new EventEmitter<string | null>();

  @Input()
  set image({ source, mask }: Image) {
    [this.source, this.mask] = [source, mask];
  }

  images: HTMLImageElement[] = [];

  loaded({ target }: { target: HTMLImageElement }) {
    const canvas = this.paintRef.nativeElement;
    let ctx = canvas.getContext("2d");

    const [source, mask] = [
      this.sourceRef.nativeElement,
      this.maskRef.nativeElement,
    ];

    const applyMask = () => {
      if (this.images.length >= 2) {
        ctx.drawImage(
          mask,
          0,
          0,
          mask.width,
          mask.height,
          0,
          0,
          canvas.width,
          canvas.height
        );
      }
    };

    this.images.push(target);

    if (target === source) {
      const { naturalWidth: width, naturalHeight: height } = source;

      const ratio = 800 / width;
      canvas.style.transform = `scale(${ratio}, ${ratio})`;
      [canvas.width, canvas.height] = [width, height];
      this.ratio = ratio;
      applyMask();
    } else if (target === mask) {
      applyMask();
    }
  }

  constructor(
    private http: HttpService,
    private cd: ChangeDetectorRef,
    private fb: FormBuilder
  ) {}

  ngOnDestroy() {
    this.saved.complete();
  }

  getMouse(event: MouseEvent | TouchEvent) {
    const canvas = this.paintRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;

    if (event instanceof MouseEvent) {
      [clientX, clientY] = [event.clientX, event.clientY];
    } else if (event instanceof TouchEvent) {
      const touch = first(event.touches);
      [clientX, clientY] = [touch.clientX, touch.clientY];
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  startDraw(event: MouseEvent | TouchEvent) {
    this.drawing = true;

    const paintCanvas = this.paintRef.nativeElement;
    const ctx = paintCanvas.getContext("2d");
    const scale = 1 / this.ratio;
    ctx.save();
    ctx.scale(scale, scale);

    const { x, y } = this.getMouse(event);
    ctx.beginPath();
    ctx.arc(x, y, this.brushSizeControl.value / 2, 0, 2 * Math.PI);
    ctx.fillStyle = "white";
    ctx.fill();
    ctx.closePath();

    this.last = { x, y };
  }

  stopDraw() {
    this.drawing = false;

    const canvas = this.paintRef.nativeElement;
    const ctx = canvas.getContext("2d");
    ctx.closePath();
    ctx.restore();
  }

  draw(event: MouseEvent | TouchEvent) {
    const { x, y } = this.getMouse(event);

    this.cursorRef.nativeElement.style.left = x + "px";
    this.cursorRef.nativeElement.style.top = y + "px";

    if (!this.drawing) {
      return;
    }
    const canvas = this.paintRef.nativeElement;
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.lineWidth = this.brushSizeControl.value;
    ctx.lineCap = "round";
    ctx.strokeStyle = "white";
    ctx.moveTo(this.last.x, this.last.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    this.last = { x, y };
  }

  save() {
    const canvas = this.paintRef.nativeElement;
    const ctx = canvas.getContext("2d");
    const has = ctx
      .getImageData(0, 0, canvas.width, canvas.height)
      .data.some((channel) => channel !== 0);
    if (has) {
      this.progress.saving = true;
      this.cd.detectChanges();
      canvas.toBlob((blob) => {
        let file = new File([blob], "mask.png", { type: "image/png" });
        let formData = new FormData();
        formData.append("grayscale", "x");
        formData.append("file", file);
        this.http
          .post("artefacts?", formData)
          .pipe(
            delay(UI_DELAY),
            finalize(() => {
              this.progress.saving = false;
              this.cd.detectChanges();
            }),
            map((json) => plainToInstance(Artefact, json))
          )
          .subscribe(({ url }) => this.saved.emit(url));
      });
    } else {
      this.saved.emit(null);
    }
  }

  clear() {
    const canvas = this.paintRef.nativeElement;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
