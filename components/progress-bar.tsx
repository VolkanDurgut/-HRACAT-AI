"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [scale, setScale] = useState(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Ilk render'da bar gosterme (sayfa zaten yuklu)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Onceki zamanlayicilari temizle
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    setVisible(true);
    setScale(0.2);

    const t1 = setTimeout(() => setScale(0.6), 100);
    const t2 = setTimeout(() => setScale(0.85), 300);
    const t3 = setTimeout(() => {
      setScale(1);
      const t4 = setTimeout(() => {
        setVisible(false);
        setScale(0);
      }, 200);
      timeoutsRef.current.push(t4);
    }, 450);

    timeoutsRef.current.push(t1, t2, t3);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] bg-transparent overflow-hidden">
      <div
        className="h-full w-full origin-left ease-out"
        style={{
          transform: `scaleX(${scale})`,
          background: "linear-gradient(90deg, #1B2B4B 0%, #F59E0B 100%)",
          transitionProperty: "transform",
          transitionDuration: scale === 1 ? "150ms" : "350ms",
          boxShadow: "0 0 8px rgba(245, 158, 11, 0.5)",
        }}
      />
    </div>
  );
}