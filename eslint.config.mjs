import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  {
    rules: {
      // All setState-in-effect uses in this project are intentional SSR-safe
      // initialization patterns (reading localStorage/window after hydration).
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default config;
