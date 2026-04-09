const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Intercept react/jsx-runtime and react/jsx-dev-runtime from APP code to redirect
// to NativeWind's wrappers (which intercept className props).
//
// Why: In Expo SDK 55 / Metro 0.83, babel-preset-expo's JSX transform runs before
// nativewind/babel's, so the bundle ends up with react/jsx-dev-runtime instead of
// nativewind/jsx-dev-runtime. We fix this at the resolver level so className interop
// works regardless of which babel plugin transforms JSX first.
//
// We exclude node_modules to avoid circular deps (react-native-css-interop's own
// jsx-dev-runtime.js itself requires react/jsx-dev-runtime).
const nativewindJsxRuntime = require.resolve('nativewind/jsx-runtime/index.js');
const nativewindJsxDevRuntime = require.resolve('nativewind/jsx-dev-runtime/index.js');

const originalResolveRequest = config.resolver?.resolveRequest;
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    const isAppCode = !context.originModulePath.includes('node_modules');
    if (isAppCode) {
      if (moduleName === 'react/jsx-runtime') {
        return { type: 'sourceFile', filePath: nativewindJsxRuntime };
      }
      if (moduleName === 'react/jsx-dev-runtime') {
        return { type: 'sourceFile', filePath: nativewindJsxDevRuntime };
      }
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

// forceWriteFileSystem: react-native-css-interop 0.2.3 patches bundler.transformFile
// which no longer exists in Metro 0.83 (Expo SDK 55). Force filesystem mode so the
// generated CSS is written to .cache/ios.js and served from disk instead of virtual modules.
module.exports = withNativeWind(config, { input: './global.css', forceWriteFileSystem: true });
