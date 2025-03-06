import { Pipe, PipeTransform } from "@angular/core";
import { NodePackageUpdates } from "src/models/node-package";

@Pipe({ name: "packagesForUpdate" })
export class PackagesForUpdateCountPipe implements PipeTransform {
  transform(packages: NodePackageUpdates[]): number {
    return packages.filter((update) => !!update.updated).length;
  }
}

@Pipe({ name: "packagesUpdateErrors" })
export class PackagesUpdateErrorsCountPipe implements PipeTransform {
  transform(packages: NodePackageUpdates[]): number {
    return packages.filter((update) => !!update.errors).length;
  }
}
