import { Billboard, Text } from "@react-three/drei";
import { DoubleSide } from "three";

export const ENEMY_SPEECH_BUBBLE_OFFSET: [number, number, number] = [-1.15, 2.6, 0.08];
export const ENEMY_SPEECH_BUBBLE_FONT_SIZE = 0.13;
const BUBBLE_WIDTH = 2.4;
const BUBBLE_HEIGHT = 1.1;

export function EnemySpeechBubble({ phrase, isBoss }: { phrase: string; isBoss: boolean }) {
  if (!phrase) return null;
  const accentColor = isBoss ? "#ff7182" : "#f0b8ff";

  return (
    <Billboard position={ENEMY_SPEECH_BUBBLE_OFFSET} follow>
      <group>
        <mesh position={[0, 0, -0.012]}>
          <planeGeometry args={[BUBBLE_WIDTH, BUBBLE_HEIGHT]} />
          <meshBasicMaterial color="#10091c" transparent opacity={0.94} side={DoubleSide} />
        </mesh>
        <mesh position={[0, 0, -0.008]}>
          <planeGeometry args={[BUBBLE_WIDTH + 0.035, BUBBLE_HEIGHT + 0.035]} />
          <meshBasicMaterial color={accentColor} transparent opacity={0.75} side={DoubleSide} />
        </mesh>
        <mesh position={[0, 0, -0.004]}>
          <planeGeometry args={[BUBBLE_WIDTH, BUBBLE_HEIGHT]} />
          <meshBasicMaterial color="#10091c" side={DoubleSide} />
        </mesh>
        <mesh position={[0, -BUBBLE_HEIGHT / 2 - 0.07, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.11, 0.16, 3]} />
          <meshBasicMaterial color="#10091c" side={DoubleSide} />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={ENEMY_SPEECH_BUBBLE_FONT_SIZE}
          maxWidth={2.05}
          lineHeight={1.25}
          overflowWrap="break-word"
          color="#ffffff"
          outlineWidth={0.006}
          outlineColor="#1a0826"
          anchorX="center"
          anchorY="middle"
        >
          {`「${phrase}」`}
        </Text>
      </group>
    </Billboard>
  );
}
