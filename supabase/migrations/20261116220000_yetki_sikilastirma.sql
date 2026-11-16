-- Saglik taramasi (16.11.2026, Supabase guvenlik danismani): tetik fonksiyonlari ve ic yardimci RPC olarak cagrilamasin.
-- on_odeme_*_tetik yalniz tetik olarak calisir; ad_esi yalniz SECURITY DEFINER fonksiyonlarin icinden (sahip yetkisiyle)
-- kullanilir. Davranis degismez (siparis_listesi ve veri_tutarsizliklari kullanici rolüyle denendi).
revoke all on function public.on_odeme_dosya_tetik() from public, anon, authenticated;
revoke all on function public.on_odeme_kaydi_tetik() from public, anon, authenticated;
revoke all on function public.ad_esi(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ad_esi(uuid, text, text) to service_role;
