"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleFavorite, type FavoriteTarget } from "@/lib/favorites/actions";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  targetType,
  targetId,
  initial,
  label = "Favoritar",
}: {
  targetType: FavoriteTarget;
  targetId: string;
  initial: boolean;
  label?: string;
}) {
  const [active, setActive] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    start(async () => {
      const res = await toggleFavorite(targetType, targetId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setActive((v) => !v);
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        size="sm"
        disabled={pending}
        onClick={toggle}
        aria-pressed={active}
        aria-label={label}
      >
        <Heart className={cn("h-4 w-4", active && "fill-current")} />
        {active ? "Favoritado" : "Favoritar"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
