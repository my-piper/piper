import { inject, NgModule } from "@angular/core";
import {
  Data,
  Router,
  RouterModule,
  Routes,
  UrlSegment,
} from "@angular/router";
import { AppComponent } from "src/app/app.component";
import { AppModule } from "src/app/app.module";
import { DeployPipelineComponent } from "src/app/deploy-pipeline/deploy-pipeline.component";
import { EditNodeComponent } from "src/app/edit-node/edit-node.component";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { EditPipelineYamlComponent } from "src/app/edit-pipeline-yaml/edit-pipeline-yaml.component";
import { NodeStateComponent } from "src/app/node-state/node-state.component";
import { ProjectComponent } from "src/app/project/project.component";
import { ProjectsComponent } from "src/app/projects/projects.component";
import { SelectNodeComponent } from "src/app/select-node/select-node.component";
import { AnonymousGuard } from "src/guards/anonymous.guard";
import { ShouldCheckReadmeGuard } from "src/guards/pipeline-readme";
import { SaveProjectGuard } from "src/guards/save-project.guard";
import { SigninNeededGuard } from "src/guards/signin.guard";
import { DeployResolver } from "src/resolvers/deploy";
import { LaunchResolver } from "src/resolvers/launch";
import { LaunchMessagesFilterResolver } from "src/resolvers/launch-messages-filter";
import { LaunchesResolver } from "src/resolvers/launches";
import {
  AllLaunchesFilterResolver,
  LaunchesFilterResolver,
  NestedLaunchesFilterResolver,
  ProjectPlaygroundLaunchesFilterResolver,
} from "src/resolvers/launches-filter";
import { GlobalEnvironmentResolver } from "src/resolvers/global-environment";
import {
  NodeFromLaunchResolver,
  NodeFromProjectResolver,
} from "src/resolvers/node";
import { NodePackageResolver } from "src/resolvers/node-package";
import { ProjectResolver } from "src/resolvers/project";
import { UserResolver } from "src/resolvers/user";
import { AssetsComponent } from "./assets/assets.component";
import { AssistantComponent } from "./assistant/assistant.component";
import { BatchesComponent } from "./batches/batches.component";
import { EditNodeAppComponent } from "./edit-node-app/edit-node-app.component";
import { EditNodeCatalogComponent } from "./edit-node-catalog/edit-node-catalog.component";
import { EditNodeDesignComponent } from "./edit-node-design/edit-node-design.component";
import { EditNodeEnvironmentComponent } from "./edit-node-environment/edit-node-environment.component";
import { EditNodeInputsComponent } from "./edit-node-inputs/edit-node-inputs.component";
import { EditNodeScriptComponent } from "./edit-node-script/edit-node-script.component";
import { EditNodeYamlComponent } from "./edit-node-yaml/edit-node-yaml.component";
import { EditPipelineDesignComponent } from "./edit-pipeline-design/edit-pipeline-design.component";
import { EditPipelineEnvironmentComponent } from "./edit-pipeline-environment/edit-pipeline-environment.component";
import { LaunchOutputsPageComponent } from "./launch-outputs-page/launch-outputs-page.component";
import { LaunchesPageComponent } from "./launches-page/launches-page.component";
import { AppLayoutComponent } from "./layout/layout.component";
import { EnvironmentComponent } from "./environment/environment.component";
import { NodeAppComponent } from "./node-app/node-app.component";
import { NodeInLaunchComponent } from "./node-in-launch/node-in-launch.component";
import { NodeInputsComponent } from "./node-inputs/node-inputs.component";
import { NodeJobsComponent } from "./node-jobs/node-jobs.component";
import { LaunchLogsComponent } from "./launch-logs/launch-logs.component";
import { NodeOutputsComponent } from "./node-outputs/node-outputs.component";
import { EditPackageComponent } from "./node-packages/edit/edit-package.component";
import { ExportPackageComponent } from "./node-packages/export/export-package.component";
import { ImportPackageComponent } from "./node-packages/import/import-package.component";
import { NodePackagesComponent } from "./node-packages/node-packages.component";
import { PipelineMessagesComponent } from "./pipeline-messages/pipeline-messages.component";
import { PipelineReadmeComponent } from "./pipeline-readme/pipeline-readme.component";
import { PlayViaApiComponent } from "./play-via-api/play-via-api.component";
import { PlayWithProjectComponent } from "./play-with-project/play-with-project.component";
import { PlaygroundComponent } from "./playground/playground.component";
import { ProjectArtefactsComponent } from "./project-artefacts/project-artefacts.component";
import { ProjectAssetsComponent } from "./project-assets/project-assets.component";
import { ProjectCommentsComponent } from "./project-comments/project-comments.component";
import { ProjectStatsComponent } from "./project-stats/project-stats.component";
import { CreateProjectComponent } from "./projects/create/create-project.component";
import { ImportProjectComponent } from "./projects/import/import-project.component";
import { LoginComponent } from "./signin/login.component";
import { SigupComponent } from "./signup/signup.component";
import { UpdatePipelineNodesComponent } from "./update-pipeline-nodes/update-pipeline-nodes.component";
import { EditUserComponent } from "./users/edit/edit-user.component";
import { UsersComponent } from "./users/users.component";
import { DialogLabel, titled } from "src/utils/route-dialog";

const LAUNCH_OUTPUTS_LABEL = $localize`:@@label.launch_outputs:Launch outputs`;

/** A dialog label naming a plain value (a login, a deploy address), not a Localized Text. */
function named(prefix: string, name: string | undefined): string {
  return name ? `${prefix}: ${name}` : prefix;
}

/** Names the deploy by its address, `prefix/slug` or `slug`. */
const CALL_VIA_API_LABEL: DialogLabel = ({ deploy }: Data) =>
  named(
    $localize`:@@label.call_via_api:Call via API`,
    deploy && [deploy.prefix, deploy.slug].filter(Boolean).join("/"),
  );

/** Children of the Projects page, which a Project id can never be. */
const PROJECTS_PAGES = new Set(["new", "import"]);

export function projectIdMatcher(
  segments: UrlSegment[],
): { consumed: UrlSegment[]; posParams: { [key: string]: UrlSegment } } | null {
  if (
    segments.length >= 2 &&
    segments[0].path === "projects" &&
    !PROJECTS_PAGES.has(segments[1].path)
  ) {
    return {
      consumed: segments.slice(0, 2),
      posParams: {
        id: segments[1],
      },
    };
  }

  return null;
}

const routes: Routes = [
  // The backend sends single sign-on results to /en/... (the production base
  // href). The dev server builds without localize and serves the app at "/",
  // so drop the prefix here, keeping the query.
  {
    path: "en",
    children: [
      {
        path: "**",
        redirectTo: ({ url, queryParams }) =>
          inject(Router).createUrlTree(["/", ...url.map(({ path }) => path)], {
            queryParams,
          }),
      },
    ],
  },
  {
    path: "login",
    canActivate: [AnonymousGuard],
    component: LoginComponent,
  },
  {
    path: "signup",
    canActivate: [AnonymousGuard],
    component: SigupComponent,
  },
  {
    path: "",
    component: AppLayoutComponent,
    children: [
      {
        path: "play",
        component: PlaygroundComponent,
        children: [
          {
            path: "",
            pathMatch: "full",
            redirectTo: "/projects",
          },
          {
            path: ":id",
            data: { fullBleed: true },
            resolve: {
              project: ProjectResolver,
            },
            component: PlayWithProjectComponent,
            children: [
              {
                path: "readme",
                component: PipelineReadmeComponent,
              },
              {
                path: "scheme",
                // A read-only canvas without runs: no flags.
                component: EditPipelineVisualComponent,
              },
              {
                path: "api/:prefix/:slug",
                resolve: {
                  deploy: DeployResolver,
                },
                component: PlayViaApiComponent,
              },
              {
                path: "api/:slug",
                resolve: {
                  deploy: DeployResolver,
                },
                component: PlayViaApiComponent,
              },
              {
                path: "comments",
                component: ProjectCommentsComponent,
              },
              {
                path: "batches",
                component: BatchesComponent,
              },
              {
                path: "",
                resolve: {
                  filter: ProjectPlaygroundLaunchesFilterResolver,
                },
                component: LaunchesPageComponent,
                canActivate: [ShouldCheckReadmeGuard],
                children: [
                  {
                    path: "outputs/:id",
                    component: LaunchOutputsPageComponent,
                    resolve: {
                      launch: LaunchResolver,
                    },
                    data: { dialogLabel: LAUNCH_OUTPUTS_LABEL },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        path: "launches/:id",
        component: EditPipelineVisualComponent,
        data: {
          fullBleed: true,
          project: null,
          runs: true,
        },
        resolve: {
          launch: LaunchResolver,
        },
        children: [
          {
            path: "nodes/:id",
            outlet: "right",
            component: NodeInLaunchComponent,
            resolve: {
              node: NodeFromLaunchResolver,
            },
            children: [
              {
                path: "",
                redirectTo: "outputs",
                pathMatch: "full",
              },
              {
                path: "outputs",
                component: NodeOutputsComponent,
              },
              {
                path: "inputs",
                component: NodeInputsComponent,
              },
              {
                path: "state",
                component: NodeStateComponent,
              },
              {
                path: "logs",
                component: LaunchLogsComponent,
              },
              {
                path: "jobs",
                component: NodeJobsComponent,
              },
            ],
          },
          {
            path: "logs",
            outlet: "right",
            component: LaunchLogsComponent,
          },
          {
            path: "outputs",
            component: LaunchOutputsPageComponent,
          },
          {
            path: "nested",
            component: LaunchesPageComponent,
            resolve: {
              filter: NestedLaunchesFilterResolver,
            },
          },
          {
            path: "messages",
            resolve: {
              filter: LaunchMessagesFilterResolver,
            },
            component: PipelineMessagesComponent,
          },
        ],
      },
      {
        matcher: projectIdMatcher,
        component: ProjectComponent,
        data: { fullBleed: true },
        canActivate: [SigninNeededGuard],
        canDeactivate: [SaveProjectGuard],
        resolve: {
          project: ProjectResolver,
        },
        runGuardsAndResolvers: "pathParamsChange",
        children: [
          {
            path: "artefacts",
            component: ProjectArtefactsComponent,
          },
          {
            path: "environment",
            resolve: {
              environment: GlobalEnvironmentResolver,
            },
            component: EditPipelineEnvironmentComponent,
          },
          {
            path: "yaml",
            component: EditPipelineYamlComponent,
          },
          {
            path: "design",
            component: EditPipelineDesignComponent,
          },
          {
            path: "deploy",
            component: DeployPipelineComponent,
            children: [
              {
                path: ":slug",
                resolve: {
                  deploy: DeployResolver,
                },
                component: PlayViaApiComponent,
                data: { dialogLabel: CALL_VIA_API_LABEL },
              },
              {
                path: ":prefix/:slug",
                resolve: {
                  deploy: DeployResolver,
                },
                component: PlayViaApiComponent,
                data: { dialogLabel: CALL_VIA_API_LABEL },
              },
            ],
          },
          {
            path: "launches",
            component: LaunchesPageComponent,
            resolve: {
              filter: LaunchesFilterResolver,
            },
            children: [
              {
                path: "outputs/:id",
                component: LaunchOutputsPageComponent,
                resolve: {
                  launch: LaunchResolver,
                },
                data: { dialogLabel: LAUNCH_OUTPUTS_LABEL },
              },
            ],
          },
          {
            path: "stats",
            component: ProjectStatsComponent,
          },
          {
            path: "node-updates",
            component: UpdatePipelineNodesComponent,
          },
          {
            path: "assets",
            component: ProjectAssetsComponent,
          },
          {
            path: "",
            component: EditPipelineVisualComponent,
            data: {
              editable: true,
              runs: true,
            },
            resolve: {
              launches: LaunchesResolver,
            },
            runGuardsAndResolvers: "pathParamsChange",
            children: [
              {
                path: "launches/:id",
                resolve: {
                  launch: LaunchResolver,
                },
                outlet: "right",
                children: [
                  {
                    path: "nodes/:id",
                    component: NodeInLaunchComponent,
                    resolve: {
                      node: NodeFromLaunchResolver,
                    },
                    children: [
                      {
                        path: "",
                        redirectTo: "outputs",
                        pathMatch: "full",
                      },
                      {
                        path: "outputs",
                        component: NodeOutputsComponent,
                      },
                      {
                        path: "inputs",
                        component: NodeInputsComponent,
                      },
                      {
                        path: "state",
                        component: NodeStateComponent,
                      },
                      {
                        path: "logs",
                        component: LaunchLogsComponent,
                      },
                      {
                        path: "jobs",
                        component: NodeJobsComponent,
                      },
                    ],
                  },
                ],
              },
              {
                path: "add-node",
                component: SelectNodeComponent,
                outlet: "left",
              },
              {
                path: "assistant",
                component: AssistantComponent,
                outlet: "bottom",
              },
              {
                path: "apps/:id",
                component: NodeAppComponent,
                resolve: {
                  node: NodeFromProjectResolver,
                },
              },
              {
                path: "nodes/:id",
                component: EditNodeInputsComponent,
                outlet: "right",
                resolve: {
                  node: NodeFromProjectResolver,
                },
              },
              {
                path: "nodes/:id/edit",
                component: EditNodeComponent,
                resolve: {
                  node: NodeFromProjectResolver,
                },
                children: [
                  {
                    path: "script",
                    component: EditNodeScriptComponent,
                  },
                  {
                    path: "app",
                    component: EditNodeAppComponent,
                  },
                  {
                    path: "yaml",
                    component: EditNodeYamlComponent,
                  },
                  {
                    path: "catalog",
                    component: EditNodeCatalogComponent,
                  },
                  {
                    path: "environment",
                    component: EditNodeEnvironmentComponent,
                  },
                  {
                    path: "",
                    component: EditNodeDesignComponent,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        path: "projects",
        component: ProjectsComponent,
        canActivate: [SigninNeededGuard],
        children: [
          {
            path: "new",
            component: CreateProjectComponent,
            data: {
              dialogLabel: $localize`:@@label.new_project:New project`,
              // the new project form is short
              dialogSize: "s",
            },
          },
          {
            path: "import",
            component: ImportProjectComponent,
            data: {
              dialogLabel: $localize`:@@label.import_pipeline:Import a Pipeline (YAML or URL)`,
            },
          },
        ],
      },
      {
        path: "assets",
        component: AssetsComponent,
        canActivate: [SigninNeededGuard],
      },
      {
        path: "environment",
        component: EnvironmentComponent,
        canActivate: [SigninNeededGuard],
        resolve: {
          environment: GlobalEnvironmentResolver,
        },
      },
      {
        path: "launches",
        component: LaunchesPageComponent,
        resolve: {
          filter: AllLaunchesFilterResolver,
        },
        canActivate: [SigninNeededGuard],
        children: [
          {
            path: "outputs/:id",
            component: LaunchOutputsPageComponent,
            resolve: {
              launch: LaunchResolver,
            },
            data: { dialogLabel: LAUNCH_OUTPUTS_LABEL },
          },
        ],
      },
      {
        path: "packages",
        component: NodePackagesComponent,
        children: [
          {
            path: "add",
            component: EditPackageComponent,
            data: {
              dialogLabel: $localize`:@@label.new_package:New package`,
            },
          },
          {
            path: "import",
            component: ImportPackageComponent,
            data: {
              dialogLabel: $localize`:@@label.import_package:Import package`,
            },
          },
          {
            path: ":package/export",
            resolve: {
              nodePackage: NodePackageResolver,
            },
            component: ExportPackageComponent,
            data: {
              dialogLabel: ({ nodePackage }: Data) =>
                titled(
                  $localize`:@@label.export_package:Export package`,
                  nodePackage?.title,
                ),
            },
          },
          {
            path: ":package",
            component: EditPackageComponent,
            resolve: {
              nodePackage: NodePackageResolver,
            },
            data: {
              dialogLabel: ({ nodePackage }: Data) =>
                titled(
                  $localize`:@@label.edit_package:Edit package`,
                  nodePackage?.title,
                ),
            },
          },
        ],
      },
      {
        path: "users",
        component: UsersComponent,
        children: [
          {
            path: "add",
            component: EditUserComponent,
            data: { dialogLabel: $localize`:@@label.create_user:Create user` },
          },
          {
            path: ":user",
            component: EditUserComponent,
            resolve: {
              user: UserResolver,
            },
            data: {
              dialogLabel: ({ user }: Data) =>
                named($localize`:@@label.edit_user:Edit user`, user?._id),
            },
          },
        ],
      },
      {
        path: "**",
        redirectTo: "/projects",
      },
    ],
  },
];

@NgModule({
  imports: [
    AppModule,
    RouterModule.forRoot(routes, {
      paramsInheritanceStrategy: "always",
    }),
  ],
  bootstrap: [AppComponent],
})
export class AppRoutingModule {}
