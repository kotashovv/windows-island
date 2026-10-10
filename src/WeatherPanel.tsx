import {t,locale} from './i18n';
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, LoaderCircle, Sun } from 'lucide-react';
import { weatherLabel, type Weather } from './bridge';
function WeatherIcon({ code, size = 19 }: {
    code: number;
    size?: number;
}) {
    const Icon = code === 0 ? Sun : code < 3 ? CloudSun : code === 3 ? Cloud : code < 50 ? CloudFog : code >= 95 ? CloudLightning : code >= 71 && code <= 77 || code >= 85 && code <= 86 ? CloudSnow : CloudRain;
    return <Icon size={size} aria-hidden="true"/>;
}
const degrees = (value: number) => `${value > 0 ? '+' : ''}${value}°`;
export function WeatherPanel({ weather, loading, error, onRetry, onSettings }: {
    weather: Weather | null;
    loading: boolean;
    error: string;
    onRetry: () => void;
    onSettings: () => void;
}) {
    return <div className="weather-panel">
    {weather && <>
      <div className="weather-current"><div><button className="weather-city" onClick={onSettings}>{weather.city}</button><strong>{degrees(weather.temperature)}</strong><p>{weatherLabel(weather.code)}</p></div><WeatherIcon code={weather.code} size={42}/></div>
      <div className="weather-heading"><small>{t("Прогноз на 7 дней")}</small>{loading && <LoaderCircle size={13} className="spinning" aria-label={t("Обновление прогноза")}/>}</div>
      <div className="weather-days">{weather.days.map((day, index) => <div className="weather-day" key={day.date}>
        <div><strong>{index === 0 ? t("Сегодня") : index === 1 ? t("Завтра") : new Date(`${day.date}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short' })}</strong><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}</small></div>
        <span className="weather-day-icon" title={weatherLabel(day.code)}><WeatherIcon code={day.code}/></span>
        <span className="rain-chance" aria-label={t("Вероятность осадков")}>{day.precipitation !== null && <><Droplets size={11}/>{day.precipitation}%</>}</span>
        <span className="weather-low">{degrees(day.low)}</span><strong className="weather-high">{degrees(day.high)}</strong>
      </div>)}</div>
      <small className="weather-attribution">{weather.demo ? t("Пример прогноза") : t("Прогноз Open-Meteo")} · {new Date(weather.updatedAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</small>
    </>}
    {!weather && <p className="empty">{loading ? t("Загружаем прогноз…") : t("Прогноз недоступен")}</p>}
    {error && <p className="weather-error" role="status">{weather ? t("Не удалось обновить прогноз. Показаны предыдущие данные.") : error}</p>}
    <button className="text-action" disabled={loading} onClick={onRetry}>{loading ? t("Обновляем…") : t("Обновить прогноз")}</button>
  </div>;
}
