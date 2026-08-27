// useSwingDetection.ts
// Joy-Conの加速度データから「振り」を検出するフック。
// 方向は取得せず、加速度ベクトルの大きさ(magnitude)が閾値を超えた瞬間(rising edge)を
// 1回のスイングとして扱う。GameScene側はこの swingId が変化するたびに攻撃判定を行う。

import { useEffect, useRef, useState } from "react";
import type { JoyConState, JoyConVector3 } from "../lib/joycon/joyConDevice";
import { SWING_POWER_THRESHOLD } from "../game/attackDetection";

export interface SwingDetectionResult {
  swingPower: number; // 直近に検出したスイングの強さ(加速度の大きさ)
  swingId: number; // スイングが検出されるたびに増える(edge検出用)
}

function accelMagnitude(accel: JoyConVector3): number {
  return Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);
}

export function useSwingDetection(state: JoyConState | null): SwingDetectionResult {
  const [result, setResult] = useState<SwingDetectionResult>({ swingPower: 0, swingId: 0 });
  const wasAboveThresholdRef = useRef(false);
  const swingIdRef = useRef(0);

  useEffect(() => {
    if (!state) return;

    const magnitude = accelMagnitude(state.accel);
    const isAboveThreshold = magnitude >= SWING_POWER_THRESHOLD;

    if (isAboveThreshold && !wasAboveThresholdRef.current) {
      swingIdRef.current += 1;
      setResult({ swingPower: magnitude, swingId: swingIdRef.current });
    }
    wasAboveThresholdRef.current = isAboveThreshold;
  }, [state]);

  return result;
}
