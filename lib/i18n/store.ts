import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Locale, Dictionary } from "./types";
import zh from "./dictionaries/zh";
import en from "./dictionaries/en";

const dictionaries: Record<Locale, Dictionary> = { zh, en };

type I18nState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: "zh",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "mxpage:i18n" },
  ),
);

/**
 * 翻译 hook。使用：const t = useTranslation(); t("common.save")
 * 支持点号路径访问嵌套字典。
 */
export function useTranslation() {
  const locale = useI18nStore((state) => state.locale);
  const dict = dictionaries[locale] ?? dictionaries.zh;
  return (path: string): string => {
    const segments = path.split(".");
    let current: unknown = dict;
    for (const segment of segments) {
      if (current && typeof current === "object" && segment in current) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return path;
      }
    }
    return typeof current === "string" ? current : path;
  };
}

export function getDict(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.zh;
}
