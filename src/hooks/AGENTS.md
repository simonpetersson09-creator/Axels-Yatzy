
- Online sync: every result transport shares ordered queue delivery; delayed starts preserve results, queued replay commits a rolling edge, and match generations invalidate timers/results so old flights cannot affect another game. Unmount releases rolls and batched lock sends.
