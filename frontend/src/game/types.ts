// types.ts
// 戦闘ロジック全体で共有する型定義

import { Vector3 } from "three";

export type EnemyState = "idle" | "hit" | "dying" | "dead";

export type Enemy = {
  id: string;
  position: Vector3;
  hp: number;
  maxHp: number;
  state: EnemyState;
  spawnedAt: number;
  hitRadius: number; // 当たり判定用の半径(Bounding Sphere方式)
  approachSpeed: number; // 奥(-z)から手前(+z)へ近づく速度(units/sec)
  baseX: number; // フェイント(左右の揺さぶり)の中心となるx座標
  feintPhase: number; // フェイントの位相(個体ごとにばらけさせる)
  feintFrequency: number; // フェイントの周期の速さ(個体ごとにばらけさせる)
};

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
