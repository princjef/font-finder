const { performance } = require('perf_hooks');
const fontFinder = require('../');

const start = performance.now();
fontFinder.list({ concurrency: 8 })
    .then(res => {
        console.log('Total time:', performance.now() - start);
        console.log('Total count:', Object.keys(res).length);
        for (const font in res) {
            for (const sub in res[font]) {
                console.log(`${font} (${res[font][sub].weight}): ${res[font][sub].type}, ${res[font][sub].style}`);
            }
        }
    })
    .catch(e => {
        console.log('error', e);
    });
