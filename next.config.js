// 22.11.2026 TEST ORTAMI: Netlify derlemede CONTEXT verir (production | deploy-preview | branch-deploy | dev).
// Yalniz deploy-preview / branch-deploy "test" sayilir (lib/ortam.ts): ustte test seridi, dosya acma PROVA modunda
// (kayit yapilmaz). Canli (production) ve yerel derleme eskisi gibi; CONTEXT gelmezse de test sayilmaz.
const NETLIFY_TEST_BAGLAMLARI = ['deploy-preview', 'branch-deploy'];
const ORTAM = NETLIFY_TEST_BAGLAMLARI.includes(process.env.CONTEXT || '') ? 'test' : 'canli';

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_ORTAM: ORTAM },
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