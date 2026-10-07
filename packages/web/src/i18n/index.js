import { useSyncExternalStore } from 'react'

// PRD v1 §25 "i18n-ready": every label a screen shows can come from a
// dictionary. English is the source language; Hindi is the first translation.
// Strings missing from a dictionary fall back to English, so a screen is never
// blank while translations catch up.

export const LANGUAGES = [{ code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी' }]

const HI = {
  Dashboard: 'डैशबोर्ड',
  Tournaments: 'प्रतियोगिताएँ',
  Matches: 'मुकाबले',
  Accounts: 'खाते',
  'Sign-ins': 'साइन-इन',
  System: 'सिस्टम',
  Organisations: 'संगठन',
  Rulesets: 'नियम-सेट',
  Scoreboard: 'स्कोरबोर्ड',
  'Live board': 'लाइव बोर्ड',
  'Public site': 'सार्वजनिक साइट',
  Registrations: 'पंजीकरण',
  'Weigh-in': 'वज़न जाँच',
  'Kata scoring': 'काता स्कोरिंग',
  'Call matches': 'मुकाबले बुलाएँ',
  'Scoreboard control': 'स्कोरबोर्ड नियंत्रण',
  'My team': 'मेरी टीम',
  'My account': 'मेरा खाता',
  'Sign out': 'साइन आउट',
  Language: 'भाषा',
  Settings: 'सेटिंग्स',
  Categories: 'श्रेणियाँ',
  'Draw / Pools': 'ड्रॉ / पूल',
  'Kata panel': 'काता पैनल',
  Results: 'परिणाम',
  Certificates: 'प्रमाणपत्र',
  Reports: 'रिपोर्ट',
  'Audit log': 'ऑडिट लॉग',
}

const DICTIONARIES = { en: {}, hi: HI }
const KEY = 'kt:v1:lang'
let current = (() => {
  try { return localStorage.getItem(KEY) || 'en' } catch { return 'en' }
})()
const listeners = new Set()

export const getLanguage = () => current
export function setLanguage(code) {
  if (!DICTIONARIES[code]) return
  current = code
  try { localStorage.setItem(KEY, code) } catch { /* this tab only */ }
  try { document.documentElement.lang = code } catch { /* no document */ }
  listeners.forEach((fn) => fn())
}
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

/** Translates an English label into the current language. */
export const translate = (text, lang = current) => DICTIONARIES[lang]?.[text] ?? text

/** The current language and a translator that re-renders when it changes. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, getLanguage, getLanguage)
  return { lang, t: (text) => translate(text, lang), setLanguage }
}
