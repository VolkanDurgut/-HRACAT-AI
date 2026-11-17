-- 17.11.2026 "Onay geldi" akisi (kullanici: "Harun Bey proforma yapacak, musteriye atacak, imzali proforma VEYA on odeme
-- gelirse proforma on onayi alinmis ama rezervasyonu alinmamis olarak dusecek").
-- Onay iki yoldan gelir:
--   * on odeme  -> mevcut siparis_on_odeme_kaydet (DEGISMEDI; tutar zorunlu)
--   * imzali proforma -> YENI siparis_onay_imzali (tutar yok). Kayit ayni tabloya alindi = true yazar; siparis_listesi()
--     zaten alindi'ya bakar ("Rezervasyon bekleyen" sekmesine gecer) -> liste hesabi DEGISMEDI.
-- Yalniz ekleme: bos baslayan onay_turu kolonu + yeni fonksiyon. Mevcut satirlar / fonksiyonlar / yetkiler aynen kalir.

alter table public.siparis_on_odemeler add column if not exists onay_turu text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'siparis_on_odemeler_onay_turu_chk') then
    alter table public.siparis_on_odemeler add constraint siparis_on_odemeler_onay_turu_chk check (onay_turu is null or onay_turu in ('on_odeme', 'imzali'));
  end if;
end $$;
comment on column public.siparis_on_odemeler.onay_turu is 'Onayin geldigi yol: imzali = imzali proforma (tutar yok), on_odeme / null = on odeme (17.11.2026).';

create or replace function public.siparis_onay_imzali(p_proforma_no text, p_tarih date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := auth_company_id();
  v_anahtar text := siparis_anahtar(p_proforma_no);
  v_kim text;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  -- Yetki: ön ödeme işaretiyle aynı ("proformalar" sayfa yetkisi)
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then
    raise exception 'Yetkiniz yok.';
  end if;
  if v_anahtar is null then raise exception 'Proforma no gerekli.'; end if;
  if p_tarih is not null and (p_tarih > v_bugun or p_tarih < v_bugun - 730) then raise exception 'Geçersiz onay tarihi.'; end if;
  begin v_kim := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_kim := null; end;
  insert into siparis_on_odemeler (company_id, proforma_anahtar, alindi, tarih, tutar, para_birimi, onay_turu, isaretleyen, updated_at)
  values (v_sirket, v_anahtar, true, coalesce(p_tarih, v_bugun), null, null, 'imzali', left(v_kim, 120), now())
  on conflict (company_id, proforma_anahtar) do update set
    -- Daha once girilmis on odeme tutari SILINMEZ (yalniz onay isareti ve turu)
    alindi = true, tarih = coalesce(siparis_on_odemeler.tarih, excluded.tarih),
    onay_turu = case when siparis_on_odemeler.alindi and siparis_on_odemeler.tutar is not null then siparis_on_odemeler.onay_turu else 'imzali' end,
    isaretleyen = excluded.isaretleyen, updated_at = now();
  return jsonb_build_object('ok', true, 'alindi', true, 'onay_turu', 'imzali');
end;
$$;
revoke all on function public.siparis_onay_imzali(text, date) from public, anon;
grant execute on function public.siparis_onay_imzali(text, date) to authenticated;
