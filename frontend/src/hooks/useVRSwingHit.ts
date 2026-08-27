// useVRSwingHit.ts
// VR用の命中判定。Joy-Con版(useSwingDetection)は加速度の閾値超えを離散的な
// 「スイングイベント」として検出するが、VRではコントローラーの位置は連続値しか
// 得られない。そこで刃(useSaberTipRef/useSaberBaseRefで共有される柄側の端と剣先を
// 結ぶ線分)が敵の簡易ヒットボックスに「外→中」へ進入した瞬間だけを1回のスイングと
// みなし、直近の移動量から振り方向を分類する(useSwingDetectionのrising-edge検出に相当)。
// 剣先の一点だけでなく刃全体を判定に使うことで、根元寄りで当てても命中扱いになる。

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, Vector3 } from "three";
import type { Enemy, SwingDirection } from "../game/types";
import { useSaberTipRef } from "./vrSaberTip";
import { useSaberBaseRef } from "./vrSaberBase";
import { useEnemyHitboxSizeRef, HITBOX_MARGIN } from "./vrEnemyHitbox";
import { useEnemyPositionRef } from "./vrEnemyPosition";

const HIT_WINDOW_MS = 150; // 振り方向を判定するために遡るサンプル時間
const HIT_COOLDOWN_MS = 250; // 連続ヒット・往復振りの誤爆を防ぐクールダウン
const MIN_SWING_DISTANCE = 0.15; // これ未満の移動量は「振り」とみなさない(静止ノイズ対策)
const BLADE_SAMPLE_COUNT = 8; // 刃を線分として判定する際、根元〜剣先を何分割してチェックするか

type Sample = { position: Vector3; t: number };

/**
 * phase==="playerTurn"の間、剣先が敵のヒットボックスに新規進入した瞬間に
 * onHit(振り方向)を呼び出す。方向がrequiredDirectionと一致するかどうかの判定は
 * 呼び出し側(VRGameLoop)の責務とする(Joy-Con版と同じ役割分担)。
 */
export function useVRSwingHit(
  enemy: Enemy,
  phase: "playerTurn" | "enemyTurn",
  onHit: (direction: SwingDirection) => void,
) {
  const saberTip = useSaberTipRef();
  const saberBase = useSaberBaseRef();
  const hitboxSize = useEnemyHitboxSizeRef();
  const enemyPosition = useEnemyPositionRef();
  const samplesRef = useRef<Sample[]>([]);
  const wasInsideRef = useRef(false);
  const lastHitAtRef = useRef(0);
  const hitboxRef = useRef(new Box3());
  const hitboxCenterRef = useRef(new Vector3());
  const hitboxMarginedSizeRef = useRef(new Vector3());
  const bladeSamplePointRef = useRef(new Vector3());

  useFrame(() => {
    const tip = saberTip.current;
    const now = performance.now();

    const samples = samplesRef.current;
    samples.push({ position: tip.clone(), t: now });
    while (samples.length > 1 && now - samples[0].t > HIT_WINDOW_MS) {
      samples.shift();
    }

    if (phase !== "playerTurn" || enemy.state === "dying" || enemy.state === "dead") {
      wasInsideRef.current = false;
      return;
    }

    // 実際に表示されているモデルの実寸(幅・高さ・奥行き)・現在位置(近寄る/離れるで
    // アニメーションする)に合わせて判定領域を作る。位置は足元基準なので、
    // 中心はモデルの高さの半分だけかさ上げする。
    hitboxMarginedSizeRef.current.copy(hitboxSize.current).multiplyScalar(HITBOX_MARGIN);
    hitboxCenterRef.current.set(
      enemyPosition.current.x,
      enemyPosition.current.y + hitboxMarginedSizeRef.current.y / 2,
      enemyPosition.current.z,
    );
    hitboxRef.current.setFromCenterAndSize(hitboxCenterRef.current, hitboxMarginedSizeRef.current);

    // 剣先の一点だけでなく、柄側の端(base)〜剣先(tip)の線分を等分サンプリングして
    // いずれかがヒットボックス内に入っていれば「刃が当たっている」とみなす。
    let insideBox = false;
    for (let i = 0; i <= BLADE_SAMPLE_COUNT; i++) {
      const t = i / BLADE_SAMPLE_COUNT;
      bladeSamplePointRef.current.lerpVectors(saberBase.current, tip, t);
      if (hitboxRef.current.containsPoint(bladeSamplePointRef.current)) {
        insideBox = true;
        break;
      }
    }

    if (insideBox && !wasInsideRef.current && now - lastHitAtRef.current > HIT_COOLDOWN_MS) {
      const direction = classifyDirection(samples);
      if (direction) {
        lastHitAtRef.current = now;
        onHit(direction);
      }
    }
    wasInsideRef.current = insideBox;
  });
}

function classifyDirection(samples: Sample[]): SwingDirection | null {
  if (samples.length < 2) return null;
  const delta = samples[samples.length - 1].position.clone().sub(samples[0].position);
  if (delta.length() < MIN_SWING_DISTANCE) return null;

  if (Math.abs(delta.y) >= Math.abs(delta.x)) {
    return delta.y > 0 ? "up" : "down";
  }
  return delta.x > 0 ? "right" : "left";
}
