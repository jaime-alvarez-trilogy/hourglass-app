// FR7, FR8, FR9: Config/Credentials Store
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  loadConfig,
  saveConfig,
  loadCredentials,
  saveCredentials,
  clearAll,
} from '../src/store/config';
import type { CrossoverConfig } from '../src/types/config';

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };
const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore> & { _reset: () => void };

const sampleConfig: CrossoverConfig = {
  userId: '2362707',
  fullName: 'Jane Doe',
  managerId: '2372227',
  primaryTeamId: '4584',
  teams: [{ id: '4584', name: 'Team Alpha', company: 'Acme Corp' }],
  hourlyRate: 25,
  weeklyLimit: 40,
  useQA: false,
  isManager: false,
  assignmentId: '79996',
  lastRoleCheck: '2026-03-08T00:00:00.000Z',
  debugMode: false,
  setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  mockAsyncStorage._reset();
  mockSecureStore._reset();
});

// --- FR7: Config Layer ---
describe('FR7: Config Layer — AsyncStorage', () => {
  it('loadConfig returns null when key is absent', async () => {
    const result = await loadConfig();
    expect(result).toBeNull();
  });

  it('loadConfig returns typed CrossoverConfig when key is present', async () => {
    await AsyncStorage.setItem('crossover_config', JSON.stringify(sampleConfig));
    const result = await loadConfig();
    expect(result).toEqual(sampleConfig);
  });

  it('saveConfig writes JSON to crossover_config key', async () => {
    await saveConfig(sampleConfig);
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      'crossover_config',
      JSON.stringify(sampleConfig)
    );
  });

  it('round-trip: saveConfig then loadConfig returns deeply equal object', async () => {
    await saveConfig(sampleConfig);
    const result = await loadConfig();
    expect(result).toEqual(sampleConfig);
  });

  it('loadConfig returns null on invalid JSON', async () => {
    await AsyncStorage.setItem('crossover_config', 'not-valid-json{');
    const result = await loadConfig();
    expect(result).toBeNull();
  });

  it('saveConfig propagates AsyncStorage errors — does not swallow', async () => {
    const error = new Error('AsyncStorage write failed');
    mockAsyncStorage.setItem.mockRejectedValueOnce(error);
    await expect(saveConfig(sampleConfig)).rejects.toThrow('AsyncStorage write failed');
  });
});

// --- FR8: Credentials Layer ---
describe('FR8: Credentials Layer — SecureStore', () => {
  it('saveCredentials writes both SecureStore keys', async () => {
    await saveCredentials('user@example.com', 'pass123');
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'crossover_username',
      'user@example.com'
    );
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('crossover_password', 'pass123');
  });

  it('loadCredentials returns null when username key is absent', async () => {
    await SecureStore.setItemAsync('crossover_password', 'pass123');
    const result = await loadCredentials();
    expect(result).toBeNull();
  });

  it('loadCredentials returns null when password key is absent', async () => {
    await SecureStore.setItemAsync('crossover_username', 'user@example.com');
    const result = await loadCredentials();
    expect(result).toBeNull();
  });

  it('loadCredentials returns Credentials object when both keys present', async () => {
    await SecureStore.setItemAsync('crossover_username', 'user@example.com');
    await SecureStore.setItemAsync('crossover_password', 'pass123');
    const result = await loadCredentials();
    expect(result).toEqual({ username: 'user@example.com', password: 'pass123' });
  });
});

// --- FR9 + 05-cache-hygiene FR1: Clear All ---
// clearAll now uses AsyncStorage.multiRemove with all 14 known keys (atomic, performant).
// SecureStore credentials are included as raw string literals to avoid import cycles.
describe('FR9: clearAll', () => {
  it('after clearAll, loadConfig returns null', async () => {
    await saveConfig(sampleConfig);
    await clearAll();
    const result = await loadConfig();
    expect(result).toBeNull();
  });

  it('after clearAll, loadCredentials returns null', async () => {
    await saveCredentials('user@example.com', 'pass123');
    await clearAll();
    const result = await loadCredentials();
    expect(result).toBeNull();
  });

  it('clearAll calls AsyncStorage.multiRemove with all 14 keys', async () => {
    await clearAll();
    expect(mockAsyncStorage.multiRemove).toHaveBeenCalledTimes(1);
    const [keys] = (mockAsyncStorage.multiRemove as jest.Mock).mock.calls[0];
    expect(keys).toHaveLength(14);
    expect(keys).toContain('crossover_config');
    expect(keys).toContain('crossover_username');
    expect(keys).toContain('crossover_password');
  });

  it('clearAll includes all data keys beyond the original 3', async () => {
    await clearAll();
    const [keys] = (mockAsyncStorage.multiRemove as jest.Mock).mock.calls[0];
    // Verify the additional 11 keys that were missing in the original clearAll
    expect(keys).toContain('hours_cache');
    expect(keys).toContain('ai_cache');
    expect(keys).toContain('previousWeekAIPercent');
    expect(keys).toContain('earnings_history_v1');
    expect(keys).toContain('weekly_history_v2');
    expect(keys).toContain('push_token');
    expect(keys).toContain('ai_app_history');
    expect(keys).toContain('widget_data');
    expect(keys).toContain('notif_thursday_id');
    expect(keys).toContain('notif_monday_id');
    expect(keys).toContain('prev_approval_count');
  });

  it('clearAll propagates AsyncStorage.multiRemove errors — does not swallow', async () => {
    const error = new Error('AsyncStorage multiRemove failed');
    (mockAsyncStorage.multiRemove as jest.Mock).mockRejectedValueOnce(error);
    await expect(clearAll()).rejects.toThrow('AsyncStorage multiRemove failed');
  });
});
