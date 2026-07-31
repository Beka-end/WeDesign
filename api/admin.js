// api/admin.js — вся панель владельца через одну защищённую ручку.
// Пароль лежит только в переменных окружения Vercel. В коде и в браузере его нет.

const L = require('./_lib');
const R = require('./_render');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.fail(res, 405, 'Только POST');

  const ip = L.clientIp(req);
  const body = await L.readBody(req);
  const action = L.clean(body.action, 24);

  /* ------------------------------ вход ------------------------------ */
  if (action === 'login') {
    const tries = await L.limit(`wd:lim:login:${ip}`, 5, 15 * 60);
    if (!tries.ok)
      return L.fail(res, 429, 'Слишком много попыток входа. Панель заблокирована на 15 минут');

    if (!process.env.ADMIN_PASSWORD)
      return L.fail(res, 500, 'На сервере не задан ADMIN_PASSWORD');

    if (!L.samePassword(body.password || '')) {
      await new Promise((r) => setTimeout(r, 700)); // тормозим перебор
      return L.fail(res, 401, 'Пароль не подошёл');
    }
    return L.send(res, 200, { ok: true, token: L.signAdminToken(8) });
  }

  /* --------------------- дальше только по токену --------------------- */
  if (!(await L.requireAdmin(req, res))) return;

  if (action === 'list') {
    const codes = await L.store.zrecent('wd:orders', 80);
    const orders = [];
    for (const code of codes || []) {
      const o = await L.getJSON(`wd:order:${code}`);
      if (!o) continue;
      if (o.status === 'awaiting_payment' && o.expiresAt < Date.now()) {
        o.status = 'expired';
        await L.store.srem('wd:amounts', String(o.amount));
        await L.setJSON(`wd:order:${code}`, o, 120 * L.DAY);
      }
      orders.push(o);
    }
    return L.send(res, 200, {
      ok: true,
      orders,
      price: L.num('PRICE_KZT', 9990),
      kaspiUrl: process.env.KASPI_URL || 'https://pay.kaspi.kz/pay/cwevqlzj',
      storage: L.hasKV ? 'redis' : 'память (данные пропадут — подключите Upstash)',
    });
  }

  const code = L.clean(body.code, 12).toUpperCase();
  const order = code ? await L.getJSON(`wd:order:${code}`) : null;
  if (!order) return L.fail(res, 404, 'Заказ не найден');

  if (action === 'preview') {
    const draft = await L.getJSON(`wd:draft:${order.draftId}`);
    if (!draft) return L.fail(res, 404, 'Черновик уже удалён');
    return L.send(res, 200, {
      ok: true,
      html: R.render(draft.data, draft.dna, { preview: order.status !== 'paid' }),
      dnaCode: R.dnaCode(draft.dna),
    });
  }

  if (action === 'confirm') {
    const draft = await L.getJSON(`wd:draft:${order.draftId}`);
    if (!draft) return L.fail(res, 404, 'Черновик устарел, сайт нужно собрать заново');

    if (!order.slug) {
      let slug = L.slugify(order.business);
      for (let i = 0; i < 25; i++) {
        const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
        const fresh = await L.store.sadd('wd:slugs', candidate);
        if (fresh === 1) {
          slug = candidate;
          break;
        }
      }
      order.slug = slug;
      await L.setJSON(`wd:site:${slug}`, { code: order.code, draftId: order.draftId }, 400 * L.DAY);
    }

    order.status = 'paid';
    order.paidConfirmedAt = Date.now();
    order.note = '';
    await L.store.srem('wd:amounts', String(order.amount));
    await L.setJSON(`wd:order:${code}`, order, 400 * L.DAY);
    await L.setJSON(`wd:draft:${order.draftId}`, draft, 400 * L.DAY);
    return L.send(res, 200, { ok: true, order });
  }

  if (action === 'reject') {
    order.status = 'rejected';
    order.note = L.clean(body.note, 200) || 'Платёж не найден';
    await L.store.srem('wd:amounts', String(order.amount));
    if (order.claim && order.claim.receiptNo) await L.store.srem('wd:receipts', order.claim.receiptNo);
    await L.setJSON(`wd:order:${code}`, order, 120 * L.DAY);
    return L.send(res, 200, { ok: true, order });
  }

  if (action === 'unpublish') {
    if (order.slug) {
      await L.store.del(`wd:site:${order.slug}`);
      await L.store.srem('wd:slugs', order.slug);
      order.slug = null;
    }
    order.status = 'rejected';
    order.note = L.clean(body.note, 200) || 'Снят с публикации';
    await L.setJSON(`wd:order:${code}`, order, 120 * L.DAY);
    return L.send(res, 200, { ok: true, order });
  }

  return L.fail(res, 400, 'Неизвестное действие');
};
