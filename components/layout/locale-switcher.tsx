"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";

import { useI18nStore } from "@/lib/i18n/store";
import type { Locale } from "@/lib/i18n/types";
import { localeOptions, localeLabels } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

const localeShortLabels: Record<Locale, string> = {
  zh: "CN  ZH",
  en: "EN",
};

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useI18nStore((state) => state.locale);
  const setLocale = useI18nStore((state) => state.setLocale);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function selectLocale(option: Locale) {
    setLocale(option);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-black/30 dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-white/8"
        aria-expanded={open}
        aria-label="Language"
      >
        <Languages className="h-3.5 w-3.5 text-slate-400" />
        <span>{localeShortLabels[locale]}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-[0_18px_44px_-24px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-[#151517]">
          {localeOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => selectLocale(option)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition",
                locale === option
                  ? "bg-teal-50 text-teal-700 dark:bg-teal-500/12 dark:text-teal-300"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white",
              )}
            >
              <span>{localeLabels[option]}</span>
              {locale === option ? <Check className="h-4 w-4" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
