// Static guards on app.json values that only take effect in the next native build.
import * as fs from 'fs';
import * as path from 'path';

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;

describe('app.json', () => {
  it('locks the app to dark appearance', () => {
    expect(appJson.userInterfaceStyle).toBe('dark');
  });

  it('has no splash "dark" block (expo-splash-screen would force UIUserInterfaceStyle=Automatic)', () => {
    const splash = appJson.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen'
    );
    expect(splash).toBeDefined();
    expect(splash[1].dark).toBeUndefined();
  });
});
