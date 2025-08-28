const assert = require('assert');
const { isImageRequest } = require('../image-request');

assert.strictEqual(isImageRequest('draw a cat', []), true, 'direct image prompt');
assert.strictEqual(isImageRequest('Make it blue', ['draw a cat']), true, 'edit with reference to previous prompt');
assert.strictEqual(isImageRequest('How are you?', []), false, 'non-image prompt');
assert.strictEqual(isImageRequest('Make the phone a little smaller', ['draw a phone']), true, 'edit without image keyword');

console.log('All isImageRequest tests passed.');
