// vrEnemyHitbox.ts
// 敵モデルは正規化(MODEL_TARGET_HEIGHT基準の高さ揃え)はしているが、
// 横幅・奥行きはモデルごとの縦横比次第でバラバラになる。
// そのため当たり判定の大きさを固定値にすると、モデルによって
// 「大きすぎて/小さすぎて判定がわからない」というズレが生じる。
// EnemyModelが実際にスケーリングした後の実寸(幅・高さ・奥行き)をこのRefへ書き込み、
// useVRSwingHitが毎フレームそれを読んで当たり判定の大きさに反映する。

import { createContext, useContext, type RefObject } from "react";
import { Vector3 } from "three";

// 判定・可視化ワイヤーフレームで共通して使う余白倍率(見た目の輪郭ぴったりだと
// シビアすぎるため、少し寛容にする)。
export const HITBOX_MARGIN = 1.15;

export const EnemyHitboxSizeContext = createContext<RefObject<Vector3> | null>(null);

export function useEnemyHitboxSizeRef(): RefObject<Vector3> {
  const ref = useContext(EnemyHitboxSizeContext);
  if (!ref) {
    throw new Error("useEnemyHitboxSizeRef must be used within an EnemyHitboxSizeContext.Provider");
  }
  return ref;
}
