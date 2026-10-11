import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { forecastUrl, normalizeWeather } = createRequire(import.meta.url)('../electron/weather.cjs');
test('requests and normalizes all seven daily forecasts, keeping zero rain probability', () => {
  const url = new URL(forecastUrl({ latitude: 46.35, longitude: 48.04 }));
  assert.equal(url.searchParams.get('forecast_days'), '7');
  assert.equal(url.searchParams.get('hourly'),'temperature_2m');
  assert.match(url.searchParams.get('daily'), /weather_code/);
  const forecast = normalizeWeather({ current: { temperature_2m: 18.7, weather_code: 2 }, daily: {
    time: Array.from({ length: 7 }, (_, i) => `2026-10-${10 + i}`),
    weather_code: [0, 1, 3, 61, 71, 80, 95], temperature_2m_max: [20, 21, 19, 18, 16, 17, 18],
    temperature_2m_min: [10, 9, 8, 7, 6, 7, 8], precipitation_probability_max: [0, 5, 20, 70, 80, 90, 50]
  } }, 'Астрахань');
  assert.equal(forecast.temperature, 19); assert.equal(forecast.city, 'Астрахань');
  assert.equal(forecast.days.length, 7); assert.equal(forecast.days[0].precipitation, 0);
  assert.equal(forecast.days[6].code, 95);
});
test('greeting uses local hourly afternoon/evening forecasts, including zero and negative temperatures',()=>{
  const daily={time:Array.from({length:7},(_,i)=>`2026-10-${10+i}`),weather_code:Array(7).fill(0),temperature_2m_max:Array(7).fill(15),temperature_2m_min:Array(7).fill(-5)};
  const data={current:{temperature_2m:7,weather_code:0},daily,hourly:{time:['2026-10-11T14:00','2026-10-10T14:00','2026-10-10T19:00'],temperature_2m:[99,0,-2.4]}};
  assert.deepEqual(normalizeWeather(data,'Город').periods,{date:'2026-10-10',day:0,evening:-2});
  assert.deepEqual(normalizeWeather({...data,hourly:undefined},'Город').periods,{date:'2026-10-10',day:null,evening:null});
});
test('rejects malformed weather instead of displaying NaN temperatures', () => {
  assert.throws(() => normalizeWeather({}, 'Астрахань'), /недоступен/);
  assert.throws(() => normalizeWeather({ current: { temperature_2m: 20 }, daily: {
    time: ['2026-10-10'], weather_code: [0], temperature_2m_max: [], temperature_2m_min: []
  } }, 'Астрахань'), /неполный/);
});
