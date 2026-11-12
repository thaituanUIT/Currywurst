import type { DictionaryEntry } from '../shared/dictionary-types';
import { expandGermanForms, normalizeGermanForm } from './german-forms';

export type ReflexiveCase = 'accusative' | 'dative';
export interface GermanVerbPhrase {
  verb: string;
  particle?: string;
  pronoun?: string;
  subject?: string;
  auxiliary?: string;
  infinitiveWithZu: boolean;
}

// This list proposes spellings; only dictionary forms establish separability.
const PARTICLES = new Set('ab an auf aus auseinander bei da dabei daran dar davon dazu durch ein empor entgegen entlang entzwei fest fort frei gegen her herab heran herauf heraus herbei herein herum herunter hervor hin hinab hinauf hinaus hinein hinzu hoch los mit nach nieder statt teil über überein um unter vor voran voraus vorbei vorüber weg weiter wieder zu zurecht zurück zusammen'.split(' '));
const MODIFIERS = new Set('bald bereits bitte doch eben endlich etwas früh gar gerade gern gerne gestern gleich heute jetzt manchmal mehr morgen nicht noch nur oft schon sehr selbst sofort spät täglich viel wirklich'.split(' '));
const REFLEXIVE = /^(?:mich|dich|sich|uns|euch|mir|dir)$/;
const ROW_LABEL = /^(?:nom\.?|gen\.?|dat\.?|acc\.?|singular|plural|masculine|feminine|neutral|neuter|present|past|perfect|infinitive|participle|imperative)$/i;
const SUBJECTS: Record<string, readonly string[]> = {
  ich: ['mich', 'mir'], du: ['dich', 'dir'], er: ['sich'], sie: ['sich'], es: ['sich'], wir: ['uns'], ihr: ['euch'],
};
const AUXILIARIES_BY_SUBJECT: Record<string, RegExp> = {
  ich: /^(?:habe|hatte|hätte|bin|sei|war|wäre|werde|wurde|würde)$/,
  du: /^(?:hast|habest|hattest|hättest|bist|seiest|warst|wärest|wirst|werdest|wurdest|würdest)$/,
  er: /^(?:hat|habe|hatte|hätte|ist|sei|war|wäre|wird|werde|wurde|würde)$/,
  es: /^(?:hat|habe|hatte|hätte|ist|sei|war|wäre|wird|werde|wurde|würde)$/,
  sie: /^(?:hat|habe|hatte|hätte|haben|hatten|hätten|ist|sei|war|wäre|sind|seien|waren|wären|wird|werde|wurde|würde|werden|wurden|würden)$/,
  wir: /^(?:haben|hatten|hätten|sind|seien|waren|wären|werden|wurden|würden)$/,
  ihr: /^(?:habt|habet|hattet|hättet|seid|seiet|wart|wäret|werdet|wurdet|würdet)$/,
};

export function auxiliaryFamily(value: string): string | null {
  if (/^(?:hab(?:e|en|t|est|et)|hast|hat|hatt(?:e|est|et|en)|hätt(?:e|est|et|en))$/.test(value)) return 'haben';
  if (/^(?:bin|bist|ist|sind|seid|sei(?:est|et|en)?|war(?:st|t|en)?|wär(?:e|est|et|en)|sein)$/.test(value)) return 'sein';
  if (/^(?:werd(?:e|en|et)|wirst|wird|wurd(?:e|est|et|en)|würd(?:e|est|et|en))$/.test(value)) return 'werden';
  return null;
}

export function analyzeGermanVerbPhrase(text: string): GermanVerbPhrase | null {
  if (text.length > 160) return null;
  const normalized = normalizeGermanForm(text).replace(/^[„“”"'«»]+|[.!?„“”"'«»]+$/gu, '').trim();
  if (!/^[\p{L}]+(?:[\s-][\p{L}]+)*$/u.test(normalized)) return null;
  let tokens = normalized.split(' ');
  if (tokens.length < 2 || tokens.length > 10) return null;
  const subject = tokens.length >= 3 && Object.hasOwn(SUBJECTS, tokens[0]) ? tokens.shift() : undefined;
  const auxiliary = tokens.length > 1 && auxiliaryFamily(tokens[0]) ? tokens.shift() : undefined;
  const pronouns = tokens.filter(token => REFLEXIVE.test(token));
  if (pronouns.length > 1) return null;
  const pronoun = pronouns[0];
  tokens = tokens.filter(token => !REFLEXIVE.test(token));
  const infinitiveWithZu = tokens[0] === 'zu' && tokens.length > 1;
  if (infinitiveWithZu) tokens.shift();
  const particle = tokens.length > 1 && PARTICLES.has(tokens.at(-1)!) ? tokens.pop() : undefined;
  tokens = tokens.filter(token => !MODIFIERS.has(token));
  if (tokens.length !== 1 || (!pronoun && !particle)) return null;
  if (infinitiveWithZu && !/(?:en|ern|eln)$/.test(tokens[0])) return null;
  return { verb: tokens[0], particle, pronoun, subject, auxiliary, infinitiveWithZu };
}

interface VerbEvidence {
  lexical: string;
  particle?: string;
  pronoun?: string;
  subject?: string;
  auxiliary?: string;
  imperative: boolean;
}

function expandRow(cells: string[]): string[] {
  let phrases = [''];
  for (const cell of cells) {
    const forms = expandGermanForms(cell);
    if (!forms.length) forms.push('');
    phrases = phrases.flatMap(phrase => forms.map(form => `${phrase} ${form}`.trim())).slice(0, 32);
  }
  return phrases;
}

function parseEvidence(form: string, lemma: string, imperative: boolean, defaultSubject?: string): VerbEvidence | null {
  const tokens = form.split(' ').filter(Boolean);
  if (ROW_LABEL.test(tokens[0] || '')) tokens.shift();
  const subject = Object.hasOwn(SUBJECTS, tokens[0]) ? tokens.shift() : defaultSubject;
  const pronoun = tokens.find(token => REFLEXIVE.test(token));
  const auxiliary = tokens.length > 1 ? tokens.find(token => auxiliaryFamily(token)) : undefined;
  const lexicalTokens = tokens.filter(token => !REFLEXIVE.test(token) && !(tokens.length > 1 && auxiliaryFamily(token)));
  const last = lexicalTokens.at(-1);
  const particle = lexicalTokens.length > 1 && last && lemma !== last && lemma.startsWith(last) ? lexicalTokens.pop() : undefined;
  if (lexicalTokens.length !== 1) return null;
  return { lexical: lexicalTokens[0], particle, pronoun, subject, auxiliary, imperative };
}

function verbEvidence(entry: Partial<DictionaryEntry>): VerbEvidence[] {
  const lemma = normalizeGermanForm(entry.lemma || '').replace(/^sich\s+/, '');
  const evidence: VerbEvidence[] = [];
  const add = (cells: string[], imperative = false, subject?: string) => {
    for (const form of expandRow(cells)) {
      const parsed = parseEvidence(form, lemma, imperative, subject);
      if (parsed) evidence.push(parsed);
    }
  };
  add([entry.lemma || '']);
  for (const form of (entry.principalParts || '').split('·')) add([form], false, 'er');
  for (const table of entry.inflectionTables || []) for (const [index, row] of table.rows.entries()) {
    if (table.cells?.[index]?.length && table.cells[index].every(cell => cell.header)) continue;
    const imperative = /imperativ/i.test(`${table.group || ''} ${table.title}`);
    const subject = row.join(' ').match(/\((du|ihr|sie|wir)\)/)?.[1];
    add(row, imperative, subject);
  }
  return evidence;
}

function pronounCases(pronoun?: string): ReflexiveCase[] {
  if (pronoun === 'mich' || pronoun === 'dich') return ['accusative'];
  if (pronoun === 'mir' || pronoun === 'dir') return ['dative'];
  return ['accusative', 'dative'];
}

function matchesReflexive(phrase: GermanVerbPhrase, evidence: VerbEvidence, cases: ReflexiveCase[]): boolean {
  if (!phrase.pronoun) return !evidence.pronoun;
  if (!cases.length || !pronounCases(phrase.pronoun).some(value => cases.includes(value))) return false;
  if (evidence.pronoun && !pronounCases(phrase.pronoun).some(value => pronounCases(evidence.pronoun).includes(value))) return false;
  const subject = phrase.subject || (!phrase.auxiliary ? evidence.subject : undefined);
  return !subject || SUBJECTS[subject]?.includes(phrase.pronoun) === true;
}

function lexicalVariants(evidence: VerbEvidence): string[] {
  const values = [evidence.lexical];
  if (evidence.imperative && evidence.subject === 'du' && evidence.lexical.endsWith('e')) {
    const stem = evidence.lexical.slice(0, -1);
    if (!/(?:[dt]|[bcdfghjklpqstvwxz][mn])$/i.test(stem)) values.push(stem);
  }
  return values;
}

function subjectsAgree(subject: string, sourceSubject?: string): boolean {
  if (subject === sourceSubject) return true;
  const thirdPerson = ['er', 'sie', 'es'];
  return thirdPerson.includes(subject) && thirdPerson.includes(sourceSubject || '');
}

export function matchesGermanVerbPhrase(entry: Partial<DictionaryEntry>, phrase: GermanVerbPhrase): boolean {
  if (phrase.subject && phrase.pronoun && !SUBJECTS[phrase.subject]?.includes(phrase.pronoun)) return false;
  if (phrase.subject && phrase.auxiliary && !AUXILIARIES_BY_SUBJECT[phrase.subject]?.test(phrase.auxiliary)) return false;
  const forms = verbEvidence(entry);
  const declaredReflexive = /^sich\s/.test(normalizeGermanForm(entry.lemma)) || entry.grammarTags?.includes('reflexive');
  const cases = entry.reflexiveCases?.length ? entry.reflexiveCases
    : declaredReflexive ? ['accusative', 'dative'] as ReflexiveCase[] : forms.flatMap(form => form.pronoun ? pronounCases(form.pronoun) : []);
  return forms.some(evidence => {
    if (phrase.subject && !phrase.auxiliary && !subjectsAgree(phrase.subject, evidence.subject)) return false;
    if (phrase.auxiliary && auxiliaryFamily(phrase.auxiliary) !== auxiliaryFamily(evidence.auxiliary || '')) return false;
    if (!matchesReflexive(phrase, evidence, cases)) return false;
    if (phrase.particle && evidence.particle !== phrase.particle) return false;
    return lexicalVariants(evidence).some(form => phrase.verb === (phrase.particle ? form : `${evidence.particle || ''}${form}`));
  });
}

export function matchesReflexiveVerbForm(entry: Partial<DictionaryEntry>, word: string): boolean {
  const query = normalizeGermanForm(word);
  const evidence = verbEvidence(entry);
  if (!/^sich\s/.test(normalizeGermanForm(entry.lemma)) && !evidence.some(form => form.pronoun)) return false;
  if (REFLEXIVE.test(query) || Object.hasOwn(SUBJECTS, query) || auxiliaryFamily(query)) return false;
  return evidence.some(form => lexicalVariants(form).some(value => query === `${form.particle || ''}${value}`));
}

export function verbPhraseSearchForm(phrase: GermanVerbPhrase): string {
  return `${phrase.particle || ''}${phrase.verb}`;
}

export function verbPhraseInfinitives(phrase: GermanVerbPhrase): string[] {
  const form = phrase.verb;
  const infinitive = (stem: string) => /(?:e|el|er)$/.test(stem) ? `${stem}n` : `${stem}en`;
  const candidates: string[] = [];
  if (/(?:en|ern|eln)$/.test(form)) candidates.push(form);
  for (const ending of ['est', 'st', 'et', 't', 'e']) {
    if (form.endsWith(ending) && form.length - ending.length >= 2) candidates.push(infinitive(form.slice(0, -ending.length)));
  }
  for (const particle of PARTICLES) {
    if (form.startsWith(`${particle}zu`) && /en$/.test(form)) candidates.unshift(form.slice(0, particle.length) + form.slice(particle.length + 2));
  }
  return [...new Set(candidates.map(candidate => `${phrase.particle || ''}${candidate}`))].slice(0, 3);
}
