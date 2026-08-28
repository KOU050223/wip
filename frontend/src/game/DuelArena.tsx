import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createXRStore, XR, XRSpace, useXR, useXRInputSourceStateContext } from "@react-three/xr";
import { useMemo, useRef, useState } from "react";
import { Group, Vector3 } from "three";
import VRLightsaber from "../components/three/VRLightsaber";
import { SaberBaseContext } from "../hooks/vrSaberBase";
import { SaberTipContext } from "../hooks/vrSaberTip";
import {
  bladeHitsBody,
  bladeTipToward,
  opponentSaberPose,
  poseSmoothingAlpha,
  type SaberPose,
  type Vector3Tuple,
} from "./duel";

const OPPONENT_BODY: Vector3Tuple = [0, 1.25, -0.6];
const BODY_RADIUS = 0.58;
const DUEL_BLADE_LENGTH = 2;
const POSE_INTERVAL_MS = 1000 / 60;
const OPPONENT_SABER_FOLLOW_RATE = 24;
const STRIKE_COOLDOWN_MS = 700;

type DuelArenaProps = {
  active: boolean;
  opponentPoseRef: React.RefObject<SaberPose | undefined>;
  onPose: (base: Vector3Tuple, tip: Vector3Tuple) => void;
  onStrike: () => void;
};

function tuple(vector: Vector3): Vector3Tuple {
  return [vector.x, vector.y, vector.z];
}

function BladeReporter({
  base,
  tip,
  active,
  onPose,
  onStrike,
}: {
  base: React.RefObject<Vector3>;
  tip: React.RefObject<Vector3>;
  active: boolean;
  onPose: DuelArenaProps["onPose"];
  onStrike: DuelArenaProps["onStrike"];
}) {
  const lastPoseAt = useRef(0);
  const lastStrikeAt = useRef(0);
  const wasTouchingBody = useRef(false);

  useFrame(() => {
    const now = performance.now();
    const baseTuple = tuple(base.current);
    const tipTuple = tuple(tip.current);
    if (now - lastPoseAt.current >= POSE_INTERVAL_MS) {
      lastPoseAt.current = now;
      onPose(baseTuple, tipTuple);
    }
    const touchingBody = bladeHitsBody(baseTuple, tipTuple, OPPONENT_BODY, BODY_RADIUS);
    if (
      active &&
      touchingBody &&
      !wasTouchingBody.current &&
      now - lastStrikeAt.current >= STRIKE_COOLDOWN_MS
    ) {
      lastStrikeAt.current = now;
      onStrike();
    }
    wasTouchingBody.current = touchingBody;
  });
  return null;
}

function PCBlade({ active, onPose, onStrike }: Omit<DuelArenaProps, "opponentPoseRef">) {
  const blade = useRef<Group>(null);
  const base = useRef(new Vector3(0.45, 1.35, 1.2));
  const tip = useRef(new Vector3(0.45, 2.05, -0.2));
  const target = useRef(new Vector3(0.45, 2.05, -0.2));
  const direction = useRef(new Vector3());
  const up = useMemo(() => new Vector3(0, 1, 0), []);

  useFrame(() => {
    const group = blade.current;
    if (!group) return;
    tip.current.fromArray(
      bladeTipToward(tuple(base.current), tuple(target.current), DUEL_BLADE_LENGTH),
    );
    direction.current.subVectors(tip.current, base.current).normalize();
    group.position.copy(base.current);
    group.quaternion.setFromUnitVectors(up, direction.current);
  });

  return (
    <>
      <mesh
        position={[0, 1.3, 0]}
        onPointerMove={(event) => target.current.copy(event.point)}
        onPointerDown={(event) => target.current.copy(event.point)}
      >
        <planeGeometry args={[7, 4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={blade}>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.25, 12]} />
          <meshStandardMaterial color="#777" />
        </mesh>
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 1.8, 12]} />
          <meshStandardMaterial color="#4cc9f0" emissive="#4cc9f0" emissiveIntensity={2} />
        </mesh>
      </group>
      <BladeReporter base={base} tip={tip} active={active} onPose={onPose} onStrike={onStrike} />
    </>
  );
}

function VRController() {
  const controller = useXRInputSourceStateContext("controller");
  if (controller.inputSource.handedness !== "right") return null;
  return (
    <XRSpace space="grip-space">
      <VRLightsaber bladeLength={DUEL_BLADE_LENGTH} />
    </XRSpace>
  );
}

function DesktopParticipant(props: Omit<DuelArenaProps, "opponentPoseRef">) {
  const inXRSession = useXR((state) => state.session != null);
  return inXRSession ? null : <PCBlade {...props} />;
}

function OpponentSaber({ poseRef }: { poseRef: DuelArenaProps["opponentPoseRef"] }) {
  const saber = useRef<Group>(null);
  const visibleBaseRef = useRef(new Vector3(0, 1, -2.5));
  const visibleTipRef = useRef(new Vector3(0, 2, -2.8));
  const targetBaseRef = useRef(new Vector3(0, 1, -2.5));
  const targetTipRef = useRef(new Vector3(0, 2, -2.8));
  const directionRef = useRef(new Vector3());
  const midpointRef = useRef(new Vector3());
  const up = useMemo(() => new Vector3(0, 1, 0), []);

  useFrame((_, delta) => {
    const group = saber.current;
    if (!group) return;
    const pose = opponentSaberPose(poseRef.current);
    targetBaseRef.current.fromArray(pose.base);
    targetTipRef.current.fromArray(pose.tip);
    const alpha = poseSmoothingAlpha(delta, OPPONENT_SABER_FOLLOW_RATE);
    visibleBaseRef.current.lerp(targetBaseRef.current, alpha);
    visibleTipRef.current.lerp(targetTipRef.current, alpha);
    directionRef.current.subVectors(visibleTipRef.current, visibleBaseRef.current);
    const length = directionRef.current.length();
    if (length === 0) return;
    midpointRef.current
      .addVectors(visibleBaseRef.current, visibleTipRef.current)
      .multiplyScalar(0.5);
    group.position.copy(midpointRef.current);
    group.quaternion.setFromUnitVectors(up, directionRef.current.normalize());
    group.scale.set(1, length, 1);
  });

  return (
    <group ref={saber}>
      <mesh>
        <cylinderGeometry args={[0.028, 0.028, 1, 12]} />
        <meshStandardMaterial color="#ff3355" emissive="#ff3355" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

function Opponent({ poseRef }: { poseRef: DuelArenaProps["opponentPoseRef"] }) {
  return (
    <group>
      <mesh position={OPPONENT_BODY}>
        <capsuleGeometry args={[0.36, 1.15, 8, 16]} />
        <meshStandardMaterial color="#8b1e3f" emissive="#3b0717" />
      </mesh>
      <mesh position={[0, 2.2, -0.6]}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color="#e8c6a5" />
      </mesh>
      <OpponentSaber poseRef={poseRef} />
    </group>
  );
}

function Camera() {
  const { camera } = useThree();
  useFrame(() => camera.lookAt(0, 1.3, 0));
  return null;
}

export default function DuelArena({ active, opponentPoseRef, onPose, onStrike }: DuelArenaProps) {
  const store = useMemo(
    () =>
      createXRStore({
        controller: VRController,
        anchors: false,
        handTracking: false,
        layers: false,
        meshDetection: false,
        planeDetection: false,
        hitTest: false,
        domOverlay: false,
        emulate: false,
      }),
    [],
  );
  const saberBase = useRef(new Vector3());
  const saberTip = useRef(new Vector3());
  const [vrError, setVRError] = useState<string>();

  return (
    <div className="relative h-[65vh] min-h-[420px] w-full overflow-hidden border border-cyan-400/40 bg-slate-950">
      <button
        type="button"
        onClick={() => {
          setVRError(undefined);
          void store.enterVR().catch(() => setVRError("この端末ではVRを開始できません"));
        }}
        className="absolute left-1/2 top-4 z-10 -translate-x-1/2 border border-cyan-300/60 bg-slate-950/80 px-5 py-2 text-sm text-cyan-100"
      >
        VRで参加
      </button>
      {vrError && (
        <p
          role="alert"
          className="absolute left-1/2 top-16 z-10 -translate-x-1/2 text-sm text-amber-200"
        >
          {vrError}
        </p>
      )}
      <Canvas camera={{ position: [0, 1.6, 3], fov: 65 }} gl={{ alpha: false }}>
        <color attach="background" args={["#05050f"]} />
        <ambientLight intensity={0.7} />
        <pointLight position={[0, 4, 2]} intensity={1.4} color="#aaddff" />
        <SaberBaseContext.Provider value={saberBase}>
          <SaberTipContext.Provider value={saberTip}>
            <XR store={store}>
              <Camera />
              <Opponent poseRef={opponentPoseRef} />
              <DesktopParticipant active={active} onPose={onPose} onStrike={onStrike} />
              <BladeReporter
                base={saberBase}
                tip={saberTip}
                active={active}
                onPose={onPose}
                onStrike={onStrike}
              />
            </XR>
          </SaberTipContext.Provider>
        </SaberBaseContext.Provider>
      </Canvas>
      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-cyan-100/80">
        PC: マウスで相手を狙って斬る / VR: 右手コントローラーで斬る
      </p>
    </div>
  );
}
