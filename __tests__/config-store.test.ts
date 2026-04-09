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

// --- FR9: Clear All ---
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

  it('clearAll calls AsyncStorage.removeItem for crossover_config', async () => {
    await clearAll();
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('crossover_config');
  });

  it('clearAll calls SecureStore.deleteItemAsync for crossover_username', async () => {
    await clearAll();
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('crossover_username');
  });

  it('clearAll calls SecureStore.deleteItemAsync for crossover_password', async () => {
    await clearAll();
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('crossover_password');
  });

  it('clearAll propagates errors — does not swallow deletion failures', async () => {
    const error = new Error('SecureStore delete failed');
    mockSecureStore.deleteItemAsync.mockRejectedValueOnce(error);
    await expect(clearAll()).rejects.toThrow('SecureStore delete failed');
  });
});
