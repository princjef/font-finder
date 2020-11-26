import test from 'ava';
import * as sinon from 'sinon';

import * as os from 'os';
import * as path from 'path';
import * as sysFontsLib from 'get-system-fonts';

import { list, Type, Style, Font, listVariants, get } from '.';

const variants = {
    dancing: {
        path: path.join(__dirname, '../fonts/DancingScript-Regular.ttf'),
        type: Type.Cursive,
        weight: 400,
        style: Style.Regular
    },
    firaCode: {
        path: path.join(__dirname, '../fonts/FiraCode-Regular.otf'),
        type: Type.Monospace,
        weight: 400,
        style: Style.Regular
    },
    furaCode: {
        path: path.join(__dirname, '../fonts/FuraCodeNF.otf'),
        type: Type.Monospace,
        weight: 450,
        style: Style.Regular
    },
    iosevkaOblique: {
        path: path.join(__dirname, '../fonts/iosevka-oblique.ttf'),
        type: Type.Monospace,
        weight: 400,
        style: Style.Oblique
    },
    iosevkaRegular: {
        path: path.join(__dirname, '../fonts/iosevka-regular.ttf'),
        type: Type.Monospace,
        weight: 400,
        style: Style.Regular
    },
    iosevkaBoldOblique: {
        path: path.join(__dirname, '../fonts/iosevka-boldoblique.ttf'),
        type: Type.Monospace,
        weight: 700,
        style: Style.BoldOblique
    },
    monoid: {
        path: path.join(__dirname, '../fonts/Monoid-Regular.ttf'),
        type: Type.Monospace,
        weight: 400,
        style: Style.Regular
    },
    ltagTest: {
        path: path.join(__dirname, '../fonts/ltag.otf'),
        type: Type.Unknown,
        weight: 500,
        style: Style.Regular
    },
    pacifico: {
        path: path.join(__dirname, '../fonts/Pacifico-Regular.ttf'),
        type: Type.Unknown,
        weight: 400,
        style: Style.Regular
    },
    pt: {
        path: path.join(__dirname, '../fonts/PT_Serif-Web-Regular.ttf'),
        type: Type.Serif,
        weight: 400,
        style: Style.Regular
    },
    robotoRegular: {
        path: path.join(__dirname, '../fonts/Roboto-Regular.ttf'),
        type: Type.SansSerif,
        weight: 400,
        style: Style.Regular
    },
    robotoBold: {
        path: path.join(__dirname, '../fonts/Roboto-Bold.ttf'),
        type: Type.SansSerif,
        weight: 700,
        style: Style.Bold
    },
    robotoBoldItalic: {
        path: path.join(__dirname, '../fonts/Roboto-BoldItalic.ttf'),
        type: Type.SansSerif,
        weight: 700,
        style: Style.BoldItalic
    },
    robotoThinItalic: {
        path: path.join(__dirname, '../fonts/Roboto-ThinItalic.ttf'),
        type: Type.SansSerif,
        weight: 250,
        style: Style.Italic
    },
    noOs2: {
        path: path.join(__dirname, '../fonts/no-os2.otf'),
        type: Type.Unknown,
        weight: 400,
        style: Style.Regular
    },
    shortOs2: {
        path: path.join(__dirname, '../fonts/os2-too-short.otf'),
        type: Type.Unknown,
        weight: 400,
        style: Style.Regular
    }
};

const fonts = {
    win32: {
        'Dancing Script': [variants.dancing],
        'Fira Code': [variants.firaCode],
        'FuraCode NF Retina': [variants.furaCode],
        'Iosevka': [variants.iosevkaOblique, variants.iosevkaRegular, variants.iosevkaBoldOblique],
        'Monoid': [variants.monoid],
        'LtagTest2': [variants.ltagTest],
        'Pacifico': [variants.pacifico],
        'PT Serif': [variants.pt],
        'Roboto': [variants.robotoRegular, variants.robotoBold, variants.robotoBoldItalic],
        'Roboto Thin': [variants.robotoThinItalic],
        'NoOS2': [variants.noOs2],
        'ShortOS/2': [variants.shortOs2]
    },
    darwin: {
        'Dancing Script': [variants.dancing],
        'Fira Code': [variants.firaCode],
        'FuraCode NF': [variants.furaCode],
        'Iosevka': [variants.iosevkaOblique, variants.iosevkaRegular, variants.iosevkaBoldOblique],
        'Monoid': [variants.monoid],
        'LtagTest2': [variants.ltagTest],
        'Pacifico': [variants.pacifico],
        'PT Serif': [variants.pt],
        'Roboto': [variants.robotoThinItalic, variants.robotoRegular, variants.robotoBold, variants.robotoBoldItalic],
        'NoOS2': [variants.noOs2],
        'ShortOS/2': [variants.shortOs2]
    }
};

const invalidFonts = [
    path.join(__dirname, '../fonts/invalidSignature.otf'),
    path.join(__dirname, '../fonts/woffSig.woff'),
    path.join(__dirname, '../fonts/nonexistantFont.ttf')
];

function stubFontList(platform: 'win32' | 'darwin') {
    const fontValues = Object.values(fonts[platform]).reduce((acc, val) => [...acc, ...val], []);
    const stubs = [
        sinon.stub(sysFontsLib, 'default')
            .returns(Promise.resolve(fontValues.map(f => f.path).concat(invalidFonts))),
        sinon.stub(os, 'platform').returns(platform)
    ];

    return () => {
        for (const stub of stubs) {
            stub.restore();
        }
    };
}

for (const platform of ['win32', 'darwin'] as ('win32' | 'darwin')[]) {
    test(`${platform}: finds all valid fonts in the provided directory`, async t => {
        const restore = stubFontList(platform);

        const result = await list();
        for (const name in result) {
            result[name].sort(variantCompare);
        }

        t.deepEqual(result, fonts[platform]);

        restore();
    });
}

for (const [name, variants] of Object.entries(fonts.darwin)) {
    test(`finds all variants of '${name}'`, async t => {
        const restore = stubFontList('darwin');
        const result = await listVariants(name);
        result.sort(variantCompare);
        t.deepEqual(result, variants);
        restore();
    });
}

test('returns an empty array if the font is not found', async t => {
    t.deepEqual(await listVariants('Nonexistant'), []);
});

for (const [name, variants] of Object.entries(fonts.darwin)) {
    for (const variant of variants) {
        test(`extracts metadata for ${name} variant at ${variant.path}`, async t => {
            const restore = stubFontList('darwin');
            t.deepEqual(await get(variant.path), { ...variant, name });
            restore();
        });
    }
}

function variantCompare(a: Font, b: Font): number {
    return (a.weight - b.weight) || a.style.localeCompare(b.style);
}
