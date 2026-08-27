// useButtonPress.ts
// Joy-Conのボタン入力を検出するフック(防御コマンド用)。
// 対象ボタン(a/b/x/y/r/zr、いずれもJoy-Con Rに存在するボタン)のいずれかが
// 押された瞬間(rising edge)を検出し、どのボタンが押されたかとpressId(edge検出用)を返す。

import { useEffect, useRef, useState } from "react";
import type { JoyConButtons, JoyConState } from "../lib/joycon/joyConDevice";
import type { DefenseButton } from "../game/types";

export const DEFENSE_BUTTONS: DefenseButton[] = ["a", "b", "x", "y", "r", "zr"];

export function randomDefenseButton(): DefenseButton {
  return DEFENSE_BUTTONS[Math.floor(Math.random() * DEFENSE_BUTTONS.length)];
}

export interface ButtonPressResult {
  pressedButton: DefenseButton | null; // 直近に押されたボタン
  pressId: number; // 押されるたびに増える(edge検出用)
}

export function useButtonPress(state: JoyConState | null): ButtonPressResult {
  const [result, setResult] = useState<ButtonPressResult>({ pressedButton: null, pressId: 0 });
  const prevButtonsRef = useRef<JoyConButtons | null>(null);
  const pressIdRef = useRef(0);

  useEffect(() => {
    if (!state) return;
    const prevButtons = prevButtonsRef.current;

    if (prevButtons) {
      for (const button of DEFENSE_BUTTONS) {
        if (state.buttons[button] && !prevButtons[button]) {
          pressIdRef.current += 1;
          setResult({ pressedButton: button, pressId: pressIdRef.current });
          break; // 同時押しは最初に見つかった1つだけを採用する
        }
      }
    }
    prevButtonsRef.current = state.buttons;
  }, [state]);

  return result;
}
