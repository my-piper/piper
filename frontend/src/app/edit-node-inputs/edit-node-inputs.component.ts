import { Component, Inject, OnInit } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { merge } from "lodash";
import { filter, Subscription, takeUntil } from "rxjs";
import { Asset } from "src/models/assets";
import { NodeToLaunch } from "src/models/launch-request";
import { Node, NodeInput } from "src/models/node";
import { Project } from "src/models/project";
import { UserRole } from "src/models/user";
import { ProjectManager } from "src/services/project.manager";
import { Primitive } from "src/types/primitive";
import { UI } from "src/ui-kit/consts";
import { Languages } from "src/ui-kit/enums/languages";
import { UntilDestroyed } from "src/ui-kit/helpers/until-destroyed";
import { PopoverComponent } from "src/ui-kit/popover/popover.component";
import { CURRENT_LANGUAGE } from "src/ui-kit/providers/current-language";
import { getLabel } from "src/ui-kit/utils/i18n";
import { createLogger, LogLevel } from "src/utils/logger";
import { mapTo, toPlain } from "src/utils/models";

const DYNAMIC_PLACEHOLDER = "#";

const logger = createLogger("edit_node_inputs", LogLevel.debug);

@Component({
  selector: "app-edit-node-inputs",
  templateUrl: "./edit-node-inputs.component.html",
  styleUrls: ["./edit-node-inputs.component.scss"],
})
export class EditNodeInputsComponent extends UntilDestroyed implements OnInit {
  userRole = UserRole;
  ui = UI;

  project!: Project;
  id!: string;
  node!: Node;

  subscriptions: { changes?: Subscription } = {};
  references: { popover: PopoverComponent } = { popover: null };

  startControl = this.fb.control<boolean>(false);
  inputsGroup = this.fb.group({});
  form = this.fb.group({
    title: this.fb.control<string>(null, [
      Validators.required,
      Validators.minLength(3),
    ]),
    start: this.startControl,
    inputs: this.inputsGroup,
  });

  constructor(
    @Inject(CURRENT_LANGUAGE) private language: Languages,
    private projectManager: ProjectManager,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    super();
  }

  ngOnInit() {
    logger.debug("Init edit node inputs");

    this.route.data.subscribe(({ project, node: { id, node } }) => {
      [this.project, this.id, this.node] = [project, id, node];
      this.build();
    });

    this.projectManager.updates
      .pipe(
        takeUntil(this.destroyed$),
        filter((initiator) => initiator !== this),
      )
      .subscribe(() => {
        this.node.build();
        this.build();
      });
  }

  private build() {
    logger.debug("Build edit node inputs");

    this.subscriptions.changes?.unsubscribe();
    Object.keys(this.inputsGroup.controls).forEach((key) =>
      this.inputsGroup.removeControl(key),
    );
    const { pipeline, launchRequest } = this.project;
    for (const [k, input] of this.node.inputs) {
      const inputGroup = this.fb.group({});

      const control = this.fb.control<Primitive>(null);
      const node = launchRequest.nodes.get(this.id);
      let value = node?.inputs?.get(k);
      if (value === undefined) {
        value = input.default;
      }
      switch (input.type) {
        case "boolean":
          control.setValue(value);
          break;
        default:
          control.setValue(value);
      }

      inputGroup.addControl("value", control);
      this.inputsGroup.addControl(k, inputGroup);
    }
    this.form.patchValue({
      title: getLabel(this.node.title, this.language),
      start: pipeline.start.nodes.includes(this.id),
    });

    this.subscriptions.changes = this.form.valueChanges.subscribe(() =>
      this.save(),
    );
  }

  put(input: string, asset: Asset) {
    this.inputsGroup.get(input).setValue(asset.url);
  }

  private async save() {
    if (!this.form.valid) {
      return;
    }

    const { pipeline, launchRequest } = this.project;

    const { title, start } = this.form.getRawValue();
    if (title !== getLabel(this.node.title, this.language)) {
      this.node.title = title;
    }

    const index = pipeline.start.nodes.indexOf(this.id);
    if (start) {
      if (index === -1) {
        pipeline.start.nodes.push(this.id);
      }
    } else {
      if (index !== -1) {
        pipeline.start.nodes.splice(index, 1);
      }
    }

    const inputs = new Map<string, Primitive>();
    for (const [k, input] of this.node.inputs) {
      const inputGroup = this.inputsGroup.get(k);
      if (!inputGroup) {
        console.error(`Group for input [${k}] not found`);
        continue;
      }

      const value = inputGroup.get("value").value as Primitive;
      switch (input.type) {
        case "boolean":
          const val = value as boolean;
          inputs.set(k, val);
          break;
        case "integer":
        case "float":
        case "string":
        case "string[]":
        case "json":
        case "image":
          if (!!value) {
            inputs.set(k, value);
          } else {
            inputs.delete(k);
          }
          break;
        default:
          inputs.set(k, value);
      }
    }

    let nodeToLaunch = launchRequest.nodes.get(this.id);
    if (!nodeToLaunch) {
      nodeToLaunch = new NodeToLaunch();
      launchRequest.nodes.set(this.id, nodeToLaunch);
    }
    nodeToLaunch.inputs = inputs;

    this.projectManager.markDirty(this);
  }

  addDynamic(input: NodeInput) {
    const plain = toPlain(input);
    const cloned = mapTo(plain, NodeInput);

    const {
      dynamic: { id, title },
    } = cloned;

    const index =
      [...this.node.inputs.values()].reduce((max, i) => {
        if (i.cloned && i.dynamic?.group !== input.dynamic.group) {
          return max;
        }

        const index = i.dynamic?.index || 0;
        return index > max ? index : max;
      }, 0) + 1;

    merge(cloned, {
      title: title.replaceAll(DYNAMIC_PLACEHOLDER, index.toString()),
      order: index,
      cloned: true,
      dynamic: {
        index,
      },
    });

    this.node.inputs.set(
      id.replaceAll(DYNAMIC_PLACEHOLDER, index.toString()),
      cloned,
    );

    this.node.build();
    this.build();

    this.projectManager.markDirty(this);
  }

  removeInput(input: string) {
    this.node.inputs.delete(input);

    this.node.build();
    this.build();

    this.projectManager.markDirty(this);
  }

  markFeatured(input: NodeInput) {
    input.featured = true;
    this.projectManager.markDirty();
  }

  markUnFeatured(input: string) {
    delete this.node.inputs.get(input).featured;
    this.projectManager.markDirty(this);
  }

  edit() {
    this.references.popover?.hide();
    this.router.navigate(
      [{ outlets: { primary: ["nodes", this.id, "edit", "script"] } }],
      { relativeTo: this.route.parent },
    );
  }

  reset() {
    const { launchRequest } = this.project;

    const node = launchRequest.nodes.get(this.id);
    if (!node.inputs) {
      return;
    }

    node.inputs.forEach((v, k) => node.inputs.delete(k));

    this.node.build();
    this.build();

    this.projectManager.markDirty(this);
  }

  reorder() {
    this.references.popover?.hide();

    let i = 1;
    for (const { group } of this.node.render.inputs) {
      group.order = i++;
      let j = 1;
      for (const { input } of group.inputs) {
        input.order = j++;
      }
    }

    this.node.build();
    this.build();

    this.projectManager.markDirty(this);
  }
}
