# あなたの今日どうでしたか

多摩美術大学「構造設計 / Webアプリケーション制作」の Dynamic Web Form。

## Local

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Deployment

This repository is prepared for a Node.js hosting service such as Railway.

Environment variables:

- `PORT`: hosting service usually sets this automatically.
- `DB_PATH`: SQLite file path. For persistent hosting, mount a volume and set e.g. `/data/responses.sqlite`.
- `ADMIN_TOKEN`: secret used to download the collected SQLite database.

If `ADMIN_TOKEN` is configured, download the submitted SQLite database from:

`/admin/database?token=YOUR_TOKEN`

`responses.sqlite` is ignored by Git so collected responses are not published in the repository.
