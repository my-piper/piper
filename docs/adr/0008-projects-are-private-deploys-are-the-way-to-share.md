# Projects are private; a Deploy is the only way to share a Pipeline

A Project used to have a visibility: private, shared or public. Public Projects formed a catalog (the "Apps" page at `/play`, sorted by an admin-set order, with tags and categories rebuilt by an admin "Organize" action), any logged-in user could open and launch them, and others could clone them. Shared was offered in the UI but never granted access. We removed visibility altogether: every Project lives in its owner's account, only the owner and admins can open or launch it, and anyone else uses a Pipeline by calling its Deploy with the Deploy's link and an access token.

We considered keeping Public and dropping only the broken Shared option. We chose one sharing path instead, because a Deploy already freezes the Pipeline and carries its own access and concurrency rules, while a public Project exposed a draft that its owner could change under its users.

## Consequences

- Users lose access to other users' public Projects. To keep offering one, its owner deploys it and hands out the Deploy.
- The project `slug`, `order` and `category`, the `projectTags` and `projectCategories` collections, clone (`POST /api/projects/:_id/clone`), Organize (`POST /api/projects/organize`), the catalog tags (`GET /api/projects/tags`), categories (`GET /api/projects/categories`) and the settings route (`POST /api/projects/:_id`) are gone. A migration removes the stored fields and collections; it has no down step, so the data is gone once it runs (take a backup first if it may be needed). Projects are addressed by `_id` only, so old `/play/<slug>` links return 404.
- Project lists, folders, tags and stats show only the current user's own Projects, for admins too. Admins can still open another user's Project by its URL.
