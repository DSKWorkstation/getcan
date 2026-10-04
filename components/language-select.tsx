'use client';
import { languages, type Language } from '@/components/labels';

const names: Record<Language, string> = { en: 'English', ta: 'தமிழ்', hi: 'हिन्दी', te: 'తెలుగు', kn: 'ಕನ್ನಡ' };

// Put the languages the person is not using first, so switching is one glance away:
// the other languages lead while the app is in English, English leads otherwise.
export function languageOrder(current: Language): Language[] {
  const others = languages.filter(l => l !== 'en' && l !== current);
  return current === 'en' ? [...others, 'en'] : ['en', ...others, current];
}

export default function LanguageSelect({ value, onChange, label = 'Language', className }: { value: Language; onChange: (value: Language) => void; label?: string; className?: string }) {
  return <select className={className} aria-label={label} value={value} onChange={e => onChange(e.target.value as Language)}>
    {languageOrder(value).map(l => <option key={l} value={l}>{names[l]}</option>)}
  </select>;
}
