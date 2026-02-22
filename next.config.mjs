/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  },
  async rewrites() {
    const backend = process.env.BACKEND_BASE_URL || 'http://localhost';

    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`
      },
      {
        source: '/ws/:path*',
        destination: `${backend}/ws/:path*`
      },
      {
        source: '/health',
        destination: `${backend}/health`
      }
    ];
  }
};

export default nextConfig;
