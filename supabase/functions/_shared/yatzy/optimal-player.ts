// Server: decode the optimal table once per function instance (synchronous).
import { OPTIMAL_TABLE_B64 } from './optimal-table-data.ts';
import { base64ToBytes, createOptimalPlayer, decodeTable, type OptimalPlayer } from './optimal.ts';
let player: OptimalPlayer | null = null;
export function getOptimalPlayer(): OptimalPlayer {
  if (!player) player = createOptimalPlayer(decodeTable(base64ToBytes(OPTIMAL_TABLE_B64)));
  return player;
}
