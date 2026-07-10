import { Ship } from "lucide-react";

export default function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F8F9FA" }}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-16 h-16 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border-4 border-slate-200 animate-spin"
            style={{ borderTopColor: "#1B2B4B", borderRightColor: "#F59E0B" }}
          />
          <Ship size={24} style={{ color: "#1B2B4B" }} />
        </div>
        <p className="text-sm font-medium text-slate-400 animate-pulse">Yükleniyor...</p>
      </div>
    </div>
  );
}