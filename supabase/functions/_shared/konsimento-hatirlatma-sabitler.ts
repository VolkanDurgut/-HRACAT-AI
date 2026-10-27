// Konsimento talimati hatirlatmasi - alici sabitleri (27.10.2026). SAF, importsuz:
// hem edge function hem uygulama (components/konsimento-talimati-section.tsx) okur.
// Canlida edge function secret'lari ile degisebilir:
//   KONSIMENTO_HATIRLATMA_ALICI (varsayilan operation@), KONSIMENTO_HATIRLATMA_CC (virgulle),
//   KONSIMENTO_HATIRLATMA_CANLI = "evet" -> gercek alicilar; aksi halde SADECE test adresi.
export const KH_SITE = "https://ihracatasistanim.com";
export const KH_VARSAYILAN_ALICI = "operation@unex.com.tr";
export const KH_VARSAYILAN_CC = ["bbt@unex.com.tr", "execution@unex.com.tr", "export@unex.com.tr"];
export const KH_TEST_ALICISI = "mesensei282@gmail.com";
