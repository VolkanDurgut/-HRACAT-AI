// 06.11.2026: saf modul _shared altina tasindi (uygulama + edge function ayni kodu kullanir).
// Acik adlarla yeniden disa aktarim: tsx / Node testlerinde de calisir (export * CJS'te gorunmez).
export { DIIB_ORAN, kgOku, faturaNorm, diibAnahtari, diibBul, dosyaKg, dosyaTutar, yuklenenHesapla, diibMiktari, stokAdi, diibSatirlari, diibOzetleri, diibSiralama, bolunmeOnerisi, siraliBekleyenler, guncelDiib, diibAlanMetni, parcaTutarlari, kgYaz } from "@/supabase/functions/_shared/diib-hesap";
export type { DiibBelgesi, DiibKaydi, DiibDosyasi, DiibBolunmesi, DiibSatiri, DiibMiktari, DiibSonucu, DiibOzeti, BolunmeParcasi, BolunmeOnerisi, BekleyenSira, SiraliBekleyen } from "@/supabase/functions/_shared/diib-hesap";
