// VRGameScene.tsx
// VRモード: ターン制バトル本体をJoy-Con版(GameScene.tsx)から移植する。
// 戦闘ロジック(types.ts/enemySpawn.ts/combo.ts/hp.ts/attackDetection.ts)は無改変で流用し、
// 差し替えているのは入力方式・防御方式:
// - 自分のターンの命中判定: Joy-Conの「振った方向が一致すれば無条件ヒット」から、
//   剣先が敵の簡易ヒットボックスに実際に接触したときだけ判定するuseVRSwingHitに変更
// - 相手のターンの防御: ボタン入力ではなく、敵が離れてポリゴン(発光球)を飛ばし、
//   それをプレイヤーが自分の剣で斬れば防御成功、斬れなければ被弾する方式にする。
//   方向は問わず、剣先がポリゴンに触れれば防御成功とする。
// HUD(HP/コンボ/スコアの3Dパネル)・BGM/SFXはPhase 3/4で追加する。
// 今はプレイヤー→敵→ボスの一連の流れを実機で確認できるよう、簡易的な3Dテキストのみ表示する。

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text, useGLTF } from "@react-three/drei";
import { createXRStore, XR, XRSpace, useXRInputSourceStateContext } from "@react-three/xr";
import { Box3, Group, Line3, Mesh, MeshStandardMaterial, Vector3 } from "three";
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

// Joy-Con版(GameScene.tsx)と揃えた数値。バランスは無変更で流用する。
const ENEMY_NEAR_POSITION = new Vector3(0, 0, -2.5); // 自分のターン中、敵がいる位置(足元基準)
const ENEMY_FAR_POSITION = new Vector3(0, 0, -6); // 相手のターン中、ポリゴンを飛ばす位置まで離れる
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
const PROJECTILE_TRAVEL_MS = 1200; // ポリゴンが敵からプレイヤーまで届く時間(=防御の受付時間)
const PROJECTILE_HIT_RADIUS = 0.25; // 剣先がこの距離まで近づいたら斬れたとみなす
const PROJECTILE_SPAWN_Y = 1.4; // ポリゴンを飛ばす高さの目安
const PROJECTILE_SPAWN_POSITION = new Vector3(
  ENEMY_FAR_POSITION.x,
  PROJECTILE_SPAWN_Y,
  ENEMY_FAR_POSITION.z,
);

const BOSS_APPEAR_AFTER_MS = 2 * 60 * 1000;
const BOSS_MAX_HP = 2500;
const BOSS_MODEL_PATH = "/models/DV.glb";
const BOSS_ATTACKS_PER_TURN = 1;
const BOSS_CLEAR_BONUS_SCORE = 5000;

const DIRECTION_ARROWS: Record<SwingDirection, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

const MODEL_TARGET_HEIGHT = 1.6;

// モデルによっては書き出し時の正面がZ+/Z-逆になっているため、個別に補正する。
// DV.glbはそのままだとプレイヤーに背を向けてしまうため180度回転させる。
const MODEL_FACING_OFFSET: Record<string, number> = {
  "/models/DV.glb": Math.PI,
};

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
    const scale = size.y > 0 ? MODEL_TARGET_HEIGHT / size.y : 1;
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
      {enemy.state !== "dying" && (
        <Text
          position={[0, MODEL_TARGET_HEIGHT + 0.3, 0.41]}
          fontSize={0.4}
          color="#ffe066"
          anchorX="center"
          anchorY="middle"
        >
          {DIRECTION_ARROWS[enemy.requiredDirection]}
        </Text>
      )}
      {/* Phase 3でVRBattleHUDに置き換えるまでの仮表示。モデル幅に関わらず隠れないよう頭上に置く */}
      <Text
        position={[0, MODEL_TARGET_HEIGHT + 0.7, 0]}
        fontSize={0.15}
        color={enemy.isBoss ? "#ff6666" : "#4cc9f0"}
        anchorX="center"
        anchorY="middle"
      >
        {`${enemy.isBoss ? "DARTH VADER" : "ENEMY"}  HP ${enemy.hp}/${enemy.maxHp}`}
      </Text>
    </group>
  );
}

// 相手のターンに敵が飛ばしてくるポリゴン(発光球)。プレイヤーの頭(カメラ)を
// 目掛けて直進し、刃(柄側の端〜剣先の線分)が一定距離まで近づいたら
// 斬れたものとしてonHitを呼ぶ。剣先の一点だけでなく刃全体で判定するため、
// 根元寄りで弾いても防御成功になる。
// onHit自体は呼び出し側(VRGameLoop)で「既に決着済みか」をガードするため、
// ここでは範囲内にいる間毎フレーム呼んでも問題ない。
function ProjectileVisual({
  spawnPosition,
  startTime,
  onHit,
}: {
  spawnPosition: Vector3;
  startTime: number;
  onHit: () => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const saberTip = useSaberTipRef();
  const saberBase = useSaberBaseRef();
  const bladeLineRef = useRef(new Line3());
  const closestPointRef = useRef(new Vector3());

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = Math.min(1, (performance.now() - startTime) / PROJECTILE_TRAVEL_MS);
    mesh.position.lerpVectors(spawnPosition, state.camera.position, t);

    bladeLineRef.current.set(saberBase.current, saberTip.current);
    bladeLineRef.current.closestPointToPoint(mesh.position, true, closestPointRef.current);

    if (mesh.position.distanceTo(closestPointRef.current) < PROJECTILE_HIT_RADIUS) {
      onHit();
    }
  });

  return (
    <mesh ref={meshRef} position={spawnPosition}>
      <sphereGeometry args={[0.12, 12, 12]} />
      <meshStandardMaterial
        color="#ff3344"
        emissive="#ff3344"
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
}: {
  onStateChange: (enemy: Enemy, combo: ComboState, playerHp: number, phase: BattlePhase) => void;
  onGameOver: (score: number, result: "clear" | "over") => void;
}) {
  const [enemy, setEnemy] = useState<Enemy>(createEnemy);
  const [phase, setPhase] = useState<BattlePhase>("playerTurn");
  const [combo, setCombo] = useState<ComboState>(createInitialComboState());
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [projectile, setProjectile] = useState<{ id: number; startTime: number } | null>(null);
  const gameOverFiredRef = useRef(false);
  const projectileIdRef = useRef(0);

  const enemyTurnResolvedRef = useRef(false);
  const projectileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // 相手のターン1回分: ポリゴンを1発飛ばし、斬れなければPROJECTILE_TRAVEL_MS後に被弾確定する。
  function spawnProjectile() {
    if (projectileTimerRef.current) clearTimeout(projectileTimerRef.current);
    enemyTurnResolvedRef.current = false;
    projectileIdRef.current += 1;
    const startTime = performance.now();
    setProjectile({ id: projectileIdRef.current, startTime });

    projectileTimerRef.current = setTimeout(() => {
      if (enemyTurnResolvedRef.current) return;
      enemyTurnResolvedRef.current = true;
      setProjectile(null);
      finishEnemyTurn(false);
    }, PROJECTILE_TRAVEL_MS);
  }

  // ポリゴンを斬れた瞬間に呼ばれる(ProjectileVisualから)。
  function handleProjectileSliced() {
    if (enemyTurnResolvedRef.current) return;
    enemyTurnResolvedRef.current = true;
    if (projectileTimerRef.current) {
      clearTimeout(projectileTimerRef.current);
      projectileTimerRef.current = null;
    }
    setProjectile(null);
    finishEnemyTurn(true);
  }

  function finishEnemyTurn(defended: boolean) {
    setCombo((prev) => (defended ? prev : resetCombo(prev)));

    function advanceTurn() {
      attacksRemainingRef.current -= 1;
      const proceedToNext = () => {
        if (attacksRemainingRef.current > 0) {
          spawnProjectile();
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

    setPlayerHp((hp) => {
      const nextHp = Math.max(0, hp - ENEMY_ATTACK_DAMAGE);
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
    if (direction !== enemy.requiredDirection) return; // 方向違いは不発、ターンは継続

    const damage = calculateDamage(1, PLAYER_ATTACK_DAMAGE); // VRにswingPowerの概念はないため固定値
    const now = performance.now();
    const hitEnemy = applyDamage(enemy, damage);
    setEnemy(hitEnemy);

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

  // 相手のターン開始: 敵が離れきるのを待ってからポリゴンを飛ばす。
  useEffect(() => {
    if (phase !== "enemyTurn") return;
    attacksRemainingRef.current = enemy.isBoss ? BOSS_ATTACKS_PER_TURN : 1;
    const timer = setTimeout(() => {
      spawnProjectile();
    }, ENEMY_RETREAT_MS);
    return () => {
      clearTimeout(timer);
      if (projectileTimerRef.current) clearTimeout(projectileTimerRef.current);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [phase]);

  useEffect(() => {
    onStateChange(enemy, combo, playerHp, phase);
  }, [enemy, combo, playerHp, phase, onStateChange]);

  return (
    <>
      {enemy.isBoss ? (
        <>
          <ambientLight intensity={0.25} color="#ff3344" />
          <pointLight position={[2, 3, 2]} intensity={0.5} color="#ff3344" />
          <pointLight position={[0, 0.4, -1.5]} intensity={2} color="#ff0000" />
        </>
      ) : (
        <>
          <ambientLight intensity={0.6} />
          <pointLight position={[2, 3, 2]} intensity={1} />
        </>
      )}
      <EnemyMesh enemy={enemy} phase={phase} />
      {projectile && (
        <ProjectileVisual
          key={projectile.id}
          spawnPosition={PROJECTILE_SPAWN_POSITION}
          startTime={projectile.startTime}
          onHit={handleProjectileSliced}
        />
      )}
      {/* Phase 3でVRBattleHUDに置き換えるまでの仮表示 */}
      <Text
        position={[0, 2.4, -1]}
        fontSize={0.15}
        color={phase === "playerTurn" ? "#4cc9f0" : "#ff6666"}
        anchorX="center"
        anchorY="middle"
      >
        {`${phase === "playerTurn" ? "YOUR TURN" : projectile ? "INCOMING! SLICE IT!" : "ENEMY TURN"}  HP ${playerHp}/${PLAYER_MAX_HP}  COMBO ${combo.combo}`}
      </Text>
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

  return (
    <div className="relative w-full h-[70vh] min-h-[500px]">
      <button
        type="button"
        onClick={() => {
          store.enterVR();
        }}
        className="font-display absolute top-4 left-1/2 z-10 -translate-x-1/2 border border-cyan-400/50 px-8 py-3 text-sm tracking-[0.3em] text-cyan-200 uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
      >
        VRを開始
      </button>
      <Canvas camera={{ position: [0, 1.5, 2], fov: 75 }}>
        <SaberTipContext.Provider value={saberTipRef}>
          <SaberBaseContext.Provider value={saberBaseRef}>
            <EnemyHitboxSizeContext.Provider value={enemyHitboxSizeRef}>
              <EnemyPositionContext.Provider value={enemyPositionRef}>
                <XR store={store}>
                  <VRGameLoop
                    onStateChange={() => {}}
                    onGameOver={(score, result) =>
                      navigate("/result", { state: { score, result } })
                    }
                  />
                </XR>
              </EnemyPositionContext.Provider>
            </EnemyHitboxSizeContext.Provider>
          </SaberBaseContext.Provider>
        </SaberTipContext.Provider>
      </Canvas>
    </div>
  );
}
