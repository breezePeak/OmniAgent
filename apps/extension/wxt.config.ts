import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'OmniAgent',
    description: 'One memory. Every AI.',
    permissions: ['storage', 'sidePanel', 'tabs'],
    action: {
      default_title: 'Open OmniAgent',
    },
  },
});
