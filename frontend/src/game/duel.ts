export const DUEL_MAX_HP = 3;

export type DuelEvent =
  | { type: "duel.ready"; playerID: string }
  | { type: "duel.start"; startsAt: number }
  | { type: "duel.strike"; playerID: string; id: string }
  | { type: "duel.pose"; playerID: string; base: Vector3Tuple; tip: Vector3Tuple };

export type Vector3Tuple = [number, number, number];
export type SaberPose = { base: Vector3Tuple; tip: Vector3Tuple };

const opponentSaberHand: Vector3Tuple = [0.45, 1.35, -0.35];
const saberLength = 2;

export type DuelState = {
  phase: "lobby" | "active";
  opponentReady: boolean;
  startsAt?: number;
  playerHP: number;
  opponentHP: number;
  lastLocalStrikeID?: string;
  lastOpponentStrikeID?: string;
};

export function createDuelState(): DuelState {
  return { phase: "lobby", opponentReady: false, playerHP: DUEL_MAX_HP, opponentHP: DUEL_MAX_HP };
}

export function applyDuelEvent(state: DuelState, event: DuelEvent, playerID: string): DuelState {
  if (event.type === "duel.ready") {
    return event.playerID === playerID ? state : { ...state, opponentReady: true };
  }
  if (event.type === "duel.start") {
    return state.phase === "active"
      ? state
      : { ...state, phase: "active", startsAt: event.startsAt };
  }
  if (event.type === "duel.pose") return state;
  if (state.phase !== "active") return state;
  if (event.playerID === playerID) {
    if (state.lastLocalStrikeID === event.id) return state;
    return {
      ...state,
      opponentHP: Math.max(0, state.opponentHP - 1),
      lastLocalStrikeID: event.id,
    };
  }
  if (state.lastOpponentStrikeID === event.id) return state;
  return {
    ...state,
    playerHP: Math.max(0, state.playerHP - 1),
    lastOpponentStrikeID: event.id,
  };
}

export function parseDuelEvent(payload: string): DuelEvent | undefined {
  try {
    const message = JSON.parse(payload) as { type?: string; payload?: string };
    if (message.type !== "room.message" || typeof message.payload !== "string") return undefined;
    const event = JSON.parse(message.payload) as DuelEvent;
    if (event.type === "duel.ready" && typeof event.playerID === "string") return event;
    if (event.type === "duel.start" && typeof event.startsAt === "number") return event;
    if (
      event.type === "duel.strike" &&
      typeof event.playerID === "string" &&
      typeof event.id === "string"
    ) {
      return event;
    }
    if (
      event.type === "duel.pose" &&
      typeof event.playerID === "string" &&
      isVector3Tuple(event.base) &&
      isVector3Tuple(event.tip)
    ) {
      return event;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function bladeHitsBody(
  base: Vector3Tuple,
  tip: Vector3Tuple,
  bodyCenter: Vector3Tuple,
  radius: number,
): boolean {
  const blade = [tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]];
  const bodyOffset = [bodyCenter[0] - base[0], bodyCenter[1] - base[1], bodyCenter[2] - base[2]];
  const bladeLengthSquared = blade[0] ** 2 + blade[1] ** 2 + blade[2] ** 2;
  const projection =
    bladeLengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            (bodyOffset[0] * blade[0] + bodyOffset[1] * blade[1] + bodyOffset[2] * blade[2]) /
              bladeLengthSquared,
          ),
        );
  const nearest = [
    base[0] + blade[0] * projection,
    base[1] + blade[1] * projection,
    base[2] + blade[2] * projection,
  ];
  const distanceSquared =
    (bodyCenter[0] - nearest[0]) ** 2 +
    (bodyCenter[1] - nearest[1]) ** 2 +
    (bodyCenter[2] - nearest[2]) ** 2;
  return distanceSquared <= radius ** 2;
}

export function bladeTipToward(
  base: Vector3Tuple,
  target: Vector3Tuple,
  length: number,
): Vector3Tuple {
  const direction = [target[0] - base[0], target[1] - base[1], target[2] - base[2]];
  const distance = Math.hypot(...direction);
  if (distance === 0) return base;
  return [
    base[0] + (direction[0] / distance) * length,
    base[1] + (direction[1] / distance) * length,
    base[2] + (direction[2] / distance) * length,
  ];
}

export function poseSmoothingAlpha(deltaSeconds: number, followRate: number): number {
  return 1 - Math.exp(-deltaSeconds * followRate);
}

export function opponentSaberPose(pose: SaberPose | undefined): SaberPose {
  if (!pose) {
    return { base: opponentSaberHand, tip: [0.45, 2.52, -1.52] };
  }
  const direction = [
    pose.base[0] - pose.tip[0],
    pose.tip[1] - pose.base[1],
    pose.base[2] - pose.tip[2],
  ];
  const length = Math.hypot(...direction);
  if (length === 0) return opponentSaberPose(undefined);
  return {
    base: opponentSaberHand,
    tip: [
      opponentSaberHand[0] + (direction[0] / length) * saberLength,
      opponentSaberHand[1] + (direction[1] / length) * saberLength,
      opponentSaberHand[2] + (direction[2] / length) * saberLength,
    ],
  };
}

function isVector3Tuple(value: unknown): value is Vector3Tuple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
  );
}
