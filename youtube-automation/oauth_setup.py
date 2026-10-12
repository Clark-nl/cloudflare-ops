#!/usr/bin/env python3
"""
One-time YouTube OAuth setup (Google "installed app" loopback flow + PKCE).

Run ONCE on your own machine with a browser. It saves a refresh token to
.env so upload_video.py can run unattended afterward.

Prerequisites (Google Cloud Console, https://console.cloud.google.com/):
  1. Create a project and enable "YouTube Data API v3".
  2. OAuth consent screen: External, add your own Google account as a
     test user (or publish the app).
  3. Credentials -> Create OAuth client ID -> type "Desktop app".
  4. Put the client ID / secret into .env (see .env.example).

Usage:
  cp .env.example .env   # fill in YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET
  python3 oauth_setup.py
"""
import base64
import hashlib
import http.server
import json
import os
import secrets
import sys
import urllib.parse
import urllib.request

ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")
SCOPE = "https://www.googleapis.com/auth/youtube.upload"
PORT = 8788


def load_env():
    env = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    return env


def save_env(updates):
    env = load_env()
    env.update(updates)
    with open(ENV_PATH, "w") as f:
        for k, v in env.items():
            f.write(f"{k}={v}\n")


def main():
    env = load_env()
    client_id = env.get("YOUTUBE_CLIENT_ID")
    client_secret = env.get("YOUTUBE_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("Missing YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET in .env (copy .env.example first).")
        sys.exit(1)

    redirect_uri = f"http://127.0.0.1:{PORT}"
    state = secrets.token_hex(16)
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(40)).rstrip(b"=").decode()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()

    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })
    print("\nOpen this URL in your browser, choose the YouTube channel's Google account, and approve:\n")
    print(auth_url)
    print(f"\nWaiting for the redirect on {redirect_uri} ...\n")

    result = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            code = qs.get("code", [None])[0]
            ok = code and qs.get("state", [None])[0] == state
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            if ok:
                result["code"] = code
                self.wfile.write("Authorized. You can close this tab.".encode())
            else:
                self.wfile.write("Auth failed or state mismatch. Check the terminal.".encode())

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    while "code" not in result:
        server.handle_request()
    server.server_close()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=urllib.parse.urlencode({
            "client_id": client_id,
            "client_secret": client_secret,
            "code": result["code"],
            "code_verifier": verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())

    if "refresh_token" not in data:
        print("No refresh token returned:", {k: v for k, v in data.items() if k != "access_token"})
        sys.exit(1)

    save_env({"YOUTUBE_REFRESH_TOKEN": data["refresh_token"]})
    print(f"Done. Refresh token saved to {ENV_PATH}. upload_video.py can now run unattended.")


if __name__ == "__main__":
    main()
