import test from "node:test";
import assert from "node:assert/strict";
import { initialScene, poseAt, sceneSchema } from "../shared/scene.js";
test("escena inicial y animación interpolada", () => {
  const s = sceneSchema.parse(initialScene());
  assert.equal(poseAt(s.layers[1].keyframes, 12.5).opacity, 0.5);
  assert.equal(poseAt(s.layers[1].keyframes, 100).opacity, 1);
});
test("rechaza intervalos, claves duplicadas y colores no seguros", () => {
  let s = initialScene();
  s.layers[0].end = 200;
  assert.equal(sceneSchema.safeParse(s).success, false);
  s = initialScene();
  s.layers[0].keyframes.reverse();
  assert.equal(sceneSchema.safeParse(s).success, false);
  s = initialScene();
  s.background = "url(https://example.com)";
  assert.equal(sceneSchema.safeParse(s).success, false);
});
