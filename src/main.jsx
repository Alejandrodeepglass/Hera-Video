import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import {
  Layers,
  Plus,
  Play,
  Download,
  Sparkles,
  Upload,
  Eye,
  EyeOff,
  Trash2,
  Diamond,
  LogOut,
  Film,
  ChevronRight,
  Save,
} from "lucide-react";
import { Scene } from "./Composition";
import { initialScene, newLayer, poseAt, sceneSchema } from "../shared/scene";
import "./style.css";
async function api(url, options = {}) {
  const r = await fetch("/api" + url, {
    ...options,
    headers:
      options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json", ...options.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Error de conexión");
  return data;
}
function App() {
  const [auth, setAuth] = useState(false),
    [password, setPassword] = useState(""),
    [scene, setScene] = useState(initialScene),
    [projects, setProjects] = useState([]),
    [id, setId] = useState(() => crypto.randomUUID()),
    [selected, setSelected] = useState("title-1"),
    [frame, setFrame] = useState(0),
    [tab, setTab] = useState("layers"),
    [assets, setAssets] = useState([]),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState("Sin guardar"),
    [format, setFormat] = useState("mp4"),
    [job, setJob] = useState(null),
    [ai, setAi] = useState(false);
  const player = useRef(),
    importRef = useRef(),
    history = useRef([]),
    loaded = useRef(false);
  const layer = scene.layers.find((l) => l.id === selected),
    pose = layer ? poseAt(layer.keyframes, frame) : null;
  const tell = (e) => setMessage(e.message || String(e));
  async function refresh() {
    const [p, a, s] = await Promise.all([
      api("/projects"),
      api("/assets"),
      api("/status"),
    ]);
    setProjects(p);
    setAssets(a);
    setAi(s.openai);
    setAuth(true);
  }
  useEffect(() => {
    refresh().catch(() => {});
  }, []);
  useEffect(() => {
    if (!auth) return;
    const p = player.current;
    if (!p) return;
    const fn = (e) => setFrame(e.detail.frame);
    p.addEventListener("frameupdate", fn);
    return () => p.removeEventListener("frameupdate", fn);
  }, [auth]);
  useEffect(() => {
    if (!auth || !loaded.current) return;
    setSaved("Guardando…");
    const t = setTimeout(
      () =>
        save().catch((e) => {
          setSaved("Error al guardar");
          tell(e);
        }),
      900,
    );
    return () => clearTimeout(t);
  }, [scene, id, auth]);
  useEffect(() => {
    if (!job || ["done", "failed"].includes(job.status)) return;
    const t = setInterval(
      () =>
        api("/exports/" + job.id)
          .then(setJob)
          .catch(tell),
      1200,
    );
    return () => clearInterval(t);
  }, [job]);
  function change(next) {
    history.current.push(scene);
    if (history.current.length > 50) history.current.shift();
    loaded.current = true;
    setScene(next);
  }
  function edit(patch) {
    change({
      ...scene,
      layers: scene.layers.map((l) =>
        l.id === selected ? { ...l, ...patch } : l,
      ),
    });
  }
  function keyEdit(prop, value) {
    const k = { ...pose, frame, [prop]: Number(value) };
    edit({
      keyframes: [...layer.keyframes.filter((k) => k.frame !== frame), k].sort(
        (a, b) => a.frame - b.frame,
      ),
    });
  }
  function seek(f) {
    const n = Math.max(0, Math.min(scene.duration - 1, Number(f)));
    setFrame(n);
    player.current?.seekTo(n);
  }
  async function save() {
    await api("/projects/" + id, {
      method: "PUT",
      body: JSON.stringify(scene),
    });
    setSaved("Guardado");
    const p = await api("/projects");
    setProjects(p);
  }
  function add(type, asset) {
    const l = {
      ...newLayer(type),
      end: scene.duration,
      ...(asset ? { assetId: asset.id, name: asset.name } : {}),
    };
    change({ ...scene, layers: [...scene.layers, l] });
    setSelected(l.id);
  }
  async function upload(file) {
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const a = await api("/assets", { method: "POST", body: form });
      setAssets([...assets, a]);
      add(
        a.mime.startsWith("image")
          ? "image"
          : a.mime.startsWith("video")
            ? "video"
            : "audio",
        a,
      );
    } catch (e) {
      tell(e);
    }
  }
  async function generate() {
    setBusy(true);
    try {
      const s = await api("/generate", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      change(sceneSchema.parse(s));
      setSelected(s.layers[0]?.id);
      seek(0);
      setMessage("Escena generada. Puedes editar cada capa.");
    } catch (e) {
      tell(e);
    } finally {
      setBusy(false);
    }
  }
  if (!auth)
    return (
      <div className="login">
        <div className="login-card">
          <div className="logo">
            <Film /> HERA<span>VIDEO AI</span>
          </div>
          <h1>
            Tu próxima gran idea
            <br />
            empieza en movimiento.
          </h1>
          <p>Estudio privado de motion graphics</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/login", {
                  method: "POST",
                  body: JSON.stringify({ password }),
                });
                setPassword("");
                await refresh();
              } catch (e) {
                tell(e);
              }
            }}
          >
            <label>
              Contraseña del estudio
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary">
              Entrar al estudio <ChevronRight size={16} />
            </button>
          </form>
          <small>
            {message || "Acceso seguro · Tus proyectos, en tu espacio"}
          </small>
        </div>
        <div className="login-art">
          <div className="orb" />
          <b>
            MAKE
            <br />
            IT MOVE<span>✳</span>
          </b>
        </div>
      </div>
    );
  return (
    <div className="app">
      <header>
        <div className="logo">
          <Film size={24} /> HERA<span>VIDEO AI</span>
        </div>
        <span className="private">● Espacio privado</span>
        <div className="header-right">
          <span className="save-state">{saved}</span>
          <button onClick={() => save().catch(tell)} title="Guardar">
            <Save size={16} />
          </button>
          <select
            aria-label="Formato de exportación"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {["mp4", "webm", "gif", "mov"].map((f) => (
              <option key={f} value={f}>
                {f === "mov" ? "MOV · transparente" : f.toUpperCase()}
              </option>
            ))}
          </select>
          <button
            className="primary"
            onClick={async () => {
              try {
                setJob(
                  await api("/exports", {
                    method: "POST",
                    body: JSON.stringify({ scene, format }),
                  }),
                );
              } catch (e) {
                tell(e);
              }
            }}
          >
            <Download size={15} /> Exportar
          </button>
          <button
            title="Cerrar sesión"
            onClick={() =>
              api("/logout", { method: "POST" }).then(() => {
                setAuth(false);
                loaded.current = false;
              })
            }
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="project-title">
            <small>PROYECTO ACTUAL</small>
            <input
              aria-label="Nombre del proyecto"
              value={scene.name}
              onChange={(e) => change({ ...scene, name: e.target.value })}
            />
            <select
              aria-label="Abrir proyecto"
              value=""
              onChange={(e) => {
                const p = projects.find((p) => p.id === e.target.value);
                if (p) {
                  loaded.current = false;
                  setId(p.id);
                  setScene(p.scene);
                  setSelected(p.scene.layers[0]?.id);
                  seek(0);
                }
              }}
            >
              <option value="">Abrir proyecto guardado…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.scene.name}
                </option>
              ))}
            </select>
            <button
              className="text-button"
              onClick={() => {
                setId(crypto.randomUUID());
                change(initialScene());
                seek(0);
              }}
            >
              + Nuevo proyecto
            </button>
          </div>
          <div className="tabs">
            <button
              className={tab === "layers" ? "active" : ""}
              onClick={() => setTab("layers")}
            >
              <Layers size={15} /> Capas
            </button>
            <button
              className={tab === "assets" ? "active" : ""}
              onClick={() => setTab("assets")}
            >
              Recursos
            </button>
          </div>
          {tab === "layers" ? (
            <>
              <div className="section-label">
                ESCENA <span>{scene.layers.length} capas</span>
              </div>
              <div className="layer-list">
                {[...scene.layers].reverse().map((l) => (
                  <div
                    key={l.id}
                    className={"layer " + (selected === l.id ? "selected" : "")}
                    onClick={() => setSelected(l.id)}
                  >
                    <span className="layer-symbol">
                      {l.type === "text" ? "T" : l.type === "shape" ? "◉" : "▧"}
                    </span>
                    <span>{l.name}</span>
                    <button
                      title="Visibilidad"
                      onClick={(e) => {
                        e.stopPropagation();
                        change({
                          ...scene,
                          layers: scene.layers.map((x) =>
                            x.id === l.id ? { ...x, visible: !x.visible } : x,
                          ),
                        });
                      }}
                    >
                      {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                  </div>
                ))}
              </div>
              <div className="add-buttons">
                <button onClick={() => add("text")}>
                  <Plus size={14} /> Texto
                </button>
                <button onClick={() => add("shape")}>
                  <Plus size={14} /> Forma
                </button>
              </div>
            </>
          ) : (
            <div className="assets">
              <button onClick={() => importRef.current.click()}>
                <Upload size={16} /> Importar recurso
              </button>
              <p>Imágenes, vídeo y audio · Máximo 50 MB</p>
              {assets.map((a) => (
                <button
                  className="asset"
                  key={a.id}
                  onClick={() =>
                    add(
                      a.mime.startsWith("image")
                        ? "image"
                        : a.mime.startsWith("video")
                          ? "video"
                          : "audio",
                      a,
                    )
                  }
                >
                  {a.mime.startsWith("image") ? (
                    <img src={"/api/assets/" + a.id} />
                  ) : (
                    <Film size={20} />
                  )}
                  <span>{a.name}</span>
                  <Plus size={14} />
                </button>
              ))}
            </div>
          )}
          <div className="ai-panel">
            <div>
              <Sparkles size={17} />
              <b>De una idea a una escena</b>
            </div>
            <p>Describe lo que imaginas. Dale movimiento.</p>
            <textarea
              aria-label="Prompt de escena"
              placeholder="Un título cinético para una marca creativa, con formas violetas…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={4000}
            />
            <button
              className="primary"
              disabled={busy || !prompt.trim()}
              onClick={generate}
            >
              <Sparkles size={15} />
              {busy ? "Creando escena…" : "Generar con IA"}
            </button>
            <small>
              {ai ? "OpenAI conectado" : "Pendiente: configurar OpenAI"}
            </small>
          </div>
        </aside>
        <main>
          <div className="canvas-toolbar">
            <div>
              <span className="breadcrumb">Estudio / </span>
              {scene.name}
            </div>
            <div className="canvas-tags">
              <span>
                {scene.width} × {scene.height}
              </span>
              <span>{scene.fps} FPS</span>
              <button
                onClick={() => {
                  const prev = history.current.pop();
                  if (prev) setScene(prev);
                }}
              >
                Deshacer
              </button>
            </div>
          </div>
          <div className="stage">
            <div className="canvas-wrap">
              <Player
                ref={player}
                component={Scene}
                inputProps={{ scene }}
                durationInFrames={scene.duration}
                compositionWidth={scene.width}
                compositionHeight={scene.height}
                fps={scene.fps}
                style={{ width: "100%" }}
                controls={false}
                loop
              />
              <div className="canvas-caption">
                {scene.name} <span>COMPOSICIÓN 01</span>
              </div>
            </div>
          </div>
          <div className="transport">
            <button
              className="play"
              title="Reproducir o pausar"
              onClick={() => player.current?.toggle()}
            >
              <Play size={16} />
            </button>
            <span>
              {(frame / scene.fps).toFixed(2)}s{" "}
              <span className="muted">
                / {(scene.duration / scene.fps).toFixed(2)}s
              </span>
            </span>
            <input
              aria-label="Posición de reproducción"
              type="range"
              min="0"
              max={scene.duration - 1}
              value={frame}
              onChange={(e) => seek(e.target.value)}
            />
            <span className="muted">{frame.toString().padStart(4, "0")} f</span>
          </div>
          <div className="timeline">
            <div className="timeline-heading">
              <b>Timeline</b>
              <span>◆ Keyframes</span>
              <button onClick={() => seek(0)}>Volver al inicio</button>
            </div>
            <div className="ruler">
              <span>CAPAS</span>
              <div>
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i}>
                    {((i * scene.duration) / scene.fps / 5).toFixed(1)}s
                  </span>
                ))}
              </div>
            </div>
            <div className="tracks">
              {[...scene.layers].reverse().map((l, i) => (
                <div
                  className={
                    "track " + (selected === l.id ? "active-track" : "")
                  }
                  key={l.id}
                >
                  <button onClick={() => setSelected(l.id)}>
                    {l.type === "text" ? "T" : "◉"} <span>{l.name}</span>
                  </button>
                  <div
                    className="track-lane"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      seek(
                        Math.round(
                          ((e.clientX - r.left) / r.width) *
                            (scene.duration - 1),
                        ),
                      );
                    }}
                  >
                    <div
                      className={"clip clip-" + (i % 3)}
                      style={{
                        left: (l.start / scene.duration) * 100 + "%",
                        width: ((l.end - l.start) / scene.duration) * 100 + "%",
                      }}
                    >
                      {l.name}
                    </div>
                    {l.keyframes.map((k) => (
                      <button
                        title={"Keyframe " + k.frame}
                        className="key-dot"
                        key={k.frame}
                        style={{ left: (k.frame / scene.duration) * 100 + "%" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(l.id);
                          seek(k.frame);
                        }}
                      >
                        ◆
                      </button>
                    ))}
                    <div
                      className="playhead"
                      style={{ left: (frame / scene.duration) * 100 + "%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
        <aside className="inspector">
          <div className="inspector-title">
            Propiedades <span>⌘</span>
          </div>
          {layer ? (
            <>
              <div className="section-label">CAPA SELECCIONADA</div>
              <input
                aria-label="Nombre de capa"
                value={layer.name}
                onChange={(e) => edit({ name: e.target.value })}
              />
              {layer.type === "text" && (
                <>
                  <label>
                    Texto
                    <textarea
                      aria-label="Texto"
                      value={layer.text}
                      onChange={(e) => edit({ text: e.target.value })}
                    />
                  </label>
                  <label>
                    Tamaño de fuente
                    <input
                      type="number"
                      min="8"
                      max="300"
                      value={layer.fontSize}
                      onChange={(e) =>
                        edit({ fontSize: Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}
              <label>
                Color
                <input
                  type="color"
                  value={layer.color}
                  onChange={(e) => edit({ color: e.target.value })}
                />
              </label>
              <div className="section-label">
                TRANSFORMACIÓN <Diamond size={12} />
              </div>
              <div className="property-grid">
                {[
                  ["x", "Posición X"],
                  ["y", "Posición Y"],
                  ["scale", "Escala"],
                  ["rotation", "Rotación"],
                  ["opacity", "Opacidad"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      step={key === "scale" || key === "opacity" ? 0.1 : 1}
                      min={key === "opacity" || key === "scale" ? 0 : undefined}
                      max={key === "opacity" ? 1 : undefined}
                      value={Math.round(pose[key] * 100) / 100}
                      onChange={(e) => keyEdit(key, e.target.value)}
                    />
                  </label>
                ))}
                {["width", "height", "start", "end"].map((key) => (
                  <label key={key}>
                    {
                      {
                        width: "Ancho",
                        height: "Alto",
                        start: "Entrada (f)",
                        end: "Salida (f)",
                      }[key]
                    }
                    <input
                      type="number"
                      min="1"
                      value={layer[key]}
                      onChange={(e) => edit({ [key]: Number(e.target.value) })}
                    />
                  </label>
                ))}
              </div>
              <button className="wide" onClick={() => keyEdit("x", pose.x)}>
                <Diamond size={13} /> Añadir keyframe en {frame} f
              </button>
              {layer.keyframes.some((k) => k.frame === frame) &&
                layer.keyframes.length > 1 && (
                  <button
                    className="wide"
                    onClick={() =>
                      edit({
                        keyframes: layer.keyframes.filter(
                          (k) => k.frame !== frame,
                        ),
                      })
                    }
                  >
                    Quitar keyframe actual
                  </button>
                )}
              <div className="layer-actions">
                <button
                  onClick={() => {
                    const l = {
                      ...structuredClone(layer),
                      id: crypto.randomUUID(),
                      name: layer.name + " copia",
                    };
                    change({ ...scene, layers: [...scene.layers, l] });
                    setSelected(l.id);
                  }}
                >
                  Duplicar
                </button>
                <button
                  title="Subir capa"
                  onClick={() => {
                    const ls = [...scene.layers],
                      i = ls.findIndex((l) => l.id === selected);
                    if (i < ls.length - 1) {
                      [ls[i], ls[i + 1]] = [ls[i + 1], ls[i]];
                      change({ ...scene, layers: ls });
                    }
                  }}
                >
                  Subir
                </button>
                <button
                  className="danger"
                  title="Eliminar capa"
                  onClick={() => {
                    change({
                      ...scene,
                      layers: scene.layers.filter((l) => l.id !== selected),
                    });
                    setSelected(null);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </>
          ) : (
            <p>Selecciona una capa para editarla.</p>
          )}
          <div className="section-label">COMPOSICIÓN</div>
          <label>
            Fondo
            <input
              type="color"
              value={scene.background}
              onChange={(e) => change({ ...scene, background: e.target.value })}
            />
          </label>
          <label>
            Duración (segundos)
            <input
              type="number"
              min="1"
              max="60"
              value={scene.duration / scene.fps}
              onChange={(e) => {
                const d = Math.max(
                  1,
                  Math.min(
                    1800,
                    Math.round(Number(e.target.value) * scene.fps),
                  ),
                );
                change({
                  ...scene,
                  duration: d,
                  layers: scene.layers.map((l) => ({
                    ...l,
                    start: Math.min(l.start, d - 1),
                    end: Math.min(l.end, d),
                    keyframes: l.keyframes.filter((k) => k.frame < d).length
                      ? l.keyframes.filter((k) => k.frame < d)
                      : [{ ...l.keyframes[0], frame: 0 }],
                  })),
                });
                seek(0);
              }}
            />
          </label>
          <label>
            Formato
            <select
              value={scene.width + ":" + scene.height}
              onChange={(e) => {
                const [w, h] = e.target.value.split(":").map(Number);
                change({ ...scene, width: w, height: h });
              }}
            >
              <option value="960:540">Horizontal · 16:9</option>
              <option value="540:960">Vertical · 9:16</option>
              <option value="720:720">Cuadrado · 1:1</option>
            </select>
          </label>
        </aside>
      </div>
      {job && (
        <div className="job">
          <Film size={17} />
          {job.status === "done" ? (
            <>
              Exportación lista{" "}
              <a href={"/api/exports/" + job.id + "/download"}>
                Descargar archivo ↓
              </a>
            </>
          ) : job.status === "failed" ? (
            job.error
          ) : (
            "Renderizando tu escena… " +
            (job.status === "queued" ? "En cola" : "")
          )}
          <button onClick={() => setJob(null)}>×</button>
        </div>
      )}
      {message && (
        <div role="alert" className="toast">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}
      <input
        ref={importRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg"
        onChange={(e) => {
          upload(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
