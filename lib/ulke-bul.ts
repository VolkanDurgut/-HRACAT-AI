// 06.11.2026: saf modul _shared altina tasindi (uygulama + edge function ayni kodu kullanir).
// Acik adlarla yeniden disa aktarim: tsx / Node testlerinde de calisir (export * CJS'te gorunmez).
export { ulkeBul, ticaretYapilanUlke, gidecegiUlke, TICARET_ULKESI_BELIRSIZ, asciiYap } from "@/supabase/functions/_shared/ulke-bul";
