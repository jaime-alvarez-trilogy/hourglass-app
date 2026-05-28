// In-memory mock for expo-sharing.

export const shareAsync = jest.fn(async (_uri: string, _opts?: { dialogTitle?: string; mimeType?: string; UTI?: string }) => {
  // No-op success by default. Tests may override via mockRejectedValueOnce.
});

export const isAvailableAsync = jest.fn(async () => true);

export const _reset = () => {
  shareAsync.mockClear();
  isAvailableAsync.mockClear();
  shareAsync.mockImplementation(async () => undefined);
  isAvailableAsync.mockImplementation(async () => true);
};

const Sharing = { shareAsync, isAvailableAsync, _reset };
export default Sharing;
