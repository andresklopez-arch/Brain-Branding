/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/zamoranos/:path*',
        destination: process.env.ZAMORANOS_BACKEND_URL
          ? `${process.env.ZAMORANOS_BACKEND_URL}/:path*`
          : 'http://localhost:3000/:path*',
      },
    ]
  }
};

export default nextConfig;
