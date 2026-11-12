import catalog from "../../_locales/en/messages.json";
import type { EntryChoice } from "./dictionary-types";
import { isRecord } from "./storage";

export type MessageKey = keyof typeof catalog;

// Chrome and Edge resolve missing locale messages through default_locale.
export function t(key: MessageKey, substitutions: string | number | (string | number)[] = []) {
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  return chrome.i18n.getMessage(key, values.map(String));
}

export function uiError(error: unknown, fallbackKey: MessageKey = "lookup_failed") {
  if (!isRecord(error) && !(error instanceof Error)) return t(fallbackKey);
  const value = error as { messageKey?: string; messageArgs?: string[]; message?: string };
  return (value.messageKey && value.messageKey in catalog && t(value.messageKey as MessageKey, value.messageArgs || [])) || value.message || t(fallbackKey);
}

export function entryChoiceLabel(entry: Pick<EntryChoice, "partOfSpeech" | "label" | "lemma">) {
  const prefix = `${entry.partOfSpeech} · `;
  const label = entry.label || entry.lemma;
  const word = label.startsWith(prefix) ? label.slice(prefix.length) : label;
  return t("entry_choice_label", [uiGrammarLabel(entry.partOfSpeech) || t("dictionary_entry"), word]);
}

export const GRAMMAR_MESSAGES = {
  "verb": "grammar_verb",
  "noun": "grammar_noun",
  "adjective": "grammar_adjective",
  "adverb": "grammar_adverb",
  "pronoun": "grammar_pronoun",
  "article": "grammar_article",
  "preposition": "grammar_preposition",
  "conjunction": "grammar_conjunction",
  "particle": "grammar_particle",
  "numeral": "grammar_numeral",
  "interjection": "grammar_interjection",
  "irregular": "grammar_irregular",
  "regular": "grammar_regular",
  "separable": "grammar_separable",
  "inseparable": "grammar_inseparable",
  "not separable": "grammar_not_separable",
  "masculine": "grammar_masculine",
  "feminine": "grammar_feminine",
  "neutral": "grammar_neutral",
  "neuter": "grammar_neuter",
  "strong": "grammar_strong",
  "weak": "grammar_weak",
  "mixed": "grammar_mixed",
  "positive": "grammar_positive",
  "comparative": "grammar_comparative",
  "superlative": "grammar_superlative",
  "not comparable": "grammar_not_comparable",
  "comparable": "grammar_comparable",
  "indeclinable": "grammar_indeclinable",
  "reflexive": "grammar_reflexive",
  "transitive": "grammar_transitive",
  "intransitive": "grammar_intransitive",
  "passive": "grammar_passive",
  "only singular": "grammar_only_singular",
  "only plural": "grammar_only_plural",
  "personal pronoun": "grammar_personal_pronoun",
  "reflexive pronoun": "grammar_reflexive_pronoun",
  "possessive": "grammar_possessive",
  "relative": "grammar_relative",
  "demonstrative": "grammar_demonstrative",
  "interrogative": "grammar_interrogative",
  "indefinite": "grammar_indefinite",
  "definite": "grammar_definite",
  "coordinating": "grammar_coordinating",
  "subordinating": "grammar_subordinating",
  "accusative": "grammar_accusative",
  "dative": "grammar_dative",
  "genitive": "grammar_genitive",
  "Positive": "heading_positive",
  "Comparative": "heading_comparative",
  "Superlative": "heading_superlative",
  "Indicative": "heading_indicative",
  "Subjunctive": "heading_subjunctive",
  "Imperative": "heading_imperative",
  "Infinitive/Participle": "heading_infinitive_participle",
  "Infinitive": "heading_infinitive",
  "Infinitive I": "heading_infinitive_i",
  "Infinitive II": "heading_infinitive_ii",
  "Participle": "heading_participle",
  "Participle I": "heading_participle_i",
  "Participle II": "heading_participle_ii",
  "Present": "heading_present",
  "Imperfect": "heading_imperfect",
  "Present Subj.": "heading_present_subj",
  "Imperf. Subj.": "heading_imperf_subj",
  "Perfect": "heading_perfect",
  "Pluperf.": "heading_pluperf",
  "Future I": "heading_future_i",
  "Future Perfect": "heading_future_perfect",
  "Perf. Subj.": "heading_perf_subj",
  "Pluperf. Subj.": "heading_pluperf_subj",
  "Future Subj.": "heading_future_subj",
  "Fut. Perf. Subj.": "heading_fut_perf_subj",
  "Conditional (würde)": "heading_conditional_wurde",
  "Subjunctive II": "heading_subjunctive_ii",
  "Past Cond.": "heading_past_cond",
  "Singular": "heading_singular",
  "Plural": "heading_plural",
  "Masculine": "heading_masculine",
  "Feminine": "heading_feminine",
  "Neutral": "heading_neutral",
  "Neuter": "heading_neuter",
  "Strong declension": "heading_strong_declension",
  "Weak declension": "heading_weak_declension",
  "Mixed declension": "heading_mixed_declension",
  "Predicative use": "heading_predicative_use",
  "Conjugation": "heading_conjugation",
  "Declension": "heading_declension",
  "Nom.": "heading_nom",
  "Gen.": "heading_gen",
  "Dat.": "heading_dat",
  "Acc.": "heading_acc",
  "Masc.": "heading_masc",
  "Fem.": "heading_fem",
  "Neut.": "heading_neut"
} as const satisfies Record<string, MessageKey>;

export function uiGrammarLabel(label = "") {
  return label.split(" · ").map(part => part in GRAMMAR_MESSAGES ? t(GRAMMAR_MESSAGES[part as keyof typeof GRAMMAR_MESSAGES]) : part).join(" · ");
}
