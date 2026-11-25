# Piper

Piper is a visual builder for AI pipelines: users compose Nodes on a canvas, try them in the Playground, and deploy them as APIs.

## Language

### Authoring

**Project**:
What a user owns and edits. It holds a draft Pipeline. Only its owner (and admins) can open it; anyone else uses its Pipeline through a Deploy.
_Avoid_: Workspace, app, shared project, public project

**Folder**:
A named place in the Projects list that holds Projects and other Folders. A Project is in at most one Folder; one in none sits at the top of the list.
_Avoid_: Group, directory, category

**Tag**:
A label on a Project. A Project can have many, and picking Tags narrows the Projects list to the Projects that have all of them.
_Avoid_: Label, keyword

**Localized Text**:
A title, description or README in a Pipeline or Node Package that can carry a version per language. Piper shows its English version; the other versions stay in the text untouched.
_Avoid_: Translation, i18n string

**Node Definition**:
A reusable kind of Node, published in a Node Package: its inputs, outputs and script.
_Avoid_: Node type, template

**Node**:
A Node Definition placed in a Pipeline, with its own inputs and position.
_Avoid_: Step, block, task

**Node Package**:
A versioned, published collection of Node Definitions that users add to their Pipelines. Once a version is published, its code never changes; a fix is a new version.
_Avoid_: Plugin, library, module

**Package Archive**:
A zip that an admin uploads to publish one version of a Node Package. It carries the package's description, every Node Definition and either their code with its shared helpers or references to published scripts.
_Avoid_: Bundle, plugin file

**Script Override**:
An edited script belonging to one Node in a Pipeline. It leaves the published Node Definition unchanged.
_Avoid_: Package patch, package edit

**Script Node**:
A Node whose inputs, outputs and script are written by the user who places it, rather than taken from a Node Package. Every user can place one without installing anything. Each one stands alone: reusing it means publishing a Node Package.
_Avoid_: Custom node, code node, builtin node

**Isolated Node**:
A Node that runs in its own process, apart from the Launches running at the same time. A Node runs isolated only when someone marks it so; a Node Definition can carry the mark, and each Node in a Pipeline can turn it on or off.
_Avoid_: Sandboxed node, untrusted node, unsigned node

**Package Registry**:
Where Piper keeps the code of every published Node Package version, and where Nodes load it from when they run.
_Avoid_: CDN, repository, package store

**Pipeline**:
A graph of Nodes joined by Flows. It has no identity of its own and always belongs to a Project, a Deploy or a Launch.
_Avoid_: Workflow, graph

**Start Node**:
A Node that runs as soon as a Launch of its Pipeline begins, without waiting for an upstream Node. Any Node can be made a Start Node or stop being one.
_Avoid_: Entry node, trigger, first node

**Featured Input**:
A Node input shown on the Node's card on the canvas, where a Flow can be attached to it. Any other input is edited only in the Node's side panel. An input fed by a Flow takes its value from that Flow instead of the value set in the panel.
_Avoid_: Port, pinned input, exposed input

### Serving

**Deploy**:
A frozen copy of a Project's Pipeline, served as an API under a slug.
_Avoid_: Deployment, release, endpoint

### Running

**Playground**:
The place where a user tries a Project by launching it and reviewing its Launches and outputs.
_Avoid_: Sandbox, test run

**Launch**:
One run of a Pipeline. It records the Project or Deploy it was started from, and it keeps its own copy of the Pipeline, so later edits do not change it.
_Avoid_: Run, execution, job

**Child Launch**:
A Launch that a Node of another Launch started from a Deploy. It runs for the same user and is part of its Parent Launch: it fails the Node that started it, and stops when its Parent Launch is interrupted.
_Avoid_: Nested launch, sub-pipeline, sub-launch

**Parent Launch**:
The Launch whose Node started a Child Launch.
_Avoid_: Outer launch, root launch

### Configuration

**Environment**:
Named values that Nodes read when they run, such as API keys and endpoints. A Node declares each Variable it needs by name.
_Avoid_: Env, config, settings

**Variable**:
One value in an Environment, made of a name, a type (string, number or boolean) and the value itself. A Variable has no title of its own. Renaming a Variable keeps its value; no two Variables in one Environment share a name.
_Avoid_: Env var, setting, key

**Secret Variable**:
A string Variable whose value is never shown again once it is saved; it can only be replaced. Every string Variable is a Secret Variable unless it is made a Visible Variable. Turning a Secret Variable into a Visible Variable without giving a new value removes it, so a stored secret can never be revealed.
_Avoid_: Hidden variable, masked variable, encrypted variable

**Visible Variable**:
A string Variable whose value is shown to anyone who can see its Environment.
_Avoid_: Plain variable, public variable

**Global Environment**:
The one Environment shared by every Project. Everyone can see it, but only admins edit it. Every Project Variable is bound to it unless the Project overrides that Variable.
_Avoid_: Platform environment, user environment, system environment, shared environment

**Project Environment**:
One Variable for each name its Nodes declare, each either a Bound Variable or an Overridden Variable.
_Avoid_: Pipeline environment, local environment

**Bound Variable**:
A Project Variable that reads its value from a Global Variable, by default the one of the same name, though it may name another. It has no value of its own, and when that Global Variable is missing it stays unset.
_Avoid_: Linked variable, alias, reference, inherited variable

**Overridden Variable**:
A Project Variable with its own value, which the Project uses instead of the Global Environment. A Deploy keeps the value it had when it was made.
_Avoid_: Local variable, project secret
