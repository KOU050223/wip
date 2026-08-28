import { useCallback, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

import type { SwingDirection } from "../game/types";
import { useSaberTipRef } from "./vrSaberTip";

const HIT_WINDOW_MS = 150;
const MIN_SWING_DISTANCE = 0.15;

export function classifyVRSwingDirection(samples: Vector3[]): SwingDirection | null {
  if (samples.length < 2) return null;
  const delta = samples[samples.length - 1].clone().sub(samples[0]);
  if (delta.length() < MIN_SWING_DISTANCE) return null;
  if (Math.abs(delta.y) >= Math.abs(delta.x)) return delta.y > 0 ? "up" : "down";
  return delta.x > 0 ? "right" : "left";
}

/** 直近の剣先移動から、Rapierの接触イベント時に使う振り方向を返す。 */
export function useVRSwingDirection(): () => SwingDirection | null {
  const saberTip = useSaberTipRef();
  const samplesRef = useRef<{ position: Vector3; t: number }[]>([]);

  useFrame(() => {
    const now = performance.now();
    const samples = samplesRef.current;
    samples.push({ position: saberTip.current.clone(), t: now });
    while (samples.length > 1 && now - samples[0].t > HIT_WINDOW_MS) samples.shift();
  });

  return useCallback(
    () => classifyVRSwingDirection(samplesRef.current.map((sample) => sample.position)),
    [],
  );
}
