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
    if (!idoc) throw new Error("Gecici render alani olusturulamadi.");
    idoc.open();
    idoc.write(html);
    idoc.close();

    await new Promise((resolve) => setTimeout(resolve, 350));

    const hedefEl = (idoc.querySelector(".sheet") as HTMLElement | null) || idoc.body;

    // ".print-hint" kutusu (tarayicida elle yazdirmadan once gosterilen
    // "Headers/footers kapatin" uyarisi) normalde sadece @media print ile
    // gizlenir. html2canvas ekrani oldugu gibi "fotografladigi" icin bu
    // print kuralini hic tetiklemez - burada elle gizliyoruz, aksi halde
    // PDF ciktisinda istenmeyen sekilde gorunur kalir.
    const ipucuKutusu = idoc.querySelector(".print-hint") as HTMLElement | null;
    if (ipucuKutusu) ipucuKutusu.style.display = "none";

    const canvas = await html2canvas(hedefEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 820,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const sayfaGenislikMm = 210;
    const sayfaYukseklikMm = 297;
    const goruntuYukseklikMm = (canvas.height * sayfaGenislikMm) / canvas.width;

    if (goruntuYukseklikMm <= sayfaYukseklikMm) {
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", 0, 0, sayfaGenislikMm, goruntuYukseklikMm);
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
        if (!ctx) throw new Error("Canvas baglami olusturulamadi.");
        ctx.drawImage(canvas, 0, offset, canvas.width, buSeferkiYukseklik, 0, 0, canvas.width, buSeferkiYukseklik);

        if (!ilkSayfa) pdf.addPage();
        const dilimYukseklikMm = (buSeferkiYukseklik * sayfaGenislikMm) / canvas.width;
        pdf.addImage(dilimCanvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, sayfaGenislikMm, dilimYukseklikMm);

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