// api/order.js — создаёт заказ и бронирует УНИКАЛЬНУЮ сумму оплаты.
// Уникальная сумма — это и есть способ понять, кто именно заплатил.

const L = require('./_lib');

const handler = async (req, res) => {
  if (req.method !== 'POST') return L.fail(res, 405, 'Только POST');

  const ip = L.clientIp(req);
  const body = await L.readBody(req);

  const rate = await L.limit(`wd:lim:order:${ip}`, 6, L.DAY);
  if (!rate.ok) return L.fail(res, 429, 'Слишком много заказов с этого устройства. Напишите нам в WhatsApp');

  const draftId = L.clean(body.draftId, 20);
  const contactPhone = L.clean(body.contactPhone, 30);

  // Имя при заказе не спрашиваем: платёж опознаётся по уникальной сумме,
  // а имя плательщика придёт вместе с чеком. Телефон — только для связи.
  if (!draftId) return L.fail(res, 400, 'Сначала соберите сайт');
  if (contactPhone.replace(/\D/g, '').length < 10)
    return L.fail(res, 400, 'Укажите телефон в формате +7 7XX XXX XX XX');

  const draft = await L.getJSON(`wd:draft:${draftId}`);
  if (!draft) return L.fail(res, 404, 'Черновик устарел. Соберите сайт заново');

  // Если по этому черновику уже есть живой заказ — возвращаем его, а не новый.
  if (draft.orderCode) {
    const existing = await L.getJSON(`wd:order:${draft.orderCode}`);
    if (existing && existing.status === 'awaiting_payment' && existing.expiresAt > Date.now()) {
      return L.send(res, 200, { ok: true, ...publicOrder(existing) });
    }
  }

  const base = L.num('PRICE_KZT', 9990);
  const windowMin = L.num('PAY_WINDOW_MIN', 90);

  // Подбираем свободную «хвостовую» добавку: 9990 + 137 = 10 127 ₸.
  let suffix = null;
  for (let i = 0; i < 60; i++) {
    const candidate = 1 + Math.floor(Math.random() * 499);
    const fresh = await L.store.sadd('wd:amounts', String(base + candidate));
    if (fresh === 1) {
      suffix = candidate;
      break;
    }
  }
  if (suffix === null)
    return L.fail(res, 503, 'Сейчас все суммы заняты. Попробуйте через 15 минут');

  const order = {
    code: 'WD-' + L.code(4),
    draftId,
    base,
    suffix,
    amount: base + suffix,
    status: 'awaiting_payment',
    contactPhone,
    ip,
    createdAt: Date.now(),
    expiresAt: Date.now() + windowMin * 60000,
    business: draft.data.name,
    city: draft.data.city,
    risk: (draft.flags || []).slice(),
  };

  await L.setJSON(`wd:order:${order.code}`, order, 120 * L.DAY);
  await L.store.zadd('wd:orders', order.createdAt, order.code);
  draft.orderCode = order.code;
  await L.setJSON(`wd:draft:${draftId}`, draft, 30 * L.DAY);

  return L.send(res, 200, { ok: true, ...publicOrder(order) });
};

function publicOrder(o) {
  return {
    code: o.code,
    amount: o.amount,
    status: o.status,
    expiresAt: o.expiresAt,
    kaspiUrl: process.env.KASPI_URL || 'https://pay.kaspi.kz/pay/cwevqlzj',
  };
}

module.exports = L.wrap(handler);
