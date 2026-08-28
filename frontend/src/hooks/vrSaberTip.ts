// vrSaberTip.ts
// VRLightsaberは@react-three/xrがコントローラーごとに管理する別ツリー(grip-space)に
// 描画されるため、通常のprops/refではその剣先の実座標をVRGameLoop側から直接参照できない。
// そこでVRGameScene側で生成した1つのVector3をContext経由で共有し、
// VRLightsaberが毎フレーム書き込み、Rapierの剣コライダーが毎フレーム読み取る。

import { createContext, useContext, type RefObject } from "react";
import { Vector3 } from "three";

export const SaberTipContext = createContext<RefObject<Vector3> | null>(null);

export function useSaberTipRef(): RefObject<Vector3> {
  const ref = useContext(SaberTipContext);
  if (!ref) {
    throw new Error("useSaberTipRef must be used within a SaberTipContext.Provider");
  }
  return ref;
}
