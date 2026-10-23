import { z } from "zod";
export const keySchema = z.object({
  frame: z.number().int().min(0).max(18000),
  x: z.number().min(-4000).max(4000),
  y: z.number().min(-4000).max(4000),
  opacity: z.number().min(0).max(1),
  scale: z.number().min(0).max(10),
  rotation: z.number().min(-3600).max(3600),
});
export const sceneSchema = z
  .object({
    name: z.string().min(1).max(120),
    width: z.number().int().min(64).max(1920),
    height: z.number().int().min(64).max(1920),
    fps: z.number().int().min(12).max(60),
    duration: z.number().int().min(1).max(1800),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layers: z
      .array(
        z.object({
          id: z.string().max(80),
          name: z.string().max(100),
          type: z.enum(["text", "shape", "image", "video", "audio"]),
          text: z.string().max(1000),
          assetId: z.string().max(100),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          fontSize: z.number().min(8).max(300),
          width: z.number().min(1).max(1920),
          height: z.number().min(1).max(1920),
          start: z.number().int().min(0).max(1800),
          end: z.number().int().min(1).max(1800),
          visible: z.boolean(),
          keyframes: z.array(keySchema).min(1).max(200),
        }),
      )
      .max(50),
  })
  .superRefine((s, c) => {
    if (new Set(s.layers.map((l) => l.id)).size !== s.layers.length)
      c.addIssue({ code: "custom", message: "IDs duplicados" });
    for (const l of s.layers) {
      if (l.end <= l.start || l.end > s.duration)
        c.addIssue({ code: "custom", message: "Intervalo de capa inválido" });
      if (
        l.keyframes.some(
          (k, i) =>
            k.frame >= s.duration || (i && k.frame <= l.keyframes[i - 1].frame),
        )
      )
        c.addIssue({
          code: "custom",
          message: "Keyframes fuera de rango o desordenados",
        });
    }
  });
export function poseAt(keys, frame) {
  if (frame <= keys[0].frame) return keys[0];
  const b = keys.find((k) => k.frame >= frame);
  if (!b) return keys.at(-1);
  const a = keys[keys.indexOf(b) - 1],
    t = (frame - a.frame) / (b.frame - a.frame);
  return Object.fromEntries(
    ["x", "y", "opacity", "scale", "rotation"].map((p) => [
      p,
      a[p] + (b[p] - a[p]) * t,
    ]),
  );
}
export const newLayer = (type = "text") => ({
  id: crypto.randomUUID(),
  name: type === "text" ? "Nuevo texto" : "Forma",
  type,
  text: "MAKE IT MOVE",
  assetId: "",
  color: "#d7fd62",
  fontSize: 80,
  width: 500,
  height: 150,
  start: 0,
  end: 150,
  visible: true,
  keyframes: [{ frame: 0, x: 230, y: 185, opacity: 1, scale: 1, rotation: 0 }],
});
export const initialScene = () => ({
  name: "Una idea en movimiento",
  width: 960,
  height: 540,
  fps: 30,
  duration: 150,
  background: "#111427",
  layers: [
    {
      ...newLayer("shape"),
      id: "shape-1",
      name: "Órbita violeta",
      color: "#7957ef",
      width: 240,
      height: 240,
      keyframes: [
        { frame: 0, x: 650, y: 150, opacity: 0.8, scale: 0.5, rotation: 0 },
        { frame: 149, x: 620, y: 100, opacity: 1, scale: 1.3, rotation: 180 },
      ],
    },
    {
      ...newLayer(),
      id: "title-1",
      name: "Título principal",
      text: "Ideas que\ncobran vida.",
      width: 700,
      height: 240,
      keyframes: [
        { frame: 0, x: 80, y: 160, opacity: 0, scale: 0.9, rotation: 0 },
        { frame: 25, x: 80, y: 140, opacity: 1, scale: 1, rotation: 0 },
      ],
    },
  ],
});
