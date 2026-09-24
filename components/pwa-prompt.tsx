"use client";
/* eslint-disable react-hooks/set-state-in-effect -- sync pós-mount com beforeinstallprompt/navigator (só existem no browser) */

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

const KEY = "mr-pwa-dismissed";

function wasDismissed(): boolean {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return true;
  }
}

/** PWA install prompt discreto (beforeinstallprompt + iOS manual). */
export function PwaPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (wasDismissed()) return;
    // Leitura pós-mount (navigator não existe no SSR) — sync intencional.
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    // iOS: sem beforeinstallprompt — mostra dica manual discreta uma vez.
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setVisible(true);
    function onBIP(e: Event) {
      e.preventDefault();
      if (wasDismissed()) return;
      setDeferred(e as BIPEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignora */
    }
    setVisible(false);
  }

  if (!visible || (!deferred && !isIos)) return null;

  return (
    <div
      role="region"
      aria-label="Instalar aplicativo"
      className="fixed inset-x-0 bottom-16 z-40 mx-auto flex w-full max-w-full items-center gap-2 px-4 sm:px-6 md:bottom-6 md:max-w-3xl lg:max-w-6xl lg:px-8"
    >
      <div className="flex flex-1 items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg">
        <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="flex-1 text-xs">
          {deferred
            ? "Instale o MercadoRadar para comparar preços no mercado, mesmo offline."
            : "No iPhone: Compartilhar → “Adicionar à Tela de Início” para instalar."}
        </p>
        {deferred && (
          <Button
            size="sm"
            onClick={() => {
              void deferred.prompt();
              dismiss();
            }}
          >
            Instalar
          </Button>
        )}
        <Button size="icon" variant="ghost" aria-label="Dispensar instalação" onClick={dismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
