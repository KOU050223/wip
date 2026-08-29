export function shouldDisplayTaunt(currentEnemyId: string | null, tauntEnemyId: string): boolean {
  return currentEnemyId === tauntEnemyId;
}

export function shouldRequestTauntForEnemy(
  currentEnemyId: string | null,
  nextEnemyId: string,
): boolean {
  return currentEnemyId !== nextEnemyId;
}

export function tauntForEnemy(
  taunt: { enemyId: string; phrase: string } | null,
  currentEnemyId: string,
): string {
  return taunt?.enemyId === currentEnemyId ? taunt.phrase : "";
}

export function pendingTauntForEnemy(enemyId: string): { enemyId: string; phrase: string } {
  return { enemyId, phrase: "ふふっ、少しだけ、ここにいてよ？" };
}

// 敵出現時は通常の台詞要求とVision要求が並行して走る。要求ごとに世代を振り、
// 「すでに表示した応答」より古い応答だけを捨てる。要求の開始ではなく表示を基準にするのは、
// 撮影が次フレームで走るぶんVision要求のほうが必ず先に始まり、開始基準だと
// 通常応答が常に破棄されてしまうため。
export function isNewerTauntResponse(
  displayedGeneration: number,
  responseGeneration: number,
): boolean {
  return responseGeneration > displayedGeneration;
}
