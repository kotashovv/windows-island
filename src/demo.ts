import type { State, Weather } from './bridge';
export const demo = __ISLAND_WEB__ && !window.island && new URLSearchParams(location.search).has('demo');
export function demoState(settings: State['settings']): State {
  const today = new Date(), startedAt = new Date(Date.now() - 24 * 60000).toISOString();
  const deadline = new Date(today); deadline.setHours(18, 0, 0, 0);
  const createdAt = today.toISOString();
  return { settings, events: [], agentReports: [], tasks: [
    { id: 'demo-design', title: 'Подготовить новый макет', notes: 'Уточнить композицию и проверить детали перед презентацией.', url: 'https://github.com/kotashovv/windows-island', deadline: deadline.toISOString(), priority: 'normal', source: 'Демо', status: 'running', createdAt, elapsed: 0, sessions: [], startedAt },
    { id: 'demo-review', title: 'Посмотреть изменения агента', notes: 'Проверить результат и оставить комментарии.', url: 'https://github.com/kotashovv/windows-island', deadline: '', priority: 'normal', source: 'Демо', status: 'todo', createdAt, elapsed: 0, sessions: [] },
    { id: 'demo-plan', title: 'Спланировать завтрашний день', notes: 'Собрать задачи со ссылками через MCP.', url: '', deadline: '', priority: 'low', source: 'Демо', status: 'todo', createdAt, elapsed: 0, sessions: [] }
  ], notifications: [{ id: 'demo-notification', source: 'codex', appName: 'Codex', title: 'Изменения готовы', body: 'Можно посмотреть результат и продолжить работу.', status: 'completed', target: null, icon: '', createdAt, read: false },
    {id:'demo-telegram-2',source:'telegram',appName:'Telegram',title:'Команда',body:'Новый макет готов к обсуждению.',status:'info',target:null,icon:'',createdAt,read:false},
    {id:'demo-telegram-1',source:'telegram',appName:'Telegram',title:'Анна',body:'Материалы для встречи добавлены.',status:'info',target:null,icon:'',createdAt:new Date(Date.now()-180000).toISOString(),read:true}
  ] };
}
export function demoWeather(city: string): Weather {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(); date.setDate(date.getDate() + i);
    return { date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      code: [0, 1, 3, 61, 3, 1, 0][i], high: [22, 23, 21, 18, 20, 22, 24][i], low: [12, 13, 11, 10, 11, 12, 14][i], precipitation: [0, 5, 20, 70, 30, 10, 0][i] };
  });
  return { temperature: 21, code: 0, high: 22, low: 12, city, days, updatedAt: new Date().toISOString(), demo: true };
}
