import i18next from "i18next";

import en from "./locales/en.json";
import fr from "./locales/fr.json";
import zh from "./locales/zh.json";


i18next.init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    zh: { translation: zh },
  },
  fallbackLng: "en",
  lng: "en", // default
  interpolation: {
    escapeValue: false,
  },
});

export const t = (key: string, lang: string = "en", options: any = {}) => {
  const normalizedLang = lang?.split("-")[0] || "en";
  return i18next.t(key, { lng: normalizedLang, ...options });
};