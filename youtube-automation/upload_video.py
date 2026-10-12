#!/usr/bin/env python3
"""
Automated YouTube upload (YouTube Data API v3, resumable upload) using the
refresh token saved by oauth_setup.py.

IMPORTANT: Google locks uploads from unverified API projects (created after
28 July 2020) to private. Until your Cloud project passes YouTube's API
compliance audit, every upload becomes "private" no matter what --privacy
says; you can switch it to public by hand in YouTube Studio. This script
cannot bypass that.

Usage:
  python3 upload_video.py <video_url_or_path> \\
      --title "..." --description "..." --tags 육아공감,해달 \\
      --privacy private|unlisted|public \\
      [--made-for-kids] [--not-synthetic]
"""
import argparse
import json
import os
import sys
import tempfile
import urllib.parse
import urllib.request

ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")


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


def access_token(env):
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=urllib.parse.urlencode({
            "client_id": env["YOUTUBE_CLIENT_ID"],
            "client_secret": env["YOUTUBE_CLIENT_SECRET"],
            "refresh_token": env["YOUTUBE_REFRESH_TOKEN"],
            "grant_type": "refresh_token",
        }).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())["access_token"]


def local_file(src):
    if os.path.exists(src):
        return src, False
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    with urllib.request.urlopen(src) as resp:
        tmp.write(resp.read())
    tmp.close()
    return tmp.name, True


def upload(src, title, description, tags, privacy, made_for_kids, synthetic):
    env = load_env()
    missing = [k for k in ("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN") if not env.get(k)]
    if missing:
        sys.exit(f"Missing from .env: {', '.join(missing)}. Run oauth_setup.py first.")

    token = access_token(env)
    path, is_temp = local_file(src)
    size = os.path.getsize(path)

    metadata = {
        "snippet": {"title": title, "description": description, "tags": tags, "categoryId": "22"},
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": made_for_kids,
            "containsSyntheticMedia": synthetic,
        },
    }
    init = urllib.request.Request(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        data=json.dumps(metadata).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/mp4",
            "X-Upload-Content-Length": str(size),
        },
        method="POST",
    )
    with urllib.request.urlopen(init) as resp:
        upload_url = resp.headers["Location"]

    with open(path, "rb") as f:
        put = urllib.request.Request(
            upload_url, data=f.read(),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "video/mp4"},
            method="PUT",
        )
    with urllib.request.urlopen(put) as resp:
        video = json.loads(resp.read().decode())
    if is_temp:
        os.unlink(path)

    status = video.get("status", {})
    print(f"Uploaded: https://youtu.be/{video['id']}  privacy={status.get('privacyStatus')}")
    if privacy != "private" and status.get("privacyStatus") == "private":
        print("Note: YouTube forced this to private (unverified API project). Make it public in YouTube Studio.")
    return video


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--title", required=True)
    p.add_argument("--description", default="")
    p.add_argument("--tags", default="")
    p.add_argument("--privacy", default="private", choices=["private", "unlisted", "public"])
    p.add_argument("--made-for-kids", action="store_true")
    p.add_argument("--not-synthetic", action="store_true", help="Only if the video is genuinely not AI-generated or altered.")
    a = p.parse_args()
    upload(a.video, a.title, a.description, [t for t in a.tags.split(",") if t],
           a.privacy, a.made_for_kids, not a.not_synthetic)


if __name__ == "__main__":
    main()
