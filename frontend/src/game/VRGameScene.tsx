// VRGameScene.tsx
// VRモード: ターン制バトル本体をJoy-Con版(GameScene.tsx)から移植する。
// 戦闘ロジック(types.ts/enemySpawn.ts/combo.ts/hp.ts/attackDetection.ts)は無改変で流用し、
// 差し替えているのは入力方式・防御方式:
// - 自分のターンの命中判定: Joy-Conの「振った方向が一致すれば無条件ヒット」から、
//   剣先が敵の簡易ヒットボックスに実際に接触したときだけ判定するuseVRSwingHitに変更
// - 相手のターンの防御: 敵が離れてポリゴン(発光球)を飛ばし、それをプレイヤーが
//   自分の剣で斬れば防御成功、斬れなければ被弾する方式にする。方向は問わないが、
//   赤=右手トリガー/青=右手グリップと色ごとに要求ボタンがあり、斬る瞬間に正しい
//   ボタンを押していないと被弾扱い(ミス確定)になる。
// HUD(HP/コンボ/スコアの3Dパネル)はPhase 3で追加済み。BGM/SFXはPhase 4で追加する。

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars, useGLTF } from "@react-three/drei";
import {
  createXRStore,
  XR,
  XRSpace,
  useXRInputSourceState,
  useXRInputSourceStateContext,
} from "@react-three/xr";
import {
  BackSide,
  Box3,
  DoubleSide,
  Group,
  Line3,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Shape,
  Vector3,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { Enemy, ComboState, SwingDirection, BattlePhase } from "./types";
import { spawnEnemy, spawnBoss, randomDirection } from "./enemySpawn";
import { calculateDamage } from "./attackDetection";
import { applyDamage, recoverFromHit } from "./hp";
import { createInitialComboState, registerHit, resetCombo } from "./combo";
import { addScore } from "./score";
import VRLightsaber from "../components/three/VRLightsaber";
import { SaberTipContext, useSaberTipRef } from "../hooks/vrSaberTip";
import { SaberBaseContext, useSaberBaseRef } from "../hooks/vrSaberBase";
import { useVRSwingHit } from "../hooks/useVRSwingHit";
import {
  EnemyHitboxSizeContext,
  useEnemyHitboxSizeRef,
  HITBOX_MARGIN,
} from "../hooks/vrEnemyHitbox";
import { EnemyPositionContext, useEnemyPositionRef } from "../hooks/vrEnemyPosition";
import VRBattleHUD from "./VRBattleHUD";
import VRTutorial from "./VRTutorial";

// 敵にダメージを与えるたびに鳴らす効果音。GameScene.tsxのBGM/SFXと同じ規約で、
// このパスに音声ファイルを置けば自動的に再生される(未配置でも再生に失敗するだけで動作に影響しない)。
const ENEMY_HIT_SFX_PATH = "/audio/maou_se_battle_gun05.mp3";
const ENEMY_HIT_SFX_VOLUME = 1;

// ボールをガード成功した瞬間に鳴らす効果音。
const GUARD_SUCCESS_SFX_PATH = "/audio/jast.wav";
const GUARD_SUCCESS_SFX_VOLUME = 1;

// 自分が被弾した瞬間に鳴らす効果音。
const PLAYER_HIT_SFX_PATH = "/audio/maou_se_battle18.mp3";
const PLAYER_HIT_SFX_VOLUME = 1;

// 剣を振って(刃が敵のヒットボックスに入って)スイングが成立するたびに鳴らす効果音。
// Joy-Con版のスイングSFXと同じファイルを流用する。
const SWING_SFX_PATH = "/audio/raitose-ba-.m4a";
const SWING_SFX_VOLUME = 1;

// 敵がポリゴンのウェーブを撃つ瞬間に鳴らす効果音。
const ENEMY_SHOOT_SFX_PATH = "/audio/shooting.m4a";
const ENEMY_SHOOT_SFX_VOLUME = 1;

// 被弾したかどうかが分かりづらい問題への対策。HPが減るほど視界の周辺が赤く
// なるようにする(カメラに追従する球を内側から見せ、depthTestを切って常に
// 手前に描画することで、通常の画面オーバーレイの代わりにVRでも機能させる)。
const LOW_HP_OVERLAY_RADIUS = 0.5;
const LOW_HP_OVERLAY_MAX_OPACITY = 0.55;

// Joy-Con版(GameScene.tsx)と揃えた数値。バランスは無変更で流用する。
const ENEMY_NEAR_POSITION = new Vector3(0, 0, -2.5); // 自分のターン中、敵がいる位置(足元基準)
const ENEMY_FAR_POSITION = new Vector3(0, 0, -6); // 相手のターン中、ポリゴンを飛ばす位置まで離れる

// HUDパネル: 手やヘッドセットに追従させず、敵の近距離側の脇にワールド固定で置く。
// 初期カメラ位置(下記VRGameScene参照)あたりを向くよう、置いた位置から
// そのおおよその視点方向を計算してrotation.yに反映しておく。
const HUD_ANCHOR_POSITION = new Vector3(ENEMY_NEAR_POSITION.x + 1.1, 1.3, ENEMY_NEAR_POSITION.z);
const HUD_REFERENCE_VIEWPOINT = new Vector3(0, 1.3, 2);
const HUD_ROTATION_Y = Math.atan2(
  HUD_REFERENCE_VIEWPOINT.x - HUD_ANCHOR_POSITION.x,
  HUD_REFERENCE_VIEWPOINT.z - HUD_ANCHOR_POSITION.z,
);
const PLAYER_MAX_HP = 1000;
const ENEMY_MAX_HP = 500;
const PLAYER_ATTACK_DAMAGE = 250;
const ENEMY_ATTACK_DAMAGE = 100;
const HIT_RECOVER_MS = 200;
const DYING_DURATION_MS = 300;
const TURN_COOLDOWN_MS = 300;

// 敵が離れてポリゴンを飛ばす防御演出まわり
const ENEMY_RETREAT_MS = 500; // 自分の攻撃直後、敵が離れきるまでの待ち時間(退避アニメの尺)
const ENEMY_MOVE_LERP_SPEED = 4; // 敵の近寄る/離れるアニメーションの追従速度
const PROJECTILE_HIT_RADIUS = 0.4; // 剣先がこの距離まで近づいたら斬れたとみなす
const PROJECTILE_SPAWN_Y = 1.4; // ポリゴンを飛ばす高さの目安

// 単調にならないよう、1ウェーブごとに「本数(方向)」「速度」「軌道の曲がり方」を
// ランダムに変える。全部ミスなく斬れて初めて防御成功、1本でも受けたら被弾(ダメージは今まで通り1回分)。
const PROJECTILE_TRAVEL_MS_MIN = 700; // 速い弾
const PROJECTILE_TRAVEL_MS_MAX = 1000; // 遅い弾
const PROJECTILE_CURVE_MIN = 0.3; // 直進に近い軌道
const PROJECTILE_CURVE_MAX = 1.0; // 大きく弧を描く軌道
const PROJECTILE_CURVE_DIRECTIONS = ["up", "down", "left", "right"] as const;
type ProjectileCurveDirection = (typeof PROJECTILE_CURVE_DIRECTIONS)[number];
const NORMAL_WAVE_COUNT = 3; // 通常敵は常に3本同時
const BOSS_WAVE_COUNT = 5; // ボスは理不尽にしたいので常に5本同時

// 収束しすぎるとブレード判定範囲内に何もしなくても入ってきてしまうため、
// 最終到達点をプレイヤーの頭の位置からわずかにずらし、実際に剣を動かして
// 迎え撃つ必要があるようにする。
const PROJECTILE_TARGET_OFFSET_MIN = 0.25;
const PROJECTILE_TARGET_OFFSET_MAX = 0.55;

// 同じウェーブ内の複数弾がほぼ同時・ほぼ同じ速度で飛んできて「複数本出す意味がない」
// 状態にならないよう、発射タイミングと速度をそれぞれ「範囲を分割して1本ずつ別の帯に
// 割り当てる」方式でわざと差をつける(単純な独立乱数だと偶然近い値になり得るため)。
const PROJECTILE_LAUNCH_GAP_MS = 350; // 発射タイミングの基本間隔
const PROJECTILE_LAUNCH_JITTER_MS = 200; // 間隔に足すランダムなブレ

// ボールは赤/青のどちらかにランダムに色分けされ、斬るときに正しいボタンを
// (剣を持つ右手コントローラーで)押していないと防御が成立しない。赤=トリガー、青=グリップ。
// 間違ったボタン・無入力のまま触れた場合、および両方同時押しの場合は、
// その場で被弾扱い(ミス確定)にする(両方押せばどちらにも該当する抜け道を防ぐ)。
const PROJECTILE_COLORS = ["red", "blue"] as const;
type ProjectileColor = (typeof PROJECTILE_COLORS)[number];
const PROJECTILE_COLOR_HEX: Record<ProjectileColor, string> = {
  red: "#ff3344",
  blue: "#3388ff",
};

function randomProjectileColor(): ProjectileColor {
  return PROJECTILE_COLORS[Math.floor(Math.random() * PROJECTILE_COLORS.length)];
}

// プレイヤーの頭の位置そのものではなく、そこから全方位ランダムにずらした点へ向かわせる。
function randomTargetOffset(): Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const radius = randomBetween(PROJECTILE_TARGET_OFFSET_MIN, PROJECTILE_TARGET_OFFSET_MAX);
  return new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// [min, max]をcount個の帯に分け、シャッフルした順で1本ずつ別の帯からランダムな値を取る。
// 同じウェーブ内の値同士が必ずある程度離れることを保証する(速度のばらつき用)。
function pickSpreadValues(count: number, min: number, max: number): number[] {
  const binSize = (max - min) / count;
  const bins = Array.from({ length: count }, (_, i) => i);
  for (let i = bins.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bins[i], bins[j]] = [bins[j], bins[i]];
  }
  return bins.map((bin) => min + bin * binSize + Math.random() * binSize);
}

// ボールは実際に敵がいる位置(退避後の座標)から飛んでくるようにする。
// angleDegは出現位置ではなく、直進経路に対してどちら向き・どれくらい弧を描くかの
// 演出だけに使う(複数方向からの攻撃感は軌道の膨らみ方の違いで表現する)。
function spawnPositionFromEnemy(enemyPos: Vector3): Vector3 {
  return new Vector3(enemyPos.x, PROJECTILE_SPAWN_Y, enemyPos.z);
}

// 発射点は敵の位置のまま、進行中の弧の膨らみ方だけで「上下左右いろんな方向から
// 来ている感」を出す。水平(左右)だけでなく垂直(上下)にも膨らませられるようにする。
const CURVE_AXIS_BY_DIRECTION: Record<ProjectileCurveDirection, Vector3> = {
  up: new Vector3(0, 1, 0),
  down: new Vector3(0, -1, 0),
  left: new Vector3(-1, 0, 0),
  right: new Vector3(1, 0, 0),
};

function curveAxisForDirection(direction: ProjectileCurveDirection): Vector3 {
  const strength = randomBetween(PROJECTILE_CURVE_MIN, PROJECTILE_CURVE_MAX);
  return CURVE_AXIS_BY_DIRECTION[direction].clone().multiplyScalar(strength);
}

// 1ウェーブ分の飛来方向(上/下/左/右)を選ぶ。方向の種類(4つ)を使い切るまでは
// 重複なく選び、それ以上(ボスの5本など)は補充してどれかの方向を重複させる。
function pickWaveDirections(count: number): ProjectileCurveDirection[] {
  let pool: ProjectileCurveDirection[] = [];
  const picked: ProjectileCurveDirection[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool = [...PROJECTILE_CURVE_DIRECTIONS];
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

type ProjectileInstance = {
  id: number;
  spawnPosition: Vector3;
  startTime: number;
  travelMs: number;
  curveAxis: Vector3;
  color: ProjectileColor;
  targetOffset: Vector3;
};

const BOSS_APPEAR_AFTER_MS = 2 * 60 * 1000;
const BOSS_MAX_HP = 2500;
const BOSS_MODEL_PATH = "/models/DV.glb";
const BOSS_ATTACKS_PER_TURN = 1;
const BOSS_CLEAR_BONUS_SCORE = 5000;

// 要求スイング方向の矢印。以前はUnicode矢印文字(↑↓←→)をTextで描画していたが、
// フォントによって上下方向のグリフが正しく表示されないことがあったため、
// シンプルな矢印ポリゴン(shapeGeometry)をZ軸回転させる方式に変更した。
const ARROW_ROTATION_Z: Record<SwingDirection, number> = {
  up: 0,
  down: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

function createArrowShape(): Shape {
  const shape = new Shape();
  shape.moveTo(0, 0.22);
  shape.lineTo(-0.16, -0.06);
  shape.lineTo(-0.06, -0.06);
  shape.lineTo(-0.06, -0.22);
  shape.lineTo(0.06, -0.22);
  shape.lineTo(0.06, -0.06);
  shape.lineTo(0.16, -0.06);
  shape.closePath();
  return shape;
}
const ARROW_SHAPE = createArrowShape();

function DirectionArrowIndicator({ direction }: { direction: SwingDirection }) {
  return (
    <mesh
      position={[0, MODEL_TARGET_HEIGHT + 0.3, 0.41]}
      rotation={[0, 0, ARROW_ROTATION_Z[direction]]}
    >
      <shapeGeometry args={[ARROW_SHAPE]} />
      <meshBasicMaterial color="#ffe066" side={DoubleSide} />
    </mesh>
  );
}

const MODEL_TARGET_HEIGHT = 1.6;

// モデルによっては書き出し時の正面がZ+/Z-逆になっているため、個別に補正する。
// DV.glbはそのままだとプレイヤーに背を向けてしまうため180度回転させる。
const MODEL_FACING_OFFSET: Record<string, number> = {
  "/models/DV.glb": Math.PI,
};

// 高さをMODEL_TARGET_HEIGHTに揃えるだけだと、モデルによっては
// (gamema.glbなど)横幅・奥行きが目立って画面上で大きく見えすぎるため、
// 個別に追加の縮小率をかけて調整する(GameScene.tsxと同じ値)。
const MODEL_SCALE_OFFSET: Record<string, number> = {
  "/models/gamema.glb": 0.7,
};

// 背景が真っ黒だと奥行きが感じられずボスの視認性も落ちるため、
// 濃紺のグラデーションに近い単色背景+星の粒子で宇宙空間らしくする。
function SpaceBackground() {
  return (
    <>
      <color attach="background" args={["#05050f"]} />
      <Stars radius={90} depth={60} count={4000} factor={4} saturation={0} fade speed={0.5} />
    </>
  );
}

// HPが減るほど視界が赤くなる被弾フィードバック。通常の2Dゲームのような画面オーバーレイは
// WebXRのヘッドセット映像には効かないため、カメラの位置・向きに毎フレーム追従する球を
// カメラのすぐ内側(BackSide)に置き、depthTest/depthWriteを切って常に手前に描画することで
// 疑似的なオーバーレイとして機能させる。
function LowHpOverlay({ hpRatio }: { hpRatio: number }) {
  const groupRef = useRef<Group>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);

  useFrame((state) => {
    const group = groupRef.current;
    if (group) {
      group.position.copy(state.camera.position);
      group.quaternion.copy(state.camera.quaternion);
    }
    if (materialRef.current) {
      const dangerRatio = Math.max(0, Math.min(1, 1 - hpRatio));
      materialRef.current.opacity = dangerRatio * LOW_HP_OVERLAY_MAX_OPACITY;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh renderOrder={1000} frustumCulled={false}>
        <sphereGeometry args={[LOW_HP_OVERLAY_RADIUS, 16, 16]} />
        <meshBasicMaterial
          ref={materialRef}
          color="#ff0000"
          transparent
          opacity={0}
          side={BackSide}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// 敵モデル本体(GameScene.tsxのEnemyModelと同じ正規化ロジック)。
// 高さはMODEL_TARGET_HEIGHTに揃うが、横幅・奥行きはモデルの縦横比次第でばらつくため、
// 実際にスケーリングした後の実寸をEnemyHitboxSizeContext経由で共有し、
// 当たり判定(useVRSwingHit)とその可視化(EnemyHitboxDebugBox)がモデルごとの
// 実サイズに追従できるようにする。
function EnemyModel({ modelPath, state }: { modelPath: string; state: Enemy["state"] }) {
  const { scene } = useGLTF(modelPath);
  const hitboxSize = useEnemyHitboxSizeRef();

  const { model, actualSize } = useMemo(() => {
    const cloned = cloneSkeleton(scene);
    const helperNodes = cloned.children.filter((child) =>
      ["env", "floor"].includes(child.name.toLowerCase()),
    );
    helperNodes.forEach((child) => cloned.remove(child));

    const box = new Box3().setFromObject(cloned);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale =
      (size.y > 0 ? MODEL_TARGET_HEIGHT / size.y : 1) * (MODEL_SCALE_OFFSET[modelPath] ?? 1);
    cloned.scale.setScalar(scale);
    cloned.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    cloned.rotation.y = MODEL_FACING_OFFSET[modelPath] ?? 0;
    return { model: cloned, actualSize: size.clone().multiplyScalar(scale) };
  }, [scene, modelPath]);

  useEffect(() => {
    hitboxSize.current.copy(actualSize);
  }, [actualSize, hitboxSize]);

  useEffect(() => {
    const isHit = state === "hit";
    const isDying = state === "dying";
    model.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.transparent = isDying;
        material.opacity = isDying ? 0.35 : 1;
        if (material instanceof MeshStandardMaterial) {
          material.emissive.set(isHit ? "#ff0000" : "#000000");
          material.emissiveIntensity = isHit ? 0.8 : 0;
        }
      }
    });
  }, [model, state]);

  return <primitive object={model} />;
}

// 実際の当たり判定と全く同じ大きさのワイヤーフレームを表示し、
// 「どこを切れば当たるのか」を目視できるようにする(自分のターン中のみ)。
function EnemyHitboxDebugBox({ visible }: { visible: boolean }) {
  const hitboxSize = useEnemyHitboxSizeRef();
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.scale.set(
      hitboxSize.current.x * HITBOX_MARGIN,
      hitboxSize.current.y * HITBOX_MARGIN,
      hitboxSize.current.z * HITBOX_MARGIN,
    );
    mesh.position.y = (hitboxSize.current.y * HITBOX_MARGIN) / 2;
  });

  return (
    <mesh ref={meshRef} visible={visible}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#4cc9f0" wireframe transparent opacity={0.35} />
    </mesh>
  );
}

// 敵の表示位置。JSXのposition propで宣言的に置くと、enemyオブジェクトが
// (HP変化などで)頻繁に再生成されるたびにアニメーション中の位置が巻き戻ってしまうため、
// 初期配置(新しい敵が出た瞬間)だけenemy.idをキーに一度スナップし、
// それ以降はuseFrameで近い/遠いをアニメーションさせる完全に命令的な制御にする。
function EnemyMesh({ enemy, phase }: { enemy: Enemy; phase: BattlePhase }) {
  const groupRef = useRef<Group>(null);
  const enemyPosition = useEnemyPositionRef();

  // 新しい敵(enemy.id)が出た瞬間だけ近い位置にスナップさせる
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.copy(ENEMY_NEAR_POSITION);
    }
  }, [enemy.id]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const targetZ = phase === "enemyTurn" ? ENEMY_FAR_POSITION.z : ENEMY_NEAR_POSITION.z;
    const t = Math.min(1, ENEMY_MOVE_LERP_SPEED * delta);
    group.position.z += (targetZ - group.position.z) * t;
    enemyPosition.current.copy(group.position);
  });

  return (
    <group ref={groupRef}>
      <EnemyModel modelPath={enemy.modelPath} state={enemy.state} />
      <EnemyHitboxDebugBox visible={phase === "playerTurn" && enemy.state !== "dying"} />
      {enemy.state !== "dying" && <DirectionArrowIndicator direction={enemy.requiredDirection} />}
    </group>
  );
}

// 相手のターンに敵が飛ばしてくるポリゴン(発光球)の1本分。プレイヤーの頭(カメラ)を
// 目掛けて進むが、直進だけだと単調なので出現角度ごとに横方向へ弓なりに膨らむ軌道
// (curveAxis)と、本ごとにバラつく速度(travelMs)を持たせて読みにくくしている。
// 赤=トリガー、青=グリップと色ごとに要求ボタンが決まっており、剣(柄側の端〜剣先の
// 線分)が一定距離まで近づいた瞬間に、右手コントローラーで正しいボタンを押していれば
// 防御成功、間違ったボタン・無入力ならその場で被弾扱い(ミス確定)としてonResolveを呼ぶ。
// onResolve自体は呼び出し側(VRGameLoop)で「既に決着済みか」をガードするため、
// ここでは範囲内にいる間毎フレーム呼んでも問題ない。
function ProjectileVisual({
  instance,
  onResolve,
}: {
  instance: ProjectileInstance;
  onResolve: (id: number, sliced: boolean) => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const saberTip = useSaberTipRef();
  const saberBase = useSaberBaseRef();
  const bladeLineRef = useRef(new Line3());
  const closestPointRef = useRef(new Vector3());
  const targetRef = useRef(new Vector3());
  const rightController = useXRInputSourceState("controller", "right");

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // 発射をずらしている(instance.startTimeが未来)間はまだ敵の手元で待機させ、
    // 自分の番が来てから直進を始める。
    const elapsed = performance.now() - instance.startTime;
    if (elapsed < 0) {
      mesh.position.copy(instance.spawnPosition);
      return;
    }
    const t = Math.min(1, elapsed / instance.travelMs);
    // プレイヤーの頭の位置ちょうどに収束すると剣を動かさなくても勝手に当たって
    // しまうため、targetOffset分だけずらした点を最終到達点にする。
    targetRef.current.copy(state.camera.position).add(instance.targetOffset);
    mesh.position.lerpVectors(instance.spawnPosition, targetRef.current, t);
    // 進行度0→1に対してsin(πt)は0→1→0と山なりになるため、経路の中間で
    // curveAxis方向に最大まで膨らみ、最後はプレイヤーの正面へ収束する弓なりの軌道になる。
    mesh.position.addScaledVector(instance.curveAxis, Math.sin(t * Math.PI));

    bladeLineRef.current.set(saberBase.current, saberTip.current);
    bladeLineRef.current.closestPointToPoint(mesh.position, true, closestPointRef.current);

    if (mesh.position.distanceTo(closestPointRef.current) < PROJECTILE_HIT_RADIUS) {
      const triggerPressed = rightController?.gamepad["xr-standard-trigger"]?.state === "pressed";
      const gripPressed = rightController?.gamepad["xr-standard-squeeze"]?.state === "pressed";
      // 両方同時押しは「赤にも青にも該当する」抜け道になってしまうため、
      // 両方押されている間はどちらの色に対しても不成立(被弾)にする。
      const requiredPressed = instance.color === "red" ? triggerPressed : gripPressed;
      const isCorrectButtonPressed = requiredPressed && !(triggerPressed && gripPressed);
      onResolve(instance.id, isCorrectButtonPressed);
    }
  });

  const colorHex = PROJECTILE_COLOR_HEX[instance.color];

  return (
    <mesh ref={meshRef} position={instance.spawnPosition}>
      <sphereGeometry args={[0.12, 12, 12]} />
      <meshStandardMaterial
        color={colorHex}
        emissive={colorHex}
        emissiveIntensity={2}
        toneMapped={false}
      />
    </mesh>
  );
}

useGLTF.preload("/models/food.glb");
useGLTF.preload("/models/gamema.glb");
useGLTF.preload("/models/hitonoakui.glb");
useGLTF.preload("/models/sabori.glb");
useGLTF.preload("/models/suima.glb");
useGLTF.preload(BOSS_MODEL_PATH);

function createEnemy(): Enemy {
  return spawnEnemy(ENEMY_NEAR_POSITION.clone(), { maxHp: ENEMY_MAX_HP });
}

// コントローラーの見た目を差し替えるコンポーネント。既定ではtarget-ray-space
// (ポインティング用の空間)に配置されるため、公式のXRControllerModelと同様に
// grip-spaceへ貼り直す。
function VRControllerVisual() {
  const controller = useXRInputSourceStateContext("controller");
  if (controller.inputSource.handedness !== "right") return null;
  return (
    <XRSpace space="grip-space">
      <VRLightsaber />
    </XRSpace>
  );
}

function VRGameLoop({
  onStateChange,
  onGameOver,
  onEnemyHit,
  onGuardSuccess,
  onPlayerHit,
  onSwing,
  onEnemyShoot,
}: {
  onStateChange: (enemy: Enemy, combo: ComboState, playerHp: number, phase: BattlePhase) => void;
  onGameOver: (score: number, result: "clear" | "over") => void;
  onEnemyHit: () => void;
  onGuardSuccess: () => void;
  onPlayerHit: () => void;
  onSwing: () => void;
  onEnemyShoot: () => void;
}) {
  const [enemy, setEnemy] = useState<Enemy>(createEnemy);
  const [phase, setPhase] = useState<BattlePhase>("playerTurn");
  const [combo, setCombo] = useState<ComboState>(createInitialComboState());
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [projectiles, setProjectiles] = useState<ProjectileInstance[]>([]);
  const enemyPosition = useEnemyPositionRef();
  const gameOverFiredRef = useRef(false);
  const projectileIdRef = useRef(0);

  // 1ウェーブ(同時に飛んでくる複数本)ぶんの決着待ち管理。
  // resolvedIdsRefは「このIDはもう斬った/被弾判定済み」の二重処理防止ガード、
  // waveUnresolvedRefは残り本数のカウンタ、waveMissCountRefは逃した(被弾した)本数。
  // ダメージは逃した本数分だけ加算する(ENEMY_ATTACK_DAMAGE × 本数)。
  const resolvedIdsRef = useRef(new Set<number>());
  const waveTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const waveUnresolvedRef = useRef(0);
  const waveMissCountRef = useRef(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attacksRemainingRef = useRef(1);
  const bossPendingRef = useRef(false);

  const comboRef = useRef(combo);
  const onGameOverRef = useRef(onGameOver);
  useEffect(() => {
    comboRef.current = combo;
  }, [combo]);
  useEffect(() => {
    onGameOverRef.current = onGameOver;
  }, [onGameOver]);

  useEffect(() => {
    const timer = setTimeout(() => {
      bossPendingRef.current = true;
    }, BOSS_APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  function spawnNext(): Enemy {
    if (bossPendingRef.current) {
      bossPendingRef.current = false;
      return spawnBoss(ENEMY_NEAR_POSITION.clone(), BOSS_MAX_HP, BOSS_MODEL_PATH);
    }
    return createEnemy();
  }

  // 相手のターン1回分: 複数方向・複数速度・複数軌道のポリゴンを同時に飛ばす1ウェーブ。
  // 全部斬れて初めて防御成功、1本でも自分のtravelMsに達すると被弾確定になる。
  function spawnProjectileWave() {
    waveTimersRef.current.forEach((timer) => clearTimeout(timer));
    waveTimersRef.current.clear();
    resolvedIdsRef.current.clear();
    waveMissCountRef.current = 0;
    onEnemyShoot();

    const directions = pickWaveDirections(enemy.isBoss ? BOSS_WAVE_COUNT : NORMAL_WAVE_COUNT);
    const waveStartTime = performance.now();
    const spawnPosition = spawnPositionFromEnemy(enemyPosition.current);
    const travelMsList = pickSpreadValues(
      directions.length,
      PROJECTILE_TRAVEL_MS_MIN,
      PROJECTILE_TRAVEL_MS_MAX,
    );
    // 1本目は0〜JITTER、2本目はGAP〜GAP+JITTER…と発射タイミングを確実にずらす。
    const launchOffsets = directions.map(
      (_, i) => i * PROJECTILE_LAUNCH_GAP_MS + randomBetween(0, PROJECTILE_LAUNCH_JITTER_MS),
    );
    const instances: ProjectileInstance[] = directions.map((direction, i) => {
      projectileIdRef.current += 1;
      return {
        id: projectileIdRef.current,
        spawnPosition: spawnPosition.clone(),
        startTime: waveStartTime + launchOffsets[i],
        travelMs: travelMsList[i],
        curveAxis: curveAxisForDirection(direction),
        color: randomProjectileColor(),
        targetOffset: randomTargetOffset(),
      };
    });

    waveUnresolvedRef.current = instances.length;
    setProjectiles(instances);

    instances.forEach((instance, i) => {
      const timer = setTimeout(() => {
        resolveProjectile(instance.id, false);
      }, launchOffsets[i] + instance.travelMs);
      waveTimersRef.current.set(instance.id, timer);
    });
  }

  // 1本の決着(斬れた/届いた)が付くたびに呼ばれる。ウェーブ全本が決着したら
  // finishEnemyTurnを呼ぶ(逃した本数分だけダメージが入る)。
  function resolveProjectile(id: number, sliced: boolean) {
    if (resolvedIdsRef.current.has(id)) return;
    resolvedIdsRef.current.add(id);

    const timer = waveTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      waveTimersRef.current.delete(id);
    }
    setProjectiles((prev) => prev.filter((p) => p.id !== id));
    if (sliced) {
      onGuardSuccess();
    } else {
      waveMissCountRef.current += 1;
    }

    waveUnresolvedRef.current -= 1;
    if (waveUnresolvedRef.current <= 0) {
      finishEnemyTurn(waveMissCountRef.current);
    }
  }

  function finishEnemyTurn(missCount: number) {
    const defended = missCount === 0;
    setCombo((prev) => (defended ? prev : resetCombo(prev)));

    function advanceTurn() {
      attacksRemainingRef.current -= 1;
      const proceedToNext = () => {
        if (attacksRemainingRef.current > 0) {
          spawnProjectileWave();
          return;
        }
        setEnemy((prev) => ({ ...prev, requiredDirection: randomDirection() }));
        setPhase("playerTurn");
      };

      if (enemy.isBoss) {
        cooldownTimerRef.current = setTimeout(proceedToNext, TURN_COOLDOWN_MS);
      } else {
        proceedToNext();
      }
    }

    if (defended) {
      advanceTurn();
      return;
    }

    onPlayerHit();
    setPlayerHp((hp) => {
      const nextHp = Math.max(0, hp - ENEMY_ATTACK_DAMAGE * missCount);
      if (nextHp <= 0) {
        if (!gameOverFiredRef.current) {
          gameOverFiredRef.current = true;
          onGameOverRef.current(comboRef.current.score, "over");
        }
      } else {
        advanceTurn();
      }
      return nextHp;
    });
  }

  // 自分のターン: 剣先が敵に当たった瞬間だけ呼ばれる(useVRSwingHit内でphase/敵状態を判定済み)
  useVRSwingHit(enemy, phase, (direction) => {
    onSwing(); // 方向の正誤に関わらず、刃が敵のヒットボックスに入って振りが成立した時点で鳴らす
    if (direction !== enemy.requiredDirection) return; // 方向違いは不発、ターンは継続

    const damage = calculateDamage(1, PLAYER_ATTACK_DAMAGE); // VRにswingPowerの概念はないため固定値
    const now = performance.now();
    const hitEnemy = applyDamage(enemy, damage);
    setEnemy(hitEnemy);
    onEnemyHit();

    setCombo((prev) => {
      const next = registerHit(prev, now);
      return { ...next, score: addScore(prev.score, next.combo) };
    });

    if (hitEnemy.hp > 0) {
      setPhase("enemyTurn");
    }
  });

  useEffect(() => {
    if (enemy.state !== "hit") return;
    const timer = setTimeout(() => {
      setEnemy((prev) => (prev.state === "hit" ? recoverFromHit(prev) : prev));
    }, HIT_RECOVER_MS);
    return () => clearTimeout(timer);
  }, [enemy]);

  useEffect(() => {
    if (enemy.state !== "dying") return;
    const wasBoss = enemy.isBoss;
    const timer = setTimeout(() => {
      if (wasBoss) {
        if (!gameOverFiredRef.current) {
          gameOverFiredRef.current = true;
          onGameOverRef.current(comboRef.current.score + BOSS_CLEAR_BONUS_SCORE, "clear");
        }
        return;
      }
      const next = spawnNext();
      setEnemy(next);
      setPhase("playerTurn");
      if (next.isBoss) {
        setPlayerHp(PLAYER_MAX_HP);
      }
    }, DYING_DURATION_MS);
    return () => clearTimeout(timer);
  }, [enemy.state]);

  // 相手のターン開始: 敵が離れきるのを待ってからポリゴンのウェーブを飛ばす。
  useEffect(() => {
    if (phase !== "enemyTurn") return;
    attacksRemainingRef.current = enemy.isBoss ? BOSS_ATTACKS_PER_TURN : 1;
    const timer = setTimeout(() => {
      spawnProjectileWave();
    }, ENEMY_RETREAT_MS);
    const waveTimers = waveTimersRef.current;
    return () => {
      clearTimeout(timer);
      waveTimers.forEach((t) => clearTimeout(t));
      waveTimers.clear();
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [phase]);

  useEffect(() => {
    onStateChange(enemy, combo, playerHp, phase);
  }, [enemy, combo, playerHp, phase, onStateChange]);

  return (
    <>
      <SpaceBackground />
      <LowHpOverlay hpRatio={playerHp / PLAYER_MAX_HP} />
      {enemy.isBoss ? (
        <>
          {/* 赤系の雰囲気だけだと黒い鎧が背景に沈むため、正面からの白系キーライトと
              背後からの青いリムライトで輪郭を浮かび上がらせつつ、不穏さは赤で残す */}
          <ambientLight intensity={0.45} color="#8899ff" />
          <pointLight position={[1.5, 2.5, 1.5]} intensity={1.4} color="#ffffff" />
          <pointLight position={[-2, 1.5, 1]} intensity={0.7} color="#ff3344" />
          <pointLight position={[0, 2, -4]} intensity={1.6} color="#4cc9f0" />
        </>
      ) : (
        <>
          <ambientLight intensity={0.6} />
          <pointLight position={[2, 3, 2]} intensity={1} />
        </>
      )}
      <EnemyMesh enemy={enemy} phase={phase} />
      {projectiles.map((instance) => (
        <ProjectileVisual key={instance.id} instance={instance} onResolve={resolveProjectile} />
      ))}
      <VRBattleHUD
        position={[HUD_ANCHOR_POSITION.x, HUD_ANCHOR_POSITION.y, HUD_ANCHOR_POSITION.z]}
        rotationY={HUD_ROTATION_Y}
        playerHp={playerHp}
        playerMaxHp={PLAYER_MAX_HP}
        enemyName={enemy.isBoss ? "DARTH VADER" : "ENEMY"}
        enemyHp={enemy.hp}
        enemyMaxHp={enemy.maxHp}
        combo={combo.combo}
        score={combo.score}
        phase={phase}
        incoming={projectiles.length > 0}
        isBoss={enemy.isBoss}
      />
    </>
  );
}

export default function VRGameScene() {
  const navigate = useNavigate();
  const store = useMemo(() => createXRStore({ controller: VRControllerVisual }), []);
  const saberTipRef = useRef(new Vector3());
  const saberBaseRef = useRef(new Vector3());
  const enemyHitboxSizeRef = useRef(new Vector3(0.9, MODEL_TARGET_HEIGHT, 0.6));
  const enemyPositionRef = useRef(ENEMY_NEAR_POSITION.clone());
  const enemyHitSfxRef = useRef<HTMLAudioElement>(null);
  const guardSuccessSfxRef = useRef<HTMLAudioElement>(null);
  const playerHitSfxRef = useRef<HTMLAudioElement>(null);
  const swingSfxRef = useRef<HTMLAudioElement>(null);
  const enemyShootSfxRef = useRef<HTMLAudioElement>(null);
  const [showTutorial, setShowTutorial] = useState(true);

  function playEnemyHitSfx() {
    const audio = enemyHitSfxRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = ENEMY_HIT_SFX_VOLUME;
    audio.play().catch(() => {
      // 音声ファイル未配置・自動再生ブロックなどは無視してよい
    });
  }

  function playGuardSuccessSfx() {
    const audio = guardSuccessSfxRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = GUARD_SUCCESS_SFX_VOLUME;
    audio.play().catch(() => {
      // 音声ファイル未配置・自動再生ブロックなどは無視してよい
    });
  }

  function playPlayerHitSfx() {
    const audio = playerHitSfxRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = PLAYER_HIT_SFX_VOLUME;
    audio.play().catch(() => {
      // 音声ファイル未配置・自動再生ブロックなどは無視してよい
    });
  }

  function playSwingSfx() {
    const audio = swingSfxRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = SWING_SFX_VOLUME;
    audio.play().catch(() => {
      // 音声ファイル未配置・自動再生ブロックなどは無視してよい
    });
  }

  function playEnemyShootSfx() {
    const audio = enemyShootSfxRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = ENEMY_SHOOT_SFX_VOLUME;
    audio.play().catch(() => {
      // 音声ファイル未配置・自動再生ブロックなどは無視してよい
    });
  }

  return (
    <div className="relative w-full h-[70vh] min-h-[500px]">
      <audio ref={enemyHitSfxRef} src={ENEMY_HIT_SFX_PATH} preload="auto" />
      <audio ref={guardSuccessSfxRef} src={GUARD_SUCCESS_SFX_PATH} preload="auto" />
      <audio ref={playerHitSfxRef} src={PLAYER_HIT_SFX_PATH} preload="auto" />
      <audio ref={swingSfxRef} src={SWING_SFX_PATH} preload="auto" />
      <audio ref={enemyShootSfxRef} src={ENEMY_SHOOT_SFX_PATH} preload="auto" />
      <button
        type="button"
        onClick={() => {
          store.enterVR();
        }}
        className="font-display absolute top-4 left-1/2 z-10 -translate-x-1/2 border border-cyan-400/50 px-8 py-3 text-sm tracking-[0.3em] text-cyan-200 uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
      >
        VRを開始
      </button>
      {/* gl.alpha未指定(既定true)だとcanvasのアルファ値が透ける前提になり、Quest 3等の
          パススルー対応ヘッドセットでは背景が不透明のはずのVRでも実際の部屋が透けて見えてしまう。
          alpha:falseで描画バッファを常に不透明にし、MR的な表示になるのを防ぐ。 */}
      <Canvas camera={{ position: [0, 1.5, 2], fov: 75 }} gl={{ alpha: false }}>
        <SaberTipContext.Provider value={saberTipRef}>
          <SaberBaseContext.Provider value={saberBaseRef}>
            <EnemyHitboxSizeContext.Provider value={enemyHitboxSizeRef}>
              <EnemyPositionContext.Provider value={enemyPositionRef}>
                <XR store={store}>
                  {showTutorial ? (
                    <VRTutorial onComplete={() => setShowTutorial(false)} />
                  ) : (
                    <VRGameLoop
                      onStateChange={() => {}}
                      onEnemyHit={playEnemyHitSfx}
                      onGuardSuccess={playGuardSuccessSfx}
                      onPlayerHit={playPlayerHitSfx}
                      onSwing={playSwingSfx}
                      onEnemyShoot={playEnemyShootSfx}
                      onGameOver={(score, result) => {
                        // VRセッションを張ったままナビゲートすると、ヘッドセット側の表示が
                        // このCanvasの最終フレームで止まったままになり、/resultページの
                        // スコア表示がヘッドセットから見えなくなる。先にセッションを終了させ、
                        // 通常の2D画面に戻してから遷移する。
                        store.getState().session?.end();
                        navigate("/result", { state: { score, result } });
                      }}
                    />
                  )}
                </XR>
              </EnemyPositionContext.Provider>
            </EnemyHitboxSizeContext.Provider>
          </SaberBaseContext.Provider>
        </SaberTipContext.Provider>
      </Canvas>
    </div>
  );
}
