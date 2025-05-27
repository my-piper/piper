import { NgModule } from "@angular/core";
import { RouterModule, Routes, UrlSegment } from "@angular/router";
import { AddNodeComponent } from "src/app/add-node/add-node.component";
import { AppComponent } from "src/app/app.component";
import { AppModule } from "src/app/app.module";
import { DeployPipelineComponent } from "src/app/deploy-pipeline/deploy-pipeline.component";
import { EditNodeComponent } from "src/app/edit-node/edit-node.component";
import { EditPipelineInputComponent } from "src/app/edit-pipeline-input/edit-pipeline-input.component";
import { EditPipelineVisualComponent } from "src/app/edit-pipeline-visual/edit-pipeline-visual.component";
import { EditPipelineYamlComponent } from "src/app/edit-pipeline-yaml/edit-pipeline-yaml.component";
import { LaunchComponent } from "src/app/launch/launch.component";
import { NodeStateComponent } from "src/app/node-state/node-state.component";
import { ProjectComponent } from "src/app/project/project.component";
import { ProjectsComponent } from "src/app/projects/projects.component";
import { AnonymousGuard } from "src/guards/anonymous.guard";
import { ShouldCheckReadmeGuard } from "src/guards/pipeline-readme";
import { SigninNeededGuard } from "src/guards/signin.guard";
import { AssetsFilterResolver } from "src/resolvers/assets-filter";
import { DeployResolver } from "src/resolvers/deploy";
import { LaunchResolver } from "src/resolvers/launch";
import { LaunchMessagesFilterResolver } from "src/resolvers/launch-messages-filter";
import {
  AllLaunchesFilterResolver,
  LaunchesFilterResolver,
  NestedLaunchesFilterResolver,
  ProjectPlaygroundLaunchesFilterResolver,
} from "src/resolvers/launches-filter";
import { MeEnvironmentResolver } from "src/resolvers/me-environment";
import {
  NodeFromLaunchResolver,
  NodeFromProjectResolver,
} from "src/resolvers/node";
import { NodePackageResolver } from "src/resolvers/node-package";
import { PipelineInputFromProjectResolver } from "src/resolvers/pipeline";
import { ProjectResolver } from "src/resolvers/project";
import { ProjectMessagesFilterResolver } from "src/resolvers/project-messages-filter";
import { TagResolver } from "src/resolvers/tags";
import { UserResolver } from "src/resolvers/user";
import { AssetsPageComponent } from "./assets-page/assets-page.component";
import { BatchesComponent } from "./batches/batches.component";
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
import { BalanceRefillsComponent } from "./expenses/balance-refills/balance-refills.component";
import { ExpensesComponent } from "./expenses/expenses.component";
import { PipelineUsagesComponent } from "./expenses/pipeline-usages/pipeline-usages.component";
import { LaunchOutputsPageComponent } from "./launch-outputs-page/launch-outputs-page.component";
import { LaunchesPageComponent } from "./launches-page/launches-page.component";
import { AppLayoutComponent } from "./layout/layout.component";
import { NodeInLaunchComponent } from "./node-in-launch/node-in-launch.component";
import { NodeIOComponent } from "./node-io/node-io.component";
import { NodeJobsComponent } from "./node-jobs/node-jobs.component";
import { EditPackageComponent } from "./node-packages/edit/edit-package.component";
import { ExportPackageComponent } from "./node-packages/export/export-package.component";
import { ImportPackageComponent } from "./node-packages/import/import-package.component";
import { NodePackagesComponent } from "./node-packages/node-packages.component";
import { PipelineMessagesComponent } from "./pipeline-messages/pipeline-messages.component";
import { PipelineReadmeComponent } from "./pipeline-readme/pipeline-readme.component";
import { PlayViaApiComponent } from "./play-via-api/play-via-api.component";
import { PlayWithProjectComponent } from "./play-with-project/play-with-project.component";
import { PlaygroundComponent } from "./playground/playground.component";
import { ProjectCommentsComponent } from "./project-comments/project-comments.component";
import { ImportProjectComponent } from "./projects/import/import-project.component";
import { SelectPlaygroundPageComponent } from "./select-playground-page/select-playground-page.component";
import { LoginComponent } from "./signin/login.component";
import { SigupComponent } from "./signup/signup.component";
import { EditUserComponent } from "./users/edit/edit-user.component";
import { UsersComponent } from "./users/users.component";

export function projectIdMatcher(
  segments: UrlSegment[]
): { consumed: UrlSegment[]; posParams: { [key: string]: UrlSegment } } | null {
  if (
    segments.length >= 2 &&
    segments[0].path === "projects" &&
    segments[1].path !== "import"
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
  {
    path: "play",
    component: PlaygroundComponent,
    children: [
      {
        path: "",
        pathMatch: "full",
        resolve: {
          tag: TagResolver,
        },
        component: SelectPlaygroundPageComponent,
      },
      {
        path: ":id",
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
            component: EditPipelineVisualComponent,
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
              },
            ],
          },
        ],
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
    matcher: projectIdMatcher,
    component: ProjectComponent,
    canActivate: [SigninNeededGuard],
    resolve: {
      project: ProjectResolver,
    },
    children: [
      {
        path: "readme/edit",
        component: EditPipelineReadmeComponent,
        children: [
          {
            path: "view",
            component: PipelineReadmeComponent,
          },
        ],
      },
      {
        path: "readme",
        component: PipelineReadmeComponent,
      },
      {
        path: "yaml",
        component: EditPipelineYamlComponent,
      },
      {
        path: "script",
        component: EditPipelineScriptComponent,
      },
      {
        path: "design",
        component: EditPipelineDesignComponent,
      },
      {
        path: "deploy",
        component: DeployPipelineComponent,
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
          },
        ],
      },
      {
        path: "environment",
        resolve: {
          environment: MeEnvironmentResolver,
        },
        component: EditPipelineEnvironmentComponent,
      },
      {
        path: "messages",
        resolve: {
          filter: ProjectMessagesFilterResolver,
        },
        component: PipelineMessagesComponent,
      },
      {
        path: "assets",
        resolve: {
          filter: AssetsFilterResolver,
        },
        component: AssetsPageComponent,
      },
      {
        path: "launches/:id",
        component: LaunchComponent,
        resolve: {
          launch: LaunchResolver,
        },
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
                component: NodeIOComponent,
              },
              {
                path: "state",
                component: NodeStateComponent,
              },
              {
                path: "jobs",
                component: NodeJobsComponent,
              },
            ],
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
        path: "",
        component: EditPipelineVisualComponent,
        data: {
          readonly: false,
        },
        children: [
          {
            path: "add-node",
            component: AddNodeComponent,
          },
          {
            path: "nodes/:id",
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
                path: "design",
                component: EditNodeDesignComponent,
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
                component: EditNodeInputsComponent,
              },
            ],
          },
          {
            path: "inputs/:id",
            component: EditPipelineInputComponent,
            resolve: {
              input: PipelineInputFromProjectResolver,
            },
          },
        ],
      },
    ],
  },
  {
    path: "",
    component: AppLayoutComponent,
    children: [
      {
        path: "projects",
        component: ProjectsComponent,
        canActivate: [SigninNeededGuard],
        children: [
          {
            path: "import",
            component: ImportProjectComponent,
          },
        ],
      },
      {
        path: "assets",
        component: AssetsPageComponent,
        canActivate: [SigninNeededGuard],
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
          },
        ],
      },
      {
        path: "launches/:id",
        component: LaunchComponent,
        resolve: {
          launch: LaunchResolver,
        },
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
                component: NodeIOComponent,
              },
              {
                path: "state",
                component: NodeStateComponent,
              },
              {
                path: "jobs",
                component: NodeJobsComponent,
              },
            ],
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
        path: "packages",
        component: NodePackagesComponent,
        children: [
          {
            path: "add",
            component: EditPackageComponent,
          },
          {
            path: "import",
            component: ImportPackageComponent,
          },
          {
            path: ":package/export",
            resolve: {
              nodePackage: NodePackageResolver,
            },
            component: ExportPackageComponent,
          },
          {
            path: ":package",
            component: EditPackageComponent,
            resolve: {
              nodePackage: NodePackageResolver,
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
          },
          {
            path: ":user",
            component: EditUserComponent,
            resolve: {
              user: UserResolver,
            },
          },
        ],
      },
      {
        path: "expenses",
        component: ExpensesComponent,
        children: [
          {
            path: "",
            pathMatch: "full",
            component: PipelineUsagesComponent,
          },
          {
            path: "refills",
            component: BalanceRefillsComponent,
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
