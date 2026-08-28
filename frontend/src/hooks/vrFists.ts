// vrFists.ts
// エンドロール(VRCreditsScene)で「コントローラーの根本=握り拳あたり」で殴る当たり判定を
// 作るために、左右コントローラーの grip-space 原点のワールド座標を共有する。
// 剣先/剣の根元(vrSaberTip.ts / vrSaberBase.ts)と同じ仕組みで、
// VRControllerVisual 内の FistTracker が毎フレーム書き込み、VRCreditsScene が読み取る。
// 剣は右手だけだが、殴るのは両手でできるようにするため左右ぶんを持つ。

import { createContext, useContext, type RefObject } from "react";
import { Vector3 } from "three";

export type FistRefs = {
  left: RefObject<Vector3>;
  right: RefObject<Vector3>;
};

export const FistsContext = createContext<FistRefs | null>(null);

export function useFistsRef(): FistRefs {
  const refs = useContext(FistsContext);
  if (!refs) {
    throw new Error("useFistsRef must be used within a FistsContext.Provider");
  }
  return refs;
}

// VR(FistsContext.Provider あり)でも非VR(なし)でも同じエンドロールを使い回すため、
// Provider が無いときは null を返す非throw版。非VRでは拳の位置が取れないので、
// CreditsScene 側は Joy-Con の振り検出だけで殴る判定を行う。
export function useOptionalFistsRef(): FistRefs | null {
  return useContext(FistsContext);
}
