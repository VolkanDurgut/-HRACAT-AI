-- 23.11.2026 ANA PANEL TEK IS LISTESI (kullanici: "Bu sayfa cok karisik; tek sayfa seklinde verebilmeliyiz. Odeme
-- bekleyenler gri, kocaman 'Odeme bekliyor' seklinde gorunsun; odeme gelince aktif hale gelsin.")
--
--  panel_odeme_bekleyenleri(): Siparis Listesi'nin "Onay bekleyen" satirlari (durum onay_bekliyor: proforma gonderildi,
--  on odeme / imzali proforma henuz isaretlenmedi). Kaynak siparis_listesi_veri (Siparis Listesi ile AYNI kural);
--  on odeme isaretlenince satir kendiliginden "Rezervasyon bekliyor"a gecer (panel_is_emirleri on_odeme).
--  Yalniz okuma; hicbir kayit / mevcut fonksiyon degismez. Yetki: panel ya da proformalar (panel_is_emirleri ile ayni).
create or replace function public.panel_odeme_bekleyenleri()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('panel') or ic_sayfa_yetkisi('proformalar')) then
    raise exception 'Yetkiniz yok.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'anahtar', v.anahtar, 'kaynak', v.kaynak, 'proforma_no', v.proforma_no, 'proforma_tarihi', v.proforma_tarihi,
        'musteri', v.firma, 'urun', v.urun, 'konteyner', v.konteyner, 'miktar_mt', v.miktar_mt, 'tutar', v.tutar,
        'para_birimi', v.para_birimi, 'varis_limani', v.liman, 'marka', v.marka, 'paketleme', v.paketleme)
      order by v.proforma_tarihi nulls last, v.firma)
    from siparis_listesi_veri(v_sirket) v
    where v.durum = 'onay_bekliyor'), '[]'::jsonb);
end; $function$;

revoke all on function public.panel_odeme_bekleyenleri() from public, anon;
grant execute on function public.panel_odeme_bekleyenleri() to authenticated;
