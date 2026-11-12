import { dictionaryEntryUrl } from '../../../shared/dictionary-sources';
import type { DictionaryEntry, SearchResults } from '../../../shared/dictionary-types';
import { entryChoiceLabel, t, uiGrammarLabel } from '../../../shared/i18n';
import { SAVED_WORD_LIMIT, savedWordId } from '../../../shared/saved-words';
import { mergeEntryChoices, normalizeGermanForm } from '../../../dictionary/parser';
import { Icon } from '../../components/Icon';
import { Inflections } from '../../components/Inflections';
import { MeaningAttribution } from '../../components/MeaningAttribution';
import { Speaker } from '../pronunciation/Speaker';
import type { SavedWordsController, SavedWordsState } from '../saved-words/controller';
import type { PopupController } from './controller';

export function BackButton({ controller, results }: { controller: PopupController; results: SearchResults }) {
  return <button className="back-button" id="back-results" type="button" onClick={() => controller.back(results)}><Icon name="arrow-left" /><span>{t('back_results')}</span></button>;
}

interface EntryProps {
  data: DictionaryEntry;
  controller: PopupController;
  saved: SavedWordsController;
  savedState: SavedWordsState;
  backState?: SearchResults;
  message?: string;
}

export function Entry({ data, controller, saved, savedState, backState, message }: EntryProps) {
  const separateForm = data.lemma.toLocaleLowerCase() !== data.word.toLocaleLowerCase();
  const tags = [data.level, data.partOfSpeech, ...(data.grammarTags || [data.grammar])].filter((tag): tag is string => Boolean(tag));
  const sourcePath = data.sourceUrl ? new URL(data.sourceUrl).pathname : '';
  const variants = data.variants || [];
  const genderByUrl = variants.findIndex(variant => new URL(variant.url).pathname === sourcePath);
  const selectedGender = genderByUrl >= 0 ? genderByUrl : variants.findIndex(variant => variant.article === data.article);
  const degrees = data.comparisonVariants || [];
  const degreeByUrl = degrees.findIndex(entry => new URL(entry.url).pathname === sourcePath);
  const choices = mergeEntryChoices(data.entryChoices);
  const choiceByUrl = choices.findIndex(entry => dictionaryEntryUrl(entry.url, data.sourceUrl) && new URL(entry.url).pathname === sourcePath);
  const choiceInline = choices.findIndex(entry => entry.data && entry.data.partOfSpeech === data.partOfSpeech && entry.data.lemma === data.lemma && entry.data.meaning === data.meaning);
  const selectedChoice = choiceByUrl >= 0 ? choiceByUrl : choiceInline >= 0 ? choiceInline : choices.findIndex(entry => entry.partOfSpeech === data.partOfSpeech && normalizeGermanForm(entry.lemma) === normalizeGermanForm(data.lemma));
  const showChoices = new Set(choices.map(entry => entry.partOfSpeech)).size > 1 || choices.filter(entry => entry.data).length > 1;
  const alreadySaved = savedState.words.some(word => word.id === savedWordId(data));
  const full = savedState.words.length >= SAVED_WORD_LIMIT;
  const saveTitle = alreadySaved ? t('already_saved_title') : full ? t('saved_list_full') : t('save_word_title');
  const meaning = data.meaning || t(data.meaningState === 'unavailable' ? 'english_meaning_unavailable' : 'finding_english_meaning');
  const canSave = Boolean(data.lemma && data.meaning?.trim());
  return <>
    {backState && <BackButton controller={controller} results={backState} />}
    <div className="result-head"><div><div className="word-heading"><h1 className="word-title" lang="de">{data.lemma}</h1>
      {canSave && <button id="save-word" className="save-word" type="button" disabled={!savedState.ready || savedState.busy || alreadySaved || full} title={saveTitle} onClick={() => void saved.save(data, controller.getSnapshot().sourceUrl)}>{t(alreadySaved ? 'saved_button' : savedState.busy ? 'saving_button' : 'save_button')}</button>}
    </div><p className="ipa">{data.ipa?.[0] || ''}</p></div>
      <div className="audio-controls"><Speaker controller={controller} word={data.lemma} language="de-DE" recording={data.audio?.[0]} /><span>{data.lemma}</span>{separateForm && <><Speaker controller={controller} word={data.word} language="de-DE" /><span>{data.word}</span></>}</div>
    </div>
    {showChoices && <div className="noun-variants" role="group" aria-label={t('dictionary_entries_label')}>{choices.map((entry, index) => {
      const sameType = entry.data && choices.some(other => other !== entry && other.partOfSpeech === entry.partOfSpeech);
      const label = sameType ? entryChoiceLabel({ ...entry, label: entry.data!.meaning }) : entryChoiceLabel(entry);
      return <button type="button" className="noun-variant" key={index} data-entry-choice={index} aria-pressed={index === selectedChoice} onClick={() => index !== selectedChoice && controller.openAlternative(entry, data, backState, 'entry')}>{label}</button>;
    })}</div>}
    {variants.length > 1 && <div className="noun-variants" role="group" aria-label={t('noun_articles_label')}>{variants.map((entry, index) => <button type="button" className="noun-variant" key={index} data-noun-variant={index} aria-pressed={index === selectedGender} onClick={() => index !== selectedGender && controller.openAlternative(entry, data, backState)}>{entry.label}</button>)}</div>}
    {degrees.length > 1 && <div className="noun-variants" role="group" aria-label={t('adjective_degree_label')}>{degrees.map((entry, index) => <button type="button" className="noun-variant" key={index} data-degree={index} aria-pressed={index === (degreeByUrl >= 0 ? degreeByUrl : 0)} onClick={() => index !== (degreeByUrl >= 0 ? degreeByUrl : 0) && controller.openAlternative(entry, data, backState, 'comparison')}>{uiGrammarLabel(entry.label)}</button>)}</div>}
    <p className="gloss" lang="en">{meaning}</p><MeaningAttribution source={data.meaningSource} />
    {tags.length > 0 && <div className="grammar">{tags.map((tag, index) => <span className="tag" key={index}>{uiGrammarLabel(tag)}</span>)}</div>}
    {(data.usageNotes || []).map((note, index) => <p className="usage-note" key={index}>{note}</p>)}
    {message && <p className="error variant-error">{message}</p>}
    {data.principalParts && <p className="principal-parts">{data.principalParts}</p>}
    <Inflections tables={data.inflectionTables} partOfSpeech={data.partOfSpeech} />
    {canSave && <p id="save-status" className="muted save-status" role="status">{savedState.saveError || savedState.loadError || (full && !alreadySaved ? t('saved_list_full') : '')}</p>}
  </>;
}
