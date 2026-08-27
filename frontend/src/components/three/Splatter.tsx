// Splatter.tsx
// 敵の撃破時に飛び散る血しぶき・肉片の演出。
// InstancedMeshで放射状に飛ばした粒子を、重力を模した簡易物理で落下・フェードさせる。

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { InstancedMesh, Object3D } from "three";

const GRAVITY = -9.8;
const DURATION_MS = 700;

interface Particle {
  velocity: [number, number, number];
  spin: [number, number, number];
  scale: number;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createParticles(
  count: number,
  speedRange: [number, number],
  scaleRange: [number, number],
): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = randomRange(0, Math.PI * 2);
    const speed = randomRange(speedRange[0], speedRange[1]);
    return {
      velocity: [Math.cos(angle) * speed, randomRange(2, 5), Math.sin(angle) * speed],
      spin: [randomRange(-4, 4), randomRange(-4, 4), randomRange(-4, 4)],
      scale: randomRange(scaleRange[0], scaleRange[1]),
    };
  });
}

function ParticleGroup({
  origin,
  particles,
  color,
  geometry,
}: {
  origin: [number, number, number];
  particles: Particle[];
  color: string;
  geometry: ReactNode;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const startRef = useRef<number | null>(null);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - startRef.current;
    const fade = Math.max(0, 1 - (t * 1000) / DURATION_MS);

    particles.forEach((particle, i) => {
      const [vx, vy, vz] = particle.velocity;
      dummy.position.set(
        origin[0] + vx * t,
        Math.max(origin[1] - 1, origin[1] + vy * t + 0.5 * GRAVITY * t * t),
        origin[2] + vz * t,
      );
      dummy.rotation.set(particle.spin[0] * t, particle.spin[1] * t, particle.spin[2] * t);
      dummy.scale.setScalar(particle.scale * fade);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particles.length]}>
      {geometry}
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={2.5}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

export interface SplatterProps {
  position: [number, number, number];
  onComplete: () => void;
}

function Splatter({ position, onComplete }: SplatterProps) {
  const blood = useMemo(() => createParticles(28, [1.5, 4], [0.02, 0.05]), []);
  const flesh = useMemo(() => createParticles(10, [1, 3], [0.04, 0.09]), []);

  useEffect(() => {
    const timer = setTimeout(onComplete, DURATION_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <group>
      <ParticleGroup
        origin={position}
        particles={blood}
        color="#ff2d95"
        geometry={<sphereGeometry args={[1, 6, 6]} />}
      />
      <ParticleGroup
        origin={position}
        particles={flesh}
        color="#ff5e2c"
        geometry={<tetrahedronGeometry args={[1, 0]} />}
      />
    </group>
  );
}

export default Splatter;
