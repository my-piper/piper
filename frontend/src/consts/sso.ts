/** Results of the single sign-on flows, as the oauth process reports them. */
export const SSO_LINKED = "linked";

/** The message for an `sso_*` error code from `/en/login?error=` or `?sso=`. */
export function ssoErrorMessage(code: string, label: string): string {
  switch (code) {
    case "sso_account_exists":
      return $localize`:@@message.sso_account_exists:An account with this email already exists. Sign in with your password, then connect ${label}:label: under Connected accounts in the account menu.`;
    case "sso_linked_elsewhere":
      return $localize`:@@message.sso_linked_elsewhere:This ${label}:label: account is already connected to another user.`;
    case "sso_already_connected":
      return $localize`:@@message.sso_already_connected:Another ${label}:label: account is already connected. Disconnect it first.`;
    default:
      return $localize`:@@message.sso_failed:Single sign-on with ${label}:label: failed. Please try again.`;
  }
}
