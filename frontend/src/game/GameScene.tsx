// GameScene.tsx
// ターン制バトル:
// 敵が現れる → (自分のターン)矢印の方向にJoy-Conを振って攻撃 → 命中したら相手のターン →
// 相手が攻撃してくる → また自分のターン → … を、どちらかのHPが尽きるまで繰り返す。
//
// 前提:
// - Joy-Conの接続状態・センサー値はJoyConContext(useJoyConContext)から取得する。
// - スイング検出(useSwingDetection)が加速度から swingId/swingPower/swingDirection を算出する。
// - 自分のターン中に、振った方向(swingDirection)が敵の指定方向(requiredDirection)と一致した時だけ攻撃が成立する。
//   方向が違っても不発になるだけで、自分のターンは継続する(何度でも振り直せる)。
// - 敵は1体ずつ固定位置に現れ、動き回らない。

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useThree } from "@react-three/fiber";
import { Text, useGLTF } from "@react-three/drei";
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { Enemy, ComboState, SwingDirection, BattlePhase, DefenseButton } from "./types";
import { spawnEnemy, randomDirection } from "./enemySpawn";
import { calculateDamage } from "./attackDetection";
import { applyDamage, recoverFromHit } from "./hp";
import { createInitialComboState, registerHit, resetCombo } from "./combo";
import { addScore } from "./score";
import BattleHUD from "./BattleHUD";
import Lightsaber from "../components/three/Lightsaber";
import Splatter from "../components/three/Splatter";
import { useJoyConContext } from "../contexts/JoyConContext";
import { useSwingDetection } from "../hooks/useSwingDetection";
import { useButtonPress, randomDefenseButton } from "../hooks/useButtonPress";
import type { JoyConState } from "../lib/joycon/joyConDevice";

// セーバー(柄)の設置位置(方向を取らないので固定)
const SABER_HIT_POSITION = new Vector3(0, 0.7, -1);
// 敵の固定表示位置(ターン制なので敵は動かず、この場で向き合う)
const ENEMY_POSITION = new Vector3(0, 1.7, -4);

const PLAYER_MAX_HP = 1000;
const ENEMY_MAX_HP = 500;
const PLAYER_ATTACK_DAMAGE = 250; // 自分の攻撃1回のダメージ(2回でちょうど討伐できる想定)
const ENEMY_ATTACK_DAMAGE = 100; // 相手の攻撃1回で受けるダメージ(防御失敗時)
const DEFENSE_WINDOW_MS = 800; // 防御コマンドの入力受付時間
const HIT_RECOVER_MS = 200; // 被弾演出(赤フラッシュ)の表示時間
const DYING_DURATION_MS = 800; // 撃破演出の表示時間(スプラッターが消えるまで見えるようSplatterの演出時間と揃えている)

function CameraLookAt({ target }: { target: Vector3 }) {
  // Canvasのcameraはposition指定のみだと(0,0,-1)方向を向くだけで、
  // セーバー位置を狙わないため、明示的に向きを合わせて画面中央に来るようにする。
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(target);
  }, [camera, target]);
  return null;
}

const DIRECTION_ARROWS: Record<SwingDirection, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

// 敵モデル本体。同じモデルを複数体で使い回してもボーン等が衝突しないよう、
// ロード済みシーンをそのまま使わずSkeletonUtils.cloneで複製してから表示する。
function EnemyModel({ modelPath, state }: { modelPath: string; state: Enemy["state"] }) {
  const { scene } = useGLTF(modelPath);
  // モデルの原点がジオメトリ中心と一致しない書き出しがあるため、
  // 底面が接地しXZ中央に来るようにバウンディングボックスから補正する。
  const model = useMemo(() => {
    const cloned = cloneSkeleton(scene);
    const box = new Box3().setFromObject(cloned);
    const center = box.getCenter(new Vector3());
    cloned.position.set(-center.x, -box.min.y, -center.z);
    return cloned;
  }, [scene]);

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

function EnemyMesh({ enemy }: { enemy: Enemy }) {
  return (
    <group position={enemy.position}>
      <EnemyModel modelPath={enemy.modelPath} state={enemy.state} />
      {enemy.state !== "dying" && (
        <Text
          position={[0, 1.6, 0.41]}
          fontSize={0.6}
          color="#ffe066"
          anchorX="center"
          anchorY="middle"
        >
          {DIRECTION_ARROWS[enemy.requiredDirection]}
        </Text>
      )}
    </group>
  );
}

useGLTF.preload("/models/food.glb");
useGLTF.preload("/models/gamema.glb");
useGLTF.preload("/models/hitonoakui.glb");
useGLTF.preload("/models/sabori.glb");
useGLTF.preload("/models/suima.glb");

function createEnemy(): Enemy {
  return spawnEnemy(ENEMY_POSITION.clone(), { maxHp: ENEMY_MAX_HP });
}

function GameLoop({
  joyConState,
  isJoyConConnected,
  onStateChange,
  onGameOver,
}: {
  joyConState: JoyConState | null;
  isJoyConConnected: boolean;
  onStateChange: (
    enemy: Enemy,
    combo: ComboState,
    playerHp: number,
    phase: BattlePhase,
    defenseButton: DefenseButton,
  ) => void;
  onGameOver: (score: number) => void;
}) {
  const [enemy, setEnemy] = useState<Enemy>(createEnemy);
  const [phase, setPhase] = useState<BattlePhase>("playerTurn");
  const [combo, setCombo] = useState<ComboState>(createInitialComboState());
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [defenseButton, setDefenseButton] = useState<DefenseButton>(randomDefenseButton);
  const [splatters, setSplatters] = useState<{ id: string; position: [number, number, number] }[]>(
    [],
  );
  const lastSwingIdRef = useRef(0);
  const gameOverFiredRef = useRef(false);
  const splatterSpawnedForRef = useRef<string | null>(null);
  const swing = useSwingDetection(joyConState);
  const buttonPress = useButtonPress(joyConState);

  // 相手のターンの入力受付で使う状態(タイマー・ボタン入力どちらから解決されても一度だけ処理するためのガード)
  const enemyTurnResolvedRef = useRef(false);
  const enemyTurnBaselinePressIdRef = useRef(0);

  // タイマー・入力ハンドラ内で最新のscoreとonGameOverを読むためのref
  // (これらを直接useEffectの依存配列に入れると、毎レンダー新しくなるonGameOverのせいで
  //  タイマーが完了前に何度も再スケジュールされてしまうため)
  const comboRef = useRef(combo);
  const onGameOverRef = useRef(onGameOver);
  useEffect(() => {
    comboRef.current = combo;
  }, [combo]);
  useEffect(() => {
    onGameOverRef.current = onGameOver;
  }, [onGameOver]);

  // 相手のターンの結果を確定する(防御成功ならノーダメージ、失敗なら確定ダメージ)。
  // タイマー・ボタン入力のどちらから呼ばれても安全なように、状態はすべて関数型更新で読む。
  function finishEnemyTurn(defended: boolean) {
    setCombo((prev) => (defended ? prev : resetCombo(prev)));

    if (defended) {
      setEnemy((prev) => ({ ...prev, requiredDirection: randomDirection() }));
      setPhase("playerTurn");
      return;
    }

    setPlayerHp((hp) => {
      const nextHp = Math.max(0, hp - ENEMY_ATTACK_DAMAGE);
      if (nextHp <= 0) {
        if (!gameOverFiredRef.current) {
          gameOverFiredRef.current = true;
          onGameOverRef.current(comboRef.current.score);
        }
      } else {
        setEnemy((prev) => ({ ...prev, requiredDirection: randomDirection() }));
        setPhase("playerTurn");
      }
      return nextHp;
    });
  }

  // 自分のターン: 方向が一致した振りだけ攻撃として成立する
  useEffect(() => {
    if (!isJoyConConnected) return;
    if (phase !== "playerTurn") return;
    if (swing.swingId === lastSwingIdRef.current) return;
    lastSwingIdRef.current = swing.swingId;
    if (enemy.state === "dying" || enemy.state === "dead") return;
    if (swing.swingDirection !== enemy.requiredDirection) return; // 方向違いは不発、ターンは継続

    const damage = calculateDamage(swing.swingPower, PLAYER_ATTACK_DAMAGE);
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
    // hp<=0の場合は下のuseEffect(撃破演出→次の敵)に処理を任せる
  }, [swing.swingId, swing.swingDirection, swing.swingPower, isJoyConConnected, phase, enemy]);

  // 被弾演出(赤フラッシュ)を一定時間後に戻す
  useEffect(() => {
    if (enemy.state !== "hit") return;
    const timer = setTimeout(() => {
      setEnemy((prev) => (prev.state === "hit" ? recoverFromHit(prev) : prev));
    }, HIT_RECOVER_MS);
    return () => clearTimeout(timer);
  }, [enemy]);

  // 敵の撃破演出 → 次の敵を出現させて自分のターンに戻す
  useEffect(() => {
    if (enemy.state !== "dying") return;
    const timer = setTimeout(() => {
      setEnemy(createEnemy());
      setPhase("playerTurn");
    }, DYING_DURATION_MS);
    return () => clearTimeout(timer);
  }, [enemy.state]);

  // 撃破の瞬間(dyingに遷移した瞬間)に1度だけスプラッター演出を発生させる
  useEffect(() => {
    if (enemy.state !== "dying") return;
    if (splatterSpawnedForRef.current === enemy.id) return;
    splatterSpawnedForRef.current = enemy.id;

    const splatterId = `${enemy.id}-splatter`;
    setSplatters((prev) => [
      ...prev,
      { id: splatterId, position: [enemy.position.x, enemy.position.y, enemy.position.z] },
    ]);
  }, [enemy.state, enemy.id, enemy.position]);

  // 相手のターン開始: 防御ボタンを決め、DEFENSE_WINDOW_MS以内に入力がなければ防御失敗とする。
  // phaseのみに依存させている(buttonPress.pressIdは意図的に含めていない)。
  // 含めてしまうと、下の入力監視effectが解決するのと同時にこのeffectも「新たに突入した」と
  // 誤認して防御ボタン・受付時間をリセットしてしまい、判定が正しく確定しなくなる。
  useEffect(() => {
    if (phase !== "enemyTurn") return;
    enemyTurnResolvedRef.current = false;
    enemyTurnBaselinePressIdRef.current = buttonPress.pressId;
    setDefenseButton(randomDefenseButton());

    const timer = setTimeout(() => {
      if (enemyTurnResolvedRef.current) return;
      enemyTurnResolvedRef.current = true;
      finishEnemyTurn(false);
    }, DEFENSE_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // 相手のターン中の入力監視: 防御ウィンドウ開始後に新しいボタン入力があれば即座に成否を判定する。
  // 正しいボタンなら防御成功、それ以外(間違ったボタン)なら即座に防御失敗になる。
  useEffect(() => {
    if (phase !== "enemyTurn") return;
    if (enemyTurnResolvedRef.current) return;
    if (buttonPress.pressId === enemyTurnBaselinePressIdRef.current) return; // まだ新しい入力がない

    enemyTurnResolvedRef.current = true;
    finishEnemyTurn(buttonPress.pressedButton === defenseButton);
  }, [phase, buttonPress.pressId, buttonPress.pressedButton, defenseButton]);

  useEffect(() => {
    onStateChange(enemy, combo, playerHp, phase, defenseButton);
  }, [enemy, combo, playerHp, phase, defenseButton, onStateChange]);

  return (
    <>
      <CameraLookAt target={SABER_HIT_POSITION} />
      <ambientLight intensity={0.6} />
      <pointLight position={[2, 3, 2]} intensity={1} />
      <Lightsaber
        gyro={joyConState?.gyro ?? null}
        resetTrigger={joyConState?.buttons.plus ?? false}
        position={[SABER_HIT_POSITION.x, SABER_HIT_POSITION.y, SABER_HIT_POSITION.z]}
      />
      <EnemyMesh enemy={enemy} />
      {splatters.map((s) => (
        <Splatter
          key={s.id}
          position={s.position}
          onComplete={() => setSplatters((prev) => prev.filter((p) => p.id !== s.id))}
        />
      ))}
    </>
  );
}

export default function GameScene() {
  const joyCon = useJoyConContext();
  const navigate = useNavigate();
  const [hudCombo, setHudCombo] = useState<ComboState>(createInitialComboState());
  const [hudHp, setHudHp] = useState(PLAYER_MAX_HP);
  const [hudEnemy, setHudEnemy] = useState<Enemy | null>(null);
  const [hudPhase, setHudPhase] = useState<BattlePhase>("playerTurn");
  const [hudDefenseButton, setHudDefenseButton] = useState<DefenseButton>("r");

  return (
    <div className="relative w-full h-[70vh] min-h-[500px]">
      <Canvas camera={{ position: [0, 1.5, 2], fov: 75 }}>
        <GameLoop
          joyConState={joyCon.state}
          isJoyConConnected={joyCon.isConnected}
          onStateChange={(enemy, combo, playerHp, phase, defenseButton) => {
            setHudCombo(combo);
            setHudHp(playerHp);
            setHudEnemy(enemy);
            setHudPhase(phase);
            setHudDefenseButton(defenseButton);
          }}
          onGameOver={(score) => navigate("/result", { state: { score } })}
        />
      </Canvas>
      <div className="absolute inset-0 pointer-events-none">
        <BattleHUD
          combo={hudCombo.combo}
          score={hudCombo.score}
          hp={hudHp}
          maxHp={PLAYER_MAX_HP}
          enemyHp={hudEnemy?.hp ?? ENEMY_MAX_HP}
          enemyMaxHp={ENEMY_MAX_HP}
          phase={hudPhase}
          defenseButton={hudDefenseButton}
        />
      </div>
    </div>
  );
}
