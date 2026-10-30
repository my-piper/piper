import { Authorization } from "api/users/models/authorization";
import { toPlain } from "core-kit/packages/transform";

export function redirect(authorization: Authorization) {
  return `
  <html>
          <head>
          <title>Redirecting...</title>
          <script>
              // Mirrors the frontend theme (THEME_KEY in frontend/src/consts/core.ts).
              (function () {
                  var mode = localStorage.getItem('theme');
                  var light = mode === 'light' || (mode !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches);
                  document.documentElement.dataset.theme = light ? 'light' : 'dark';
              })();
          </script>
          <style>
              html { color-scheme: dark; }
              html[data-theme='light'] { color-scheme: light; }
              body { font-family: sans-serif; }
          </style>
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
