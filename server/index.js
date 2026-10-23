import express from "express";
import session from "express-session";
import multer from "multer";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { sceneSchema } from "../shared/scene.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
fs.mkdirSync(data, { recursive: true, mode: 0o700 });
fs.mkdirSync(path.join(data, "uploads"), { recursive: true });
fs.mkdirSync(path.join(data, "exports"), { recursive: true });
function retainedSecret(name) {
  const f = path.join(data, name);
  if (!fs.existsSync(f))
    fs.writeFileSync(f, randomBytes(32).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(f, "utf8").trim();
}
const password =
  process.env.STUDIO_PASSWORD || retainedSecret("admin-password");
const db = new DatabaseSync(path.join(data, "studio.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,scene TEXT NOT NULL,updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,name TEXT,mime TEXT,file TEXT); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,status TEXT,file TEXT,error TEXT); CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,value TEXT,expires INTEGER);",
);
db.exec(
  "UPDATE jobs SET status='failed',error='El servidor se reinició durante la exportación' WHERE status IN ('queued','rendering')",
);
class Store extends session.Store {
  get(id, cb) {
    try {
      const r = db
        .prepare("SELECT value FROM sessions WHERE id=? AND expires>?")
        .get(id, Date.now());
      cb(null, r ? JSON.parse(r.value) : null);
    } catch (e) {
      cb(e);
    }
  }
  set(id, v, cb) {
    try {
      db.prepare("INSERT OR REPLACE INTO sessions VALUES(?,?,?)").run(
        id,
        JSON.stringify(v),
        Date.now() + 86400000,
      );
      cb?.();
    } catch (e) {
      cb?.(e);
    }
  }
  destroy(id, cb) {
    db.prepare("DELETE FROM sessions WHERE id=?").run(id);
    cb?.();
  }
}
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== `${req.protocol}://${req.get("host")}`
  )
    return res.status(403).json({ error: "Origen no permitido" });
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || retainedSecret("session-secret"),
    store: new Store(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "1",
      maxAge: 86400000,
    },
  }),
);
app.get("/api/health", (_, res) => res.json({ ok: true }));
const attempts = new Map();
app.post("/api/login", (req, res) => {
  const ip = req.ip;
  const v = attempts.get(ip) || { count: 0, until: Date.now() + 600000 };
  if (v.until < Date.now()) {
    v.count = 0;
    v.until = Date.now() + 600000;
  }
  if (v.count >= 10)
    return res
      .status(429)
      .json({ error: "Demasiados intentos. Espera 10 minutos." });
  const hash = (s) => createHash("sha256").update(String(s)).digest();
  if (!timingSafeEqual(hash(req.body.password || ""), hash(password))) {
    v.count++;
    attempts.set(ip, v);
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }
  attempts.delete(ip);
  req.session.regenerate((e) => {
    if (e) return res.status(500).json({ error: "No se pudo iniciar sesión" });
    req.session.auth = true;
    res.json({ ok: true });
  });
});
app.use("/api", (req, res, next) =>
  req.session.auth ? next() : res.status(401).json({ error: "Inicia sesión" }),
);
app.post("/api/logout", (req, res) =>
  req.session.destroy(() => res.json({ ok: true })),
);
app.get("/api/status", (_, res) =>
  res.json({ openai: !!process.env.OPENAI_API_KEY }),
);
app.get("/api/projects", (_, res) =>
  res.json(
    db
      .prepare("SELECT id,scene,updated FROM projects ORDER BY updated DESC")
      .all()
      .map((r) => ({ ...r, scene: JSON.parse(r.scene) })),
  ),
);
app.put("/api/projects/:id", (req, res) => {
  if (!/^[\w-]{1,80}$/.test(req.params.id))
    return res.status(400).json({ error: "ID inválido" });
  const scene = sceneSchema.parse(req.body);
  const updated = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO projects VALUES(?,?,?)").run(
    req.params.id,
    JSON.stringify(scene),
    updated,
  );
  res.json({ id: req.params.id, updated });
});
app.delete("/api/projects/:id", (req, res) => {
  db.prepare("DELETE FROM projects WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
const types = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
};
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(data, "uploads"),
    filename: (_, f, cb) => cb(null, randomUUID() + types[f.mimetype]),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_, f, cb) =>
    cb(
      types[f.mimetype] ? null : new Error("Formato no admitido"),
      !!types[f.mimetype],
    ),
});
app.post("/api/assets", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Falta archivo" });
  const id = randomUUID();
  db.prepare("INSERT INTO assets VALUES(?,?,?,?)").run(
    id,
    req.file.originalname,
    req.file.mimetype,
    req.file.filename,
  );
  res.json({ id, name: req.file.originalname, mime: req.file.mimetype });
});
app.get("/api/assets", (_, res) =>
  res.json(db.prepare("SELECT id,name,mime FROM assets").all()),
);
app.get("/api/assets/:id", (req, res) => {
  const a = db.prepare("SELECT * FROM assets WHERE id=?").get(req.params.id);
  if (!a) return res.sendStatus(404);
  res.type(a.mime).sendFile(path.join(data, "uploads", a.file));
});
app.post("/api/generate", async (req, res) => {
  if (!process.env.OPENAI_API_KEY)
    return res
      .status(503)
      .json({
        error: "Configura OPENAI_API_KEY en el servidor para generar escenas.",
      });
  const prompt = req.body.prompt;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000)
    return res
      .status(400)
      .json({ error: "Escribe un prompt de hasta 4000 caracteres" });
  try {
    const response = await new OpenAI({
      timeout: 60000,
      maxRetries: 1,
    }).chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Genera una escena motion graphics como JSON sin código. Esquema exacto: {name:string,width:960,height:540,fps:30,duration:150,background:"#111427",layers:[{id:string,name:string,type:"text"|"shape",text:string,assetId:"",color:"#d7fd62",fontSize:80,width:500,height:150,start:0,end:150,visible:true,keyframes:[{frame:0,x:80,y:140,opacity:0,scale:1,rotation:0},{frame:30,x:80,y:120,opacity:1,scale:1,rotation:0}]}]}. Duración 150 frames, 1 a 8 capas. Coordenadas en píxeles. Keyframes ordenados entre 0 y 149, colores hex de seis dígitos. Diseña una composición legible y animada.`,
        },
        { role: "user", content: prompt },
      ],
    });
    res.json(
      sceneSchema.parse(JSON.parse(response.choices[0].message.content)),
    );
  } catch (e) {
    console.error("Generation failed:", e.name);
    res
      .status(502)
      .json({
        error:
          "No se pudo generar la escena. Revisa conexión, modelo y credenciales.",
      });
  }
});
let bundlePromise;
let queue = Promise.resolve();
const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    c.stderr.on("data", (d) => (err = (err + d).slice(-3000)));
    c.on("error", reject);
    c.on("close", (n) => (n ? reject(new Error(err)) : resolve()));
  });
async function render(id, scene, format) {
  db.prepare("UPDATE jobs SET status='rendering' WHERE id=?").run(id);
  try {
    bundlePromise ??= bundle({
      entryPoint: path.join(root, "src/remotion.jsx"),
    }).catch((e) => {
      bundlePromise = undefined;
      throw e;
    });
    const serveUrl = await bundlePromise;
    const assets = {};
    for (const l of scene.layers) {
      if (!["image", "video", "audio"].includes(l.type)) continue;
      const a = db.prepare("SELECT * FROM assets WHERE id=?").get(l.assetId);
      if (!a) throw new Error("Recurso no encontrado");
      assets[l.assetId] =
        `data:${a.mime};base64,${fs.readFileSync(path.join(data, "uploads", a.file)).toString("base64")}`;
    }
    const inputProps = { scene, assets, transparent: format === "mov" };
    const browserExecutable = process.env.CHROME_PATH || "/usr/bin/chromium";
    const composition = await selectComposition({
      serveUrl,
      id: "MotionScene",
      inputProps,
      browserExecutable,
    });
    const outputLocation = path.join(data, "exports", `${id}.${format}`);
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      browserExecutable,
      outputLocation:
        format === "gif" ? `${outputLocation}.mp4` : outputLocation,
      codec: format === "mov" ? "prores" : format === "webm" ? "vp8" : "h264",
      ...(format === "mov"
        ? {
            proResProfile: "4444",
            pixelFormat: "yuva444p10le",
            imageFormat: "png",
          }
        : {}),
      concurrency: 2,
      chromiumOptions: { enableMultiProcessOnLinux: true },
    });
    if (format === "gif") {
      await run("ffmpeg", [
        "-y",
        "-i",
        `${outputLocation}.mp4`,
        "-filter_complex",
        "[0:v]split[a][b];[a]palettegen[p];[b][p]paletteuse",
        "-loop",
        "0",
        outputLocation,
      ]);
      fs.unlinkSync(`${outputLocation}.mp4`);
    }
    db.prepare("UPDATE jobs SET status='done',file=? WHERE id=?").run(
      `${id}.${format}`,
      id,
    );
  } catch (e) {
    console.error("Render failed:", e.message);
    db.prepare("UPDATE jobs SET status='failed',error=? WHERE id=?").run(
      "No se pudo renderizar. Revisa los recursos y el registro del servidor.",
      id,
    );
  }
}
app.post("/api/exports", (req, res) => {
  const scene = sceneSchema.parse(req.body.scene),
    format = req.body.format;
  if (!["mp4", "webm", "gif", "mov"].includes(format))
    return res.status(400).json({ error: "Formato inválido" });
  if (
    db
      .prepare(
        "SELECT count(*) n FROM jobs WHERE status IN ('queued','rendering')",
      )
      .get().n >= 3
  )
    return res
      .status(429)
      .json({ error: "Cola llena. Espera una exportación." });
  const id = randomUUID();
  db.prepare("INSERT INTO jobs(id,status) VALUES(?,?)").run(id, "queued");
  queue = queue.then(() => render(id, scene, format));
  res.status(202).json({ id, status: "queued" });
});
app.get("/api/exports/:id", (req, res) => {
  const j = db
    .prepare("SELECT id,status,error FROM jobs WHERE id=?")
    .get(req.params.id);
  j ? res.json(j) : res.sendStatus(404);
});
app.get("/api/exports/:id/download", (req, res) => {
  const j = db.prepare("SELECT * FROM jobs WHERE id=?").get(req.params.id);
  if (j?.status !== "done") return res.sendStatus(404);
  res.download(path.join(data, "exports", j.file));
});
app.use(express.static(path.join(root, "dist")));
app.get("/{*path}", (_, res) =>
  res.sendFile(path.join(root, "dist/index.html")),
);
app.use((e, req, res, next) =>
  res
    .status(
      e.name === "ZodError" || e instanceof multer.MulterError ? 400 : 500,
    )
    .json({
      error:
        e.name === "ZodError"
          ? "Escena inválida"
          : e instanceof multer.MulterError
            ? e.message
            : "Error al procesar la solicitud",
    }),
);
app.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      "Hera Video escuchando en puerto " + (process.env.PORT || 3000),
    ),
);
