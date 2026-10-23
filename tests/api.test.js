import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initialScene } from "../shared/scene.js";
const dir = mkdtempSync(path.join(tmpdir(), "motion-test-"));
const base = "http://127.0.0.1:3101";
let cookie = "";
let server;
let logs = "";
const start = async () => {
  server = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: "3101",
      DATA_DIR: dir,
      STUDIO_PASSWORD: "integration-only-password",
      OPENAI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => (logs += d));
  server.stdout.on("data", (d) => (logs += d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(logs);
};
const req = (p, options = {}) =>
  fetch(base + "/api" + p, {
    ...options,
    headers: { cookie, "content-type": "application/json", ...options.headers },
  });
const login = async () => {
  const r = await req("/login", {
    method: "POST",
    body: JSON.stringify({ password: "integration-only-password" }),
  });
  assert.equal(r.status, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
};
test(
  "acceso privado, persistencia, recursos, OpenAI pendiente y 4 exportaciones reales",
  { timeout: 240000 },
  async (t) => {
    try {
      await start();
      assert.equal((await req("/projects")).status, 401);
      assert.equal(
        (await req("/login", { method: "POST", body: '{"password":"wrong"}' }))
          .status,
        401,
      );
      await login();
      const s = initialScene();
      s.width = 128;
      s.height = 128;
      s.duration = 12;
      s.fps = 12;
      s.layers = s.layers
        .slice(0, 1)
        .map((l) => ({
          ...l,
          width: 50,
          height: 50,
          start: 0,
          end: 12,
          keyframes: [
            { frame: 0, x: 32, y: 32, scale: 1, rotation: 0, opacity: 1 },
          ],
        }));
      assert.equal(
        (
          await req("/projects/test", {
            method: "PUT",
            body: JSON.stringify(s),
          })
        ).status,
        200,
      );
      assert.equal(
        (await req("/projects/bad", { method: "PUT", body: "{}" })).status,
        400,
      );
      assert.equal(
        (await req("/generate", { method: "POST", body: '{"prompt":"hello"}' }))
          .status,
        503,
      );
      assert.equal(
        (
          await req("/exports", {
            method: "POST",
            headers: { origin: "https://attacker.example" },
            body: JSON.stringify({ scene: s, format: "mp4" }),
          })
        ).status,
        403,
      );
      const form = new FormData();
      form.append(
        "file",
        new Blob(
          [
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
              "base64",
            ),
          ],
          { type: "image/png" },
        ),
        "pixel.png",
      );
      const up = await fetch(base + "/api/assets", {
        method: "POST",
        headers: { cookie },
        body: form,
      });
      assert.equal(up.status, 200);
      const a = await up.json();
      assert.equal((await req("/assets/" + a.id)).status, 200);
      await t.test("render con imagen, vídeo y audio importados", async () => {
        const mediaScene = structuredClone(s);
        for (const [type, mime, ext, args] of [
          [
            "image",
            "image/png",
            "png",
            ["-f", "lavfi", "-i", "color=c=red:s=32x32", "-frames:v", "1"],
          ],
          [
            "video",
            "video/mp4",
            "mp4",
            [
              "-f",
              "lavfi",
              "-i",
              "color=c=blue:s=32x32:r=12",
              "-t",
              "1",
              "-pix_fmt",
              "yuv420p",
            ],
          ],
          [
            "audio",
            "audio/wav",
            "wav",
            ["-f", "lavfi", "-i", "sine=frequency=440:duration=1"],
          ],
        ]) {
          const f = path.join(dir, "fixture." + ext);
          execFileSync("ffmpeg", ["-v", "error", "-y", ...args, f]);
          const form = new FormData();
          form.append(
            "file",
            new Blob([readFileSync(f)], { type: mime }),
            "fixture." + ext,
          );
          const response = await fetch(base + "/api/assets", {
            method: "POST",
            headers: { cookie },
            body: form,
          });
          assert.equal(response.status, 200);
          const a = await response.json();
          mediaScene.layers.push({
            ...structuredClone(s.layers[0]),
            id: type,
            type,
            assetId: a.id,
            width: 32,
            height: 32,
            keyframes: [
              { frame: 0, x: 10, y: 10, opacity: 1, scale: 1, rotation: 0 },
            ],
          });
        }
        const r = await req("/exports", {
          method: "POST",
          body: JSON.stringify({ scene: mediaScene, format: "mp4" }),
        });
        assert.equal(r.status, 202);
        let j = await r.json();
        for (
          let i = 0;
          i < 600 && !["done", "failed"].includes(j.status);
          i++
        ) {
          await new Promise((r) => setTimeout(r, 200));
          j = await (await req("/exports/" + j.id)).json();
        }
        assert.equal(j.status, "done", logs);
        const response = await req("/exports/" + j.id + "/download");
        const f = path.join(dir, "with-assets.mp4");
        writeFileSync(f, Buffer.from(await response.arrayBuffer()));
        const probe = JSON.parse(
          execFileSync(
            "ffprobe",
            ["-v", "quiet", "-show_streams", "-of", "json", f],
            { encoding: "utf8" },
          ),
        );
        assert.ok(probe.streams.some((s) => s.codec_type === "audio"));
      });
      for (const format of ["mp4", "webm", "gif", "mov"])
        await t.test("render " + format, async () => {
          const r = await req("/exports", {
            method: "POST",
            body: JSON.stringify({ scene: s, format }),
          });
          assert.equal(r.status, 202);
          let j = await r.json();
          for (
            let i = 0;
            i < 1000 && !["done", "failed"].includes(j.status);
            i++
          ) {
            await new Promise((r) => setTimeout(r, 200));
            j = await (await req("/exports/" + j.id)).json();
          }
          assert.equal(j.status, "done", logs);
          const dl = await req("/exports/" + j.id + "/download");
          assert.equal(dl.status, 200);
          const f = path.join(dir, "check." + format);
          writeFileSync(f, Buffer.from(await dl.arrayBuffer()));
          const probe = JSON.parse(
            execFileSync(
              "ffprobe",
              ["-v", "quiet", "-show_streams", "-of", "json", f],
              { encoding: "utf8" },
            ),
          );
          const v = probe.streams.find((x) => x.codec_type === "video");
          assert.equal(v.width, 128);
          assert.equal(v.height, 128);
          if (format === "mov") {
            assert.equal(v.codec_name, "prores");
            assert.match(v.pix_fmt, /a/);
            const alpha = execFileSync("ffmpeg", [
              "-v",
              "error",
              "-i",
              f,
              "-vf",
              "alphaextract",
              "-frames:v",
              "1",
              "-f",
              "rawvideo",
              "-pix_fmt",
              "gray",
              "pipe:1",
            ]);
            assert.equal(alpha[0], 0);
            assert.ok(alpha[64 * 128 + 64] > 240);
          }
        });
      server.kill();
      await new Promise((r) => server.once("exit", r));
      await start();
      assert.equal(
        (await req("/projects")).status,
        200,
        "session retained after restart",
      );
      const projects = await (await req("/projects")).json();
      assert.equal(projects[0].scene.name, s.name);
      assert.equal((await (await req("/assets")).json()).length, 4);
      await req("/logout", { method: "POST" });
      assert.equal((await req("/projects")).status, 401);
    } finally {
      server?.kill();
      await new Promise((r) => setTimeout(r, 100));
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
