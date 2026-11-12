import { remotePatterns } from './config/image-hosts.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Images produits : seulement les domaines des fournisseurs (config/image-hosts.mjs + IMAGE_HOSTS).
  images: { remotePatterns: remotePatterns() },
  experimental: {
    serverComponentsExternalPackages: ['@react-email/components', '@react-email/render'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
