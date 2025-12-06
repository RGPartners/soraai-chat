import createNextIntlPlugin from 'next-intl/plugin';

const BUILD_OUTPUT = process.env.NEXT_STANDALONE_OUTPUT ? 'standalone' : undefined;

/** @type {import('next').NextConfig} */
const EBM_ASSET_GLOBS = [
  './src/lib/ebm/templates/**/*',
  'src/lib/ebm/templates/**/*',
  './node_modules/pdfjs-dist/**/*',
  'node_modules/pdfjs-dist/**/*',
];
const OUTPUT_TRACING_TARGETS = ['/api/chat', '/api/uploads', 'app/api/chat/route', 'app/api/uploads/route'];

const buildOutputFileTracingIncludes = () => {
  return OUTPUT_TRACING_TARGETS.reduce((acc, route) => {
    acc[route] = EBM_ASSET_GLOBS;
    return acc;
  }, /** @type {Record<string, string[]>} */ ({}));
};

const nextConfig = {
  output: BUILD_OUTPUT,
  experimental: {
    outputFileTracingIncludes: buildOutputFileTracingIncludes(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh4.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh5.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh6.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_ENABLE_MODEL_SELECTOR:
      process.env.MODEL_SELECTOR ?? 'false',
    NEXT_PUBLIC_ENABLE_SEARCH_PREFERENCE:
      process.env.SEARCH_PREFERENCE ?? 'false',
    NEXT_PUBLIC_DEFAULT_CHAT_MODEL_KEY:
      process.env.DEFAULT_CHAT_MODEL_KEY ?? 'gpt-4o-mini',
    NEXT_PUBLIC_ENABLE_COPILOT_TOGGLE:
      process.env.COPILOT_TOGGLE ?? 'false',
  },
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas', 'pdfjs-dist'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('@napi-rs/canvas');
    }

    return config;
  },
};

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts');

export default withNextIntl(nextConfig);
