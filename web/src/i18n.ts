// Dashboard i18n. Strings live in ./locales/<lang>.json; English is the source and the fallback.
// Headlines arrive from the engine as key + params, so every viewer reads the world in their own language.

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import kk from './locales/kk.json';
import ko from './locales/ko.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';

export const LANGS = { en: 'English', ru: 'Русский', kk: 'Қазақша', fr: 'Français', zh: '简体中文', ko: '한국어', es: 'Español', ja: '日本語' } as const;
export type Lang = keyof typeof LANGS;

type Dict = Record<string, string>;
export const DICTS: Record<Lang, Dict> = { en, ru, kk, fr, zh, ko, es, ja };

const LOCALE: Record<Lang, string> = { en: 'en', ru: 'ru', kk: 'kk', fr: 'fr', zh: 'zh-CN', ko: 'ko', es: 'es', ja: 'ja' };

export function detectLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && q in DICTS) return q as Lang;
  try {
    const saved = localStorage.getItem('civarena.lang');
    if (saved && saved in DICTS) return saved as Lang;
  } catch { /* storage blocked */ }
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = (l || '').slice(0, 2).toLowerCase();
    if (code in DICTS) return code as Lang;
  }
  return 'en';
}

export function makeT(lang: Lang) {
  const d = DICTS[lang];
  const base = en as Dict;
  return (key: string, params?: Record<string, string | number>): string => {
    let s = d[key] ?? base[key] ?? key;
    if (params) {
      s = s.replace(/\{(\w+)\}/g, (_, k: string) => {
        const v = params[k];
        if (v === undefined) return '';
        if (k === 'good') return d[`good.${v}`] ?? String(v);
        if (k === 'job') return d[`job.${v}`] ?? String(v);
        if (typeof v === 'number') return fmtNum(v, lang);
        return String(v);
      });
    }
    return s;
  };
}

export type T = ReturnType<typeof makeT>;

export function fmtNum(v: number, lang: Lang = 'en', digits?: number): string {
  const abs = Math.abs(v);
  const d = digits ?? (abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  return v.toLocaleString(LOCALE[lang], { maximumFractionDigits: d, minimumFractionDigits: digits ?? 0 });
}

export function fmtCompact(v: number, lang: Lang = 'en'): string {
  return new Intl.NumberFormat(LOCALE[lang], { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

export function fmtPct(v: number, lang: Lang = 'en'): string {
  const s = fmtNum(Math.abs(v), lang, 1) + '%';
  return (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + s;
}
