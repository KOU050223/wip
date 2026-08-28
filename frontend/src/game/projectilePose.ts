import { Vector3 } from "three";

/** 表示用meshとRapierセンサーへ同じワールド座標を反映する。 */
export function applyProjectileWorldPosition(
  meshPosition: Vector3,
  worldPosition: Vector3,
  setPhysicsPosition: (position: Vector3) => void,
) {
  meshPosition.copy(worldPosition);
  setPhysicsPosition(worldPosition);
}
