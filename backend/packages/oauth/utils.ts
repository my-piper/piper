import { Authorization } from "api/users/models/authorization";
import { toPlain } from "core-kit/packages/transform";

export function redirect(authorization: Authorization) {
  return `
  <html>
          <head>
          <title>Redirecting...</title>
          </head>
          <body>
              <script>
                  localStorage.setItem('authorization', '${JSON.stringify(toPlain(authorization))}');
                  setTimeout(()=> location.href = '/', 1000);
              </script>
              <p>Redirecting...</p>
          </body>
  </html>
  `;
}
