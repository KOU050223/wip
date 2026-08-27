import type { UsecaseCreateScoreInput } from "../api/generated/models";

export function createResultScoreSubmission(
  playerName: string,
  score: number,
): UsecaseCreateScoreInput {
  return {
    player_name: playerName.trim(),
    score,
    max_combo: 0,
    clear_time: 0,
  };
}
