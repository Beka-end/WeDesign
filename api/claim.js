// api/claim.js — клиент сообщает, что оплатил. Здесь же считается «риск-балл»,
// чтобы владелец видел, что именно нужно перепроверить в Kaspi.

const L = require('./_lib');

const handler = async (req, res) => {
  if (req.method !== 'POST') return L.fail(res, 405, 'Только POST');

  const ip = L.clientIp(req);
  const rate = await L.limit(`wd:lim:claim:${ip}`, 10, L.DAY);
  if (!rate.ok) return L.fail(res, 429, 'Слишком много попыток. Напишите нам в WhatsApp');

  const body = await L.readBody(req);
  const code = L.clean(body.code, 12).toUpperCase();
  const payerName = L.clean(body.payerName, 80);
  const receiptNo = L.clean(body.receiptNo, 40).replace(/\s+/g, '');
  const paidAt = L.clean(body.paidAt, 30);
  const amountPaid = Number(body.amountPaid) || 0;

  const order = await L.getJSON(`wd:order:${code}`);
  if (!order) return L.fail(res, 404, 'Заказ с таким кодом не найден');
  if (order.status === 'paid') return L.send(res, 200, { ok: true, status: 'paid' });

  if (!payerName || payerName.split(/\s+/).length < 2)
    return L.fail(res, 400, 'Впишите имя и фамилию отправителя ровно так, как в чеке Kaspi');
  if (receiptNo.length < 4) return L.fail(res, 400, 'Впишите номер чека из Kaspi');

  const risk = [];
  if (amountPaid !== order.amount) risk.push('Сумма в заявке не совпадает с забронированной');
  if (Date.now() > order.expiresAt + 30 * 60000) risk.push('Оплата заявлена после окончания брони');

  const receiptFresh = await L.store.sadd('wd:receipts', receiptNo);
  if (receiptFresh !== 1) risk.push('Такой номер чека уже использовался в другом заказе');

  const nameLooksLikeContact =
    payerName.toLowerCase().split(/\s+/).some((w) => order.contactName.toLowerCase().includes(w));
  if (!nameLooksLikeContact) risk.push('Имя плательщика не совпадает с именем в заказе');

  order.status = 'claimed';
  order.claim = { payerName, receiptNo, paidAt, amountPaid, at: Date.now(), ip };
  order.risk = risk;

  await L.setJSON(`wd:order:${code}`, order, 120 * L.DAY);

  return L.send(res, 200, {
    ok: true,
    status: 'claimed',
    message: 'Проверим платёж вручную. Обычно это занимает до 30 минут в рабочее время.',
  });
};

module.exports = L.wrap(handler);
