/**
 * PAZAR 3.4 - Siparis sorgulama / tanisma / hatirlatma sablonlari (10.11.2026). SAF modul.
 * Kullanici: "3 insan gibi yazilmis, ucretsiz (yapay zeka yok), duzenlenebilir sablon; Outlook ile acilir;
 * WhatsApp ilk mesaji da olsun. Uslup export@ (Harun Bey) maillerinden." -> "Dear X," acilisi, kisa, sicak,
 * "valuable" ve net bir istek (miktar + varis limani). Gonderilmeden once gorev sayfasinda duzenlenebilir.
 * Mailler musteriye INGILIZCE; ekran Turkce.
 * 10.11.2026: imzadaki adres gorevin atandigi satiscinin adresi (export@ / export2@); WhatsApp numarasi
 * yoksa wa.me kisi secme baglantisi (whatsappPaylasAdresi).
 */

export type GorevAdimi = "sorgulama" | "hatirlatma1" | "hatirlatma2";
export type SablonBaglami = {
  /** Yetkilinin adi (yoksa "Sir / Madam"). */
  ad: string | null;
  firma: string;
  musteri: boolean;
  /** Son siparis tarihi (ISO) - musteride. */
  sonSiparis: string | null;
  /** Son siparisteki urun (ihracat dosyasi urun_tanimi). */
  sonUrun: string | null;
  /** Fuar etiketi (potansiyelde). */
  fuar: string | null;
  /** Imzadaki adres (gorevin atandigi satisci); yoksa export@. */
  gonderen?: string | null;
};
export type Sablon = { kod: string; baslik: string; konu: string; govde: string; whatsapp: string };

/** Musteriye giden tanisma / teklif maillerinin CC'si. 12.11.2026 kullanici: bbt@ cikarildi (yalniz execution@). */
export const CC_ADRESLERI = ["execution@unex.com.tr"];
const imza = (eposta?: string | null) => `Kind regards,\n\nExport Department\nUNEX Gıda\n${eposta || "export@unex.com.tr"}`;

const ayYil = (iso: string | null) => {
  if (!iso) return "";
  const ay = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${ay[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** "MOHAMED ALI" -> "Mohamed Ali"; bos -> "Sir / Madam". */
export function hitapAdi(ad: string | null): string {
  const t = (ad || "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 60 || /@/.test(t)) return "Sir / Madam";
  return t
    .toLowerCase()
    .replace(/(^|[\s'-])(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

/** "Gulfood 2023 Kasım" -> "Gulfood 2023" (Turkce ay adi Ingilizce metne girmez). */
export function fuarAdi(etiket: string): string {
  const p = etiket.replace(/\s+/g, " ").trim().split(" ");
  if (p.length > 1 && !/\d/.test(p[p.length - 1])) p.pop();
  return p.join(" ");
}

function urunIfadesi(sonUrun: string | null): string {
  // Marka parantezi musteriye yazilmaz: "WHEAT FLOUR (BLE D'OR BRAND)" -> "wheat flour"
  const u = (sonUrun || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return u && u.length <= 60 ? u.toLowerCase() : "wheat flour";
}

export function sablonlar(adim: GorevAdimi, b: SablonBaglami): Sablon[] {
  const hitap = `Dear ${hitapAdi(b.ad)},`;
  const urun = urunIfadesi(b.sonUrun);
  const son = ayYil(b.sonSiparis);
  const IMZA = imza(b.gonderen);

  if (adim === "hatirlatma1") {
    return [{
      kod: "H1",
      baslik: "Kısa takip",
      konu: `UNEX // Follow-up – ${b.firma}`,
      govde: `${hitap}\n\nI hope you are doing well. I just wanted to follow up on my previous email.\n\nDo you have any requirement for the coming weeks? Please share the quantity and destination port, and we will send you our best offer the same day.\n\n${IMZA}`,
      whatsapp: `${hitap} Hope you are doing well. Just following up on my email – do you have any requirement for the coming weeks? We would be glad to send our best offer. UNEX Gıda`,
    }];
  }
  if (adim === "hatirlatma2") {
    return [{
      kod: "H2",
      baslik: "Son takip",
      konu: `UNEX // Kind reminder – ${b.firma}`,
      govde: `${hitap}\n\nThis is a kind reminder regarding my previous emails. We understand you may be busy, so a short reply is more than enough.\n\nIf you have any requirement now or later this season, we will be happy to support you with competitive prices and fast loading.\n\nThank you for your time.\n\n${IMZA}`,
      whatsapp: `${hitap} A kind reminder from UNEX Gıda – if you have any requirement now or later this season, we would be happy to support you. A short reply is enough. Thank you!`,
    }];
  }

  if (b.musteri) {
    return [
      {
        kod: "M1",
        baslik: "Yeni sipariş planı",
        konu: `UNEX // New order planning – ${b.firma}`,
        govde: `${hitap}\n\nI hope you and your team are doing well.\n\n${son ? `It has been a while since your last shipment with us (${son}), and we wanted to check in. ` : "We wanted to check in with you. "}Are you planning any new orders for the coming weeks?\n\nIf you share your required quantity and destination port, we will prepare our best offer for ${urun} right away.\n\nThank you for your valuable cooperation.\n\n${IMZA}`,
        whatsapp: `${hitap} Hope you are well. It has been a while since your last shipment with us – are you planning a new order for the coming weeks? Share the quantity and port, we will send our best offer right away. UNEX Gıda`,
      },
      {
        kod: "M2",
        baslik: "Güncel fiyat teklifi",
        konu: `UNEX // Updated offer – ${b.firma}`,
        govde: `${hitap}\n\nGood day. Our new production is ready and we have good availability for prompt shipment.\n\nWould you like us to send you an updated price for ${urun}? Just let us know the packing, quantity and destination port, and we will reply with our offer the same day.\n\nWe would be glad to continue working together.\n\n${IMZA}`,
        whatsapp: `${hitap} Good day! Our new production is ready with prompt shipment. Shall we send you an updated price for ${urun}? Just tell us packing, quantity and port. UNEX Gıda`,
      },
      {
        kod: "M3",
        baslik: "Kısa ve samimi",
        konu: `UNEX // Any requirement this month? – ${b.firma}`,
        govde: `${hitap}\n\nHope all is well on your side.\n\nDo you have any requirement this month? We can arrange loading quickly.\n\nWaiting for your kind news.\n\n${IMZA}`,
        whatsapp: `${hitap} Hope all is well. Any requirement this month? We can arrange loading quickly. Waiting for your news. UNEX Gıda`,
      },
    ];
  }

  const fuarCumlesi = b.fuar ? `It was a pleasure to have your contact from ${fuarAdi(b.fuar)}. ` : "";
  return [
    {
      kod: "P1",
      baslik: "Tanışma",
      konu: `UNEX Gıda – Wheat flour supply for ${b.firma}`,
      govde: `${hitap}\n\n${fuarCumlesi}We are UNEX Gıda, a wheat flour producer and exporter from Turkey, shipping regularly to Africa, the Middle East and beyond.\n\nWe would be glad to send you our product list and prices. Could you share which products and quantities you usually import, and your destination port?\n\nLooking forward to working with you.\n\n${IMZA}`,
      whatsapp: `${hitap} ${fuarCumlesi}We are UNEX Gıda, a wheat flour producer and exporter from Turkey. May we send you our product list and prices? Which products and quantities do you usually import? UNEX Gıda`,
    },
    {
      kod: "P2",
      baslik: "Fiyat teklifi",
      konu: `UNEX // Offer request – ${b.firma}`,
      govde: `${hitap}\n\n${fuarCumlesi}We have good availability of wheat flour (bakery, all purpose and pastry types) with fast loading from Turkish ports.\n\nIf you let us know your monthly requirement, packing and destination port, we will send you a competitive CFR/CIF offer.\n\n${IMZA}`,
      whatsapp: `${hitap} We have good availability of wheat flour with fast loading from Turkey. Share your monthly requirement, packing and port – we will send a competitive CFR/CIF offer. UNEX Gıda`,
    },
    {
      kod: "P3",
      baslik: "Kısa",
      konu: `UNEX Gıda – Flour supply`,
      govde: `${hitap}\n\nGood day. We are a wheat flour exporter from Turkey. Are you currently buying flour? We would be happy to send our best price.\n\n${IMZA}`,
      whatsapp: `${hitap} Good day, we are UNEX Gıda, wheat flour exporter from Turkey. Are you currently buying flour? Happy to send our best price.`,
    },
  ];
}

/** Outlook / varsayilan e-posta uygulamasi icin mailto (CC: CC_ADRESLERI). */
export function mailtoAdresi(alici: string, konu: string, govde: string): string {
  const q = [`cc=${encodeURIComponent(CC_ADRESLERI.join(","))}`, `subject=${encodeURIComponent(konu)}`, `body=${encodeURIComponent(govde.replace(/\n/g, "\r\n"))}`];
  return `mailto:${encodeURIComponent(alici).replace(/%40/g, "@")}?${q.join("&")}`;
}

/** Numara yokken: WhatsApp acilir, mesaj hazir, kisi WhatsApp'ta secilir. */
export function whatsappPaylasAdresi(metin: string): string {
  return `https://wa.me/?text=${encodeURIComponent(metin)}`;
}

/** WhatsApp (wa.me) baglantisi; numara ulke koduyla, yalniz rakam. */
export function whatsappAdresi(numara: string, metin: string): string | null {
  let n = (numara || "").replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.length < 8) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(metin)}`;
}
