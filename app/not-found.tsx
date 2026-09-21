import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

const BG = '#0B0E14';
const CARD_BG = '#12161F';
const CARD_BORDER = '#1E2530';
const TEXT_MUTED = '#8B95A5';
const ACCENT = '#10B981';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: BG }}>
      <div className="max-w-md w-full rounded-2xl p-8 text-center" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
          <FileQuestion size={28} style={{ color: ACCENT }} />
        </div>
        <h1 className="text-lg font-semibold text-white mb-2">Sayfa bulunamadı</h1>
        <p className="text-sm mb-6" style={{ color: TEXT_MUTED }}>
          Aradığınız sayfa taşınmış, silinmiş olabilir veya hiç var olmamış olabilir.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: ACCENT }}
        >
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}