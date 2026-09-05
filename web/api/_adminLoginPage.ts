/** Self-contained HTML the middleware serves in place of the SPA on an
 *  unauthenticated /admin request. It cannot import React, CSS modules, or
 *  anything else from src/ (Edge Middleware bundles this file alone), so the
 *  site's dark/monospace look is hand-matched here from web/src/styles/tokens.css
 *  and AdminPage.module.css rather than shared with them directly. */
export function renderAdminLoginPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>Admin sign in: BUTTON / RDDT</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: #080808;
    color: #f2efe8;
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    width: 100%;
    max-width: 380px;
    border: 1px solid #2a2a2a;
    background: #0e0e0e;
    padding: 32px 28px;
  }
  .eyebrow {
    color: #ef2b24;
    font-size: 9px;
    font-weight: 800;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: .12em;
  }
  h1 { margin: 6px 0 0; font-size: 28px; letter-spacing: -.04em; line-height: 1; }
  p.lede { margin: 12px 0 0; color: #8c8982; font-size: 12.5px; line-height: 1.55; }
  form { margin-top: 24px; display: flex; flex-direction: column; gap: 14px; }
  label {
    display: block;
    color: #77746e;
    font: 700 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    letter-spacing: .1em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  input {
    width: 100%;
    background: #0c0c0c;
    border: 1px solid #333;
    color: #ddd;
    padding: 10px 12px;
    font: 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  input:focus { outline: none; border-color: #ef2b24; }
  button {
    margin-top: 4px;
    border: 1px solid #3a3a3a;
    background: #171717;
    color: #ddd;
    padding: 12px;
    font: 800 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    letter-spacing: .08em;
    cursor: pointer;
  }
  button:hover:not(:disabled) { border-color: #ef2b24; color: #ef2b24; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .error {
    display: none;
    margin-top: 4px;
    color: #ef2b24;
    font: 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    letter-spacing: .02em;
  }
  .error.visible { display: block; }
  .back {
    display: inline-block;
    margin-top: 22px;
    color: #6f6c65;
    font-size: 11px;
    text-decoration: none;
  }
  .back:hover { color: #ddd; }
</style>
</head>
<body>
  <div class="card">
    <span class="eyebrow">ADMIN</span>
    <h1>Sign in.</h1>
    <p class="lede">Operator controls only. If you're here to press the button, it's back through the front door.</p>
    <form id="login-form">
      <div>
        <label for="username">Username</label>
        <input id="username" name="username" type="text" autocomplete="username" required autofocus />
      </div>
      <div>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
      </div>
      <div id="error" class="error" role="alert"></div>
      <button type="submit" id="submit">SIGN IN</button>
    </form>
    <a class="back" href="/">&larr; RETURN TO THE BUTTON</a>
  </div>
  <script>
    (function () {
      var form = document.getElementById("login-form");
      var errorBox = document.getElementById("error");
      var submitButton = document.getElementById("submit");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        errorBox.className = "error";
        submitButton.disabled = true;
        submitButton.textContent = "SIGNING IN…";
        fetch("/api/admin-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: document.getElementById("username").value,
            password: document.getElementById("password").value
          })
        })
          .then(function (res) {
            if (res.ok) {
              window.location.reload();
              return;
            }
            return res.json().catch(function () { return {}; }).then(function (data) {
              errorBox.textContent = data.error === "ADMIN_AUTH_NOT_CONFIGURED"
                ? "Admin sign in isn't configured on this deployment."
                : "Wrong username or password.";
              errorBox.className = "error visible";
              submitButton.disabled = false;
              submitButton.textContent = "SIGN IN";
            });
          })
          .catch(function () {
            errorBox.textContent = "Couldn't reach the server. Try again.";
            errorBox.className = "error visible";
            submitButton.disabled = false;
            submitButton.textContent = "SIGN IN";
          });
      });
    })();
  </script>
</body>
</html>`;
}
