import type { PopupController } from '../lookup/controller';
import type { SavedWordsController, SavedWordsState } from './controller';
import { t } from '../../../shared/i18n';
import { Icon } from '../../components/Icon';
import { MeaningAttribution } from '../../components/MeaningAttribution';

export function SavedWords({ controller, saved, state }: { controller: PopupController; saved: SavedWordsController; state: SavedWordsState }) {
  return <>
    <div id="saved-list" role="list" aria-label={t('saved_list_label')}>
      {!state.ready ? !state.loadError && <p className="muted">{t('loading_saved')}</p> : !state.words.length ? <p className="hint">{t('empty_saved')}</p> : state.words.map((word, index) => <article className="saved-row" role="listitem" key={word.id}>
        <div className="saved-word-block"><button className="saved-word" data-saved-word={index} onClick={() => void controller.openSavedWord(word)}><span lang="de">{word.article ? `${word.article} ${word.lemma}` : word.lemma}</span><span className="saved-meaning" lang="en">{word.meaning}</span></button><MeaningAttribution source={word.meaningSource} /></div>
        <button className="delete-word" data-delete-word={index} disabled={state.busy} aria-label={t('delete_word_label', word.lemma)} title={t('delete_word_title')} onClick={() => void saved.remove(word.id)}><Icon name="close" /></button>
      </article>)}
    </div>
    <div className="saved-feedback"><p id="saved-status" className={state.statusError ? 'error' : 'muted'} role="status">{state.status}</p><button id="undo-delete" className="text-button" type="button" hidden={!state.removed} disabled={state.busy} onClick={() => void saved.undo()}>{t('undo_button')}</button></div>
  </>;
}
