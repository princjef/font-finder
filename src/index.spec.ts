import test from 'ava';
import * as sinon from 'sinon';

import * as path from 'path';
import * as sysFontsLib from 'get-system-fonts';

import { list, Type, Style, Font, listVariants, get } from '.';

const fonts = {
    'Dancing Script': [
        {
            path: path.join(__dirname, '../fonts/DancingScript-Regular.ttf'),
            type: Type.Cursive,
            weight: 400,
            style: Style.Regular
        }
    ],
    'Fira Code': [
        {
            path: path.join(__dirname, '../fonts/FiraCode-Regular.otf'),
            type: Type.Monospace,
            weight: 400,
            style: Style.Regular
        }
    ],
    'FuraCode NF Retina': [
        {
            path: path.join(__dirname, '../fonts/FuraCodeNF.otf'),
            type: Type.Monospace,
            weight: 450,
            style: Style.Regular
        }
    ],
    'Iosevka': [
        {
            path: path.join(__dirname, '../fonts/iosevka-oblique.ttf'),
            type: Type.Monospace,
            weight: 400,
            style: Style.Oblique
        },
        {
            path: path.join(__dirname, '../fonts/iosevka-regular.ttf'),
            type: Type.Monospace,
            weight: 400,
            style: Style.Regular
        },
        {
            path: path.join(__dirname, '../fonts/iosevka-boldoblique.ttf'),
            type: Type.Monospace,
            weight: 700,
            style: Style.BoldOblique
        }
    ],
    'Monoid': [
        {
            path: path.join(__dirname, '../fonts/Monoid-Regular.ttf'),
            type: Type.Monospace,
            weight: 400,
            style: Style.Regular
        }
    ],
    'LtagTest2': [
        {
            path: path.join(__dirname, '../fonts/ltag.otf'),
            type: Type.Unknown,
            weight: 500,
            style: Style.Regular
        }
    ],
    'Pacifico': [
        {
            path: path.join(__dirname, '../fonts/Pacifico-Regular.ttf'),
            type: Type.Unknown,
            weight: 400,
            style: Style.Regular
        }
    ],
    'PT Serif': [
        {
            path: path.join(__dirname, '../fonts/PT_Serif-Web-Regular.ttf'),
            type: Type.Serif,
            weight: 400,
            style: Style.Regular
        }
    ],
    'Roboto': [
        {
            path: path.join(__dirname, '../fonts/Roboto-Regular.ttf'),
            type: Type.SansSerif,
            weight: 400,
            style: Style.Regular
        }, {
            path: path.join(__dirname, '../fonts/Roboto-Bold.ttf'),
            type: Type.SansSerif,
            weight: 700,
            style: Style.Bold
        }, {
            path: path.join(__dirname, '../fonts/Roboto-BoldItalic.ttf'),
            type: Type.SansSerif,
            weight: 700,
            style: Style.BoldItalic
        }
    ],
    'Roboto Thin': [
        {
            path: path.join(__dirname, '../fonts/Roboto-ThinItalic.ttf'),
            type: Type.SansSerif,
            weight: 250,
            style: Style.Italic
        }
    ]
};

const invalidFonts = [
    path.join(__dirname, '../fonts/invalidSignature.otf'),
    path.join(__dirname, '../fonts/woffSig.woff'),
    path.join(__dirname, '../fonts/nonexistantFont.ttf')
];

test.beforeEach(() => {
    const fontValues = Object.values(fonts).reduce((acc, val) => [...acc, ...val], []);
    sinon.stub(sysFontsLib, 'default')
        .returns(Promise.resolve(fontValues.map(f => f.path).concat(invalidFonts)));
});

test.afterEach(() => {
    (sysFontsLib.default as sinon.SinonStub).restore();
});

test('finds all valid fonts in the provided directory', async t => {
    const result = await list();
    for (const name in result) {
        result[name].sort(variantCompare);
    }

    t.deepEqual(result, fonts);
});

for (const [name, variants] of Object.entries(fonts)) {
    test(`finds all variants of '${name}'`, async t => {
        const result = await listVariants(name);
        result.sort(variantCompare);
        t.deepEqual(result, variants);
    });
}

test('returns an empty array if the font is not found', async t => {
    t.deepEqual(await listVariants('Nonexistant'), []);
});

for (const [name, variants] of Object.entries(fonts)) {
    for (const variant of variants) {
        test(`extracts metadata for ${name} variant at ${variant.path}`, async t => {
            t.deepEqual(await get(variant.path), { ...variant, name });
        });
    }
}

function variantCompare(a: Font, b: Font): number {
    return (a.weight - b.weight) || a.style.localeCompare(b.style);
}
