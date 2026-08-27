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
import { spawnEnemy, spawnBoss, randomDirection } from "./enemySpawn";
import { calculateDamage } from "./attackDetection";
import { applyDamage, recoverFromHit } from "./hp";
import { createInitialComboState, registerHit, resetCombo } from "./combo";
import { addScore } from "./score";
import BattleHUD from "./BattleHUD";
import Lightsaber from "../components/three/Lightsaber";
import { useJoyConContext } from "../contexts/JoyConContext";
import { useSwingDetection } from "../hooks/useSwingDetection";
import { useButtonPress, randomDefenseButton } from "../hooks/useButtonPress";
import type { JoyConState } from "../lib/joycon/joyConDevice";

// セーバー(柄)の設置位置(方向を取らないので固定)
const SABER_HIT_POSITION = new Vector3(0, 0.7, -1);
// 敵の固定表示位置(ターン制なので敵は動かず、この場で向き合う)
const ENEMY_POSITION = new Vector3(0, 1.6, -2.5);
// カメラの注視点。セーバーと敵の中間あたりの高さを見るようにして、
// 画面上部に寄りすぎないよう全体を下げて表示する。
const CAMERA_TARGET = new Vector3(0, 1.5, -1.5);

const PLAYER_MAX_HP = 1000;
const ENEMY_MAX_HP = 500;
const PLAYER_ATTACK_DAMAGE = 250; // 自分の攻撃1回のダメージ(2回でちょうど討伐できる想定)
const ENEMY_ATTACK_DAMAGE = 100; // 相手の攻撃1回で受けるダメージ(防御失敗時、ボスも同じ値)
const DEFENSE_WINDOW_MS = 800; // 防御コマンドの入力受付時間
const HIT_RECOVER_MS = 200; // 被弾演出(赤フラッシュ)の表示時間
const DYING_DURATION_MS = 300; // 撃破演出の表示時間
const TURN_COOLDOWN_MS = 300; // 防御コマンド確定後、次の判定(ボスの連続攻撃・自分のターン開始)までの間合い

// ボス(ダースベーダー)関連
const BOSS_APPEAR_AFTER_MS = 2 * 60 * 1000; // この時間生き残ったら、今の敵を倒した後にボスが出現する
const BOSS_MAX_HP = 2500;
const BOSS_MODEL_PATH = "/models/DV.glb";
const BOSS_ATTACKS_PER_TURN = 1; // 自分が1回攻撃するごとに、ボスが攻撃してくる回数
const BOSS_CLEAR_BONUS_SCORE = 5000; // ボス撃破時にスコアへ加算するボーナス
const BOSS_INTRO_DURATION_MS = 1800; // ボス出現時のタイトルカード・赤フラッシュの表示時間
const SCREEN_SHAKE_DURATION_MS = 400; // 画面シェイクの継続時間

// BGM: 下記のパスにファイルを置けば自動的に再生される(未配置の場合は再生に失敗するだけで動作に影響しない)
const BATTLE_BGM_PATH = "/audio/maou_bgm_orchestra25.mp3";
const BOSS_BGM_PATH = "/audio/maou_game_medley02.mp3";
const SWING_SFX_PATH = "/audio/raitose-ba-.m4a"; // Joy-Conを振るたびに鳴らす効果音
const BGM_VOLUME = 0.25; // 通常戦・ボス戦BGM共通の音量(効果音に対して大きすぎたため抑える)
const SWING_SFX_VOLUME = 1;

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

// 敵モデルの表示上の高さの目安(以前のボックス敵とほぼ同じ)。
// モデルごとに書き出し時のスケールがバラバラなため、これに合わせて正規化する。
const MODEL_TARGET_HEIGHT = 1.6;

// モデルによっては書き出し時の正面がZ+/Z-逆になっているため、個別に補正する。
// DV.glbはそのままだとプレイヤーに背を向けてしまうため180度回転させる。
const MODEL_FACING_OFFSET: Record<string, number> = {
  "/models/DV.glb": Math.PI,
};

// 敵モデル本体。同じモデルを複数体で使い回してもボーン等が衝突しないよう、
// ロード済みシーンをそのまま使わずSkeletonUtils.cloneで複製してから表示する。
function EnemyModel({ modelPath, state }: { modelPath: string; state: Enemy["state"] }) {
  const { scene } = useGLTF(modelPath);
  // モデルの原点がジオメトリ中心と一致しない書き出しがあるため、
  // 底面が接地しXZ中央に来るようにバウンディングボックスから補正し、
  // 高さもMODEL_TARGET_HEIGHTに揃える。
  const model = useMemo(() => {
    const cloned = cloneSkeleton(scene);
    // 一部のモデル(DV.glb等)にはプレビュー用の環境ドーム("ENV")や床平面("FLOOR")が
    // キャラクター本体と一緒に同梱されており、そのままだとバウンディングボックスが
    // それらの巨大なジオメトリに支配されてスケール計算が破綻するため除外する。
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
    return cloned;
  }, [scene, modelPath]);

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
useGLTF.preload(BOSS_MODEL_PATH);

function createEnemy(): Enemy {
  return spawnEnemy(ENEMY_POSITION.clone(), { maxHp: ENEMY_MAX_HP });
}

function GameLoop({
  joyConState,
  isJoyConConnected,
  onStateChange,
  onGameOver,
  onSwing,
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
  onGameOver: (score: number, result: "clear" | "over") => void;
  onSwing: () => void;
}) {
  const [enemy, setEnemy] = useState<Enemy>(createEnemy);
  const [phase, setPhase] = useState<BattlePhase>("playerTurn");
  const [combo, setCombo] = useState<ComboState>(createInitialComboState());
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [defenseButton, setDefenseButton] = useState<DefenseButton>(randomDefenseButton);
  const lastSwingIdRef = useRef(0);
  const lastSwingSfxIdRef = useRef(0);
  const gameOverFiredRef = useRef(false);
  const swing = useSwingDetection(joyConState);
  const buttonPress = useButtonPress(joyConState);

  // Joy-Conを振るたびに(方向・ターン不問で)効果音を鳴らす
  useEffect(() => {
    if (swing.swingId === 0 || swing.swingId === lastSwingSfxIdRef.current) return;
    lastSwingSfxIdRef.current = swing.swingId;
    onSwing();
  }, [swing.swingId, onSwing]);

  // 相手のターンの入力受付で使う状態(タイマー・ボタン入力どちらから解決されても一度だけ処理するためのガード)
  const enemyTurnResolvedRef = useRef(false);
  const enemyTurnBaselinePressIdRef = useRef(0);
  const defenseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ボスの残り攻撃回数(通常敵は常に1)。防御コマンドを解決するたびに減らし、0になったら自分のターンに戻す。
  const attacksRemainingRef = useRef(1);
  // BOSS_APPEAR_AFTER_MS経過したら true になり、次に今の敵を倒した時にボスへ切り替える。
  const bossPendingRef = useRef(false);

  // タイマー・入力ハンドラ内で最新の値を読むためのref
  // (これらを直接useEffectの依存配列に入れると、毎レンダー新しくなるonGameOverのせいで
  //  タイマーが完了前に何度も再スケジュールされてしまうため)
  const comboRef = useRef(combo);
  const onGameOverRef = useRef(onGameOver);
  const buttonPressRef = useRef(buttonPress);
  useEffect(() => {
    comboRef.current = combo;
  }, [combo]);
  useEffect(() => {
    onGameOverRef.current = onGameOver;
  }, [onGameOver]);
  useEffect(() => {
    buttonPressRef.current = buttonPress;
  }, [buttonPress]);

  // BOSS_APPEAR_AFTER_MS生き残ったらボス出現フラグを立てる(切り替え自体は今の敵を倒した後)
  useEffect(() => {
    const timer = setTimeout(() => {
      bossPendingRef.current = true;
    }, BOSS_APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  // 敵が倒された後に出す次の敵を決める。ボス出現フラグが立っていればボスを、それ以外は通常敵を返す。
  function spawnNext(): Enemy {
    if (bossPendingRef.current) {
      bossPendingRef.current = false;
      return spawnBoss(ENEMY_POSITION.clone(), BOSS_MAX_HP, BOSS_MODEL_PATH);
    }
    return createEnemy();
  }

  // 相手のターン1回分の防御コマンドを開始する(ボス戦では1ターン中に複数回呼ばれる)。
  // 基準値(enemyTurnBaselinePressIdRef)はここではリセットしない。
  // ここでリセットすると、直前のクールダウン中に押されたボタンが
  // 「まだ新しい入力がない」ことにされてしまい、無効な入力を1回消費してしまうため
  // (基準値の更新はfinishEnemyTurnでラウンドが確定した瞬間に行う)。
  function startDefenseRound() {
    if (defenseTimerRef.current) clearTimeout(defenseTimerRef.current);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    enemyTurnResolvedRef.current = false;
    setDefenseButton(randomDefenseButton());

    defenseTimerRef.current = setTimeout(() => {
      if (enemyTurnResolvedRef.current) return;
      enemyTurnResolvedRef.current = true;
      finishEnemyTurn(false);
    }, DEFENSE_WINDOW_MS);
  }

  // 相手のターンの結果を確定する(防御成功ならノーダメージ、失敗なら確定ダメージ)。
  // タイマー・ボタン入力のどちらから呼ばれても安全なように、状態はすべて関数型更新で読む。
  function finishEnemyTurn(defended: boolean) {
    if (defenseTimerRef.current) {
      clearTimeout(defenseTimerRef.current);
      defenseTimerRef.current = null;
    }
    // このラウンドの判定に使った入力を消費済みにする(クールダウン中の新しい入力は次のラウンドで有効なまま残る)。
    enemyTurnBaselinePressIdRef.current = buttonPressRef.current.pressId;
    setCombo((prev) => (defended ? prev : resetCombo(prev)));

    // ボスの連続攻撃がまだ残っていれば、自分のターンには戻さずもう一度防御させる。
    // クールダウンはボス戦のみ。通常敵は従来どおり即座に次へ進む。
    function advanceTurn() {
      attacksRemainingRef.current -= 1;
      const proceedToNext = () => {
        if (attacksRemainingRef.current > 0) {
          startDefenseRound();
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

  // 敵の撃破演出 → ボスなら勝利、通常敵なら次の敵(またはボス)を出現させて自分のターンに戻す
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
        setPlayerHp(PLAYER_MAX_HP); // ボス出現時は削れたHPを全回復する
      }
    }, DYING_DURATION_MS);
    return () => clearTimeout(timer);
  }, [enemy.state]);

  // 相手のターン開始: 攻撃回数(通常敵1回・ボス2回)を決めて防御コマンドを開始する。
  useEffect(() => {
    if (phase !== "enemyTurn") return;
    attacksRemainingRef.current = enemy.isBoss ? BOSS_ATTACKS_PER_TURN : 1;
    // ターンの最初のラウンドなので、直前(自分の攻撃時点)までの入力を基準値にする。
    enemyTurnBaselinePressIdRef.current = buttonPressRef.current.pressId;
    startDefenseRound();
    return () => {
      if (defenseTimerRef.current) clearTimeout(defenseTimerRef.current);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
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
      <CameraLookAt target={CAMERA_TARGET} />
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
  const [hudDefenseButton, setHudDefenseButton] = useState<DefenseButton>("r");
  const [showBossIntro, setShowBossIntro] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const wasBossRef = useRef(false);
  const prevPlayerHpRef = useRef(PLAYER_MAX_HP);
  const battleBgmRef = useRef<HTMLAudioElement>(null);
  const bossBgmRef = useRef<HTMLAudioElement>(null);
  const swingSfxRef = useRef<HTMLAudioElement>(null);

  function triggerShake() {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), SCREEN_SHAKE_DURATION_MS);
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

  // ボス戦↔通常戦の切り替わりに合わせてBGMを即座に切り替える。
  useEffect(() => {
    const isBoss = hudEnemy?.isBoss ?? false;
    const nextBgm = isBoss ? bossBgmRef.current : battleBgmRef.current;
    const otherBgm = isBoss ? battleBgmRef.current : bossBgmRef.current;
    if (otherBgm) {
      otherBgm.pause();
      otherBgm.currentTime = 0;
    }
    if (nextBgm) {
      nextBgm.volume = BGM_VOLUME;
    }
    nextBgm?.play().catch(() => {
      // 音声ファイル未配置・自動再生ブロックなどは無視してよい
    });
  }, [hudEnemy?.isBoss]);

  // 画面を離れる時はBGMを止める
  useEffect(() => {
    const battleBgm = battleBgmRef.current;
    const bossBgm = bossBgmRef.current;
    return () => {
      battleBgm?.pause();
      bossBgm?.pause();
    };
  }, []);

  return (
    <div className={`relative w-full h-[70vh] min-h-[500px] ${isShaking ? "screen-shake" : ""}`}>
      <audio ref={battleBgmRef} src={BATTLE_BGM_PATH} loop preload="auto" />
      <audio ref={bossBgmRef} src={BOSS_BGM_PATH} loop preload="auto" />
      <audio ref={swingSfxRef} src={SWING_SFX_PATH} preload="auto" />
      <Canvas camera={{ position: [0, 1.5, 2], fov: 75 }}>
        <GameLoop
          joyConState={joyCon.state}
          isJoyConConnected={joyCon.isConnected}
          onSwing={playSwingSfx}
          onStateChange={(enemy, combo, playerHp, phase, defenseButton) => {
            // ボス出現の瞬間だけタイトルカード+赤フラッシュ+シェイクを発火する
            if (enemy.isBoss && !wasBossRef.current) {
              setShowBossIntro(true);
              triggerShake();
              setTimeout(() => setShowBossIntro(false), BOSS_INTRO_DURATION_MS);
            }
            wasBossRef.current = enemy.isBoss;

            // ボス戦中にダメージを受けたらシェイクする
            if (enemy.isBoss && playerHp < prevPlayerHpRef.current) {
              triggerShake();
            }
            prevPlayerHpRef.current = playerHp;

            setHudCombo(combo);
            setHudHp(playerHp);
            setHudEnemy(enemy);
            setHudPhase(phase);
            setHudDefenseButton(defenseButton);
          }}
          onGameOver={(score, result) => navigate("/result", { state: { score, result } })}
        />
      </Canvas>
      <div className="absolute inset-0 pointer-events-none">
        <BattleHUD
          combo={hudCombo.combo}
          score={hudCombo.score}
          hp={hudHp}
          maxHp={PLAYER_MAX_HP}
          enemyName={hudEnemy?.isBoss ? "DARTH VADER" : "ENEMY"}
          enemyHp={hudEnemy?.hp ?? ENEMY_MAX_HP}
          enemyMaxHp={hudEnemy?.maxHp ?? ENEMY_MAX_HP}
          phase={hudPhase}
          defenseButton={hudDefenseButton}
          isBoss={hudEnemy?.isBoss ?? false}
        />
      </div>
      {showBossIntro && (
        <div className="boss-flash absolute inset-0 flex items-center justify-center pointer-events-none">
          <h2 className="title-flicker font-display text-4xl md:text-6xl tracking-[0.3em] text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.8)]">
            DARTH VADER
          </h2>
        </div>
      )}
    </div>
  );
}
