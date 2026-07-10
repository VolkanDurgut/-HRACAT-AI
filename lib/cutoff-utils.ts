export function getCutOffDays(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(dateStr);
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