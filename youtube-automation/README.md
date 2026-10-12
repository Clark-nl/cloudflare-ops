# YouTube upload automation

Uploads videos with the YouTube Data API v3 after a one-time login. Same
pattern as `../tiktok-automation/`: you log in once, then uploads run with
no further prompts.

## Limits to know first

- **Uploads stay private until Google audits your project.** Videos uploaded
  through an unverified Google Cloud project (created after 28 July 2020)
  are forced to private. Switch them to public by hand in YouTube Studio,
  or apply for the YouTube API compliance audit to lift this.
- **Daily quota.** Projects get 10,000 quota units a day by default, and
  each upload costs a large share of it. Check the current cost per
  `videos.insert` in Google's quota calculator before scheduling bulk uploads.
- **Kids and AI labels.** `--made-for-kids` sets the COPPA flag; leave it off
  for parent-facing content. Uploads are marked as altered/synthetic media by
  default because our videos are AI-generated.

## One-time setup (you do this)

1. In https://console.cloud.google.com/ create a project and enable
   **YouTube Data API v3**.
2. Configure the OAuth consent screen (External) and add your own Google
   account as a test user.
3. Create an OAuth client ID of type **Desktop app**.
4. `cp .env.example .env` and fill in `YOUTUBE_CLIENT_ID` and
   `YOUTUBE_CLIENT_SECRET`.
5. On your own machine (needs a browser and normal internet access):
   `python3 oauth_setup.py`, then approve in the browser with the Google
   account that owns the channel. This saves `YOUTUBE_REFRESH_TOKEN` to `.env`.

## Upload

```
python3 upload_video.py "<video_url_or_path>" \
  --title "낮잠 재우려다 공연을 보게 됐다 #Shorts" \
  --description "..." \
  --tags 육아공감,낮잠,해달 \
  --privacy public
```

Vertical videos up to 3 minutes are classified as Shorts automatically.
`.env` is git-ignored; never commit it.
