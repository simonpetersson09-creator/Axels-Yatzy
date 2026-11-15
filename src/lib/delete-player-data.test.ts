import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resumeRecoverableWrites, writeRecoverable } from './recoverable-storage';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), claim: vi.fn(), native: vi.fn(), remove: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'test-player', claimSession: mocks.claim }));
vi.mock('@/lib/device', () => ({ initDeviceId: async () => 'test-device' }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.native } }));
vi.mock('@capacitor/preferences', () => ({ Preferences: { remove: mocks.remove } }));
import { deletePlayerData } from './delete-player-data';
beforeEach(() => {
  resumeRecoverableWrites();
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  mocks.claim.mockResolvedValue(true); mocks.native.mockReturnValue(false);
  mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  mocks.remove.mockResolvedValue(undefined);
  localStorage.setItem('yatzy_player_name', 'Test');
  localStorage.setItem('yatzy-player-stats', '{"gamesPlayed":9}');
  localStorage.setItem('mrb_dice_shop_v1', '{"xp":7,"owned":["i_music"]}');
});
afterEach(() => vi.restoreAllMocks());
it('removes profile, statistics, XP and purchases only after server confirmation', async () => {
  await deletePlayerData();
  expect(mocks.rpc).toHaveBeenCalledWith('delete_player_data', { p_session_id: 'test-player', p_device_id: 'test-device' });
  expect(localStorage.getItem('yatzy_player_name')).toBeNull();
  expect(localStorage.getItem('yatzy-player-stats')).toBeNull();
  expect(localStorage.getItem('mrb_dice_shop_v1')).toBeNull();
});
it('keeps player data when server deletion fails', async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: false }, error: null });
  await expect(deletePlayerData()).rejects.toThrow();
  expect(localStorage.getItem('mrb_dice_shop_v1')).toBe('{"xp":7,"owned":["i_music"]}');
});
it('does not call destructive RPC when ownership fails', async () => {
  mocks.claim.mockResolvedValue(false);
  await expect(deletePlayerData()).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('removes native device identity while preserving SDK consent and unrelated storage', async () => {
  mocks.native.mockReturnValue(true);
  localStorage.setItem('IABTCF_PurposeConsents', '10010');
  localStorage.setItem('lovable:iosPreview', '1');
  sessionStorage.setItem('yatzy_saved_game', 'game');
  await deletePlayerData();
  expect(mocks.remove).toHaveBeenCalledWith({ key: 'yatzy_device_id' });
  expect(localStorage.getItem('IABTCF_PurposeConsents')).toBe('10010');
  expect(localStorage.getItem('lovable:iosPreview')).toBe('1');
  expect(sessionStorage.getItem('yatzy_saved_game')).toBeNull();
});
it('retries native cleanup without repeating successful server deletion', async () => {
  mocks.native.mockReturnValue(true); mocks.remove.mockRejectedValueOnce(new Error('native'));
  await expect(deletePlayerData()).rejects.toThrow();
  await deletePlayerData();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('yatzy_player_name')).toBeNull();
});
it('cleans local data even when both deletion marker writes fail and resumes saving', async () => {
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
    if (key === 'mrb_data_deletion_cleanup') throw new Error('full');
    original.call(this, key, value);
  });
  await deletePlayerData();
  expect(localStorage.getItem('yatzy_player_name')).toBeNull();
  expect(localStorage.getItem('mrb_dice_shop_v1')).toBeNull();
  expect(writeRecoverable('new-save', '30')).toBe(true);
});
it('retries cleanup using session marker after local marker fails without repeating deletion', async () => {
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
    if (this === localStorage && key === 'mrb_data_deletion_cleanup') throw new Error('full');
    original.call(this, key, value);
  });
  mocks.native.mockReturnValue(true);
  mocks.remove.mockRejectedValueOnce(new Error('native'));
  await expect(deletePlayerData()).rejects.toThrow('native');
  expect(sessionStorage.getItem('mrb_data_deletion_cleanup')).toBe('1');
  await deletePlayerData();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem('mrb_data_deletion_cleanup')).toBeNull();
});