import * as fs from 'fs';
import promiseStream, { PromiseStream } from 'promise-stream-reader';

import parseNameTable, { NameTable } from './tables/name';
import parseLtagTable from './tables/ltag';
import parseOS2Table, { OS2Table } from './tables/os2';
import parseHeadTable, { HeadTable } from './tables/head';
import parsePostTable, { PostTable } from './tables/post';

enum SignatureType {
    TrueType,
    CFF,
    Woff,
    TrueTypeCollection
}

const tableInfo = {
    name: {
        tag: Buffer.from('name'),
        parse: parseNameTable
    },
    ltag: {
        tag: Buffer.from('ltag'),
        parse: parseLtagTable
    },
    os2: {
        tag: Buffer.from('OS/2'),
        parse: parseOS2Table
    },
    head: {
        tag: Buffer.from('head'),
        parse: parseHeadTable
    },
    post: {
        tag: Buffer.from('post'),
        parse: parsePostTable
    }
};

export type FontData = {
    names: NameTable;
    os2?: OS2Table;
    head?: HeadTable;
    post?: PostTable
};

/**
 * Loads the bare minimum information needed to retrieve the metadata that we
 * want, streaming the data from the file until we've found everything we need.
 *
 * @param filePath Absolute path to the font to load
 */
export default async function parseFont(filePath: string): Promise<FontData | FontData[]> {
    return new Promise<FontData | FontData[]>((resolve, reject) => {
        (async () => {
            const pStream = promiseStream();
            const stream = fs.createReadStream(filePath);

            // Track the stream state so we don't try to destroy a closed socket
            let streamFinished = false;
            const markFinished = () => { streamFinished = true; };
            stream.once('close', markFinished);
            stream.once('end', markFinished);
            stream.once('error', e => {
                streamFinished = true;
                reject(e);
            });

            stream.pipe(pStream);

            try {
                const signature = parseTag(await pStream.read(4));
                switch (signature) {
                    case SignatureType.TrueTypeCollection:
                        // Skip over the version information
                        await pStream.skip(4);

                        // Get the number of fonts in the collection
                        const numFonts = (await pStream.read(4)).readUInt32BE(0);
                        // Create array with the offset of each font in the TTC file
                        let offsets: number[] = [];
                        for (let i = 0; i < numFonts; i++) {
                            offsets.push((await pStream.read(4)).readUInt32BE(0));
                        }
                        let fontData: FontData[] = [];
                        // Parse the TrueType Fonts within the TTC as we go
                        for (const offset of offsets) {
                            const stream2 = fs.createReadStream(filePath);
                            const pStream2 = promiseStream();
                            stream2.pipe(pStream2);

                            await pStream2.skip(offset + 4);
                            await parseTrueTypeFont(pStream2, filePath).then((data) => {
                                fontData.push(data);
                            });
                            stream.unpipe(pStream2);
                            stream.destroy();
                            pStream2.destroy();
                        }
                        return fontData;
                        break;
                    case SignatureType.TrueType:
                    case SignatureType.CFF:
                        return await parseTrueTypeFont(pStream, filePath);
                    case SignatureType.Woff:
                    default:
                        throw new Error('provided font type is not supported yet');
                }
            } finally {
                // Clean up our state so that the file stream doesn't leak
                stream.unpipe(pStream);
                if (!streamFinished) {
                    stream.destroy();
                    pStream.destroy();
                }
            }
        })().then(resolve, reject);
    });
}

async function parseTrueTypeFont(pStream, filePath): Promise<FontData> {
    const numTables = (await pStream.read(2)).readUInt16BE(0);
    // Skip the rest of the offset table
    await pStream.skip(6);

    // Get the table metadata
    const tableMeta = await findTableRecords(pStream, numTables);

    // Order the tables based on location in the file. We
    // want to look for earlier tables first
    const orderedTables = Object.entries(tableMeta)
        .sort((a, b) => a[1]!.offset - b[1]!.offset);

    // Get the buffer representing each of the tables
    const tableData: { [K in keyof typeof tableInfo]?: Buffer } = {};
    for (const [name, meta] of orderedTables) {
        // Skip the data between the end of the previous
        // table and the start of this one
        await pStream.skip(meta!.offset - pStream.offset);
        tableData[name] = await pStream.read(meta!.length);
    }

    // The ltag table is usually not present, but parse it
    // first if it is because we need it for the name table.
    let ltag: string[] = [];
    if (tableData.ltag) {
        ltag = tableInfo.ltag.parse(tableData.ltag);
    }

    // If any of the necessary font tables are missing,
    // throw
    if (!tableData.name) {
        throw new Error(`missing required OpenType table 'name' in font file: ${filePath}`);
    }

    // Parse and return the tables we need
    let fd = {
        names: tableInfo.name.parse(tableData.name, ltag),
        os2: tableData.os2 && tableInfo.os2.parse(tableData.os2),
        head: tableData.head && tableInfo.head.parse(tableData.head),
        post: tableData.post && tableInfo.post.parse(tableData.post)
    };
    return fd as FontData;
}

const signatures = {
    one: Buffer.from([0x00, 0x01, 0x00, 0x00]),
    otto: Buffer.from('OTTO'),
    true: Buffer.from('true'),
    typ1: Buffer.from('typ1'),
    woff: Buffer.from('wOFF'),
    ttc: Buffer.from('ttcf')
};

/**
 * Parses a tag buffer, returning the type of font contained within.
 *
 * @param tag 4-byte buffer to parse for the tag
 */
function parseTag(tag: Buffer): SignatureType {
    if (
        tag.equals(signatures.one) ||
        tag.equals(signatures.true) ||
        tag.equals(signatures.typ1)
    ) {
        return SignatureType.TrueType;
    } else if (tag.equals(signatures.otto)) {
        return SignatureType.CFF;
    } else if (tag.equals(signatures.woff)) {
        return SignatureType.Woff;
    } else if (tag.equals(signatures.ttc)) {
        return SignatureType.TrueTypeCollection;
    } else {
        throw new Error(`Unsupported signature type: ${tag}`);
    }
}

type TableMeta = { [K in keyof typeof tableInfo]?: { offset: number; length: number; } };

/**
 * Parse the table record list for the specific tables that we care about.
 *
 * @param stream Promise stream positioned at the table record list
 * @param numTables The number of tables in the table record list
 */
async function findTableRecords(stream: PromiseStream, numTables: number): Promise<TableMeta> {
    const tableMeta: TableMeta = {};
    for (let i = 0; i < numTables; i++) {
        const tag = await stream.read(4);
        const data = await stream.read(12);
        for (const [name, table] of Object.entries(tableInfo)) {
            if (tag.equals(table.tag)) {
                tableMeta[name] = {
                    offset: data.readUInt32BE(4),
                    length: data.readUInt32BE(8)
                };

                if (tableMeta.name && tableMeta.ltag && tableMeta.os2) {
                    return tableMeta;
                }
            }
        }
    }

    return tableMeta;
}
