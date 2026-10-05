import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================================
// DEPO KARANTINASI (tek seferlik, 05.10.2026)
// ============================================================================
// Hicbir kayda bagli olmayan 68 dosya (36.707.022 bayt) KALICI SILINMEDEN
// once ayni bucket icinde "_karantina/2026-10-05/<eski yol>" altina TASINIR.
// Tasima geri alinabilir ("geri_al"). KALICI SILME BU FONKSIYONDA YOK -
// kullanicinin ayrica onayiyla yapilir.
//
// Liste 05.10.2026'da veritabanindaki TUM tablolar (JSON alanlari dahil)
// taranarak cikarildi (md5 7991d1e970067a7955801bbb2fb1e9b0); her biri ya
// yeniden yuklemeyle eskimis bir kopya (ayni belgenin daha yeni surumu
// kayitta), ya silinmis dosyaya ait (3 mukerrer DBA, 1 fatura, 1 test
// konteyneri ABCD1234567) ya da sistemin yeniden uretebildigi eski evrak
// arsividir.
//
// GUVENLIK: her dosya tasinmadan HEMEN once, kayitlardaki tum dosya URL
// alanlarinda yeniden aranir; kullaniliyorsa ATLANIR.
//
// islem: "rapor" (varsayilan, hicbir sey degismez) | "karantinaya_al" | "geri_al"
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const basliklar = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
const KARANTINA = "_karantina/2026-10-05/";

const LISTE: [string, string][] = [
  ["evraklar", "7f934f5a-f068-44a5-a952-ccc75cf1efee/DRAFT-_1-_INVOICE-_CULVIST2601309-_UNEXCCS270826-UNEXCCS13082026.pdf"],
  ["evraklar", "7f934f5a-f068-44a5-a952-ccc75cf1efee/DRAFT-_2-_PACKING-_CULVIST2601309-_UNEXCCS270826-UNEXCCS13082026.pdf"],
  ["evraklar", "7f934f5a-f068-44a5-a952-ccc75cf1efee/DRAFT-_4-_COO-_CULVIST2601309-_UNEXCCS270826.pdf"],
  ["evraklar", "7f934f5a-f068-44a5-a952-ccc75cf1efee/DRAFT-_5-_PHYTO-_CULVIST2601309-_UNEXCCS270826.pdf"],
  ["evraklar", "7f934f5a-f068-44a5-a952-ccc75cf1efee/DRAFT-_8-_FUMIGATION-_CULVIST2601309-_UNEXCCS270826-UNEXCCS13082026.pdf"],
  ["evraklar", "a61c2207-706b-49bb-ad24-ac3260696bd5/1_commercial_invoice_BOULANGERIE_FARID_B_P_CULVIST2601427.html"],
  ["evraklar", "a61c2207-706b-49bb-ad24-ac3260696bd5/2_packing_list_BOULANGERIE_FARID_B_P_CULVIST2601427.html"],
  ["evraklar", "a61c2207-706b-49bb-ad24-ac3260696bd5/4_certificate_of_origin_BOULANGERIE_FARID_B_P_CULVIST2601427.html"],
  ["evraklar", "a61c2207-706b-49bb-ad24-ac3260696bd5/5_phytosanitary_BOULANGERIE_FARID_B_P_CULVIST2601427.html"],
  ["evraklar", "a61c2207-706b-49bb-ad24-ac3260696bd5/6_health_certificate_BOULANGERIE_FARID_B_P_CULVIST2601427.html"],
  ["evraklar", "a61c2207-706b-49bb-ad24-ac3260696bd5/7_quality_certificate_BOULANGERIE_FARID_B_P_CULVIST2601427.html"],
  ["evraklar", "a61c2207-706b-49bb-ad24-ac3260696bd5/DRAFT-_1-_INVOICE-_CULVIST2601427-_UNEXBFB090926.pdf"],
  ["evraklar", "a61c2207-706b-49bb-ad24-ac3260696bd5/ORIJINAL-_1-_INVOICE-_CULVIST2601427-_UNEXBFB090926.pdf"],
  ["evraklar", "a61c2207-706b-49bb-ad24-ac3260696bd5/ORIJINAL-_2-_PACKING-_CULVIST2601427-_UNEXBFB090926-DENEME.pdf"],
  ["evraklar", "a8452102-b805-4556-b5fa-9c9515a67bd1/1_commercial_invoice_BOULANGERIE_ALI_SALAH_YOUSSOUF_AKKIST26047037.html"],
  ["evraklar", "eee285b2-3cf8-446e-8c52-b85c05d20b2d/2_packing_list_CENTRE_COMMERCIAL_SAAD_AKKIST26047117.html"],
  ["konsimento-talimatlari", "2660d324-fae1-4384-af65-cab8b06530b6/1789538469413_96093194_STE_AYRA_SARL_KONSIMENTO_TALIMATI.pdf"],
  ["konsimento-talimatlari", "2660d324-fae1-4384-af65-cab8b06530b6/1789538702345_96093194_STE_AYRA_SARL_KONSIMENTO_TALIMATI.pdf"],
  ["konsimento-talimatlari", "3eeca220-6d52-4e39-adfd-1a0b4462de6a/1790580857714_CULVIST2601308_BOULANGERIE_CENTRE_VILLE_KONSIMENTO_TALIMATI.pdf"],
  ["konsimento-talimatlari", "645e302f-338a-4428-bd5a-4e2bf056fc13/1789712238946_ISB2060276_GMB_TRADING_IMPORT___EXPORT_KONSIMENTO_TALIMATI.pdf"],
  ["konsimento-talimatlari", "645e302f-338a-4428-bd5a-4e2bf056fc13/1789714960310_ISB2060276_GMB_TRADING_IMPORT___EXPORT_KONSIMENTO_TALIMATI__2_.pdf"],
  ["konsimento-talimatlari", "645e302f-338a-4428-bd5a-4e2bf056fc13/1789715000824_ISB2060276_GMB_TRADING_IMPORT___EXPORT_KONSIMENTO_TALIMATI__2_.pdf"],
  ["konsimento-talimatlari", "645e302f-338a-4428-bd5a-4e2bf056fc13/1789715171378_ISB2060276_GMB_TRADING_IMPORT___EXPORT_KONSIMENTO_TALIMATI__2_.pdf"],
  ["konsimento-talimatlari", "747e243e-2bb9-4907-9dd0-2c9136747984/draft-bl/1788962481171_BL_DRAFT.pdf"],
  ["konsimento-talimatlari", "747e243e-2bb9-4907-9dd0-2c9136747984/draft-bl/1788962537457_BL_DRAFT.pdf"],
  ["konsimento-talimatlari", "747e243e-2bb9-4907-9dd0-2c9136747984/draft-bl/1788983983794_450083072.pdf"],
  ["konsimento-talimatlari", "b674dee2-8b6a-4774-9fe2-754fc2df6b28/draft-bl/1788357367768_ISB2047395_IMPULSORA_KONSIMENTO_TALIMATI.pdf"],
  ["konsimento-talimatlari", "c291d883-074b-491a-8b30-27a2ed1443af/draft-bl/1790170643483_ONEYISTG17746900.pdf"],
  ["konsimento-talimatlari", "c291d883-074b-491a-8b30-27a2ed1443af/draft-bl/1790171003675_ONEYISTG17746900.pdf"],
  ["konsimento-talimatlari", "dba/3eeca220-6d52-4e39-adfd-1a0b4462de6a/VSBU2058467_1790411756750.pdf"],
  ["konsimento-talimatlari", "dba/3eeca220-6d52-4e39-adfd-1a0b4462de6a/VSBU2058467_1790411775403.pdf"],
  ["konsimento-talimatlari", "dba/621003e9-6245-4c73-b6ef-eb35df5c0962/SEGU2843282_1790574554971.pdf"],
  ["konsimento-talimatlari", "dba/747e243e-2bb9-4907-9dd0-2c9136747984/CMAU0635393_1788935449787.pdf"],
  ["konsimento-talimatlari", "dba/747e243e-2bb9-4907-9dd0-2c9136747984/ECMU2989491_1788786584809.pdf"],
  ["konsimento-talimatlari", "dba/747e243e-2bb9-4907-9dd0-2c9136747984/ECMU2989491_1788786736070.pdf"],
  ["konsimento-talimatlari", "dba/a61c2207-706b-49bb-ad24-ac3260696bd5/CAIU6526273_1790591649267.pdf"],
  ["konsimento-talimatlari", "dba/a61c2207-706b-49bb-ad24-ac3260696bd5/CAIU6526273_1790752193094.pdf"],
  ["konsimento-talimatlari", "dba/a61c2207-706b-49bb-ad24-ac3260696bd5/DFSU2355744_1790690412514.pdf"],
  ["konsimento-talimatlari", "dba/a8452102-b805-4556-b5fa-9c9515a67bd1/TCKU3090288_1790145527788.pdf"],
  ["konsimento-talimatlari", "dba/c291d883-074b-491a-8b30-27a2ed1443af/TGBU3283511_1790053570696.pdf"],
  ["konsimento-talimatlari", "dba/d755b7f8-c5a8-4937-89a8-57789429205c/BSIU2540279_1789711249980.pdf"],
  ["konsimento-talimatlari", "dba/dd24d786-9a95-493f-88ec-f19824873746/CAAU2697383_1790053462855.pdf"],
  ["konsimento-talimatlari", "dba/dd24d786-9a95-493f-88ec-f19824873746/CAAU2697383_1790053472988.pdf"],
  ["konsimento-talimatlari", "dba/dd24d786-9a95-493f-88ec-f19824873746/CAAU2697383_1790053482908.pdf"],
  ["konsimento-talimatlari", "dba/dd24d786-9a95-493f-88ec-f19824873746/CAAU2697383_1790053502391.pdf"],
  ["konsimento-talimatlari", "dba/dd24d786-9a95-493f-88ec-f19824873746/CAAU2697383_1790057908350.pdf"],
  ["konsimento-talimatlari", "dba/dd24d786-9a95-493f-88ec-f19824873746/CAAU2697383_1790058286540.pdf"],
  ["konsimento-talimatlari", "dba/dd24d786-9a95-493f-88ec-f19824873746/CMAU2750605_1790059075922.pdf"],
  ["konsimento-talimatlari", "dba/dd24d786-9a95-493f-88ec-f19824873746/PCIU1755716_1790053536293.pdf"],
  ["konsimento-talimatlari", "dba/dd24d786-9a95-493f-88ec-f19824873746/PCIU1755716_1790053545657.pdf"],
  ["konsimento-talimatlari", "dba/dd24d786-9a95-493f-88ec-f19824873746/TLLU3045807_1790058318623.pdf"],
  ["konsimento-talimatlari", "dba/e0d1264e-bf3e-480d-8143-d151a9291032/SEGU2748372_1788959449183.pdf"],
  ["konsimento-talimatlari", "dba/e0d1264e-bf3e-480d-8143-d151a9291032/SEGU2748372_1788959473691.pdf"],
  ["konsimento-talimatlari", "dba/e0d1264e-bf3e-480d-8143-d151a9291032/SEGU2888693_1788959399495.pdf"],
  ["konsimento-talimatlari", "dba/ef96da96-7c6d-4201-b169-8c3348471eb0/AKKU2036924_1789196442239.pdf"],
  ["konsimento-talimatlari", "dba/ef96da96-7c6d-4201-b169-8c3348471eb0/TIIU2691760_1789382972299.pdf"],
  ["konsimento-talimatlari", "dba/ef96da96-7c6d-4201-b169-8c3348471eb0/TIIU2691760_1789382991567.pdf"],
  ["konsimento-talimatlari", "dd24d786-9a95-493f-88ec-f19824873746/1790143558981_ISB2066529_ESFIRA_KONSIMENTO_TALIMATI.pdf"],
  ["konsimento-talimatlari", "eee285b2-3cf8-446e-8c52-b85c05d20b2d/draft-bl/1790591387462_1777.pdf"],
  ["konsimento-talimatlari", "fatura/644ebc69-c85e-4ffa-90ee-7af1d210f59c/1787752500603_FATURA.pdf"],
  ["konsimento-talimatlari", "fatura/747e243e-2bb9-4907-9dd0-2c9136747984/1788962110179_FATURA.pdf"],
  ["konsimento-talimatlari", "fatura/747e243e-2bb9-4907-9dd0-2c9136747984/1788962397304_FATURA.pdf"],
  ["konsimento-talimatlari", "fatura/ce01ab53-bcdc-4b94-844d-8eef40dd1d7d/1789972048987_E.M.T.L_19.09_IHR._STF..pdf"],
  ["konsimento-talimatlari", "fatura/d755b7f8-c5a8-4937-89a8-57789429205c/1789970544023_E.M.G_19.09_IHR._SFT..pdf"],
  ["konsimento-talimatlari", "fatura/d755b7f8-c5a8-4937-89a8-57789429205c/1789970715647_E.M.G_19.09_IHR._SFT..pdf"],
  ["konsimento-talimatlari", "fatura/ef96da96-7c6d-4201-b169-8c3348471eb0/1789562721538_C.C.SAAD_14.09.2026_IHR_ST_FT.pdf"],
  ["konsimento-talimatlari", "fatura/ef96da96-7c6d-4201-b169-8c3348471eb0/1789563618568_C.C.SAAD_14.09.2026_IHR_ST_FT.pdf"],
  ["konsimento-talimatlari", "irsaliye/ccb9d562-3070-45bc-9074-42be62907465/ABCD1234567_1787313165201.pdf"],
];

/** Kayitlarda bu yolu gosteren bir URL var mi? (true = kullaniliyor / emin degiliz) */
async function kullaniliyorMu(bucket: string, yol: string): Promise<boolean> {
  const desen = encodeURIComponent(`*${bucket}/${yol}*`);
  const sorgular = [
    `ihracat_dosyalari?select=id&or=(fatura_dosya_url.ilike.${desen},konsimento_dosya_url.ilike.${desen},draft_bl_dosya_url.ilike.${desen},proforma_dosya_url.ilike.${desen})&limit=1`,
    `konteynerler?select=id&or=(dba_dosya_url.ilike.${desen},irsaliye_dosya_url.ilike.${desen})&limit=1`,
    `dosya_evraklari?select=id&dosya_url=ilike.${desen}&limit=1`,
  ];
  for (const s of sorgular) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${s}`, { headers: basliklar });
    if (!res.ok) return true; // okunamadiysa GUVENLI tarafta kal: tasima
    const satirlar = (await res.json()) as unknown[];
    if (satirlar.length > 0) return true;
  }
  return false;
}

async function tasi(bucket: string, kaynak: string, hedef: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/move`, {
    method: "POST",
    headers: { ...basliklar, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: bucket, sourceKey: kaynak, destinationKey: hedef }),
  });
  if (res.ok) return null;
  return `HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`;
}

function json(veri: unknown, status = 200) {
  return new Response(JSON.stringify(veri), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  let islem = "rapor";
  let kontrol: unknown = null;
  try { const g = await req.json(); islem = g?.islem || "rapor"; kontrol = g?.kontrol ?? null; } catch { /* govde yok -> rapor */ }
  // Salt okunur dogrulama: {"kontrol": ["bucket", "yol"]} -> dedektor bu yolu kullanimda goruyor mu?
  if (Array.isArray(kontrol) && kontrol.length === 2) {
    return json({ kontrol, kullaniliyor: await kullaniliyorMu(String(kontrol[0]), String(kontrol[1])) });
  }
  if (!["rapor", "karantinaya_al", "geri_al"].includes(islem)) return json({ hata: "gecersiz islem" }, 400);

  const sonuc: { bucket: string; yol: string; durum: string }[] = [];
  for (const [bucket, yol] of LISTE) {
    if (islem === "geri_al") {
      const hata = await tasi(bucket, KARANTINA + yol, yol);
      sonuc.push({ bucket, yol, durum: hata ? `HATA ${hata}` : "geri_alindi" });
      continue;
    }
    if (await kullaniliyorMu(bucket, yol)) {
      sonuc.push({ bucket, yol, durum: "ATLANDI_kullaniliyor" });
      continue;
    }
    if (islem === "rapor") {
      sonuc.push({ bucket, yol, durum: "tasinabilir" });
      continue;
    }
    const hata = await tasi(bucket, yol, KARANTINA + yol);
    sonuc.push({ bucket, yol, durum: hata ? `HATA ${hata}` : "karantinada" });
  }
  const sayim: Record<string, number> = {};
  for (const s of sonuc) { const k = s.durum.startsWith("HATA") ? "HATA" : s.durum; sayim[k] = (sayim[k] || 0) + 1; }
  return json({ islem, toplam: LISTE.length, sayim, sorunlular: sonuc.filter((s) => s.durum !== "tasinabilir" && s.durum !== "karantinada" && s.durum !== "geri_alindi") });
});
