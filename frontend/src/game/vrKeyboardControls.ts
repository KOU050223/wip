import type { SwingDirection } from "./types";

const DIRECTION_BY_KEYBOARD_CODE: Partial<Record<string, SwingDirection>> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

const GUARD_COLOR_BY_KEYBOARD_CODE = {
  KeyF: "red",
  KeyG: "blue",
} as const;

export function directionForKeyboardCode(code: string): SwingDirection | null {
  return DIRECTION_BY_KEYBOARD_CODE[code] ?? null;
}

export function guardColorForKeyboardCode(code: string): "red" | "blue" | null {
  return GUARD_COLOR_BY_KEYBOARD_CODE[code as keyof typeof GUARD_COLOR_BY_KEYBOARD_CODE] ?? null;
}
