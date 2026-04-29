/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@tensorflow/tfjs'],

  // Skip env validation saat build time
  // Env tetap dibaca di runtime (Railway inject setelah build)
  staticPageGenerationTimeout: 120,

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
