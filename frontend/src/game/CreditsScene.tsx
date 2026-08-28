// CreditsScene.tsx
// DV(ダース・ベイダー)を倒したあとに流すエンドロール。スターウォーズ風に、
// クレジットの各行を宇宙空間に浮かぶ板(オブジェクト)として奥から流し、
// プレイヤーはそれを殴ってどこかへ飛ばせる。VR / 非VR(Joy-Con)どちらの
// バトル画面からも同じこのコンポーネントを使う。
//
// 殴る入力は2系統。両方同時に有効:
//  1. VRコントローラー(Quest等): FistsContext 経由で共有される左右 grip 原点(握り拳)の
//     ワールド座標を読み、拳が板に十分近づいた瞬間の拳の速度が一定以上なら「殴った」と
//     みなし、その速度方向へ板を飛ばす。ゆっくり触れただけでは飛ばない。
//     ※ FistsContext.Provider が無い(非VR)場合はこの系統は自動的に無効になる。
//  2. Switch の Joy-Con: WebHID では加速度・ジャイロしか取れず空間内の位置が分からないため、
//     「振りを検出したら "一番手前(カメラに近い)の板" が飛ぶ」方式にする。振り方向(上下左右)は
//     飛んでいく向きの横/縦成分に反映し、強く振るほど速く飛ぶ。
//
// 終了条件: 時間経過のみ。全行を出しきって余韻を置いたら "THE END" を表示し、
// さらに数秒後に onFinish() を呼ぶ(呼び出し側で /result へ遷移する)。

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Stars, Text } from "@react-three/drei";
import { DoubleSide, Group, Mesh, Vector3 } from "three";

import { useOptionalFistsRef } from "../hooks/vrFists";
import { useSwingDetection } from "../hooks/useSwingDetection";
import type { JoyConState } from "../lib/joycon/joyConDevice";
import {
  CREDIT_LINES,
  CREDIT_SPAWN_INTERVAL_MS,
  CREDIT_DRIFT_SPEED,
  CREDIT_SPAWN_Z,
  CREDIT_DESPAWN_Z,
  CREDIT_TAIL_MS,
  CREDIT_END_HOLD_MS,
  JP_FONT_PATH,
} from "./credits";

// --- VRコントローラーの拳で殴る判定まわり ---
// 板の中心からこの距離まで拳が近づいたら接触とみなす(板は横長なので、細かい形状は
// 見ずに少し寛容な球で判定して「殴りやすさ」を優先する)。
const PUNCH_REACH = 0.85;
// 接触した瞬間の拳の速さがこれ未満なら「触れただけ」で飛ばさない(m/秒)。
const PUNCH_SPEED_MIN = 1.1;
// 飛んでいく速さ = 拳の速さ × この倍率(上限あり)。
const FLING_SPEED_FACTOR = 1.6;
const FLING_SPEED_MAX = 9;

// --- Joy-Con の振りで殴る判定まわり ---
// 振りの強さ(加速度の大きさ)× この倍率 を飛翔速度にする(下限・上限でクランプ)。
const JOYCON_FLING_SPEED_PER_POWER = 2.2;
const JOYCON_FLING_SPEED_MIN = 4.5;
const JOYCON_FLING_SPEED_MAX = 9;
// 飛んでいく向き: 「カメラ→板(奥へ)」を主成分に、振り方向の横/縦成分をこの強さで足す。
const JOYCON_SWING_COMPONENT = 0.9;

// --- 共通 ---
// 当たった瞬間に少し上向きの初速を足して、上に跳ねてから飛んでいくようにする。
const FLING_UP_BOOST = 1.2;
// 飛翔中にかける重力(弱め。軽く放物線を描いてから宇宙へ流れていく感じにする)。
const FLING_GRAVITY = 2.2;
// 殴られた板が消えるまでの寿命(ミリ秒)。最後の 0.4 秒で縮んで消える。
const FLUNG_LIFETIME_MS = 3600;
const FLUNG_SHRINK_MS = 400;

// 拳コライダーの可視化(黄色い半透明の球)の半径。
const FIST_VIZ_RADIUS = 0.13;

// クレジット板の見た目サイズ。
const SLAB_HALF_W = 1.15;
const SLAB_HALF_H = 0.17;

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

type FistName = "left" | "right";
const FIST_NAMES: readonly FistName[] = ["left", "right"];

type FistKin = Record<FistName, { pos: Vector3; vel: Vector3; prev: Vector3; started: boolean }>;

// 親(CreditsScene)が Joy-Con の振りに反応して「どの板を飛ばすか」を選び、
// 命令的に飛ばせるようにするための、板1枚ぶんの操作口。
type SlabApi = {
  isLive: () => boolean; // まだ流れている(未撃破)か
  getPosition: () => Vector3 | null; // ワールド座標(未準備/撃破済みなら null)
  fling: (direction: Vector3, speed: number) => void; // 指定方向へ飛ばす
};

// 左右の拳の「今の位置」と「速度」を毎フレーム計算して共有する。
// FistsContext が無い(非VR)場合は更新されないゼロ値の ref を返すだけ。
function useFistKinematics(): RefObject<FistKin> {
  const fists = useOptionalFistsRef();
  const kinRef = useRef<FistKin>({
    left: { pos: new Vector3(), vel: new Vector3(), prev: new Vector3(), started: false },
    right: { pos: new Vector3(), vel: new Vector3(), prev: new Vector3(), started: false },
  });

  useFrame((_, delta) => {
    if (!fists) return;
    const dt = Math.max(delta, 1e-4);
    for (const name of FIST_NAMES) {
      const k = kinRef.current[name];
      const cur = fists[name].current;
      if (!k.started) {
        k.prev.copy(cur);
        k.started = true;
      }
      k.vel.subVectors(cur, k.prev).divideScalar(dt);
      k.pos.copy(cur);
      k.prev.copy(cur);
    }
  });

  return kinRef;
}

// 拳の当たり判定位置を見せる球(VR で「ここで殴れる」と分かるように)。非VRでは何も出さない。
function FistColliderViz() {
  const fists = useOptionalFistsRef();
  const meshRefs = useRef<Record<FistName, Mesh | null>>({ left: null, right: null });

  useFrame(() => {
    if (!fists) return;
    for (const name of FIST_NAMES) {
      const mesh = meshRefs.current[name];
      if (!mesh) continue;
      const pos = fists[name].current;
      // コントローラー未接続時は原点に張り付くので隠す。
      mesh.visible = pos.lengthSq() > 1e-6;
      mesh.position.copy(pos);
    }
  });

  if (!fists) return null;

  return (
    <>
      {FIST_NAMES.map((name) => (
        <mesh
          key={name}
          ref={(m) => {
            meshRefs.current[name] = m;
          }}
        >
          <sphereGeometry args={[FIST_VIZ_RADIUS, 16, 16]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

function CreditSlab({
  id,
  text,
  kinRef,
  registerApi,
  unregisterApi,
  onFlung,
  onGone,
}: {
  id: number;
  text: string;
  kinRef: RefObject<FistKin>;
  registerApi: (id: number, api: SlabApi) => void;
  unregisterApi: (id: number) => void;
  onFlung: () => void;
  onGone: () => void;
}) {
  const groupRef = useRef<Group>(null);
  const flungRef = useRef(false);
  const goneRef = useRef(false);
  const velRef = useRef(new Vector3());
  const angVelRef = useRef(new Vector3());
  const flungAtRef = useRef(0);
  // 出現位置と上下揺れの位相はマウント時に一度だけ抽選する(レンダー中に乱数を
  // 呼ぶと不安定になるため useEffect 内で決める)。
  const bobPhaseRef = useRef(0);
  const readyRef = useRef(false);

  // 指定した向き・速さで板を飛ばす(VRの拳/Joy-Conの振り、どちらからも使う)。
  const flingWith = useCallback(
    (direction: Vector3, speed: number) => {
      if (flungRef.current || goneRef.current) return;
      velRef.current.copy(direction).normalize().multiplyScalar(speed);
      velRef.current.y += FLING_UP_BOOST;
      angVelRef.current.set(randBetween(-8, 8), randBetween(-8, 8), randBetween(-8, 8));
      flungRef.current = true;
      flungAtRef.current = performance.now();
      onFlung();
    },
    [onFlung],
  );

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.set(randBetween(-1.2, 1.2), randBetween(1.05, 2.05), CREDIT_SPAWN_Z);
    bobPhaseRef.current = Math.random() * Math.PI * 2;
    readyRef.current = true;
  }, []);

  // 親から命令的に飛ばせるよう、この板の操作口を登録する。
  useEffect(() => {
    const api: SlabApi = {
      isLive: () => readyRef.current && !flungRef.current && !goneRef.current,
      getPosition: () =>
        readyRef.current && !goneRef.current ? (groupRef.current?.position ?? null) : null,
      fling: flingWith,
    };
    registerApi(id, api);
    return () => unregisterApi(id);
  }, [id, registerApi, unregisterApi, flingWith]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group || !readyRef.current || goneRef.current) return;
    const dt = Math.min(delta, 0.05);
    const now = performance.now();

    const gone = () => {
      goneRef.current = true;
      onGone();
    };

    if (!flungRef.current) {
      // 奥から手前へゆっくり流す + わずかに上下に揺らす。
      group.position.z += CREDIT_DRIFT_SPEED * dt;
      group.position.y += Math.sin(now / 650 + bobPhaseRef.current) * 0.06 * dt;
      group.lookAt(state.camera.position.x, group.position.y, state.camera.position.z);

      if (group.position.z > CREDIT_DESPAWN_Z) {
        gone();
        return;
      }

      // VRコントローラーの拳が十分な速さで触れたら飛ばす。
      const kin = kinRef.current;
      for (const name of FIST_NAMES) {
        const k = kin[name];
        if (k.pos.lengthSq() < 1e-6) continue; // 未接続の拳は無視
        if (k.pos.distanceTo(group.position) > PUNCH_REACH) continue;
        if (k.vel.length() < PUNCH_SPEED_MIN) break; // 触れているが遅い → 飛ばさない
        const speed = Math.min(k.vel.length() * FLING_SPEED_FACTOR, FLING_SPEED_MAX);
        flingWith(k.vel, speed);
        break;
      }
      return;
    }

    // 殴られたあと: 弱い重力つきで飛翔 + 回転。寿命が来たら縮んで消える。
    velRef.current.y -= FLING_GRAVITY * dt;
    group.position.addScaledVector(velRef.current, dt);
    group.rotation.x += angVelRef.current.x * dt;
    group.rotation.y += angVelRef.current.y * dt;
    group.rotation.z += angVelRef.current.z * dt;

    const age = now - flungAtRef.current;
    if (age >= FLUNG_LIFETIME_MS) {
      gone();
      return;
    }
    if (age > FLUNG_LIFETIME_MS - FLUNG_SHRINK_MS) {
      group.scale.setScalar(Math.max(0, (FLUNG_LIFETIME_MS - age) / FLUNG_SHRINK_MS));
    }
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <planeGeometry args={[SLAB_HALF_W * 2, SLAB_HALF_H * 2]} />
        <meshBasicMaterial
          color="#04102a"
          transparent
          opacity={0.5}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Text
        font={JP_FONT_PATH}
        fontSize={0.15}
        maxWidth={SLAB_HALF_W * 2 - 0.08}
        color="#ffe9b0"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.004}
        outlineColor="#000000"
        position={[0, 0, 0.01]}
      >
        {text}
      </Text>
    </group>
  );
}

// 全行を出しきったあとに出す締めの表示。
function TheEnd({ score }: { score: number }) {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    // 出た瞬間だけ小さく → 等倍にポップインさせる。
    const s = group.scale.x + (1 - group.scale.x) * Math.min(1, delta * 6);
    group.scale.setScalar(s);
  });
  return (
    <group ref={groupRef} position={[0, 1.55, -2.2]} scale={0.2}>
      <Text
        font={JP_FONT_PATH}
        fontSize={0.42}
        color="#ffd166"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        THE END
      </Text>
      <Text
        font={JP_FONT_PATH}
        fontSize={0.1}
        color="#9fd8ff"
        anchorX="center"
        anchorY="middle"
        position={[0, -0.4, 0]}
      >
        {`SCORE ${score.toLocaleString()}　結果画面へ…`}
      </Text>
    </group>
  );
}

type Item = { id: number; text: string };

export default function CreditsScene({
  score,
  joyConState,
  onFinish,
  onPunch,
}: {
  score: number;
  // Joy-Con のセンサー値。<Canvas> の外では React context が届かないため、
  // 既存の GameLoop と同様に親から prop で渡す(非VR/VRどちらの親も対応)。
  joyConState: JoyConState | null;
  onFinish: () => void;
  onPunch: () => void;
}) {
  const kinRef = useFistKinematics();
  const camera = useThree((s) => s.camera);
  const swing = useSwingDetection(joyConState);
  const [items, setItems] = useState<Item[]>([]);
  const [ended, setEnded] = useState(false);
  const idRef = useRef(0);
  const nextLineRef = useRef(0);
  const finishedRef = useRef(false);
  const lastSwingIdRef = useRef(0);
  const slabApisRef = useRef(new Map<number, SlabApi>());

  // 親(GameScene / VRGameScene)は Joy-Con のストリームで毎フレーム再レンダーされ得るため、
  // onPunch の identity が変わっても子の useEffect が貼り直しにならないよう ref 経由で固定する。
  const onPunchRef = useRef(onPunch);
  useEffect(() => {
    onPunchRef.current = onPunch;
  });
  const handlePunch = useCallback(() => onPunchRef.current(), []);

  const registerApi = useCallback((id: number, api: SlabApi) => {
    slabApisRef.current.set(id, api);
  }, []);
  const unregisterApi = useCallback((id: number) => {
    slabApisRef.current.delete(id);
  }, []);

  // 1行ずつ順番に投入していく。
  useEffect(() => {
    const spawn = () => {
      if (nextLineRef.current >= CREDIT_LINES.length) return;
      const text = CREDIT_LINES[nextLineRef.current];
      nextLineRef.current += 1;
      idRef.current += 1;
      const id = idRef.current;
      setItems((prev) => [...prev, { id, text }]);
    };
    spawn(); // 最初の1行はすぐ
    const timer = setInterval(spawn, CREDIT_SPAWN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // 全行を出しきる時間 + 余韻 のあと "THE END" を出す。
  useEffect(() => {
    const total = CREDIT_LINES.length * CREDIT_SPAWN_INTERVAL_MS + CREDIT_TAIL_MS;
    const timer = setTimeout(() => setEnded(true), total);
    return () => clearTimeout(timer);
  }, []);

  // "THE END" 表示からさらに数秒後に結果画面へ。
  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinish();
    }, CREDIT_END_HOLD_MS);
    return () => clearTimeout(timer);
  }, [ended, onFinish]);

  // Joy-Con の振りを検出したら「一番手前の板」を、振った方向へ飛ばす。
  useEffect(() => {
    if (swing.swingId === 0 || swing.swingId === lastSwingIdRef.current) return;
    lastSwingIdRef.current = swing.swingId;

    const camPos = camera.position;
    let target: SlabApi | null = null;
    let bestDistance = Infinity;
    for (const api of slabApisRef.current.values()) {
      if (!api.isLive()) continue;
      const pos = api.getPosition();
      if (!pos) continue;
      const distance = pos.distanceTo(camPos);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = api;
      }
    }
    const targetPos = target?.getPosition();
    if (!target || !targetPos) return;

    // カメラ→板(=奥へ飛ばす向き)を主成分に、振り方向の横/縦成分を足す。
    const away = targetPos.clone().sub(camPos).normalize();
    const cameraRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const component = new Vector3();
    if (swing.swingDirection === "up") component.set(0, 1, 0);
    else if (swing.swingDirection === "down") component.set(0, -1, 0);
    else if (swing.swingDirection === "left") component.copy(cameraRight).multiplyScalar(-1);
    else if (swing.swingDirection === "right") component.copy(cameraRight);

    const direction = away.addScaledVector(component, JOYCON_SWING_COMPONENT);
    direction.y += 0.2;

    const speed = Math.min(
      Math.max(swing.swingPower * JOYCON_FLING_SPEED_PER_POWER, JOYCON_FLING_SPEED_MIN),
      JOYCON_FLING_SPEED_MAX,
    );
    target.fling(direction, speed);
    onPunchRef.current();
  }, [swing.swingId, swing.swingDirection, swing.swingPower, camera]);

  const removeItem = useCallback(
    (id: number) => setItems((prev) => prev.filter((it) => it.id !== id)),
    [],
  );

  return (
    <>
      <color attach="background" args={["#04040d"]} />
      <Stars radius={90} depth={60} count={4000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.7} />
      <pointLight position={[0, 3, 2]} intensity={1.2} />
      <pointLight position={[0, 2, -5]} intensity={1.4} color="#4cc9f0" />

      <FistColliderViz />

      {items.map((item) => (
        <CreditSlab
          key={item.id}
          id={item.id}
          text={item.text}
          kinRef={kinRef}
          registerApi={registerApi}
          unregisterApi={unregisterApi}
          onFlung={handlePunch}
          onGone={() => removeItem(item.id)}
        />
      ))}

      {ended && <TheEnd score={score} />}
    </>
  );
}
