// In-memory mock for @react-native-async-storage/async-storage
const store: Record<string, string> = {};

const AsyncStorage = {
  getItem: jest.fn(async (key: string): Promise<string | null> => {
    return store[key] ?? null;
  }),
  setItem: jest.fn(async (key: string, value: string): Promise<void> => {
    store[key] = value;
  }),
  removeItem: jest.fn(async (key: string): Promise<void> => {
    delete store[key];
  }),
  // Reset all state between tests
  _reset: () => {
    Object.keys(store).forEach((k) => delete store[k]);
    AsyncStorage.getItem.mockClear();
    AsyncStorage.setItem.mockClear();
    AsyncStorage.removeItem.mockClear();
    AsyncStorage.getItem.mockImplementation(async (key: string) => store[key] ?? null);
    AsyncStorage.setItem.mockImplementation(async (key: string, value: string) => {
      store[key] = value;
    });
    AsyncStorage.removeItem.mockImplementation(async (key: string) => {
      delete store[key];
    });
  },
};

export default AsyncStorage;
