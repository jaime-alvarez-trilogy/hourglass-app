import { AppState } from 'react-native';

it('AppState is available in test env', () => {
  console.log('AppState:', typeof AppState);
  console.log('addEventListener:', typeof AppState?.addEventListener);
  console.log('is fn:', typeof AppState?.addEventListener === 'function');
  expect(AppState).toBeDefined();
});
