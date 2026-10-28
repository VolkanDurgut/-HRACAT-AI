/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // 28.10.2026: eski Kontrol Merkezi (/dashboard) kaldirildi; yer imleri / eski
  // baglantilar yeni Kontrol Merkezine (Analiz) gider. Yetki AppShell'de kontrol edilir.
  async redirects() {
    return [{ source: '/dashboard', destination: '/analiz', permanent: false }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;