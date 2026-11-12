import { Fragment } from 'react';
import type { InflectionTable } from '../../shared/dictionary-types';
import { t, uiGrammarLabel } from '../../shared/i18n';

function hasArticleColumn(table: InflectionTable, partOfSpeech: string) {
  const cases = table.rows.filter(row => /^(?:Nom\.?|Gen\.?|Dat\.?|Acc\.?)$/i.test(row[0]));
  return ['noun', 'adjective'].includes(partOfSpeech) && cases.length >= 3
    && cases.every(row => row.length === 3 && /^(?:der|die|das|des|dem|den|ein|eine|einer|eines|einem|einen|kein|keine|keiner|keines|keinem|keinen)$/i.test(row[1]));
}

export function Inflections({ tables, partOfSpeech }: { tables: InflectionTable[]; partOfSpeech: string }) {
  const groups = new Map<string, InflectionTable[]>();
  for (const table of tables) {
    const group = table.group || '';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(table);
  }
  if (!tables.length) return null;
  return <div className="inflection-grid">{[...groups].map(([group, entries]) => <section className="inflection-group" key={group}>
    {group && <h2 className="group-title">{uiGrammarLabel(group)}</h2>}
    {entries.map((table, index) => <section className="inflection" key={`${table.title}-${index}`}>
      <h3>{uiGrammarLabel(table.title)}</h3><div className="table-scroll"><table lang="de">
        <colgroup><col className="label-column" />{hasArticleColumn(table, partOfSpeech) && <><col className="article-column" /><col /></>}</colgroup>
        <tbody>{table.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => {
          const meta = table.cells?.[ri]?.[ci] || { header: false, colSpan: 1, rowSpan: 1 };
          const Tag = meta.header ? 'th' : 'td';
          const label = meta.header || ci === 0 ? uiGrammarLabel(cell) : cell;
          const language = label !== cell ? t('ui_locale') : meta.header ? 'en' : 'de';
          return <Tag lang={language} colSpan={meta.colSpan} rowSpan={meta.rowSpan} key={ci}>{label.split('/').map((part, index) => <Fragment key={index}>{index > 0 && <>/<wbr /></>}{part}</Fragment>)}</Tag>;
        })}</tr>)}</tbody>
      </table></div>
    </section>)}
  </section>)}</div>;
}
