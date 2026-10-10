import {createRequire} from 'node:module';import test from 'node:test';import assert from 'node:assert/strict';
const {shouldHide}=createRequire(import.meta.url)('../electron/overlay.cjs');
test('Only explicitly enabled and pinned overlay bypasses fullscreen hiding',()=>{
 for(const gamingOverlay of [true,false])for(const pinned of [true,false])assert.equal(shouldHide({hideFullscreen:true,gamingOverlay},true,pinned),!(gamingOverlay&&pinned));
 assert.equal(shouldHide({hideFullscreen:true,gamingOverlay:false},false,false),false);assert.equal(shouldHide({hideFullscreen:false,gamingOverlay:false},true,false),false);
});
