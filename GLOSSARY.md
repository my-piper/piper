# Piper

Piper is a visual builder for AI pipelines: users compose Nodes on a canvas, try them in the Playground, and deploy them as APIs.

## Language

### Authoring

**Project**:
What a user owns and edits. It holds a draft Pipeline.
_Avoid_: Workspace, app

**Node Definition**:
A reusable kind of Node, published in a Node Package: its inputs, outputs and script.
_Avoid_: Node type, template

**Node**:
A Node Definition placed in a Pipeline, with its own inputs and position.
_Avoid_: Step, block, task

**Node Package**:
A versioned, published collection of Node Definitions that users add to their Pipelines.
_Avoid_: Plugin, library, module

**Pipeline**:
A graph of Nodes joined by Flows. It has no identity of its own and always belongs to a Project, a Deploy or a Launch.
_Avoid_: Workflow, graph

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
