import { t } from '../../../shared/i18n';
import { Icon } from '../../components/Icon';
import type { PopupController } from '../lookup/controller';

export function Speaker({ word, language, recording = '', controller }: { word: string; language: string; recording?: string; controller: PopupController }) {
  return <button className="word-audio" type="button" data-speak={word} data-language={language} data-recording={recording} aria-label={t('play_pronunciation_label', word)} title={t('play_word_title', word)} onClick={() => void controller.play(word, language, recording)}><Icon name="play" /></button>;
}
