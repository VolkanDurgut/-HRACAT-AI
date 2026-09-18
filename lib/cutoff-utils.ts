/**
 * Tarih/saat metninden (hem duz "YYYY-MM-DD" tarih hem "YYYY-MM-DDTHH:MM:SS+TZ"
 * bicimini destekler) sadece takvim tarihini HAM olarak cikartir - herhangi bir
 * saat dilimi donusumu YAPMADAN.
 *
 * Neden gerekli: talimat_cutoff / beyanname_cutoff veritabaninda timestamptz
 * olarak saklaniyor ama kaydedilirken saat dilimi belirtilmiyor (bkz.
 * rezervasyon-tab.tsx). Postgres bu durumda degeri UTC sanip "+00" etiketiyle
 * kaydediyor - ama deger aslinda kullanicinin girdigi YEREL (Turkiye) saatidir.
 * new Date(...) ile ayristirmak bu degeri yanlislikla tekrar yerel saate CEVIRIR
 * (3 saat ileri kayar) - ozellikle gec saatlerde (ör. 22:00+) takvim gununu bile
 * bir sonraki gune kaydirabilir. Bu fonksiyon metinden dogrudan okuyarak bu
 * riski tamamen ortadan kaldirir; duz "date" alanlari icin de zararsizdir.
 */
function ayristirHamTarih(dateStr: string): { yil: number; ay: number; gun: number } | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { yil: parseInt(m[1], 10), ay: parseInt(m[2], 10), gun: parseInt(m[3], 10) };
}

/**
 * talimat_cutoff / beyanname_cutoff gibi "yanlislikla UTC etiketli ama aslinda
 * yerel" timestamptz alanlarindan saat:dakika kismini DOGRUDAN metinden okur -
 * new Date(...) ile ayristirip yerel saate CEVIRMEZ. Bu, 16:00 girilen bir
 * cutoff saatinin ekranda 19:00 olarak gorunmesine neden olan hatanin duzeltmesidir.
 */
export function formatCutoffSaat(dateStr: string | null): string {
  if (!dateStr) return "-";
  const m = dateStr.match(/T(\d{2}):(\d{2})/);
  if (!m) return "-";
  return `${m[1]}:${m[2]}`;
}

export function getCutOffDays(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const p = ayristirHamTarih(dateStr);
  if (!p) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(p.yil, p.ay - 1, p.gun);
  cutoff.setHours(0, 0, 0, 0);
  return Math.ceil((cutoff.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export type CutOffStyle = { text: string; color: string; icon: string };

export function getCutOffLabel(dateStr: string | null): CutOffStyle {
  if (!dateStr) return { text: "-", color: "text-slate-400", icon: "" };
  const days = getCutOffDays(dateStr);
  if (days === null) return { text: "-", color: "text-slate-400", icon: "" };
  if (days < 0) return { text: "Gecti", color: "text-red-600 font-semibold", icon: "" };
  if (days === 0) return { text: "Bugun!", color: "text-red-600 font-semibold", icon: "" };
  if (days <= 2) return { text: `${days} Gün`, color: "text-orange-600 font-semibold", icon: "" };
  return { text: `${days} Gün`, color: "text-blue-600", icon: "" };
}

export function isCutoffApproaching(talimatCutoff: string | null, beyannameCutoff: string | null): boolean {
  const tDays = getCutOffDays(talimatCutoff);
  const bDays = getCutOffDays(beyannameCutoff);
  const days: number[] = [];
  if (tDays !== null) days.push(tDays);
  if (bDays !== null) days.push(bDays);
  if (days.length === 0) return false;
  return days.some((d) => d >= 0 && d <= 3);
}

export function formatDateTR(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("tr-TR");
}

export function formatDateTimeShortTR(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const datePart = d.toLocaleDateString("tr-TR");
  const timePart = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} ${timePart}`;
}

export function formatDateTimeTR(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount === null || amount === undefined) return "-";
  const cur = currency || "USD";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: cur,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function autoSuggestContainers(totalMiktar: number | null): number | null {
  if (!totalMiktar || totalMiktar <= 0) return null;
  return Math.ceil(totalMiktar / 25);
}