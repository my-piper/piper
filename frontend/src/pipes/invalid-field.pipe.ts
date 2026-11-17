import { Pipe, PipeTransform } from "@angular/core";
import { FormGroup } from "@angular/forms";

@Pipe({
  name: "invalidField",
  pure: false,
  standalone: false,
})
export class InvalidFieldPipe implements PipeTransform {
  transform(form: FormGroup, controlName: string): boolean {
    const control = form.get(controlName);
    return !!control?.touched && !control?.valid;
  }
}
