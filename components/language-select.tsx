'use client';
import type { Language } from '@/components/labels';

const names: Record<Language, string> = { en: 'English', ta: 'தமிழ்', hi: 'हिन्दी' };

// Put the languages the person is not using first, so switching is one glance away:
// Tamil and Hindi lead while the app is in English, English leads otherwise.
export function languageOrder(current: Language): Language[] {
  return current === 'en' ? ['ta', 'hi', 'en'] : ['en', ...(['ta', 'hi'] as const).filter(l => l !== current), current];
}

export default function LanguageSelect({ value, onChange, label = 'Language', className }: { value: Language; onChange: (value: Language) => void; label?: string; className?: string }) {
  return <select className={className} aria-label={label} value={value} onChange={e => onChange(e.target.value as Language)}>
    {languageOrder(value).map(l => <option key={l} value={l}>{names[l]}</option>)}
  </select>;
}
