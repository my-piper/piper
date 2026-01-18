import "reflect-metadata";

import cli from "app/cli";

import "cli/debug";
import "cli/environment";
import "cli/migrations";
import "cli/packages";
import "cli/pipelines";
import "cli/schemas";
import "cli/users";

cli.parse(process.argv);
