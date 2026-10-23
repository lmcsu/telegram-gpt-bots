// @ts-expect-error: no types
import Az from 'az';
import fs from 'node:fs';

function rand<T>(items: Array<{ weight: number; value: T | (() => T) } | T>): T | null {
    if (!items.length) {
        return null;
    }

    const mappedItems = items.map((item) => {
        if (typeof item === 'object' && item !== null && 'weight' in item) {
            return item;
        } else {
            return {
                weight: 1,
                value: item,
            };
        }
    });
    const total = mappedItems.reduce((acc, item) => acc + item.weight, 0);
    const r = Math.random() * total;

    let w = 0;
    let result: T | null = null;
    for (const item of mappedItems) {
        w += item.weight;
        if (r <= w) {
            let value = item.value;
            if (typeof value === 'function') {
                value = (value as (() => T))();
            }
            result = value;
            break;
        }
    }

    return result;
}

const dick: Record<string, string> = {};

const lines = fs.readFileSync('./nouns_form.txt', 'utf8').split('\n');

for (const lineRaw of lines) {
    const line = lineRaw.trim();

    if (!line) {
        continue;
    }

    const words = line.split(/\s+/);

    const word = words[0]!;
    const wordS = words[1]!;

    dick[word] = wordS;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function containsOnlyRussianLetters(text: string): boolean {
    return /^[а-яА-ЯёЁ]+$/.test(text);
}

export function huegen(s: string): string[][] {
    const result: string[][] = [];

    const words = s.match(/[а-яё]+/giu) ?? [];

    if (words.length > 5) {
        return result;
    }

    for (let word of words) {
        word = word.toLowerCase();

        if (
            word.length <= 3 ||
            !containsOnlyRussianLetters(word)
        ) {
            continue;
        }

        if (!(word in dick)) {
            continue;
        }

        const wordS = dick[word];

        const postWord =
            wordS
                ?.match(/.?[^аеёиоуыэюя]*\+.+/)?.[0]
                ?.replace('+', '')
                ?.replace(/^[^аеёиоуыэюя]*/, '');

        if (!postWord) {
            continue;
        }

        const gWord = capitalize('говн' + postWord);
        const zWord = capitalize('залуп' + postWord);

        let l = postWord[0];

        if (l === 'а') {
            l = 'я';
        }
        if (l === 'о') {
            l = 'е';
        }
        if (l === 'у') {
            l = 'ю';
        }

        const hWord = capitalize(
            'ху' + l + postWord.slice(1),
        );

        result.push([gWord, hWord, zWord]);
    }

    return result;
}

await new Promise<void>((resolve) => {
    Az.Morph.init(resolve);
});

function pluralize(word: string, form: 'nomn' | 'accs'): string | null {
    const parsed = Az.Morph(word)[0];
    if (!parsed) {
        return null;
    }

    if (parsed.tag.POS !== 'NOUN') {
        return null;
    }

    return (
        parsed.inflect([form, 'plur'])?.word ??
        parsed.inflect([form])?.word ??
        null
    );
}

function getWords(s: string) {
    const words = s.match(/\p{L}+/gu) ?? [];

    const result = {
        nouns: {
            nomn: [] as string[],
            accs: [] as string[],
        },
    };

    if (words.length > 100) {
        return result;
    }

    for (const raw of words) {
        const word = raw.toLowerCase();

        if (
            word.length <= 3 ||
            !containsOnlyRussianLetters(word)
        ) {
            continue;
        }

        const parsed = Az.Morph(word)[0];
        if (!parsed) {
            continue;
        }

        if (parsed.tag.POS !== 'NOUN') {
            continue;
        }

        const nomn = pluralize(word, 'nomn');
        if (nomn) {
            result.nouns.nomn.push(capitalize(nomn));
        }

        const accs = pluralize(word, 'accs');
        if (accs) {
            result.nouns.accs.push(capitalize(accs));
        }
    }

    return result;
}

export function getHuewords(s: string) {
    const words = getWords(s);

    const huegenWords = rand(huegen(s).map((ws) => {
        return {
            weight: 1,
            value: () => rand(ws),
        };
    }));

    const vRotWord = rand([
        ...(words.nouns.nomn.length ?
            [{
                weight: 25,
                value: () => rand(words.nouns.nomn) + ' для пидоров',
            }] :
            []),
        ...(words.nouns.accs.length ?
            [{
                weight: 75,
                value: () => rand(words.nouns.accs) + ' ' + rand(['на хую вертел', 'в рот ебал', 'в жопу ебал']),
            }] :
            []),
    ]);

    return rand([
        ...(huegenWords ?
            [{
                weight: 80,
                value: huegenWords,
            }] :
            []),
        ...(vRotWord ?
            [{
                weight: 20,
                value: vRotWord,
            }] :
            []),
    ]);
}
