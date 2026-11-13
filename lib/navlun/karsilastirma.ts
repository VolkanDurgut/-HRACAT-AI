// 13.11.2026: navlun karsilastirma + acente hafizasi saf modulu _shared altinda (uygulama + edge navlun-tablosu ayni kodu kullanir).
// Acik adlarla yeniden disa aktarim: tsx / Node testlerinde de calisir (export * CJS'te gorunmez).
export {
  acenteAnahtari, baglamKur, enIyiSec, karsilastir, rezervasyondanOgren,
} from "@/supabase/functions/_shared/navlun-karsilastirma";
export type {
  AcenteHafizasi, GerceklesenKanit, Guven, Karsilastirma, KarsilastirmaBaglami, KarsilastirmaTemeli, LimanKurali,
  LokalKaynagi, LokalKurali, OgrenilenKural, TeklifGirdisi,
} from "@/supabase/functions/_shared/navlun-karsilastirma";
