// vrSaberBase.ts
// 剣先(vrSaberTip.ts)だけでなく刃の根元(柄側の端)も共有し、この2点を結ぶ
// 線分全体を「刃」として当たり判定に使えるようにする(vrSaberTip.tsと同じ仕組み)。

import { createContext, useContext, type RefObject } from "react";
import { Vector3 } from "three";

export const SaberBaseContext = createContext<RefObject<Vector3> | null>(null);

export function useSaberBaseRef(): RefObject<Vector3> {
  const ref = useContext(SaberBaseContext);
  if (!ref) {
    throw new Error("useSaberBaseRef must be used within a SaberBaseContext.Provider");
  }
  return ref;
}
