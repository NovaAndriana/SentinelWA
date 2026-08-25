/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  logging: { fetches: { fullUrl: false } },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
};

export default nextConfig;
