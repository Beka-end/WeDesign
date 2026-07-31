// api/status.js — клиент проверяет свой заказ по коду WD-XXXX.

const L = require('./_lib');
const R = require('./_render');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const code = L.clean(url.searchParams.get('code'), 12).toUpperCase();
  if (!code) return L.fail(res, 400, 'Укажите код заказа');

  const ip = L.clientIp(req);
  const rate = await L.limit(`wd:lim:status:${ip}`, 200, L.DAY);
  if (!rate.ok) return L.fail(res, 429, 'Слишком много запросов');

  const order = await L.getJSON(`wd:order:${code}`);
  if (!order) return L.fail(res, 404, 'Заказ не найден');

  // Просроченную бронь освобождаем — сумма возвращается в оборот.
  if (order.status === 'awaiting_payment' && order.expiresAt < Date.now()) {
    order.status = 'expired';
    await L.store.srem('wd:amounts', String(order.amount));
    await L.setJSON(`wd:order:${code}`, order, 120 * L.DAY);
  }

  const out = {
    ok: true,
    code: order.code,
    status: order.status,
    amount: order.amount,
    expiresAt: order.expiresAt,
    business: order.business,
    slug: order.slug || null,
    note: order.note || null,
  };

  if (order.status === 'paid') {
    const draft = await L.getJSON(`wd:draft:${order.draftId}`);
    if (draft) out.html = R.render(draft.data, draft.dna, { preview: false });
    out.publicUrl = order.slug ? `/s/${order.slug}` : null;
  }

  return L.send(res, 200, out);
};
