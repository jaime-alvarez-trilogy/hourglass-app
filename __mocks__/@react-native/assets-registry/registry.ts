// Stub for @react-native/assets-registry/registry in Jest (10-sdk-58-ios-27 FR4).
//
// react-native 0.87+ no longer ships @react-native/assets-registry (its registry moved to
// react-native/src/private/assets/AssetRegistry). react-native-svg 15.16.0 still imports it,
// but only from its web resolver (lib/resolveAssetUri.web.ts); the native resolver uses
// Image.resolveAssetSource. The jest-expo/node preset resolves the .web variant, so the
// import needs a stand-in here. The iOS bundle never loads this path. Wired through
// jest.config.js moduleNameMapper; no test renders an SVG <Image> with an asset id.

type PackagerAsset = {
  __packager_asset: boolean;
  fileSystemLocation: string;
  httpServerLocation: string;
  width?: number;
  height?: number;
  scales: number[];
  hash: string;
  name: string;
  type: string;
};

const assets: PackagerAsset[] = [];

export function registerAsset(asset: PackagerAsset): number {
  return assets.push(asset);
}

export function getAssetByID(assetId: number): PackagerAsset | undefined {
  return assets[assetId - 1];
}
