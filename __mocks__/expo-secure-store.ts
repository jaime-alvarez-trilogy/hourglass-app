// In-memory mock for expo-secure-store
// Exports match the real module: named exports used via `import * as SecureStore`
const store: Record<string, string> = {};

export const getItemAsync = jest.fn(async (key: string): Promise<string | null> => {
  return store[key] ?? null;
});

export const setItemAsync = jest.fn(async (key: string, value: string): Promise<void> => {
  store[key] = value;
});

export const deleteItemAsync = jest.fn(async (key: string): Promise<void> => {
  delete store[key];
});

// Reset all state and mock implementations between tests
export const _reset = () => {
  Object.keys(store).forEach((k) => delete store[k]);
  getItemAsync.mockClear();
  setItemAsync.mockClear();
  deleteItemAsync.mockClear();
  getItemAsync.mockImplementation(async (key: string) => store[key] ?? null);
  setItemAsync.mockImplementation(async (key: string, value: string) => {
    store[key] = value;
  });
  deleteItemAsync.mockImplementation(async (key: string) => {
    delete store[key];
  });
};

const SecureStore = { getItemAsync, setItemAsync, deleteItemAsync, _reset };
export default SecureStore;
