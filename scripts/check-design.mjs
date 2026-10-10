import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const file=process.argv[2];
if(!file)throw new Error('Usage: node scripts/check-design.mjs <path-to-design-mockup.html>');
const fragment=await fs.readFile(file,'utf8');new vm.Script(fragment.match(/<script>([\s\S]*?)<\/script>/)[1]);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const errors=[];
  for(const width of [736,320]){
    const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:750});await page.setContent(`<html><body style="margin:0">${fragment}</body></html>`);await page.waitForTimeout(80);
    const section=page.locator('[data-variant="Компактная"]');
    const capsule=section.locator('.wi-capsule');
    const scene=await section.locator('.wi-scene').boundingBox();
    const x=scene.x+scene.width/2,y=scene.y+8;
    const state=()=>capsule.evaluate(el=>({progress:Number(el.dataset.progress),mode:el.dataset.mode,height:el.getBoundingClientRect().height,top:el.getBoundingClientRect().top,toast:Number(el.querySelector('.wi-toast').style.opacity),expanded:Number(el.querySelector('.wi-expanded').style.opacity)}));
    await page.mouse.move(x,y);await page.mouse.down();
    await page.mouse.move(x,y+45);let partial=await state();assert.equal(partial.mode,'dragging');assert.ok(Math.abs(partial.progress-.5)<.01);assert.ok(partial.height>32&&partial.height<96);
    await page.mouse.move(x,y+90);let toast=await state();assert.equal(toast.progress,1);assert.equal(toast.toast,1);assert.ok(toast.top>partial.top,'pull must always move downward');
    await page.screenshot({path:`artifacts/design-drag-notification-${width}.png`});
    await page.mouse.move(x,y+210);let opening=await state();assert.ok(opening.progress>1.5&&opening.expanded>0);
    await page.mouse.move(x,y+300);let full=await state();assert.equal(full.progress,2);assert.equal(full.expanded,1);
    await page.screenshot({path:`artifacts/design-drag-active-${width}.png`});
    await page.mouse.move(x,y+45);partial=await state();assert.equal(partial.progress,.5);assert.equal(partial.mode,'dragging');
    await page.mouse.move(x,y);await page.mouse.up();await page.waitForTimeout(750);assert.equal((await state()).mode,'hidden');assert.ok((await state()).progress<.001,'return without release must collapse');
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+300);await page.mouse.up();await page.waitForTimeout(750);assert.equal((await state()).mode,'active');
    // Drag the expanded header back through notification to hidden while captured.
    const expandedBounds=await capsule.boundingBox();const headerY=expandedBounds.y+18;
    await page.mouse.move(x,headerY);await page.mouse.down();await page.mouse.move(x,headerY-210);assert.ok(Math.abs((await state()).progress-1)<.01);await page.mouse.move(x,headerY-300);await page.mouse.up();await page.waitForTimeout(750);assert.equal((await state()).mode,'hidden');
    await page.mouse.move(x,y);await page.mouse.click(x,y);await page.waitForTimeout(750);assert.equal((await state()).mode,'active','ordinary click must still open');
    await section.locator('[data-state="active"]').click();await page.waitForTimeout(750);
    const overflow=await section.locator('.wi-expanded').evaluate(el=>({scroll:el.scrollHeight,height:el.clientHeight}));assert.ok(overflow.scroll<=overflow.height+2,JSON.stringify(overflow));
    await section.locator('.wi-check').first().click();assert.equal(await section.locator('.wi-task.is-done').count(),1);
    await section.locator('[data-state="hidden"]').click();assert.equal(await section.locator('.wi-capsule').getAttribute('data-mode'),'hidden');
    await section.locator('[data-state="notification"]').click();assert.equal(await section.locator('.wi-capsule').getAttribute('data-mode'),'notification');
    await page.waitForTimeout(750);await fs.mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/design-notification-${width}.png`});
    await section.locator('[data-state="mini"]').click();await page.waitForTimeout(750);assert.equal((await state()).mode,'mini');assert.equal(await capsule.getAttribute('data-focus'),'true');
    const clock=await section.locator('.wi-clock').textContent();await page.waitForTimeout(1100);assert.notEqual(await section.locator('.wi-clock').textContent(),clock,'mini timer must advance');
    await page.screenshot({path:`artifacts/design-mini-${width}.png`});
    await section.locator('[data-state="notification"]').click();await section.locator('[data-state="active"]').click();await page.waitForTimeout(750);await section.locator('.wi-collapse').click();await page.waitForTimeout(750);assert.equal((await state()).mode,'mini','collapse must retain running timer');
    await section.locator('[data-state="active"]').click();await page.waitForTimeout(750);await section.locator('.wi-play.is-running').click();await section.locator('.wi-collapse').click();await page.waitForTimeout(750);assert.equal((await state()).mode,'hidden','pause must return to inactive mini');
    await page.screenshot({path:`artifacts/design-mini-idle-${width}.png`});
    await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: reversible drag, 736/320px layout, active mini timer, collapse retains focus, pause returns to idle.');
}finally{await browser.close();}
