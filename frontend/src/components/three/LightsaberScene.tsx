import { Canvas } from "@react-three/fiber";
import type { JoyConVector3 } from "../../lib/joycon/joyConDevice";
import Lightsaber from "./Lightsaber";

interface LightsaberSceneProps {
  gyro: JoyConVector3 | null;
}

function LightsaberScene({ gyro }: LightsaberSceneProps) {
  return (
    <Canvas camera={{ position: [0, 0, 4], fov: 50 }} style={{ width: "100%", height: "480px" }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[2, 2, 2]} intensity={1} />
      <Lightsaber gyro={gyro} />
    </Canvas>
  );
}

export default LightsaberScene;
