// vrEnemyPosition.ts
// 敵は自分のターン(近い位置)と相手のターン(離れてポリゴンを飛ばす)で
// 表示位置がアニメーションして変化する。この「今実際にどこにいるか」を
// EnemyMesh側がuseFrameで毎フレーム更新し、useVRSwingHit側が読み取れるように
// Context経由で共有する(useSaberTipRefと同じ仕組み)。

import { createContext, useContext, type RefObject } from "react";
import { Vector3 } from "three";

export const EnemyPositionContext = createContext<RefObject<Vector3> | null>(null);

export function useEnemyPositionRef(): RefObject<Vector3> {
  const ref = useContext(EnemyPositionContext);
  if (!ref) {
    throw new Error("useEnemyPositionRef must be used within an EnemyPositionContext.Provider");
  }
  return ref;
}
