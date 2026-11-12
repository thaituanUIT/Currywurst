import { safeMeaningSource } from '../../shared/saved-words';
import { t } from '../../shared/i18n';

export function MeaningAttribution({ source }: { source: unknown }) {
  const value = safeMeaningSource(source);
  if (!value) return null;
  return <p className="meaning-source"><a href={value.url} target="_blank" rel="noreferrer">{t(value.provider === 'MyMemory' ? 'translation_from' : 'meaning_from', value.provider)}</a>
    {value.provider === 'Wiktionary' && <> · <a href={value.licenseUrl} target="_blank" rel="noreferrer">CC BY-SA 4.0</a></>}
  </p>;
}
