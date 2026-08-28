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
