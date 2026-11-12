import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { t } from '../shared/i18n';
import { SAVED_WORD_LIMIT } from '../shared/saved-words';
import { Icon } from './components/Icon';
import { Entry, BackButton } from './features/lookup/Entry';
import { Results } from './features/lookup/Results';
import { PopupController } from './features/lookup/controller';
import { SavedWords } from './features/saved-words/SavedWords';
import { SavedWordsController } from './features/saved-words/controller';

export function App({ controller, saved }: { controller: PopupController; saved: SavedWordsController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const savedState = useSyncExternalStore(saved.subscribe, saved.getSnapshot);
  const input = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLElement>(null);
  const english = state.mode === 'en-de';
  const entry = state.lookup.kind === 'entry' ? state.lookup.data : undefined;

  useEffect(() => {
    document.documentElement.dataset.mode = state.mode;
    document.documentElement.lang = t('ui_locale');
    document.documentElement.dir = t('ui_direction');
    document.title = t('popup_title');
  }, [state.mode]);
  useEffect(() => { saved.clearSaveError(); }, [entry, saved]);
  useLayoutEffect(() => { if (result.current) result.current.scrollTop = 0; }, [state.scrollVersion]);

  return <main>
    <header><div className="brand-mark" aria-hidden="true"><img src="icon.svg" alt="" width="36" height="36" /></div><span className="brand-name">Currywurst</span>
      <button className="source-label" id="mode-toggle" type="button" hidden={state.view === 'saved'} aria-label={t(english ? 'mode_to_german_label' : 'mode_to_english_label')} aria-pressed={english} title={t('mode_toggle_title')} onClick={() => { controller.toggleMode(); input.current?.focus(); }}><span>{english ? 'EN' : 'DE'}</span><Icon name="arrow-right" /><span>{english ? 'DE' : 'EN'}</span></button>
    </header>
    <nav className="view-nav" aria-label={t('views_label')}><button id="lookup-tab" type="button" aria-pressed={state.view === 'lookup'} onClick={() => controller.setView('lookup')}>{t('lookup_tab')}</button><button id="saved-tab" type="button" aria-pressed={state.view === 'saved'} onClick={() => { controller.setView('saved'); if (!savedState.busy) void saved.load(); }}><span>{t('saved_tab')}</span> <span id="saved-count">{savedState.ready ? t('saved_count', [savedState.words.length, SAVED_WORD_LIMIT]) : `…/${SAVED_WORD_LIMIT}`}</span></button></nav>
    <section id="lookup-view" hidden={state.view !== 'lookup'}>
      <label className="search-label" htmlFor="word">{t(english ? 'search_english_label' : 'search_german_label')}</label>
      <form id="search-form" onSubmit={event => { event.preventDefault(); void controller.runLookup(state.input.trim()); }}><input id="word" ref={input} value={state.input} autoComplete="off" spellCheck={false} aria-label={t(english ? 'english_word_label' : 'german_word_label')} onChange={event => controller.editInput(event.target.value)} /><button type="submit">{t('lookup_button')}</button></form>
      <section id="result" ref={result} aria-live="polite">
        {state.lookup.kind === 'idle' && <div className="empty-state"><p className="hint">{t(state.lookup.restored ? 'restored_lookup_hint' : 'empty_lookup_hint')}</p></div>}
        {state.lookup.kind === 'loading' && <div className="loading" role="status"><span className="spinner" aria-hidden="true" /><span>{state.lookup.message}</span></div>}
        {state.lookup.kind === 'empty' && <p className="muted">{state.lookup.message}</p>}
        {state.lookup.kind === 'error' && <>
          {state.lookup.detail?.backState && <BackButton controller={controller} results={state.lookup.detail.backState} />}
          <p className="error">{state.lookup.message}</p><button id="retry" onClick={() => { const lookup = controller.getSnapshot().lookup; if (lookup.kind === 'error') void controller.runLookup(lookup.word, lookup.detail, lookup.options); }}>{t('retry_button')}</button>
        </>}
        {state.lookup.kind === 'results' && <Results results={state.lookup.results} controller={controller} />}
        {state.lookup.kind === 'entry' && <Entry {...state.lookup} controller={controller} saved={saved} savedState={savedState} />}
        {(state.lookup.kind === 'entry' || state.lookup.kind === 'results') && <p className="audio-status muted" role="status">{state.audioStatus}</p>}
      </section>
    </section>
    <section id="saved-view" hidden={state.view !== 'saved'}><SavedWords controller={controller} saved={saved} state={savedState} /></section>
    <footer>
      <a className="support-link" href="https://ko-fi.com/tuanthai95541" target="_blank" rel="noopener noreferrer" title={t('support_link_title')}><Icon name="coffee" /><span>{t('support_link')}</span></a>
      <a href={state.sourceUrl} id="source" target="_blank" rel="noreferrer" hidden={state.view === 'saved'}>{new URL(state.sourceUrl).origin === 'https://www.woerter.net' ? 'Woerter.net' : 'Verbformen'} <Icon name="arrow-up-right" /></a>
    </footer>
  </main>;
}
