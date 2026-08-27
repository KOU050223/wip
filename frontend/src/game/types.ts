// types.ts
// 戦闘ロジック全体で共有する型定義

import { Vector3 } from "three";

export type EnemyState = "idle" | "hit" | "dying" | "dead";

// 敵を切るべき方向、およびJoy-Conを振った方向の分類に使う共通の型
export type SwingDirection = "up" | "down" | "left" | "right";

export type Enemy = {
  id: string;
  position: Vector3;
  hp: number;
  maxHp: number;
  state: EnemyState;
  spawnedAt: number;
  requiredDirection: SwingDirection; // この方向に振らないとダメージが入らない
  modelPath: string; // 表示に使う3Dモデル(.glb)へのパス
  isBoss: boolean; // ボス(ダースベーダー)かどうか。ターンごとの攻撃回数の分岐に使う
};

// ターン制バトルの現在の手番
export type BattlePhase = "playerTurn" | "enemyTurn";

// 防御に使えるボタン(Joy-Con Rに存在するボタンのみ)
export type DefenseButton = "a" | "b" | "x" | "y" | "r" | "zr";

export type GameEvent =
  | { type: "enemySpawned"; enemy: Enemy }
  | { type: "enemyHit"; enemyId: string; damage: number; combo: number }
  | { type: "enemyDefeated"; enemyId: string; score: number; combo: number }
  | { type: "comboReset" };

export type ComboState = {
  combo: number;
  score: number;
  lastHitAt: number;
};
