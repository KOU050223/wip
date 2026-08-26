// hp.ts
// HP管理・状態遷移ロジック

import type { Enemy, EnemyState } from "./types";

/**
 * 敵にダメージを与え、HPが尽きたら dying に遷移させる。
 * 呼び出し側(戦闘ロジック本体)はこの結果を見てイベントを発火する。
 */
export function applyDamage(enemy: Enemy, damage: number): Enemy {
const nextHp = Math.max(0, enemy.hp - damage);
const nextState: EnemyState = nextHp <= 0 ? "dying" : "hit";
return { ...enemy, hp: nextHp, state: nextState };
}

/**
 * dying状態の敵を、演出時間経過後に dead へ確定させる。
 * (配列からの削除は呼び出し側に委ねる)
 */
export function finalizeDeath(enemy: Enemy): Enemy {
return { ...enemy, state: "dead" };
}

/**
 * 被弾後、一定時間経過したら idle に戻す(HPが複数ある敵向け)。
 */
export function recoverFromHit(enemy: Enemy): Enemy {
if (enemy.state === "hit") {
    return { ...enemy, state: "idle" };
}
return enemy;
}

export function isDead(enemy: Enemy): boolean {
return enemy.state === "dead";
}

export function isAlive(enemy: Enemy): boolean {
return enemy.state !== "dead" && enemy.state !== "dying";
}