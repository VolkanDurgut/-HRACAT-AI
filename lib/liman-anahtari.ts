/**
 * Analiz icin liman adi birlestirme (01.10.2026).
 *
 * "Varis Limani" serbest metin; ayni liman farkli yazimlarla kaydedilmis:
 *   "DJIBOUTI PORT, DJIBOUTI" / "Djibouti Port, Djibouti" / "DJIBOUTI PORT DJIBOUTI"
 *   / "Djibouti Port, Republic of Djibouti" / "DJIBOUTI PORT"
 *   "SİNGAPUR" / "Singapore Port, Singapore"
 * Analiz bunlari ayri liman sayip listeleri bolüyordu. Bu fonksiyon SADECE
 * gruplama/gosterim icin bir anahtar uretir - dosyadaki kayit DEGISMEZ,
 * evraklarda yine girilen metin kullanilir.
 *
 * Kural: virgulden onceki kisim alinir (sonrasi ulke); virgul yoksa "PORT"
 * kelimesinden sonrasi ulke kabul edilir; "PORT/LIMANI" kelimeleri atilir;
 * Turkce karakterler sadelestirilir; bilinen Turkce yazimlar Ingilizceye
 * cevrilir (SINGAPUR -> SINGAPORE).
 */
const TURKCE_ADLAR: Record<string, string> = {
  SINGAPUR: "SINGAPORE",
  CIBUTI: "DJIBOUTI",
};

function sadelestir(metin: string): string {
  return metin
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function limanAnahtari(ham: string | null | undefined): string | null {
  if (!ham || !ham.trim()) return null;
  let s = sadelestir(ham.trim());
  if (s.includes(",")) {
    s = s.split(",")[0];
  } else {
    const kelimeler = s.split(/\s+/);
    const portIndex = kelimeler.findIndex((k) => k === "PORT" || k === "LIMANI");
    if (portIndex > 0) s = kelimeler.slice(0, portIndex).join(" ");
  }
  s = s
    .split(/\s+/)
    .filter((k) => k && k !== "PORT" && k !== "LIMANI" && k !== "OF")
    .join(" ")
    .trim();
  if (!s) return sadelestir(ham.trim());
  return TURKCE_ADLAR[s] || s;
}
