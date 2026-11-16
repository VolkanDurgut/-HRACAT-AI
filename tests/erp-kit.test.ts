/**
 * ERP ortak kit (16.11.2026): saf yardimcilar + bilesenlerin urettigi HTML, sayfalardaki ESKI sinif dizileriyle ayni mi.
 * Amac: kite gecis gorunumu degistirmesin. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { trBuyuk, trIcerir, trKucuk } from "@/lib/tr-arama";
import { urlGuncelle } from "@/lib/url-durumu";
import { aramaNorm } from "@/lib/siparis/gorunum";
import { aramaAnahtari as pazarAnahtari } from "@/lib/pazar/gorunum";
import { SekmeCubugu } from "@/components/erp/sekme-cubugu";
import { AcilirSerit, SERIT_TONU } from "@/components/erp/acilir-serit";
import { OzetKarti, SecilebilirOzetKarti } from "@/components/erp/ozet-karti";

const h = React.createElement;
const html = (e: React.ReactElement) => renderToStaticMarkup(e);

test("Turkce arama: eski kurallarla ayni sonuc, i / ı farki yok", () => {
  for (const s of ["İstanbul", "ıspanak", "IŞIK", "çağrı", "Gıda A.Ş."]) {
    assert.equal(trBuyuk(s), s.toLocaleUpperCase("tr-TR").replace(/İ/g, "I"));
    assert.equal(trKucuk(s), s.toLocaleLowerCase("tr-TR").replace(/ı/g, "i"));
    assert.equal(aramaNorm(s), trBuyuk(s));
    assert.equal(pazarAnahtari(s), trKucuk(s));
  }
  assert.equal(trBuyuk("istanbul"), trBuyuk("İSTANBUL"));
  assert.equal(trKucuk("ISPARTA"), trKucuk("ısparta"));
  assert.ok(trIcerir("Bandırma Gıda", "gida"));
  assert.ok(!trIcerir("Bandırma Gıda", "çay"));
  assert.ok(trIcerir(null, "  "));
  assert.ok(!trIcerir(null, "x"));
});

test("urlGuncelle: ekler, siler, eski parametreyi kaldirir, digerlerine dokunmaz", () => {
  const u = "https://ornek.test/panel?filter=cutoff&dosya=A&x=1";
  assert.equal(urlGuncelle(u, { filtre: "cutoff" }, ["filter"]), "https://ornek.test/panel?dosya=A&x=1&filtre=cutoff");
  assert.equal(urlGuncelle(u, { dosya: null, filter: "" }), "https://ornek.test/panel?x=1");
  assert.equal(urlGuncelle("https://ornek.test/a?sekme=plan", { sekme: "sevk" }), "https://ornek.test/a?sekme=sevk");
});

test("SekmeCubugu hap: Pazar / Ana Panel / Siparis siniflari aynen", () => {
  const ogeler = [{ deger: "a", etiket: "Birinci", sayi: 3 }, { deger: "b", etiket: "Ikinci", sayi: 0 }];
  const panel = html(h(SekmeCubugu<string>, { testId: "panel-filtreler", veriOzelligi: "filtre", sayiBicimi: "duz", secili: "a", onSec: () => {}, ogeler }));
  assert.ok(panel.includes('class="flex w-full max-w-full overflow-x-auto rounded-lg border p-0.5 sm:w-auto sm:inline-flex mb-4"'));
  assert.ok(panel.includes('class="inline-flex shrink-0 items-center gap-1.5 h-9 px-3 sm:px-4 rounded-md text-sm font-medium whitespace-nowrap transition-colors"'));
  assert.ok(panel.includes('data-filtre="a"') && panel.includes('role="tablist"') && panel.includes('aria-selected="true"'));
  assert.ok(panel.includes('background-color:rgba(16,185,129,0.16);color:#FFFFFF'));
  assert.ok(panel.includes('<span class="text-[11px] tabular-nums" style="color:#6EE7B7">3</span>'));

  const siparis = html(h(SekmeCubugu<string>, { sayiBicimi: "rozet", className: "lg:w-auto lg:inline-flex", dugmeBosluk: "px-3", secili: "b", onSec: () => {},
    ogeler: [{ deger: "a", etiket: "Bekleyen", sayi: 2, vurgu: true }, { deger: "b", etiket: "Plan", sayi: null }] }));
  assert.ok(siparis.includes('class="inline-flex shrink-0 items-center gap-1.5 h-9 px-3 rounded-md'));
  assert.ok(siparis.includes('data-sekme-sayi') && siparis.includes("background-color:#10B981;color:#FFFFFF"));
  assert.equal((siparis.match(/data-sekme-sayi/g) || []).length, 1, "sayisi null olan sekmede rozet yok");
});

test("SekmeCubugu alt-cizgi (Kontrol Merkezi) ve kompakt (Kantar) siniflari aynen", () => {
  const km = html(h(SekmeCubugu<string>, { varyant: "alt-cizgi", ariaLabel: "Kontrol Merkezi bölümleri", secili: "genel", onSec: () => {}, ogeler: [{ deger: "genel", etiket: "Genel" }] }));
  assert.ok(km.includes('class="flex gap-1 mb-4 border-b overflow-x-auto"') && km.includes('id="sekme-genel"') && km.includes('aria-controls="panel-genel"'));
  assert.ok(km.includes('class="inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors"'));
  const k = html(h(SekmeCubugu<string>, { varyant: "kompakt", secili: "aktif", onSec: () => {}, ogeler: [{ deger: "aktif", etiket: "Aktif dolumlar", sayi: 4 }] }));
  assert.ok(k.includes('class="px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors"'));
  assert.ok(k.includes('<span class="font-normal opacity-80">(<!-- -->4<!-- -->)</span>') || k.includes('<span class="font-normal opacity-80">(4)</span>'));
});

test("AcilirSerit: kapali -> icerik yok, kapali etiketi; acik -> icerik ve Gizle", () => {
  const kapali = html(h(AcilirSerit, { acik: false, onDegistir: () => {}, ...SERIT_TONU.kirmizi, ikon: null, baslik: "Cut-off uyarısı", kapaliEtiket: "Ayrıntı", className: "mb-4", testId: "cutoff-cubugu" }, h("ul", { id: "icerik" })));
  assert.ok(kapali.includes('class="rounded-xl border overflow-hidden mb-4"') && kapali.includes("border-color:rgba(248,113,113,0.35)"));
  assert.ok(kapali.includes("Ayrıntı") && !kapali.includes('id="icerik"') && kapali.includes('aria-expanded="false"'));
  const acik = html(h(AcilirSerit, { acik: true, onDegistir: () => {}, ...SERIT_TONU.amber, ikon: null, baslik: "Aksiyon", rozetler: h("b", null, "2") }, h("ul", { id: "icerik" })));
  assert.ok(acik.includes('id="icerik"') && acik.includes("Gizle") && acik.includes('class="flex flex-wrap gap-1.5 "'));
});

test("Ozet kartlari: tiklanabilir / duz / secilebilir", () => {
  const duz = html(h(OzetKarti, { ikon: null, etiket: "Toplam", deger: 5, testId: "t" }));
  assert.ok(duz.startsWith('<div class="rounded-xl border px-4 py-3"'));
  const tik = html(h(OzetKarti, { ikon: null, etiket: "Toplam", deger: 5, testId: "t", onClick: () => {} }));
  assert.ok(tik.startsWith('<button type="button" class="rounded-xl border px-4 py-3 text-left transition-colors hover:border-emerald-500/50 hover:bg-white/[0.02]"'));
  const sec = html(h(SecilebilirOzetKarti, { etiket: "Rez", deger: 2, testId: "s", secili: true, renk: "#F4A07C" }));
  assert.ok(sec.includes("disabled") && sec.includes("border-color:#10B981") && sec.includes("color:#F4A07C"));
});
