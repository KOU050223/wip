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

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { Vector3 } from "three";

import type { Enemy, ComboState, SwingDirection, BattlePhase } from "./types";
import { spawnEnemy, randomDirection } from "./enemySpawn";
import { calculateDamage } from "./attackDetection";
import { applyDamage, recoverFromHit } from "./hp";
import { createInitialComboState, registerHit, resetCombo } from "./combo";
import { addScore } from "./score";
import BattleHUD from "./BattleHUD";
import Lightsaber from "../components/three/Lightsaber";
import { useJoyConContext } from "../contexts/JoyConContext";
import { useSwingDetection } from "../hooks/useSwingDetection";
import type { JoyConState } from "../lib/joycon/joyConDevice";

// セーバー(柄)の設置位置(方向を取らないので固定)
const SABER_HIT_POSITION = new Vector3(0, 0.7, -1);
// 敵の固定表示位置(ターン制なので敵は動かず、この場で向き合う)
const ENEMY_POSITION = new Vector3(0, 1.7, -4);

const PLAYER_MAX_HP = 100;
const ENEMY_MAX_HP = 500;
const PLAYER_ATTACK_DAMAGE = 250; // 自分の攻撃1回のダメージ(2回でちょうど討伐できる想定)
const ENEMY_ATTACK_DAMAGE = 10; // 相手の攻撃1回で受けるダメージ
const ENEMY_TURN_DELAY_MS = 900; // 相手のターンで「攻撃してくる」までのタメ時間
const HIT_RECOVER_MS = 200; // 被弾演出(赤フラッシュ)の表示時間
const DYING_DURATION_MS = 300; // 撃破演出の表示時間

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

function EnemyMesh({ enemy }: { enemy: Enemy }) {
  const opacity = enemy.state === "dying" ? 0.3 : 1;
  const color = enemy.state === "hit" ? "#ff6b6b" : "#8855ff";

  return (
    <group position={enemy.position}>
      <mesh>
        <boxGeometry args={[0.8, 1.6, 0.8]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
      {enemy.state !== "dying" && (
        <Text
          position={[0, 0.3, 0.41]}
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
  onStateChange: (enemy: Enemy, combo: ComboState, playerHp: number, phase: BattlePhase) => void;
  onGameOver: (score: number) => void;
}) {
  const [enemy, setEnemy] = useState<Enemy>(createEnemy);
  const [phase, setPhase] = useState<BattlePhase>("playerTurn");
  const [combo, setCombo] = useState<ComboState>(createInitialComboState());
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const lastSwingIdRef = useRef(0);
  const gameOverFiredRef = useRef(false);
  const swing = useSwingDetection(joyConState);

  // 相手のターンのタイマー内で最新のscoreとonGameOverを読むためのref
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

  // 相手のターン: 少し間を置いてから攻撃してくる
  // phaseのみに依存させることで、他の状態変化やonGameOverの参照が変わっても
  // タイマーが途中で再スケジュールされず、確実に一度だけ発火するようにしている。
  useEffect(() => {
    if (phase !== "enemyTurn") return;
    const timer = setTimeout(() => {
      setCombo((prev) => resetCombo(prev));
      setPlayerHp((hp) => {
        const nextHp = Math.max(0, hp - ENEMY_ATTACK_DAMAGE);

        if (nextHp <= 0) {
          if (!gameOverFiredRef.current) {
            gameOverFiredRef.current = true;
            onGameOverRef.current(comboRef.current.score);
          }
        } else {
          // 次の自分のターンに備えて切るべき方向を引き直す
          setEnemy((prev) => ({ ...prev, requiredDirection: randomDirection() }));
          setPhase("playerTurn");
        }

        return nextHp;
      });
    }, ENEMY_TURN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    onStateChange(enemy, combo, playerHp, phase);
  }, [enemy, combo, playerHp, phase, onStateChange]);

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

  return (
    <div className="relative w-full h-[70vh] min-h-[500px]">
      <Canvas camera={{ position: [0, 1.5, 2], fov: 75 }}>
        <GameLoop
          joyConState={joyCon.state}
          isJoyConConnected={joyCon.isConnected}
          onStateChange={(enemy, combo, playerHp, phase) => {
            setHudCombo(combo);
            setHudHp(playerHp);
            setHudEnemy(enemy);
            setHudPhase(phase);
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
        />
      </div>
    </div>
  );
}
