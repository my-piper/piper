# Node scripts get no native code and no host environment

Node scripts run in the Deno service without `--allow-ffi` and without access to that service's own environment, even signed Package Nodes. Loading a native library (such as `sharp`, which wraps libvips) puts code outside Deno's permissions: it can read any file or variable, including the Package Registry token in `DENO_AUTH_TOKENS`. A signed Node runs in the server's own process, so that code could also read the Variables of other users' Launches running at the same time. A script never needs the host environment, as Piper sends a Node's Variables in the payload. A process-isolated script also inherits only `PATH`, `HOME` and `DENO_DIR` and can't read `/proc`, where `/proc/self/environ` would give that environment back as a file.

## Considered Options

- **FFI for signed Package Nodes only.** Rejected: they run in the shared server process, so one native dependency would see every concurrent Launch.
- **FFI in a separate pool that runs one Node per process with no secrets.** Kept as the way to add native code if it becomes necessary. It needs its own service and capacity, and nothing needs it yet.
- **Image work without native code** (chosen): imagescript or a WebAssembly build of libvips inside the script, or a service outside the sandbox (imgproxy, ArtWorks `run-ffmpeg` tasks).

## Consequences

- Nodes ported from Piper v1 replace `sharp` (see the `import-v1-pipeline` skill's rewrite rules).
- A worker shares the server's process, so `/proc/self/environ` still shows a signed Node the server's environment. Both modes still read every other file too, such as Docker secrets under `/run/secrets`. Closing that means narrowing read permission to the paths scripts need.
- An unsigned Node whose script lives in the Package Registry can't load it any more: its process has no registry token. Only paths that skip the sign check can produce one.
