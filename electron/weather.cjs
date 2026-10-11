function forecastUrl(settings) {
  const query = new URLSearchParams({
    latitude: String(settings.latitude), longitude: String(settings.longitude),
    current: 'temperature_2m,weather_code',
    hourly: 'temperature_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto', forecast_days: '7'
  });
  return `https://api.open-meteo.com/v1/forecast?${query}`;
}
function normalizeWeather(data, city) {
  if (!Number.isFinite(data.current?.temperature_2m) || !data.daily?.time?.length)
    throw new Error('Прогноз временно недоступен');
  const days = data.daily.time.slice(0, 7).map((date, index) => ({
    date, code: data.daily.weather_code[index],
    high: Math.round(data.daily.temperature_2m_max[index]),
    low: Math.round(data.daily.temperature_2m_min[index]),
    precipitation: data.daily.precipitation_probability_max?.[index] ?? null
  }));
  if (days.length !== 7 || days.some(day => !Number.isFinite(day.high) || !Number.isFinite(day.low) || !Number.isFinite(day.code)))
    throw new Error('Получен неполный прогноз');
  const atHour = hour => {const index=data.hourly?.time?.indexOf(`${days[0].date}T${hour}:00`)??-1;const value=index>=0?data.hourly.temperature_2m?.[index]:null;return Number.isFinite(value)?Math.round(value):null;};
  return { temperature: Math.round(data.current.temperature_2m), code: data.current.weather_code,
    periods:{date:days[0].date,day:atHour('14'),evening:atHour('19')},
    high: days[0].high, low: days[0].low, city, days, updatedAt: new Date().toISOString() };
}
module.exports = { forecastUrl, normalizeWeather };
