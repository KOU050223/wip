import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  Box3,
  PerspectiveCamera,
  Quaternion,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
  WebGLRenderTarget,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useSaberBaseRef } from "../hooks/vrSaberBase";
import { useSaberTipRef } from "../hooks/vrSaberTip";

const OBSERVATION_SIZE = 256;
const ENEMY_EYE_HEIGHT = 1.45;
const OPPONENT_VIEW_LAYER = 1;
export const STORMTROOPER_MODEL_PATH = "/models/first-order-stormtrooper.glb";
const AVATAR_TARGET_HEIGHT = 1.75;

export function opponentEyePosition([x, y, z]: [number, number, number]): [number, number, number] {
  return [x, y + ENEMY_EYE_HEIGHT, z];
}

function pixelsToDataURL(pixels: Uint8Array): string {
  const canvas = document.createElement("canvas");
  canvas.width = OBSERVATION_SIZE;
  canvas.height = OBSERVATION_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable");
  const imageData = context.createImageData(OBSERVATION_SIZE, OBSERVATION_SIZE);
  for (let y = 0; y < OBSERVATION_SIZE; y += 1) {
    const sourceStart = (OBSERVATION_SIZE - y - 1) * OBSERVATION_SIZE * 4;
    imageData.data.set(pixels.subarray(sourceStart, sourceStart + OBSERVATION_SIZE * 4), y * OBSERVATION_SIZE * 4);
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function OpponentViewCapture({
  captureKey,
  enemyPosition,
  onCapture,
}: {
  captureKey: string;
  enemyPosition: Vector3;
  onCapture: (image: string) => void;
}) {
  const { camera: playerCamera, gl, scene } = useThree();
  const pendingKeyRef = useRef<string | null>(captureKey);
  const target = useMemo(
    () => new WebGLRenderTarget(OBSERVATION_SIZE, OBSERVATION_SIZE, { format: RGBAFormat, type: UnsignedByteType }),
    [],
  );
  const opponentCamera = useMemo(() => new PerspectiveCamera(62, 1, 0.1, 30), []);
  const pixels = useMemo(() => new Uint8Array(OBSERVATION_SIZE * OBSERVATION_SIZE * 4), []);
  const playerPosition = useMemo(() => new Vector3(), []);

  useEffect(() => {
    opponentCamera.layers.enable(OPPONENT_VIEW_LAYER);
  }, [opponentCamera]);

  useEffect(() => {
    pendingKeyRef.current = captureKey;
  }, [captureKey]);
  useEffect(() => () => target.dispose(), [target]);

  useFrame(() => {
    if (pendingKeyRef.current !== captureKey) return;
    pendingKeyRef.current = null;
    playerCamera.getWorldPosition(playerPosition);
    opponentCamera.position.fromArray(
      opponentEyePosition([enemyPosition.x, enemyPosition.y, enemyPosition.z]),
    );
    opponentCamera.lookAt(playerPosition);

    const previousTarget = gl.getRenderTarget();
    const xrEnabled = gl.xr.enabled;
    try {
      gl.xr.enabled = false;
      gl.setRenderTarget(target);
      gl.render(scene, opponentCamera);
      gl.readRenderTargetPixels(target, 0, 0, OBSERVATION_SIZE, OBSERVATION_SIZE, pixels);
      onCapture(pixelsToDataURL(pixels));
    } catch {
      // Visionは演出専用。取得不能なら通常の台詞生成へフォールバックする。
    } finally {
      gl.setRenderTarget(previousTarget);
      gl.xr.enabled = xrEnabled;
    }
  });

  return null;
}

// 通常のプレイヤーカメラには映さず、敵の観測カメラにだけ映る簡易アバター。
// WebXRの頭・両手・剣の実座標を使うため、Visionが見る姿勢は実際の操作に追従する。
export function OpponentViewAvatar() {
  const { camera } = useThree();
  const saberBase = useSaberBaseRef();
  const saberTip = useSaberTipRef();
  const groupRef = useRef<import("three").Group>(null);
  const saberRef = useRef<import("three").Mesh>(null);
  const { scene } = useGLTF(STORMTROOPER_MODEL_PATH);
  const stormtrooper = useMemo(() => {
    const model = cloneSkeleton(scene);
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = size.y > 0 ? AVATAR_TARGET_HEIGHT / size.y : 1;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    return model;
  }, [scene]);
  const midpoint = useMemo(() => new Vector3(), []);
  const direction = useMemo(() => new Vector3(), []);
  const forward = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const rotation = useMemo(() => new Quaternion(), []);

  useEffect(() => {
    groupRef.current?.traverse((object) => object.layers.set(OPPONENT_VIEW_LAYER));
  }, []);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.copy(camera.position).addScaledVector(up, -1.62);
      camera.getWorldDirection(forward);
      groupRef.current.rotation.y = Math.atan2(forward.x, forward.z);
    }
    if (saberRef.current) {
      direction.subVectors(saberTip.current, saberBase.current);
      const length = direction.length();
      if (length > 0) {
        midpoint.copy(saberBase.current).addScaledVector(direction, 0.5);
        rotation.setFromUnitVectors(up, direction.normalize());
        saberRef.current.position.copy(midpoint);
        saberRef.current.quaternion.copy(rotation);
        saberRef.current.scale.set(1, length, 1);
      }
    }
  });

  return (
    <group ref={groupRef} name="opponent-view-player">
      <primitive object={stormtrooper} />
      <mesh ref={saberRef}>
        <cylinderGeometry args={[0.018, 0.018, 1, 8]} />
        <meshBasicMaterial color="#39ff76" toneMapped={false} />
      </mesh>
    </group>
  );
}

useGLTF.preload(STORMTROOPER_MODEL_PATH);
