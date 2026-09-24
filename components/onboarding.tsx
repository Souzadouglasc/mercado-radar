"use client";
/* eslint-disable react-hooks/set-state-in-effect -- sync pós-mount com localStorage (só existe no browser) */

import { useEffect, useState } from "react";
import { ListChecks, Radar, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KEY = "mr-onboarding-done";
const STEPS = [
  {
    icon: Search,
    title: "1. Busque o produto",
    text: "Digite o nome ou a marca e compare o último preço em Fort, Koch, Brasil e Komprão.",
  },
  {
    icon: ListChecks,
    title: "2. Monte sua lista",
    text: "Adicione itens, ajuste quantidades e veja onde a cesta sai mais barata — ou dividida.",
  },
  {
    icon: Radar,
    title: "3. Ative alertas",
    text: "Crie alertas de queda e receba quando o preço atingir sua meta.",
  },
];

/** Onboarding de 3 passos na primeira visita (localStorage). */
export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);

  // Leitura de localStorage só após mount (evita hydration mismatch).
  useEffect(() => {
    let first = true;
    try {
      first = !localStorage.getItem(KEY);
    } catch {
      first = false;
    }
    // Leitura pós-mount (localStorage não existe no SSR) — sync intencional.
    setOpen(first);
    setReady(true);
  }, []);

  function done() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* sem storage — só fecha */
    }
    setOpen(false);
  }

  if (!ready) return null;
  const s = STEPS[step];
  const Icon = s.icon;
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : done())}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" aria-hidden /> {s.title}
          </DialogTitle>
          <DialogDescription>{s.text}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={
                i === step ? "h-2 w-6 rounded-full bg-primary" : "h-2 w-2 rounded-full bg-muted"
              }
            />
          ))}
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" onClick={done}>
            Pular
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>Próximo</Button>
          ) : (
            <Button onClick={done}>Começar a economizar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
