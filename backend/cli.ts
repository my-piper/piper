import "reflect-metadata";

import cli from "app/cli";

import "cli/debug";
import "cli/environment";
import "cli/migrations";
import "cli/modules";
import "cli/packages";
import "cli/pipelines";
import "cli/schemas";
import "cli/users";
import "cli/workers";

cli.parse(process.argv);
