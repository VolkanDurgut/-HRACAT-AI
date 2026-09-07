"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase, Dosya } from "@/lib/supabase";
import { Mail, Send, X } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

const EVRAK_ADLARI: Record<string, string> = {
  commercial_invoice: "Commercial Invoice",
  packing_list: "Packing List",
  fumigation: "Fumigation Certificate",
};

type Props = {
  dosya: Dosya;
  companyId: string | null;
};

/**
 * Dosyaya ait TASLAK (draft) durumundaki ihracat evraklarini musterinin
 * e-postasina gondermek icin kullanilir. Diger mail ozellikleriyle (acente
 * teklif, fatura talimati, VGM) ayni desen: mailto: linki acar, gercek dosya
 * ekini OTOMATIK EKLEYEMEZ - kullanici HTML'i tarayicidan PDF'e cevirip
 * (Ctrl+P) elle eklemelidir. Bu, tarayicilarin guvenlik kisitlamasi.
 */
export default function TaslakEvrakMailSection({ dosya, companyId }: Props) {
  const [taslaklar, setTaslaklar] = useState<{ evrak_tipi: string }[]>([]);
  const [panelAcik, setPanelAcik] = useState(false);
  const [alici, setAlici] = useState("");
  const [konu, setKonu] = useState("");
  const [metin, setMetin] = useState("");

  const taslaklariYukle = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("dosya_evraklari")
      .select("evrak_tipi")
      .eq("dosya_id", dosya.id)
      .eq("company_id", companyId)
      .eq("durum", "taslak")
      .in("evrak_tipi", ["commercial_invoice", "packing_list", "fumigation"]);
    setTaslaklar(data || []);
  }, [dosya.id, companyId]);

  useEffect(() => {
    taslaklariYukle();
  }, [taslaklariYukle]);

  const varsayilanKonu = () => `${dosya.dosya_no || ""} - Sevkiyat Evrakları (Taslak) - Onayınıza Sunulmuştur`.trim();

  const varsayilanMetin = () => {
    const evrakListesi = taslaklar.map((t) => `- ${EVRAK_ADLARI[t.evrak_tipi] || t.evrak_tipi} (Taslak)`).join("\n");
    return `Sayın Yetkili,\n\nDosyanıza ait aşağıdaki sevkiyat evraklarının taslak (draft) hallerini incelemenize sunuyoruz:\n\n${evrakListesi}\n\nEvraklar ekte yer almaktadır. Herhangi bir düzeltme talebiniz yoksa onayınızı bekliyoruz; onayınız alındıktan sonra evrakların orijinal (filigransız) hallerini tarafınıza ileteceğiz.\n\nSaygılarımızla`;
  };

  const openPanel = () => {
    setAlici((dosya.ham_veri as any)?.alici_email || "");
    setKonu(varsayilanKonu());
    setMetin(varsayilanMetin());
    setPanelAcik(true);
  };

  const handleGonder = () => {
    if (!alici.trim()) return;
    window.open(`mailto:${encodeURIComponent(alici.trim())}?subject=${encodeURIComponent(konu)}&body=${encodeURIComponent(metin)}`);
    setPanelAcik(false);
  };

  if (taslaklar.length === 0) return null;

  return (
    <div className="rounded-lg border p-3 space-y-2" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            {taslaklar.length} taslak evrak müşteri onayı bekliyor
          </p>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            {taslaklar.map((t) => EVRAK_ADLARI[t.evrak_tipi] || t.evrak_tipi).join(", ")}
          </p>
        </div>
        {!panelAcik && (
          <button
            onClick={openPanel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white shrink-0"
            style={{ backgroundColor: ACCENT }}
          >
            <Mail size={13} /> Taslakları Müşteriye Gönder
          </button>
        )}
      </div>

      {panelAcik && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium" style={{ color: TEXT_MUTED }}>
            Not: Evraklar mail ekine otomatik eklenemiyor — gönderdikten sonra ilgili evrakları (Görüntüle ikonundan açıp yazdırıp/PDF olarak kaydederek) elle eklemeniz gerekir.
          </p>
          <input
            value={alici}
            onChange={(e) => setAlici(e.target.value)}
            placeholder="Alıcı e-posta adresi"
            type="email"
            className="w-full text-xs text-white border rounded-lg px-2.5 py-2"
            style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
          />
          <input
            value={konu}
            onChange={(e) => setKonu(e.target.value)}
            className="w-full text-xs text-white border rounded-lg px-2.5 py-2"
            style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
          />
          <textarea
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            rows={7}
            className="w-full text-xs text-white border rounded-lg p-2 resize-none"
            style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleGonder}
              disabled={!alici.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              <Send size={12} /> Mail Uygulamasını Aç
            </button>
            <button onClick={() => setPanelAcik(false)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs hover:text-white" style={{ color: TEXT_MUTED }}>
              <X size={12} /> Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}