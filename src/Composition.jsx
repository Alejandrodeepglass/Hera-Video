import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Img,
  OffthreadVideo,
  Audio,
  useCurrentFrame,
} from "remotion";
import { poseAt } from "../shared/scene.js";
export function Scene({ scene, assets = {}, transparent = false }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: transparent ? "transparent" : scene.background,
        overflow: "hidden",
      }}
    >
      {scene.layers
        .filter((l) => l.visible)
        .map((l) => {
          const p = poseAt(l.keyframes, frame),
            src = assets[l.assetId] || `/api/assets/${l.assetId}`;
          return (
            <Sequence
              key={l.id}
              from={l.start}
              durationInFrames={l.end - l.start}
            >
              <div
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  width: l.width,
                  height: l.height,
                  opacity: p.opacity,
                  transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
                  color: l.color,
                  fontSize: l.fontSize,
                  fontFamily: "Arial, sans-serif",
                  fontWeight: 800,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.08,
                }}
              >
                {l.type === "text" ? (
                  l.text
                ) : l.type === "shape" ? (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: l.color,
                      borderRadius: "50%",
                    }}
                  />
                ) : l.type === "image" ? (
                  <Img
                    src={src}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                ) : l.type === "video" ? (
                  <OffthreadVideo
                    src={src}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  <Audio src={src} />
                )}
              </div>
            </Sequence>
          );
        })}
    </AbsoluteFill>
  );
}
