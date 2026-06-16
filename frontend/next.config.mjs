/** @type {import('next').NextConfig} */
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
    output: 'standalone',
    reactStrictMode: true,
    poweredByHeader: false,
    compress: true,
    
    // Fix workspace root detection (silences the multiple lockfiles warning)
    outputFileTracingRoot: __dirname,
    
    // Performance optimizations
    compiler: {
        removeConsole: process.env.NODE_ENV === 'production',
    },

    // Image optimization
    images: {
        domains: ['backpack.exchange'],
        formats: ['image/avif', 'image/webp'],
    },

    // Headers for better performance
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'X-DNS-Prefetch-Control',
                        value: 'on'
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'SAMEORIGIN'
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
