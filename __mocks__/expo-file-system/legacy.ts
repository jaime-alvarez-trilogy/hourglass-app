// Re-export the root mock under the /legacy subpath so production code
// importing from 'expo-file-system/legacy' resolves to the same in-memory
// implementation as 'expo-file-system'.
export * from './index';
export { default } from './index';
