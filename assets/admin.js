/* Панель WeDesign. Токен живёт 8 часов и проверяется подписью на сервере —
   подделать его в браузере нельзя, а без него ни одна операция не пройдёт. */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'wd_admin_token';
  var token = sessionStorage.getItem(KEY) || '';
  var orders = [];
  var filter = 'claimed';
  var kaspiUrl = '';

  function parse(res, text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      if (res.status === 404)
        throw new Error('Сервер не нашёл /api/admin (404). Папка api лежит не в корне репозитория.');
      if (res.status >= 500)
        throw new Error('Функция упала (ошибка ' + res.status + '). Причина — в логах Vercel.');
      throw new Error('Сервер вернул страницу вместо ответа (код ' + res.status + ').');
    }
  }

  async function call(payload) {
    var res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(payload)
    });
    var data = parse(res, await res.text());
    if (res.status === 401) { logout(); throw new Error('Сессия закончилась, войдите заново'); }
    if (!res.ok || !data.ok) throw new Error(data.error || 'Не получилось');
    return data;
  }

  function logout() {
    token = '';
    sessionStorage.removeItem(KEY);
    $('panel').hidden = true;
    $('loginBox').hidden = false;
  }

  /* ————— вход ————— */

  async function login() {
    var err = $('loginErr');
    err.hidden = true;
    var btn = $('btnLogin');
    btn.disabled = true;
    try {
      var res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', password: $('pw').value })
      });
      var data = parse(res, await res.text());
      if (!data.ok) throw new Error(data.error);
      token = data.token;
      sessionStorage.setItem(KEY, token);
      $('pw').value = '';
      open();
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }

  $('btnLogin').addEventListener('click', login);
  $('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  $('btnLogout').addEventListener('click', logout);
  $('btnReload').addEventListener('click', function () { load(); });

  function open() {
    $('loginBox').hidden = true;
    $('panel').hidden = false;
    load();
  }

  /* ————— список ————— */

  var LABEL = {
    awaiting_payment: 'ждёт оплату',
    claimed: 'на проверке',
    paid: 'оплачено',
    rejected: 'отклонено',
    expired: 'бронь истекла'
  };

  function tenge(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function when(ts) { return ts ? new Date(ts).toLocaleString('ru-RU') : '—'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function load() {
    try {
      var data = await call({ action: 'list' });
      orders = data.orders || [];
      kaspiUrl = data.kaspiUrl;
      $('kaspiOpen').href = kaspiUrl;
      var waiting = orders.filter(function (o) { return o.status === 'claimed'; }).length;
      $('meta').textContent =
        'Цена ' + tenge(data.price) + ' ₸ · хранилище: ' + data.storage + ' · ждут проверки: ' + waiting;
      render();
    } catch (e) {
      alert(e.message);
    }
  }

  function render() {
    var list = $('list');
    var shown = orders.filter(function (o) { return filter === 'all' || o.status === filter; });
    if (!shown.length) {
      list.innerHTML = '<p class="micro">Здесь пока пусто. Как только клиент оформит заказ, он появится в этом списке.</p>';
      return;
    }
    list.innerHTML = shown.map(card).join('');

    list.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () { act(b.dataset.act, b.dataset.code); });
    });
  }

  function card(o) {
    var risky = o.risk && o.risk.length;
    var c = o.claim || {};
    var checklist = o.status === 'claimed'
      ? '<div class="steps-check">Проверьте в Kaspi по порядку:<br>' +
        '1. Найдите поступление ровно на <b>' + tenge(o.amount) + ' ₸</b> около ' + esc(c.paidAt || 'указанного времени') + '.<br>' +
        '2. Сверьте отправителя: клиент назвался <b>' + esc(c.payerName) + '</b>. Kaspi покажет имя и первую букву фамилии — полной фамилии там не будет, это нормально.<br>' +
        '3. Чек <b>' + esc(c.receiptNo) + '</b> — он нужен против повторов: если этот номер уже был в другом заказе, карточка станет оранжевой.<br>' +
        'Главный признак — сумма. Совпала сумма и примерно совпало время — платёж ваш.</div>'
      : '';

    return '' +
      '<div class="order' + (risky ? ' hot' : '') + '">' +
        '<div class="order-top">' +
          '<div><b class="mono" style="font-size:18px">' + esc(o.code) + '</b> · ' + esc(o.business) + ', ' + esc(o.city) + '</div>' +
          '<span class="tag ' + o.status + '">' + (LABEL[o.status] || o.status) + '</span>' +
        '</div>' +
        '<div class="kv">' +
          '<div><span>Сумма к оплате</span><b class="mono">' + tenge(o.amount) + ' ₸</b></div>' +
          '<div><span>Телефон для связи</span><b>' + esc(o.contactPhone) + '</b></div>' +
          '<div><span>Заказ создан</span><b style="font-size:14px">' + when(o.createdAt) + '</b></div>' +
          (c.payerName ? '<div><span>Плательщик по чеку</span><b>' + esc(c.payerName) + '</b></div>' : '') +
          (c.receiptNo ? '<div><span>Номер чека</span><b class="mono">' + esc(c.receiptNo) + '</b></div>' : '') +
          (c.amountPaid ? '<div><span>Заявленная сумма</span><b class="mono">' + tenge(c.amountPaid) + ' ₸</b></div>' : '') +
          (o.slug ? '<div><span>Адрес сайта</span><b style="font-size:14px">/s/' + esc(o.slug) + '</b></div>' : '') +
        '</div>' +
        (risky ? '<div class="risk"><b>Обратите внимание:</b><ul><li>' + o.risk.map(esc).join('</li><li>') + '</li></ul></div>' : '') +
        checklist +
        '<div class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" data-act="preview" data-code="' + o.code + '">Открыть сайт</button>' +
          (o.status === 'paid' && o.slug && o.contactPhone
            ? '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/' +
              encodeURIComponent(String(o.contactPhone).replace(/\D/g, '')) +
              '?text=' + encodeURIComponent(
                'Здравствуйте! Ваш сайт готов и работает: ' + location.origin + '/s/' + o.slug +
                '\nЭту ссылку можно ставить в Instagram, 2ГИС и на визитку. Заказ ' + o.code + '.'
              ) + '">Отправить ссылку в WhatsApp</a>'
            : '') +
          (o.status !== 'paid' ? '<button class="btn btn-sm" data-act="confirm" data-code="' + o.code + '">Платёж получен, опубликовать</button>' : '') +
          (o.status === 'paid' ? '<button class="btn btn-ghost btn-sm" data-act="unpublish" data-code="' + o.code + '">Снять с публикации</button>' : '') +
          (o.status !== 'paid' && o.status !== 'rejected' ? '<button class="btn btn-ghost btn-sm" data-act="reject" data-code="' + o.code + '">Платежа нет</button>' : '') +
        '</div>' +
      '</div>';
  }

  async function act(action, code) {
    try {
      if (action === 'preview') {
        var data = await call({ action: 'preview', code: code });
        $('dlgTitle').textContent = code + ' · ' + data.dnaCode;
        $('dlgFrame').srcdoc = data.html;
        $('dlg').showModal();
        return;
      }
      if (action === 'confirm') {
        if (!confirm('Вы своими глазами увидели этот платёж в Kaspi? Сайт станет публичным.')) return;
      }
      var note = '';
      if (action === 'reject' || action === 'unpublish') {
        note = prompt('Причина — её увидит клиент при проверке заказа:', 'Платёж на эту сумму не найден') || '';
      }
      await call({ action: action, code: code, note: note });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  document.querySelectorAll('[data-f]').forEach(function (b) {
    b.addEventListener('click', function () { filter = b.dataset.f; render(); });
  });
  $('dlgClose').addEventListener('click', function () { $('dlg').close(); });

  if (token) open();
})();
