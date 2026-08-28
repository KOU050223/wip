// RapierのDEFAULTにはkinematic × kinematicが含まれない。
// VRでは剣・敵・飛来物をすべてkinematicPositionで追従させるため、
// センサーの接触イベントにはこの組み合わせを明示的に追加する。
// DEFAULT (0x000f) | KINEMATIC_KINEMATIC (0xcc00)
export const KINEMATIC_SENSOR_COLLISION_TYPES = 0xcc0f as ActiveCollisionTypes;
import type { ActiveCollisionTypes } from "@dimforge/rapier3d-compat";
