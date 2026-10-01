import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Bir HTML belgesini (tam <html>...<body> icerigi) gercek, coklu sayfa
 * destekli bir PDF Blob'a cevirir. Gorunmez bir iframe icinde render edip
 * goruntusunu yuksek cozunurlukte "fotograflayarak" PDF'e gomuyoruz -
 * boylece mevcut, zaten tasarlanmis HTML sablonlari (Commercial Invoice,
 * Packing List vb.) SIFIRDAN YENIDEN YAZILMADAN, birebir gorsel sadakatle
 * (logo, filigran, tablo duzeni dahil) gercek bir PDF dosyasi olur.
 *
 * Icerik tek A4 sayfaya sigmiyorsa (ornegin cok satirli urun listesi),
 * otomatik olarak birden fazla sayfaya bolunur - hicbir icerik kirpilmaz.
 *
 * Kalite notu (talep: 01.10.2026 - "yazilar bulanik, kayma var"): bu
 * yontem HTML'i bir RESIM olarak PDF'e gomdugu icin (Fatura Talimati gibi
 * jsPDF ile dogrudan metin cizen belgelerin aksine) hicbir zaman gercek
 * vektor metin kadar keskin olmaz - ama asagidaki iki onlemle bulanikligin
 * ve hizalama kaymasinin buyuk kismi giderilir:
 *   1) scale 2 -> 3 (daha yuksek cozunurluklu "fotograf")
 *   2) JPEG -> PNG (JPEG'in metin kenarlarinda yarattigi bulanik sikistirma
 *      artifaktlari yok olur; boyut buyur ama okunabilirlik onceliklidir)
 *   3) sabit 350ms bekleme yerine, tum <img> etiketlerinin (logo/imza)
 *      fiilen decode olmasi beklenir - resim tam yuklenmeden alinan
 *      "fotografta" satirlarin kaymasi/bos kalmasi ihtimali ortadan kalkar.
 */
export async function htmlToPdfBlob(html: string): Promise<Blob> {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "820px";
  iframe.style.height = "1200px";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument;
    if (!idoc) throw new Error("Geçici render alanı oluşturulamadı.");
    idoc.open();
    idoc.write(html);
    idoc.close();

    // Once DOM'un yerlesmesi icin kisa bir bekleme, sonra TUM gorsellerin
    // (logo, imza) fiilen decode olmasini bekle. decode() bazi eski
    // tarayicilarda olmayabilir - o durumda onload/onerror'a duser.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const gorseller = Array.from(idoc.querySelectorAll("img"));
    await Promise.all(
      gorseller.map((img) => {
        if (img.complete) {
          return typeof img.decode === "function" ? img.decode().catch(() => undefined) : Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        });
      })
    );
    // Gorseller yerlestikten sonra layout'un oturmasi icin son bir kare payi.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const hedefEl = (idoc.querySelector(".sheet") as HTMLElement | null) || idoc.body;

    // ".print-hint" kutusu (tarayicida elle yazdirmadan once gosterilen
    // "Headers/footers kapatin" uyarisi) normalde sadece @media print ile
    // gizlenir. html2canvas ekrani oldugu gibi "fotografladigi" icin bu
    // print kuralini hic tetiklemez - burada elle gizliyoruz, aksi halde
    // PDF ciktisinda istenmeyen sekilde gorunur kalir.
    const ipucuKutusu = idoc.querySelector(".print-hint") as HTMLElement | null;
    if (ipucuKutusu) ipucuKutusu.style.display = "none";

    const canvas = await html2canvas(hedefEl, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 820,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const sayfaGenislikMm = 210;
    const sayfaYukseklikMm = 297;
    const goruntuYukseklikMm = (canvas.height * sayfaGenislikMm) / canvas.width;

    if (goruntuYukseklikMm <= sayfaYukseklikMm) {
      const imgData = canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", 0, 0, sayfaGenislikMm, goruntuYukseklikMm);
    } else {
      const pikselBasinaMm = canvas.width / sayfaGenislikMm;
      const dilimYukseklikPx = Math.floor(sayfaYukseklikMm * pikselBasinaMm);
      let kalanYukseklik = canvas.height;
      let offset = 0;
      let ilkSayfa = true;

      while (kalanYukseklik > 0) {
        const buSeferkiYukseklik = Math.min(dilimYukseklikPx, kalanYukseklik);
        const dilimCanvas = document.createElement("canvas");
        dilimCanvas.width = canvas.width;
        dilimCanvas.height = buSeferkiYukseklik;
        const ctx = dilimCanvas.getContext("2d");
        if (!ctx) throw new Error("Canvas bağlamı oluşturulamadı.");
        ctx.drawImage(canvas, 0, offset, canvas.width, buSeferkiYukseklik, 0, 0, canvas.width, buSeferkiYukseklik);

        if (!ilkSayfa) pdf.addPage();
        const dilimYukseklikMm = (buSeferkiYukseklik * sayfaGenislikMm) / canvas.width;
        pdf.addImage(dilimCanvas.toDataURL("image/png"), "PNG", 0, 0, sayfaGenislikMm, dilimYukseklikMm);

        offset += buSeferkiYukseklik;
        kalanYukseklik -= buSeferkiYukseklik;
        ilkSayfa = false;
      }
    }

    return pdf.output("blob");
  } finally {
    document.body.removeChild(iframe);
  }
}