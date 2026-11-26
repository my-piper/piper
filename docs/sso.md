# Single sign-on (OIDC)

Piper signs users in through any OpenID Connect provider; the team uses
Authentik. Password login keeps working next to it. The design is in #204.

## How it works

- The `oauth` process serves `GET /oauth/oidc` and `/oauth/oidc/callback`
  when `OIDC_AUTH=yes` (`backend/packages/oauth/oidc`). It uses
  `openid-client`: issuer discovery, authorization code with PKCE, and a
  `state` and `nonce` kept single-use in Redis. The `state` is also set as an
  HttpOnly `oidc_state` cookie, and the callback only accepts the state from
  the browser that started the flow.
- The callback signs in (`backend/packages/users/oidc-sign-in.ts`):
  - a user with an identity `(oidc, sub)` is signed in, and the identity's
    email is refreshed (the Piper user's own email never changes);
  - an email that already belongs to a Piper account is refused with
    `sso_account_exists`; that user signs in with the password and connects
    SSO from the profile;
  - otherwise a user is created, only when the ID token says
    `email_verified: true`. Its login comes from `preferred_username` (or the
    email's local part), without roles or a password.
- The browser gets the same Piper token as a password login. Errors redirect
  to `/en/login?error=<code>`.
- Who may sign in is decided by the provider (Authentik application
  bindings). Roles are assigned in Piper by an admin. Disabling a user in the
  provider does not end a Piper session that is already open.

## Configuration

| Variable | Meaning |
| --- | --- |
| `OIDC_AUTH` | `yes` mounts the routes and shows the sign-in button |
| `OIDC_ISSUER` | Issuer URL; discovery reads `<issuer>/.well-known/openid-configuration`. Plain HTTP is accepted on `localhost` only |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Confidential client credentials |
| `OIDC_LABEL` | Button text: "Sign in with {label}" (default `SSO`) |

`BASE_URL` gives the redirect URI: `${BASE_URL}/oauth/oidc/callback`.

## Authentik in production

1. **Provider**: Applications → Providers → OAuth2/OpenID Provider.
   - Client type: confidential. Copy the client ID and secret into
     `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`.
   - Redirect URI (strict): `${BASE_URL}/oauth/oidc/callback`.
   - Scopes: `openid`, `profile` and an email mapping that returns
     `email_verified: true` for emails you trust. Authentik's default email
     mapping always returns `false`, and Piper then refuses to create
     accounts. `tools/compose/authentik/piper.yaml` has such a mapping.
   - Signing key: any RSA certificate (the default self-signed one works).
2. **Application** with this provider; its slug is in the issuer:
   `https://<authentik>/application/o/<slug>/`.
3. **Bindings** on the application decide who may sign in to Piper (for
   example, a group binding). Without bindings every Authentik user can.

## Local development

`make up-sso` starts the usual infrastructure plus Authentik
(`tools/compose`, profile `sso`) on `http://localhost:9080`. The blueprint
`tools/compose/authentik/piper.yaml` creates the provider, application and
email mapping, and the test user `jane` / `piper-local-password`. The admin
is `akadmin` with the same password.

Set the `OIDC_*` block of `backend/.env.template` in `backend/.env` with
`OIDC_AUTH=yes`, run the `oauth` process (`make run-oauth`) and open
`http://localhost/oauth/oidc`. The first start of Authentik takes about a
minute.
