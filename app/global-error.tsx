'use client';

import { useEffect } from 'react';

const BG = '#0B0E14';
const CARD_BG = '#12161F';
const CARD_BORDER = '#1E2530';
const TEXT_MUTED = '#8B95A5';
const ACCENT = '#10B981';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="tr">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: BG }}>
          <div style={{ maxWidth: 420, width: '100%', backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <h1 style={{ color: 'white', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Uygulama başlatılamadı</h1>
            <p style={{ color: TEXT_MUTED, fontSize: 14, marginBottom: 24 }}>
              Beklenmeyen bir hata oluştu. Lütfen sayfayı yenileyin.
            </p>
            <button
              onClick={() => reset()}
              style={{ backgroundColor: ACCENT, color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              Tekrar Dene
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}