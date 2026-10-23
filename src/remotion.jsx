import React from "react";
import { registerRoot, Composition } from "remotion";
import { Scene } from "./Composition";
import { initialScene } from "../shared/scene";
registerRoot(() => (
  <Composition
    id="MotionScene"
    component={Scene}
    width={960}
    height={540}
    fps={30}
    durationInFrames={150}
    defaultProps={{ scene: initialScene() }}
    calculateMetadata={({ props }) => ({
      width: props.scene.width,
      height: props.scene.height,
      fps: props.scene.fps,
      durationInFrames: props.scene.duration,
    })}
  />
));
