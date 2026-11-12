export function normalizeGermanForm(value: unknown) {
  return String(value).normalize("NFC").toLocaleLowerCase("de-DE")
    .replace(/[·⁰¹²³⁴⁵⁶⁷⁸⁹]/g, "").replace(/[„“”"']/g, "").replace(/\s+/g, " ").trim();
}

export function expandGermanForms(value: string) {
  let forms = [normalizeGermanForm(value).replace(/\((?:du|ihr|sie|wir)\)/gi, "").trim()];
  // Parentheses indicate optional letters: geh(e), aß(es)t, and(e)r(e)n.
  for (let depth = 0; depth < 5 && forms.some((form) => /\([\p{L}]+\)/u.test(form)); depth++) {
    forms = forms.flatMap((form) => {
      const match = form.match(/\(([\p{L}]+)\)/u);
      return match ? [form.replace(match[0], ""), form.replace(match[0], match[1])] : [form];
    }).slice(0, 32);
  }
  return [...new Set(forms.flatMap((form) => form.split(/\s*[/;]\s*/)).map((form) => form.trim()).filter(Boolean))];
}

