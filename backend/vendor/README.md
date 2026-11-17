# vendor

`buffer-equal-constant-time` replaces the npm package of the same name through
`overrides` in `../package.json`. Upstream 1.0.1 (a dependency of `jwa`, used by
`jsonwebtoken` and `google-auth-library`) reads `SlowBuffer.prototype` when it
loads, and Node 25 removed `SlowBuffer`. Drop the override once `jwa` stops
depending on it.
