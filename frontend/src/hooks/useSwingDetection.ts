// useSwingDetection.ts
// Joy-Conの加速度・ジャイロデータから「振り」とその方向を検出するフック。
// 加速度ベクトルの大きさ(magnitude)が閾値を超えた瞬間(rising edge)を1回のスイングとして扱い、
// その瞬間のジャイロ(角速度)の主軸・符号から上下左右いずれの振りかを分類する。
//
// 方向の符号(x>0がdownかupか等)はJoy-Conの持ち方次第で変わるため仮の割り当てであり、
// 実機で振ってみて逆になっている場合はclassifyDirection内の符号を反転すればよい。

import { useEffect, useRef, useState } from "react";
import type { JoyConState, JoyConVector3 } from "../lib/joycon/joyConDevice";
import type { SwingDirection } from "../game/types";
import { SWING_POWER_THRESHOLD } from "../game/attackDetection";

export interface SwingDetectionResult {
  swingPower: number; // 直近に検出したスイングの強さ(加速度の大きさ)
  swingId: number; // スイングが検出されるたびに増える(edge検出用)
  swingDirection: SwingDirection | null; // 直近のスイングの方向
}

function accelMagnitude(accel: JoyConVector3): number {
  return Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);
}

// gyro.x: 上下方向(pitch)の回転、gyro.y: 左右方向(yaw)の回転とみなし、
// 大きく回転している方の軸・符号から4方向に分類する。
function classifyDirection(gyro: JoyConVector3): SwingDirection {
  if (Math.abs(gyro.x) >= Math.abs(gyro.y)) {
    return gyro.x > 0 ? "down" : "up";
  }
  return gyro.y > 0 ? "right" : "left";
}

export function useSwingDetection(state: JoyConState | null): SwingDetectionResult {
  const [result, setResult] = useState<SwingDetectionResult>({
    swingPower: 0,
    swingId: 0,
    swingDirection: null,
  });
  const wasAboveThresholdRef = useRef(false);
  const swingIdRef = useRef(0);

  useEffect(() => {
    if (!state) return;

    const magnitude = accelMagnitude(state.accel);
    const isAboveThreshold = magnitude >= SWING_POWER_THRESHOLD;

    if (isAboveThreshold && !wasAboveThresholdRef.current) {
      swingIdRef.current += 1;
      setResult({
        swingPower: magnitude,
        swingId: swingIdRef.current,
        swingDirection: classifyDirection(state.gyro),
      });
    }
    wasAboveThresholdRef.current = isAboveThreshold;
  }, [state]);

  return result;
}
