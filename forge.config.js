const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { VitePlugin } = require('@electron-forge/plugin-vite');
const { execSync } = require('child_process');
const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'WKT',
    icon: './assets/icon',
    extraResource: [],
    universalOptions: {
      mergeASARs: true,
      force: true,
    },
  },
  hooks: {
    postPackage: async (_config, packageResult) => {
      if (process.platform !== 'darwin') return;
      const appPath = path.join(packageResult.outputPaths[0], 'WKT.app');
      const entitlements = path.resolve(__dirname, 'entitlements.plist');
      console.log(`Re-signing ${appPath} with entitlements...`);
      execSync(
        `codesign --force --deep --sign - --entitlements "${entitlements}" "${appPath}"`,
        { stdio: 'inherit' }
      );
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: './assets/icon.icns',
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
