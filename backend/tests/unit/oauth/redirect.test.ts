import { Authorization } from "api/users/models/authorization";
import { User } from "models/user";
import { redirect } from "packages/oauth/utils";
import { describe, expect, it } from "vitest";

describe("OAuth hand-over page", () => {
  it("stores the authorization without letting its values break out of the script", () => {
    const email = "x'</script><script>alert(1)</script>@example.com";
    const authorization = new Authorization({
      token: "token",
      user: new User({ _id: "jane", email }),
    });

    const html = redirect(authorization);

    expect(html).not.toContain("</script><script>");
    const [, literal] = html.match(/setItem\('authorization', (".*?")\);/s);
    expect(JSON.parse(JSON.parse(literal))).toEqual({
      token: "token",
      user: { _id: "jane", email },
    });
  });
});
