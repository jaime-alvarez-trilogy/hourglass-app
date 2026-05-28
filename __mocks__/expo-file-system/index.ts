// In-memory mock for expo-file-system (legacy API surface).
// We export the same surface twice: as `expo-file-system` (root) and as
// `expo-file-system/legacy` via jest.config moduleNameMapper.

const files: Record<string, string> = {};
let docDir = '/mock-docs/';

export const documentDirectory = docDir;

export const writeAsStringAsync = jest.fn(
  async (uri: string, content: string, opts?: { encoding?: string; append?: boolean }) => {
    if (opts?.append) {
      files[uri] = (files[uri] ?? '') + content;
    } else {
      files[uri] = content;
    }
  }
);

export const readAsStringAsync = jest.fn(async (uri: string): Promise<string> => {
  if (files[uri] === undefined) {
    throw new Error(`ENOENT: ${uri}`);
  }
  return files[uri];
});

export const getInfoAsync = jest.fn(
  async (uri: string): Promise<{ exists: boolean; size: number; uri: string }> => {
    if (files[uri] === undefined) return { exists: false, size: 0, uri };
    return { exists: true, size: Buffer.byteLength(files[uri], 'utf8'), uri };
  }
);

export const deleteAsync = jest.fn(async (uri: string, _opts?: { idempotent?: boolean }) => {
  delete files[uri];
});

// Encoding enum mock — some callers pass FileSystem.EncodingType.UTF8.
export const EncodingType = { UTF8: 'utf8', Base64: 'base64' } as const;

// Test helpers (not exported by the real module).
export const _reset = () => {
  Object.keys(files).forEach((k) => delete files[k]);
  writeAsStringAsync.mockClear();
  readAsStringAsync.mockClear();
  getInfoAsync.mockClear();
  deleteAsync.mockClear();
  writeAsStringAsync.mockImplementation(async (uri: string, content: string, opts?: { encoding?: string; append?: boolean }) => {
    if (opts?.append) files[uri] = (files[uri] ?? '') + content;
    else files[uri] = content;
  });
  readAsStringAsync.mockImplementation(async (uri: string) => {
    if (files[uri] === undefined) throw new Error(`ENOENT: ${uri}`);
    return files[uri];
  });
  getInfoAsync.mockImplementation(async (uri: string) => {
    if (files[uri] === undefined) return { exists: false, size: 0, uri };
    return { exists: true, size: Buffer.byteLength(files[uri], 'utf8'), uri };
  });
  deleteAsync.mockImplementation(async (uri: string) => {
    delete files[uri];
  });
};

export const _getFile = (uri: string): string | undefined => files[uri];
export const _setFile = (uri: string, content: string) => {
  files[uri] = content;
};

const FileSystem = {
  documentDirectory,
  writeAsStringAsync,
  readAsStringAsync,
  getInfoAsync,
  deleteAsync,
  EncodingType,
  _reset,
  _getFile,
  _setFile,
};

export default FileSystem;
