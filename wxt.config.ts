import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Dynamic Spoof Geolocation',
    description:
      'Spoof the Geolocation API per tab: fixed point, constant-bearing movement, or a Tokaido Shinkansen run along the real alignment.',
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
  },
});
