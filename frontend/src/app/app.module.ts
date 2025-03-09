import { APP_BASE_HREF, DOCUMENT } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { BrowserModule } from "@angular/platform-browser";
import { RouterModule } from "@angular/router";
import { MonacoEditorModule } from "ngx-monaco-editor-v2";
import { SocketIoModule } from "ngx-socket-io";
import { AddNodeComponent } from "src/app/add-node/add-node.component";
import { AssetsComponent } from "src/app/assets/assets.component";
import { DeployPipelineComponent } from "src/app/deploy-pipeline/deploy-pipeline.component";
import { EditInputComponent } from "src/app/edit-input/edit-input.component";
import { EditNodeComponent } from "src/app/edit-node/edit-node.component";
import { EditPipelineInputComponent } from "src/app/edit-pipeline-input/edit-pipeline-input.component";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { EditPipelineYamlComponent } from "src/app/edit-pipeline-yaml/edit-pipeline-yaml.component";
import { LaunchComponent } from "src/app/launch/launch.component";
import { LaunchesComponent } from "src/app/launches/launches.component";
import { NodeStateComponent } from "src/app/node-state/node-state.component";
import { NodeComponent } from "src/app/node/node.component";
import { PipelineInputComponent } from "src/app/pipeline-input/pipeline-input.component";
import { PipelineOutputComponent } from "src/app/pipeline-output/pipeline-output.component";
import { ProjectComponent } from "src/app/project/project.component";
import { ProjectsComponent } from "src/app/projects/projects.component";
import { AutoHeightDirective } from "src/directives/auto-height";
import { DragMoveDirective } from "src/directives/drag-move.directive";
import { ImageFallbackDirective } from "src/directives/image-fall-back.directive";
import { ImageSizeDirective } from "src/directives/image-size";
import { SelectableDirective } from "src/directives/selectable.directive";
import { SubmitButtonDirective } from "src/directives/submit-button.directive";
import { AppConfig } from "src/models/app-config";
import { CanPipe } from "src/pipes/can";
import { CurvePipe } from "src/pipes/curve";
import { DurationPipe } from "src/pipes/duration";
import { FirstPipe } from "src/pipes/first";
import { FormatDistancePipe } from "src/pipes/format-distance";
import { GroupListPipe } from "src/pipes/group-list";
import { GroupNodesPipe } from "src/pipes/group-nodes";
import { ImageProxyPipe } from "src/pipes/image-proxy";
import { IncludesPipe } from "src/pipes/includes";
import { PipelineInputPipe } from "src/pipes/input";
import { IsPipe } from "src/pipes/is";
import { PlainPipe } from "src/pipes/map-to-plain";
import { MarkdownPipe } from "src/pipes/markdown";
import { MockArrayPipe } from "src/pipes/mock-array.pipe";
import { InputIndexOfPipe, NodePipe, OutputIndexOfPipe } from "src/pipes/node";
import { NotPipe } from "src/pipes/not";
import { NsfwPipe } from "src/pipes/nsfw";
import { OrderByPipe } from "src/pipes/order-by";
import { PipelineOutputPipe } from "src/pipes/output";
import { GetPercentPipe } from "src/pipes/percents";
import { PipelineCostsPipe } from "src/pipes/pipeline-costs";
import { PipelineFinishedMetricPipe } from "src/pipes/pipeline-finished-metric";
import { ShiftPipe } from "src/pipes/shift";
import { SlicePipe } from "src/pipes/slice";
import { SplitPipe } from "src/pipes/split";
import { ValuesPipe } from "src/pipes/values";
import { YamlPipe } from "src/pipes/yaml";
import { appConfigFactory } from "src/providers/app-config";
import { baseHrefFactory } from "src/ui-kit/providers/base-href";
import {
  CURRENT_LANGUAGE,
  currentLangFactory,
} from "src/ui-kit/providers/current-language";
import { UiKitModule } from "src/ui-kit/ui-kit.module";
import { AppComponent } from "./app.component";
import { AssetsPageComponent } from "./assets-page/assets-page.component";
import { BatchesComponent } from "./batches/batches.component";
import { DrawMaskComponent } from "./draw-mask/draw-mask.component";
import { EditNodeCatalogComponent } from "./edit-node-catalog/edit-node-catalog.component";
import { EditNodeDesignComponent } from "./edit-node-design/edit-node-design.component";
import { EditNodeEnvironmentComponent } from "./edit-node-environment/edit-node-environment.component";
import { EditNodeInputsComponent } from "./edit-node-inputs/edit-node-inputs.component";
import { EditNodeScriptComponent } from "./edit-node-script/edit-node-script.component";
import { EditNodeYamlComponent } from "./edit-node-yaml/edit-node-yaml.component";
import { EditPipelineDesignComponent } from "./edit-pipeline-design/edit-pipeline-design.component";
import { EditPipelineEnvironmentComponent } from "./edit-pipeline-environment/edit-pipeline-environment.component";
import { EditPipelineReadmeComponent } from "./edit-pipeline-readme/edit-pipeline-readme.component";
import { EditProjectComponent } from "./edit-project/edit-project.component";
import { BalanceRefillsComponent } from "./expenses/balance-refills/balance-refills.component";
import { ExpensesComponent } from "./expenses/expenses.component";
import { PipelineUsagesComponent } from "./expenses/pipeline-usages/pipeline-usages.component";
import { FeedSkeletonComponent } from "./feed-skeleton/feed-skeleton.component";
import { InpaintComponent } from "./inpaint/inpaint.component";
import { JsonEditorComponent } from "./json-editor/json-editor.component";
import { LaunchOutputsPageComponent } from "./launch-outputs-page/launch-outputs-page.component";
import { LaunchOutputsComponent } from "./launch-outputs/launch-outputs.component";
import { LaunchesPageComponent } from "./launches-page/launches-page.component";
import { AppLayoutComponent } from "./layout/layout.component";
import { MeUserComponent } from "./me-user/me-user.component";
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
import { ProjectPlaygroundComponent } from "./project-playground/project-playground.component";
import { SelectGeneratedComponent } from "./select-generated/select-generated.component";
import { SelectPlaygroundPageComponent } from "./select-playground-page/select-playground.component";
import { SelectPlaygroundComponent } from "./select-playground/select-playground.component";
import { LoginComponent } from "./signin/login.component";
import { SigupComponent } from "./signup/signup.component";
import { EditUserComponent } from "./users/edit/edit-user.component";
import { UsersComponent } from "./users/users.component";

@NgModule({
  declarations: [
    AppComponent,
    NodeComponent,
    LaunchComponent,
    ProjectComponent,
    EditPipelineYamlComponent,
    EditPipelineVisualComponent,
    DeployPipelineComponent,
    ProjectsComponent,
    LaunchesComponent,
    CurvePipe,
    NodePipe,
    ShiftPipe,
    PlainPipe,
    IncludesPipe,
    AssetsComponent,
    OutputIndexOfPipe,
    InputIndexOfPipe,
    AddNodeComponent,
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
    PlayWithProjectComponent,
    LaunchOutputsPageComponent,
    AssetsPageComponent,
    SelectPlaygroundPageComponent,
    ImageFallbackDirective,
    FeedSkeletonComponent,
    MockArrayPipe,
    GetPercentPipe,
    FirstPipe,
    ValuesPipe,
    LaunchOutputsComponent,
    FormatDistancePipe,
    SelectGeneratedComponent,
    InpaintComponent,
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
    MeUserComponent,
    ExpensesComponent,
    PipelineUsagesComponent,
    BalanceRefillsComponent,
    PlayViaApiComponent,
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
      provide: CURRENT_LANGUAGE,
      useFactory: currentLangFactory,
      deps: [APP_BASE_HREF],
    },
  ],
})
export class AppModule {}
