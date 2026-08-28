import { Vector3 } from "three";

type ProjectileMotionInput = {
  spawnPosition: Vector3;
  targetPosition: Vector3;
  curveAxis: Vector3;
  elapsedMs: number;
  travelMs: number;
};

/** Rapier剛体に設定する、飛来物の単一のワールド座標を計算する。 */
export function getProjectileWorldPosition(
  { spawnPosition, targetPosition, curveAxis, elapsedMs, travelMs }: ProjectileMotionInput,
  output = new Vector3(),
): Vector3 {
  const t = Math.min(1, elapsedMs / travelMs);
  return output
    .lerpVectors(spawnPosition, targetPosition, t)
    .addScaledVector(curveAxis, Math.sin(t * Math.PI));
}
