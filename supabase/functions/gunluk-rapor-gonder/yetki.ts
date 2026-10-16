// ============================================================================
// GUNLUK RAPOR - CAGRI YETKISI (16.10.2026, guvenlik denetimi)
// ============================================================================
// Sorun: fonksiyon, sitenin kodunda zaten gorunen herkese acik (anon) anahtarla
// cagrilabiliyordu. Bu anahtari bilen herkes:
//   1) {"deneme": true} ile musteri adlari / konteyner sayilari / markalar
//      iceren raporu okuyabiliyordu,
//   2) {"slot": "aksam"} gibi bir cagriyla raporu ZAMANINDAN ONCE (eksik
//      veriyle) gonderdirip tekrar korumasi yuzunden asil 17:00 raporunu
//      engelleyebiliyordu.
// Kural:
//   - YETKILI KULLANICI (gecerli oturum + admin rolu veya super admin):
//     eskisi gibi her sey (deneme, slot/tarih secimi); sadece KENDI sirketi.
//   - DIGER HER CAGRI (anon anahtar = pg_cron): deneme YOK; sadece o an
//     zamanlanmis slotun penceresindeyse (TR HH:00'dan 5 dk once - 60 dk sonra)
//     o slotu gonderir; govdedeki slot farkliysa reddedilir. Yanitta sirket
//     adi / ozet yer almaz (sadece sayilar).
// Bu dosya saf TypeScript'tir (Deno/Supabase bagimliligi yok) - Node ile test edilir.
// ============================================================================

export type Slot = "sabah" | "ogle" | "aksam";
export const SLOTLAR: Slot[] = ["sabah", "ogle", "aksam"];

/** pg_cron saatleri (TR, UTC+3 sabit): sabah 06:00 UTC, ogle 09:00 UTC, aksam 14:00 UTC. */
export const SLOT_TR_SAATI: Record<Slot, number> = { sabah: 9, ogle: 12, aksam: 17 };
export const ERKEN_TOLERANS_DK = 5;
export const PENCERE_DK = 60;
const TURKIYE_OFSET_MS = 3 * 60 * 60 * 1000;

/** Su an (TR) hangi zamanlanmis slotun gonderim penceresi icindeyiz; hicbiri degilse null. */
export function aktifSlot(simdiMs: number): Slot | null {
  const tr = new Date(simdiMs + TURKIYE_OFSET_MS);
  const dk = tr.getUTCHours() * 60 + tr.getUTCMinutes();
  for (const s of SLOTLAR) {
    const bas = SLOT_TR_SAATI[s] * 60;
    if (dk >= bas - ERKEN_TOLERANS_DK && dk < bas + PENCERE_DK) return s;
  }
  return null;
}

/**
 * Uygulamadaki SUPER_ADMIN_EMAILS (lib/auth-context.tsx) ve RLS politikalariyla
 * AYNI liste. Biri degisirse digerleri de BIRLIKTE guncellenir.
 */
export const SUPER_ADMIN_EPOSTALARI = ["volkandurgut.tr@gmail.com", "bbt@unex.com.tr"];

/** Authorization basligindaki JWT'nin "role" alani (dogrulamaz; sadece on eleme). */
export function jwtRolu(token: string | null): string | null {
  if (!token) return null;
  const parca = token.split(".")[1];
  if (!parca) return null;
  try {
    const b64 = parca.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parca.length / 4) * 4, "=");
    const yuk = JSON.parse(atob(b64)) as { role?: unknown };
    return typeof yuk.role === "string" ? yuk.role : null;
  } catch {
    return null;
  }
}

export type CagriKarari =
  | { izin: true; slot: Slot }
  | { izin: false; durum: number; hata: string };

/**
 * Yetkisiz (anon / pg_cron) cagri icin karar. Yetkili kullanici bu fonksiyona
 * girmez (handler onu ayri ele alir).
 */
export function yetkisizCagriKarari(govde: { deneme?: unknown; slot?: unknown; tarih?: unknown }, simdiMs: number): CagriKarari {
  if (govde.deneme === true) {
    return { izin: false, durum: 403, hata: "Deneme modu yalnızca yetkili kullanıcılar içindir." };
  }
  const aktif = aktifSlot(simdiMs);
  if (!aktif) {
    return { izin: false, durum: 403, hata: "Şu an zamanlanmış bir rapor gönderim saati değil." };
  }
  if (govde.slot !== undefined && govde.slot !== aktif) {
    return { izin: false, durum: 403, hata: "İstenen rapor bu saatte gönderilemez." };
  }
  return { izin: true, slot: aktif };
}
