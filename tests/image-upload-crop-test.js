const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/admin.js'), 'utf8');
const start = source.indexOf('function ratioValue');
const end = source.indexOf('const UPLOAD_PROXY_MAX');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(source.slice(start, end) + '\nmodule.exports = { ratioValue, fitCropRect, clampCropRect, outputType };', sandbox);
const { ratioValue, fitCropRect, clampCropRect, outputType } = sandbox.module.exports;

assert.equal(ratioValue('1:1'), 1);
assert.equal(ratioValue('free'), null);
const sameRect = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));
sameRect(fitCropRect(1200, 800, 1), { x: 200, y: 0, width: 800, height: 800 });
sameRect(fitCropRect(800, 1200, 16 / 9), { x: 0, y: 375, width: 800, height: 450 });
sameRect(clampCropRect({ x: -4, y: 20, width: 500, height: 900 }, 800, 600), {
  x: 0, y: 0, width: 500, height: 600
});
assert.equal(outputType('image/gif'), 'image/png');
assert.equal(outputType('image/jpeg'), 'image/jpeg');
console.log('image-upload-crop-test: PASS');
