import type { SearchResults } from '../../../shared/dictionary-types';
import { t, uiGrammarLabel } from '../../../shared/i18n';
import { Icon } from '../../components/Icon';
import { Speaker } from '../pronunciation/Speaker';
import type { PopupController } from './controller';

export function Results({ results, controller }: { results: SearchResults; controller: PopupController }) {
  const description = results.entries.length ? t(results.entries.length === 1 ? 'one_german_match' : 'many_german_matches', results.entries.length) : t('no_english_matches');
  return <>
    <div className="result-head"><div><p className="eyebrow">{t('english_to_german_heading')}</p><h1 className="word-title" lang="en">{results.query}</h1></div><Speaker controller={controller} word={results.query} language="en-GB" /></div>
    <p className="results-count muted">{description}</p>
    <div className="translation-list">{results.entries.map((entry, index) => <article className="translation-card" key={index}>
      <button className="open-entry" data-entry={index} aria-label={t('open_grammar_label', entry.label)} onClick={() => controller.openResult(entry, results)}>
        <span className="translation-word" lang="de">{entry.label}</span>
        {entry.partOfSpeech && <span className="translation-pos">{uiGrammarLabel(entry.partOfSpeech)}</span>}
        <span className="translation-meaning" lang="en">{entry.meaning}</span>
        <span className="translation-action">{t(['verb', 'noun', 'adjective', 'pronoun', 'article'].includes(entry.partOfSpeech) ? 'forms_grammar' : 'view_meaning')} <Icon name="arrow-up-right" /></span>
      </button><Speaker controller={controller} word={entry.lemma} language="de-DE" />
    </article>)}</div>
  </>;
}
