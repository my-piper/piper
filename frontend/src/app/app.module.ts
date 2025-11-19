import { APP_BASE_HREF, DOCUMENT } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import { APP_INITIALIZER, NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { BrowserModule } from "@angular/platform-browser";
import { RouterModule } from "@angular/router";
import { NgHcaptchaModule } from "ng-hcaptcha";
import { MonacoEditorModule } from "ngx-monaco-editor-v2";
import { SocketIoModule } from "ngx-socket-io";
import { AssetsComponent } from "src/app/assets/assets.component";
import { DeployPipelineComponent } from "src/app/deploy-pipeline/deploy-pipeline.component";
import { EditInputComponent } from "src/app/edit-input/edit-input.component";
import { EditNodeComponent } from "src/app/edit-node/edit-node.component";
import { EditPipelineInputComponent } from "src/app/edit-pipeline-input/edit-pipeline-input.component";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { EditPipelineYamlComponent } from "src/app/edit-pipeline-yaml/edit-pipeline-yaml.component";
import { LaunchesComponent } from "src/app/launches/launches.component";
import { NodeStateComponent } from "src/app/node-state/node-state.component";
import { NodeComponent } from "src/app/node/node.component";
import { PipelineInputComponent } from "src/app/pipeline-input/pipeline-input.component";
import { PipelineOutputComponent } from "src/app/pipeline-output/pipeline-output.component";
import { ProjectComponent } from "src/app/project/project.component";
import { ProjectsComponent } from "src/app/projects/projects.component";
import { SelectNodeComponent } from "src/app/select-node/select-node.component";
import { AutoHeightDirective } from "src/directives/auto-height";
import { CopyToClipboardDirective } from "src/directives/copy-clipboard.directive";
import { DragCloneDirective } from "src/directives/drag-clone.directive";
import { DragMoveDirective } from "src/directives/drag-move.directive";
import { DropZoneDirective } from "src/directives/drop-zone.directive";
import { ImageFallbackDirective } from "src/directives/image-fall-back.directive";
import { ImageSizeDirective } from "src/directives/image-size";
import { ScrollInsideDirective } from "src/directives/scroll-inside.directive";
import { SelectableDirective } from "src/directives/selectable.directive";
import { SubmitButtonDirective } from "src/directives/submit-button.directive";
import { AppConfig } from "src/models/app-config";
import { CanPipe } from "src/pipes/can";
import { CenterPipe } from "src/pipes/center";
import { CurvePipe } from "src/pipes/curve";
import { DurationPipe } from "src/pipes/duration";
import { FirstPipe } from "src/pipes/first";
import { GroupListPipe } from "src/pipes/group-list";
import { GroupNodesPipe } from "src/pipes/group-nodes";
import { ImageProxyPipe } from "src/pipes/image-proxy";
import { IncludesPipe } from "src/pipes/includes";
import { PipelineInputPipe } from "src/pipes/input";
import { IsPipe } from "src/pipes/is";
import { MapToPlainPipe } from "src/pipes/map-to-plain";
import { MarkdownPipe } from "src/pipes/markdown";
import { InputIndexOfPipe, NodePipe, OutputIndexOfPipe } from "src/pipes/node";
import { NotPipe } from "src/pipes/not";
import { NsfwPipe } from "src/pipes/nsfw";
import { OrderByPipe } from "src/pipes/order-by";
import { PipelineOutputPipe } from "src/pipes/output";
import { GetPercentPipe } from "src/pipes/percents";
import { PipelineCostsPipe } from "src/pipes/pipeline-costs";
import { PipelineFinishedMetricPipe } from "src/pipes/pipeline-finished-metric";
import { PipelineNodeUpdatesPipe } from "src/pipes/pipeline-node-updates";
import { PlainPipe } from "src/pipes/plain";
import { PositionPipe } from "src/pipes/position";
import { ShiftPipe } from "src/pipes/shift";
import { SlicePipe } from "src/pipes/slice";
import { SplitPipe } from "src/pipes/split";
import { ValuesPipe } from "src/pipes/values";
import { YamlPipe } from "src/pipes/yaml";
import { Ajv, ajvFactory } from "src/providers/ajv";
import { appConfigFactory } from "src/providers/app-config";
import { ScrollTopListener } from "src/providers/scroll-top.listener";
import { baseHrefFactory } from "src/ui-kit/providers/base-href";
import {
  CURRENT_LANGUAGE,
  currentLangFactory,
} from "src/ui-kit/providers/current-language";
import {
  DATE_LOCALE,
  dateLocaleFactory,
} from "src/ui-kit/providers/date-locale";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { AppComponent } from "./app.component";
import { AssetsPageComponent } from "./assets-page/assets-page.component";
import { BatchesComponent } from "./batches/batches.component";
import { ChangePasswordComponent } from "./change-password/change-password.component";
import { DrawMaskComponent } from "./draw-mask/draw-mask.component";
import { EditFlowTransformerComponent } from "./edit-flow-transformer/edit-flow-transformer.component";
import { EditNodeAppComponent } from "./edit-node-app/edit-node-app.component";
import { EditNodeCatalogComponent } from "./edit-node-catalog/edit-node-catalog.component";
import { EditNodeDesignComponent } from "./edit-node-design/edit-node-design.component";
import { EditNodeEnvironmentComponent } from "./edit-node-environment/edit-node-environment.component";
import { EditNodeInputsComponent } from "./edit-node-inputs/edit-node-inputs.component";
import { EditNodeScriptComponent } from "./edit-node-script/edit-node-script.component";
import { EditNodeYamlComponent } from "./edit-node-yaml/edit-node-yaml.component";
import { EditPipelineDesignComponent } from "./edit-pipeline-design/edit-pipeline-design.component";
import { EditPipelineEnvironmentComponent } from "./edit-pipeline-environment/edit-pipeline-environment.component";
import { EditPipelineReadmeComponent } from "./edit-pipeline-readme/edit-pipeline-readme.component";
import { EditPipelineScriptComponent } from "./edit-pipeline-script/edit-pipeline-script.component";
import { EditProjectComponent } from "./edit-project/edit-project.component";
import { BalanceRefillsComponent } from "./expenses/balance-refills/balance-refills.component";
import { ExpensesComponent } from "./expenses/expenses.component";
import { PipelineUsagesComponent } from "./expenses/pipeline-usages/pipeline-usages.component";
import { FeedSkeletonComponent } from "./feed-skeleton/feed-skeleton.component";
import { JsonEditorComponent } from "./json-editor/json-editor.component";
import { LaunchOutputsPageComponent } from "./launch-outputs-page/launch-outputs-page.component";
import { LaunchOutputsComponent } from "./launch-outputs/launch-outputs.component";
import { LaunchesPageComponent } from "./launches-page/launches-page.component";
import { AppLayoutComponent } from "./layout/layout.component";
import { MeUserComponent } from "./me-user/me-user.component";
import { NodeAppComponent } from "./node-app/node-app.component";
import { NodeInLaunchComponent } from "./node-in-launch/node-in-launch.component";
import { NodeIOComponent } from "./node-io/node-io.component";
import { NodeJobsComponent } from "./node-jobs/node-jobs.component";
import { EditPackageComponent } from "./node-packages/edit/edit-package.component";
import { ExportPackageComponent } from "./node-packages/export/export-package.component";
import { ImportPackageComponent } from "./node-packages/import/import-package.component";
import { NodePackagesComponent } from "./node-packages/node-packages.component";
import {
  PackagesForUpdateCountPipe,
  PackagesUpdateErrorsCountPipe,
} from "./node-packages/pipes";
import { NsfwDisclaimer } from "./nsfw-disclaimer/nsfw-disclaimer.component";
import { PipelineMessagesComponent } from "./pipeline-messages/pipeline-messages.component";
import { PipelineReadmeComponent } from "./pipeline-readme/pipeline-readme.component";
import { PlayViaApiComponent } from "./play-via-api/play-via-api.component";
import { PlayWithProjectComponent } from "./play-with-project/play-with-project.component";
import { PlaygroundComponent } from "./playground/playground.component";
import { ProjectCommentsComponent } from "./project-comments/project-comments.component";
import { ProjectPlaygroundComponent } from "./project-playground/project-playground.component";
import { ImportProjectComponent } from "./projects/import/import-project.component";
import { SelectGeneratedComponent } from "./select-generated/select-generated.component";
import { SelectPlaygroundPageComponent } from "./select-playground-page/select-playground-page.component";
import { SelectPlaygroundComponent } from "./select-playground/select-playground.component";
import { LoginComponent } from "./signin/login.component";
import { SigupComponent } from "./signup/signup.component";
import { UpdatePipelineNodesComponent } from "./update-pipeline-nodes/update-pipeline-nodes.component";
import { EditUserComponent } from "./users/edit/edit-user.component";
import { UsersComponent } from "./users/users.component";

@NgModule({
  declarations: [
    CenterPipe,
    PositionPipe,
    AppComponent,
    NodeComponent,
    ProjectComponent,
    EditPipelineYamlComponent,
    EditPipelineVisualComponent,
    DeployPipelineComponent,
    ProjectsComponent,
    LaunchesComponent,
    CurvePipe,
    NodePipe,
    ShiftPipe,
    MapToPlainPipe,
    PlainPipe,
    IncludesPipe,
    AssetsComponent,
    OutputIndexOfPipe,
    InputIndexOfPipe,
    SelectNodeComponent,
    EditNodeComponent,
    IsPipe,
    NodeStateComponent,
    PipelineInputComponent,
    PipelineInputPipe,
    PipelineOutputComponent,
    PipelineOutputPipe,
    DragMoveDirective,
    EditInputComponent,
    EditPipelineInputComponent,
    SplitPipe,
    SlicePipe,
    ImageProxyPipe,
    MarkdownPipe,
    AutoHeightDirective,
    LaunchOutputsComponent,
    PipelineMessagesComponent,
    PipelineFinishedMetricPipe,
    DurationPipe,
    LoginComponent,
    SigupComponent,
    AppLayoutComponent,
    NodeInLaunchComponent,
    NodeStateComponent,
    NodeJobsComponent,
    NodeIOComponent,
    PlaygroundComponent,
    ProjectPlaygroundComponent,
    SelectPlaygroundComponent,
    EditFlowTransformerComponent,
    PlayWithProjectComponent,
    LaunchOutputsPageComponent,
    AssetsPageComponent,
    SelectPlaygroundPageComponent,
    ImageFallbackDirective,
    FeedSkeletonComponent,
    GetPercentPipe,
    FirstPipe,
    ValuesPipe,
    LaunchOutputsComponent,
    SelectGeneratedComponent,
    DrawMaskComponent,
    OrderByPipe,
    LaunchesPageComponent,
    ImageSizeDirective,
    NsfwPipe,
    NsfwDisclaimer,
    UsersComponent,
    EditUserComponent,
    BatchesComponent,
    GroupListPipe,
    JsonEditorComponent,
    EditNodeScriptComponent,
    EditNodeInputsComponent,
    EditNodeDesignComponent,
    EditNodeYamlComponent,
    EditNodeCatalogComponent,
    EditNodeEnvironmentComponent,
    EditPipelineEnvironmentComponent,
    SubmitButtonDirective,
    GroupNodesPipe,
    EditPackageComponent,
    ExportPackageComponent,
    YamlPipe,
    NodePackagesComponent,
    ImportPackageComponent,
    ImportProjectComponent,
    PackagesForUpdateCountPipe,
    PackagesUpdateErrorsCountPipe,
    EditPipelineDesignComponent,
    EditProjectComponent,
    SelectableDirective,
    CanPipe,
    NotPipe,
    EditPipelineReadmeComponent,
    PipelineReadmeComponent,
    PipelineCostsPipe,
    PipelineNodeUpdatesPipe,
    MeUserComponent,
    ExpensesComponent,
    PipelineUsagesComponent,
    BalanceRefillsComponent,
    PlayViaApiComponent,
    EditPipelineScriptComponent,
    ProjectCommentsComponent,
    ChangePasswordComponent,
    UpdatePipelineNodesComponent,
    CopyToClipboardDirective,
    EditNodeAppComponent,
    NodeAppComponent,
    ScrollInsideDirective,
    DragCloneDirective,
    DropZoneDirective,
  ],
  imports: [
    BrowserModule,
    RouterModule,
    ReactiveFormsModule,
    MonacoEditorModule.forRoot(),
    SocketIoModule.forRoot({
      url: "/",
      options: { transports: ["websocket"] },
    }),
    HttpClientModule,
    UiKitModule,
    NgHcaptchaModule.forRoot(),
  ],
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: baseHrefFactory,
      deps: [DOCUMENT],
    },
    {
      provide: AppConfig,
      useFactory: appConfigFactory,
      deps: [],
    },
    {
      provide: Ajv,
      useFactory: ajvFactory,
      deps: [],
    },
    {
      provide: CURRENT_LANGUAGE,
      useFactory: currentLangFactory,
      deps: [APP_BASE_HREF],
    },
    {
      provide: DATE_LOCALE,
      useFactory: dateLocaleFactory,
      deps: [CURRENT_LANGUAGE],
    },

    {
      provide: APP_INITIALIZER,
      useFactory: () => () => {},
      deps: [ScrollTopListener],
      multi: true,
    },
  ],
})
export class AppModule {}
