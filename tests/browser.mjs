import { chromium } from "@playwright/test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const data = mkdtempSync(path.join(tmpdir(), "hera-browser-"));
const base = "http://127.0.0.1:3102";
const server = spawn(process.execPath, ["server/index.js"], {
  env: { ...process.env, DATA_DIR: data, PORT: "3102", HOST: "127.0.0.1", STUDIO_PASSWORD: "", OPENAI_API_KEY: "", COOKIE_SECURE: "0", TRUST_PROXY: "0" },
  stdio: ["ignore", "ignore", "inherit"],
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("El servidor de pruebas no arrancó");
  browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page
    .locator("input[type=password]")
    .fill(readFileSync(path.join(data, "admin-password"), "utf8").trim());
  await page.getByRole("button", { name: /Entrar al estudio/ }).click();
  await page.getByText("Propiedades", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.getByLabel("Texto", { exact: true }).fill("Prueba de navegador");
  await page.getByRole("button", { name: /Añadir keyframe/ }).click();
  await page.getByLabel("Posición de reproducción").fill("60");
  await page.getByLabel("Posición X", { exact: true }).fill("140");
  await page.getByLabel("Nombre del proyecto").fill("Prueba persistente UI");
  await page.getByText("Guardado", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/motion-studio-editor.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .getByLabel("Abrir proyecto")
    .selectOption({ label: "Prueba persistente UI" });
  await page.getByLabel("Nombre del proyecto").waitFor();
  assert.equal(
    await page.getByLabel("Nombre del proyecto").inputValue(),
    "Prueba persistente UI",
  );
  await page.getByRole("button", { name: "Recursos", exact: true }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "sample.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await page.getByRole("alert").waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Browser: login, editing, keyframes, autosave, reload, asset rejection passed",
  );
} finally {
  await browser?.close();
}
} finally {
  server.kill();
  if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
  rmSync(data, { recursive: true, force: true });
}
