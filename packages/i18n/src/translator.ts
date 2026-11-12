/** A text catalog: each key maps to its text, with {name} placeholders for the values. */
export type Catalog = Readonly<Record<string, string>>;

/** The placeholder names of a text: "Ver {name} ({count})" → "name" | "count". */
type PlaceholdersOf<Text extends string> =
  Text extends `${string}{${infer Name}}${infer Rest}`
    ? Name | PlaceholdersOf<Rest>
    : never;

/** No values for a text without placeholders; exactly its placeholders otherwise. */
type ValuesFor<Text extends string> = [PlaceholdersOf<Text>] extends [never]
  ? []
  : [values: Readonly<Record<PlaceholdersOf<Text>, string | number>>];

export type Translate<C extends Catalog> = <Key extends keyof C & string>(
  key: Key,
  ...values: ValuesFor<C[Key]>
) => string;

/**
 * The t() of an app (ADR-0043). Keys and placeholders are checked by the compiler, so a
 * screen cannot ask for a text that does not exist or forget one of its values.
 */
export function createTranslator<const C extends Catalog>(
  catalog: C,
): Translate<C> {
  return (key, ...values) => {
    const text = catalog[key];
    const given: Readonly<Record<string, string | number>> = values[0] ?? {};
    return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      name in given ? String(given[name]) : placeholder,
    );
  };
}
