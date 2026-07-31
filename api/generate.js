// api/generate.js — единственное место, где живёт ключ ИИ.
// Ключ читается из process.env и никогда не попадает в браузер.

const L = require('./_lib');
const R = require('./_render');

const MAX_DESC = 900;

/* --------------------------- вызов модели --------------------------- */

async function callModel(prompt) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-sonnet-5',
        max_tokens: 2200,
        temperature: 1,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) throw new Error('ai_' + r.status);
    const data = await r.json();
    return (data.content || []).map((b) => b.text || '').join('');
  }

  if (openaiKey) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        max_tokens: 2200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) throw new Error('ai_' + r.status);
    const data = await r.json();
    return data.choices[0].message.content;
  }

  throw new Error('no_ai_key');
}

function parseJSON(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('bad_ai_json');
  return JSON.parse(text.slice(start, end + 1));
}

function buildPrompt(input) {
  return `Ты копирайтер, который пишет тексты для сайта малого бизнеса в Казахстане.

Данные от владельца:
Название: ${input.name}
Город: ${input.city}
Сфера: ${input.category}
Описание своими словами: ${input.description}
Телефон: ${input.phone || 'не указан'}

Напиши тексты для одностраничного сайта уровня хорошего агентства. Правила:
- только русский язык, живой и конкретный, без канцелярита, без «инновационный», «качественный сервис», «индивидуальный подход»;
- НЕ ВЫДУМЫВАЙ факты: скидки, награды, число лет, количество клиентов — только если владелец сам это написал;
- заголовок короткий, до 8 слов, про выгоду клиента, а не название компании;
- 4–6 услуг, описание в одно живое предложение; price оставь пустым, если цена не названа;
- ровно 3 цифры для блока статистики. Бери их ТОЛЬКО из описания владельца. Если чисел в описании нет — верни пустой массив stats, не выдумывай;
- 3–4 шага «как мы работаем» — реальная последовательность от обращения до результата;
- 4–5 вопросов-ответов, которые реально задают такому бизнесу;
- финальный призыв — одна короткая фраза, без восклицательных знаков;
- ничего не пиши капсом, обычная запись.

Верни ТОЛЬКО JSON, без пояснений и без markdown-разметки, по схеме:
{
 "title": "заголовок вкладки браузера",
 "metaDescription": "описание для поиска, до 150 символов",
 "headline": "главный заголовок",
 "subheadline": "1-2 предложения под заголовком",
 "ctaText": "текст кнопки, 1-2 слова",
 "stats": [{"value":"5", "label":"мастеров в смене"}],
 "servicesTitle": "заголовок блока услуг",
 "services": [{"name":"", "text":"", "price":""}],
 "aboutTitle": "заголовок блока о нас",
 "about": "3-4 предложения",
 "processTitle": "заголовок блока о работе",
 "process": [{"name":"название шага", "text":"одно предложение"}],
 "faq": [{"q":"", "a":""}],
 "ctaTitle": "короткий призыв, до 6 слов",
 "ctaSub": "одно предложение под призывом",
 "contactsTitle": "заголовок блока контактов",
 "contactsText": "1 предложение"
}`;
}

/* --------------------------- фотографии ----------------------------- */
// Принимаем только прямые https-ссылки на картинки: чужой javascript: сюда
// не пролезет, а битые ссылки не сломают вёрстку.

function photoUrls(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((u) => L.clean(u, 300))
    .filter((u) => /^https:\/\/[^\s"'<>]+$/i.test(u))
    .slice(0, 3);
}

/* ------------------------- уникальность ДНК ------------------------- */

async function uniqueDNA() {
  for (let i = 0; i < 40; i++) {
    const dna = R.makeDNA();
    const fresh = await L.store.sadd('wd:dna', R.dnaKey(dna));
    if (fresh === 1) return dna;
  }
  return R.makeDNA();
}

/* ------------------------------ handler ----------------------------- */

module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.fail(res, 405, 'Только POST');

  const ip = L.clientIp(req);
  const body = await L.readBody(req);

  // Ловушка для ботов: настоящий человек это поле не видит.
  if (L.clean(body.company_website, 50)) return L.fail(res, 400, 'Не получилось. Обновите страницу');

  // Слишком быстрое заполнение формы — тоже бот.
  if (Number(body.elapsed) < 4000) return L.fail(res, 429, 'Заполните форму до конца и попробуйте снова');

  const name = L.clean(body.name, 60);
  const city = L.clean(body.city, 40);
  const category = L.clean(body.category, 60);
  const description = L.clean(body.description, MAX_DESC);

  if (!name || !city || !category) return L.fail(res, 400, 'Заполните название, город и сферу');
  if (description.length < 40)
    return L.fail(res, 400, 'Опишите бизнес подробнее — минимум 40 символов, лучше 3-4 предложения');

  // ---- лимиты: три уровня, чтобы ключ нельзя было «доить» ----
  const perIpDay = await L.limit(`wd:lim:ip:${ip}`, L.num('LIMIT_PER_IP_DAY', 4), L.DAY);
  if (!perIpDay.ok)
    return L.fail(res, 429, 'Сегодня бесплатных генераций больше нет. Возвращайтесь завтра или оформите заказ');

  const perIpMin = await L.limit(`wd:lim:burst:${ip}`, 2, 60);
  if (!perIpMin.ok) return L.fail(res, 429, 'Слишком часто. Подождите минуту');

  const globalDay = await L.limit(
    `wd:lim:global:${new Date().toISOString().slice(0, 10)}`,
    L.num('LIMIT_GLOBAL_DAY', 250),
    L.DAY
  );
  if (!globalDay.ok) return L.fail(res, 503, 'Сегодня генератор перегружен. Напишите нам в WhatsApp');

  // ---- собственно генерация ----
  let content;
  try {
    const raw = await callModel(buildPrompt({ name, city, category, description, phone: L.clean(body.phone, 30) }));
    content = parseJSON(raw);
  } catch (e) {
    if (String(e.message) === 'no_ai_key') return L.fail(res, 500, 'На сервере не настроен ключ ИИ');
    return L.fail(res, 502, 'Модель не ответила. Попробуйте ещё раз через минуту');
  }

  const dna = await uniqueDNA();

  const data = {
    name,
    city,
    category,
    title: L.clean(content.title, 70) || name,
    metaDescription: L.clean(content.metaDescription, 160),
    headline: L.clean(content.headline, 90) || name,
    subheadline: L.clean(content.subheadline, 260),
    ctaText: L.clean(content.ctaText, 24) || 'Записаться',
    servicesTitle: L.clean(content.servicesTitle, 60),
    services: (content.services || []).slice(0, 6).map((s) => ({
      name: L.clean(s.name, 60),
      text: L.clean(s.text, 220),
      price: L.clean(s.price, 40),
    })),
    aboutTitle: L.clean(content.aboutTitle, 60),
    about: L.clean(content.about, 700),
    stats: (content.stats || []).slice(0, 3).map((s) => ({
      value: L.clean(s.value, 12),
      label: L.clean(s.label, 40),
    })).filter((s) => s.value && s.label),
    processTitle: L.clean(content.processTitle, 60),
    process: (content.process || []).slice(0, 4).map((s) => ({
      name: L.clean(s.name, 60),
      text: L.clean(s.text, 220),
    })).filter((s) => s.name),
    faq: (content.faq || []).slice(0, 6).map((f) => ({
      q: L.clean(f.q, 120),
      a: L.clean(f.a, 320),
    })),
    ctaTitle: L.clean(content.ctaTitle, 70),
    ctaSub: L.clean(content.ctaSub, 200),
    contactsTitle: L.clean(content.contactsTitle, 60),
    contactsText: L.clean(content.contactsText, 220),
    phone: L.clean(body.phone, 30),
    whatsapp: L.clean(body.whatsapp, 30),
    address: L.clean(body.address, 140),
    instagram: L.clean(body.instagram, 160),
    photos: photoUrls(body.photos),
    hours: R.normalizeHours(body.hours),
    reviews: [],
  };

  const draftId = L.code(10);
  const html = R.render(data, dna, { preview: true });

  await L.setJSON(
    `wd:draft:${draftId}`,
    { data, dna, ip, createdAt: Date.now() },
    7 * L.DAY
  );

  return L.send(res, 200, {
    ok: true,
    draftId,
    html,
    dnaCode: R.dnaCode(dna),
    left: Math.max(0, perIpDay.max - perIpDay.used),
  });
};
