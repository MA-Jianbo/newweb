import express from "express";
import { fileURLToPath } from "node:url";
import { db, dbPath } from "./db.mjs";

const app = express();
const publicDir = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = "0.0.0.0";

app.use(express.urlencoded({ extended: false, limit: "10kb" }));

app.get("/", (req, res) => {
  res.sendFile(`${publicDir}/index.html`);
});

app.get("/health", (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS total FROM responses").get().total;
  res.json({ ok: true, responses: Number(total) });
});

const insertResponse = db.prepare(`
  INSERT INTO responses (
    morning_share, afternoon_share, night_share, day_scale,
    morning_color, afternoon_color, night_color, answer_date, is_test
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

app.post("/responses", (req, res) => {
  const data = req.body ?? {};
  const fields = ["morning_share", "afternoon_share", "night_share", "day_scale"];
  const validNumber = (value) =>
    typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));

  if (!fields.every((field) => validNumber(data[field]))) {
    return res.status(400).json({ saved: false, error: "時間の数値が正しくありません。" });
  }

  const morning = Number(data.morning_share);
  const afternoon = Number(data.afternoon_share);
  const night = Number(data.night_share);
  const scale = Number(data.day_scale);
  const shareSum = morning + afternoon + night;
  const validColor = (value) =>
    typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
  const isTest = data.is_test === "1" ? 1 : data.is_test === "0" ? 0 : null;
  const validDate = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

  if (
    [morning, afternoon, night].some((n) => n <= 0 || n >= 1) ||
    Math.abs(shareSum - 1) > 0.001 ||
    scale < 0.5 ||
    scale > 1.3 ||
    !validColor(data.morning_color) ||
    !validColor(data.afternoon_color) ||
    !validColor(data.night_color) ||
    !validDate(data.answer_date) ||
    isTest === null
  ) {
    return res.status(400).json({ saved: false, error: "回答の値を確認してください。" });
  }

  try {
    const result = insertResponse.run(
      morning,
      afternoon,
      night,
      scale,
      data.morning_color,
      data.afternoon_color,
      data.night_color,
      data.answer_date,
      isTest
    );
    return res.status(201).json({ saved: true, id: Number(result.lastInsertRowid) });
  } catch (error) {
    console.error("SQLite の保存エラー:", error);
    return res.status(500).json({ saved: false, error: "データベースへの保存に失敗しました。" });
  }
});

app.get("/admin/database", (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || req.query.token !== adminToken) {
    return res.status(404).send("Not found");
  }
  return res.download(dbPath, "responses.sqlite");
});

app.use(express.static(publicDir));

app.listen(port, host, () => {
  console.log(`Web server started on port ${port}`);
});
