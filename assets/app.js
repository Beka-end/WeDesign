/* WeDesign — фронтенд. Ключей здесь нет и быть не может:
   всё, что стоит денег, живёт на сервере в /api. */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var openedAt = Date.now();
  var draftId = null;
  var order = null;
  var timerId = null;

  // Память браузера: чтобы человек не потерял сайт, закрыв вкладку.
  // В приватном режиме localStorage кидает ошибку — молча переживаем это.
  var STORE = {
    get: function (k) { try { return localStorage.getItem('wd_' + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('wd_' + k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('wd_' + k); } catch (e) {} }
  };

  /* ═══════════ движение ═══════════ */

  var rv = document.querySelectorAll('.rv');
  if (reduce) {
    for (var i = 0; i < rv.length; i++) rv[i].classList.add('on');
  } else {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -8%' });
    for (var j = 0; j < rv.length; j++) io.observe(rv[j]);
  }

  var nav = document.querySelector('.nav');
  var bar = document.querySelector('.bar');
  function onScroll() {
    var y = window.scrollY || 0;
    nav.classList.toggle('stuck', y > 24);
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var burger = document.querySelector('.burger');
  var menu = document.querySelector('.menu');
  burger.addEventListener('click', function () {
    menu.classList.toggle('on');
    document.body.style.overflow = menu.classList.contains('on') ? 'hidden' : '';
  });
  menu.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') { menu.classList.remove('on'); document.body.style.overflow = ''; }
  });

  /* ═══════════ бегущая строка ═══════════ */

  var WORDS = ['барбершоп','кофейня','автосервис','стоматология','студия ногтей','пекарня',
    'фитнес-зал','цветочная лавка','детский центр','ремонт телефонов','химчистка','салон красоты'];
  var line = WORDS.map(function (w) { return '<b>' + w + '</b><i>✦</i>'; }).join('');
  $('marq').innerHTML = line + line;

  /* ═══════════ сигнатура: живая ДНК ═══════════ */

  var DEMO = [
    { bg:'#0B0D14', tx:'#F1F4FA', ac:'#5B8CFF', f:"'Unbounded',sans-serif",       cat:'Барбершоп · Алматы',        t:'Стрижка без ожидания',        b:'Записаться' },
    { bg:'#FFF9F2', tx:'#1C1917', ac:'#B45309', f:"'Playfair Display',serif",     cat:'Кофейня · Астана',          t:'Кофе, который помнят',        b:'Смотреть меню' },
    { bg:'#F2F7F3', tx:'#10231A', ac:'#0F8A5F', f:"'Oswald',sans-serif",          cat:'Автосервис · Шымкент',      t:'Диагностика за 40 минут',     b:'Записать авто' },
    { bg:'#0A0714', tx:'#F3EFFC', ac:'#A78BFA', f:"'Yeseva One',serif",           cat:'Студия ногтей · Алматы',    t:'Маникюр по записи',           b:'Выбрать время' },
    { bg:'#FBF8F1', tx:'#1F2933', ac:'#1D4ED8', f:"'Jost',sans-serif",            cat:'Стоматология · Караганда',  t:'Лечим без страха',            b:'На приём' },
    { bg:'#050B12', tx:'#EAF6FA', ac:'#2FE0B0', f:"'Unbounded',sans-serif",       cat:'Доставка еды · Актобе',     t:'Обед приедет за 30 минут',    b:'Заказать' },
    { bg:'#FDF5F6', tx:'#26131A', ac:'#BE185D', f:"'Playfair Display',serif",     cat:'Пекарня · Тараз',           t:'Хлеб из печи в семь утра',    b:'Смотреть' }
  ];

  var strip = $('dnaStrip');
  for (var k = 0; k < 24; k++) strip.appendChild(document.createElement('i'));

  function hex() { return Math.floor(Math.random() * 16).toString(16).toUpperCase(); }

  function shuffleDNA(v) {
    var bars = strip.children;
    for (var i = 0; i < bars.length; i++) {
      var r = Math.random();
      bars[i].style.background = r > 0.72 ? v.ac : (r > 0.48 ? v.tx : '#FFFFFF14');
    }
    var screen = $('dnaScreen');
    screen.style.background = v.bg;
    screen.style.color = v.tx;
    $('dnaCat').style.color = v.ac;
    $('dnaCat').textContent = v.cat;
    $('dnaTitle').style.fontFamily = v.f;
    $('dnaTitle').textContent = v.t;
    var btn = $('dnaBtn');
    btn.textContent = v.b;
    btn.style.background = v.ac;
    btn.style.color = v.bg;
    btn.style.borderRadius = [0, 4, 12, 22, 999][Math.floor(Math.random() * 5)] + 'px';
    $('dnaCode').textContent = 'DNA-' + hex() + hex() + hex() + hex() + hex() + hex();
  }

  shuffleDNA(DEMO[0]);
  if (!reduce) {
    var idx = 0;
    setInterval(function () { idx = (idx + 1) % DEMO.length; shuffleDNA(DEMO[idx]); }, 2900);
  }

  /* ═══════════ часы работы ═══════════ */

  var DAYS = [['mon','Понедельник'],['tue','Вторник'],['wed','Среда'],['thu','Четверг'],
              ['fri','Пятница'],['sat','Суббота'],['sun','Воскресенье']];

  var box = $('hoursBox');
  DAYS.forEach(function (d) {
    var row = document.createElement('div');
    row.className = 'hrow';
    row.dataset.key = d[0];
    row.innerHTML =
      '<label>' + d[1] + '</label>' +
      '<input type="time" value="09:00" data-from>' +
      '<input type="time" value="18:00" data-to>' +
      '<label class="off"><input type="checkbox" data-closed> выходной</label>';
    row.querySelector('[data-closed]').addEventListener('change', function () {
      row.classList.toggle('closed', this.checked);
    });
    box.appendChild(row);
  });

  function setDay(key, from, to, closed) {
    var row = box.querySelector('[data-key="' + key + '"]');
    row.querySelector('[data-from]').value = from;
    row.querySelector('[data-to]').value = to;
    var cb = row.querySelector('[data-closed]');
    cb.checked = !!closed;
    row.classList.toggle('closed', !!closed);
  }

  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = b.dataset.preset;
      DAYS.forEach(function (d, i) {
        if (p === 'weekdays') setDay(d[0], '09:00', '18:00', i > 4);
        if (p === 'daily') setDay(d[0], '10:00', '22:00', false);
        if (p === 'always') setDay(d[0], '00:00', '23:59', false);
      });
    });
  });

  function collectHours() {
    var out = {};
    DAYS.forEach(function (d) {
      var row = box.querySelector('[data-key="' + d[0] + '"]');
      out[d[0]] = row.querySelector('[data-closed]').checked
        ? { closed: true }
        : { closed: false, from: row.querySelector('[data-from]').value, to: row.querySelector('[data-to]').value };
    });
    return out;
  }

  var desc = $('fDescription');
  desc.addEventListener('input', function () { $('descCount').textContent = desc.value.length; });

  /* ═══════════ вызов API ═══════════ */

  // Разбор ответа сервера. Если пришёл не JSON, а страница с ошибкой —
  // говорим об этом прямо, вместе с кодом. Так проще чинить.
  function parse(res, text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      if (res.status === 404)
        throw new Error('Сервер не нашёл /api (ошибка 404). Похоже, папка api лежит не в корне репозитория.');
      if (res.status >= 500)
        throw new Error('Функция на сервере упала (ошибка ' + res.status + '). Точная причина — в логах Vercel.');
      throw new Error('Сервер вернул страницу вместо ответа (код ' + res.status + ').');
    }
  }

  async function api(path, payload) {
    var res, text;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      text = await res.text();
    } catch (e) {
      throw new Error('Не удалось связаться с сервером. Проверьте интернет и обновите страницу.');
    }
    var data = parse(res, text);
    if (!res.ok || !data.ok) throw new Error(data.error || 'Не получилось');
    return data;
  }

  function show(el, text, good) {
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('good', !!good);
  }

  /* ═══════════ генерация ═══════════ */

  async function generate() {
    var btn = $('btnGenerate');
    var err = $('genError');
    err.hidden = true;

    var payload = {
      name: $('fName').value.trim(),
      city: $('fCity').value.trim(),
      category: $('fCategory').value.trim(),
      services: $('fServices').value.trim(),
      description: desc.value.trim(),
      phone: $('fPhone').value.trim(),
      whatsapp: $('fWhatsapp').value.trim(),
      address: $('fAddress').value.trim(),
      instagram: $('fInstagram').value.trim(),
      photos: $('fPhotos').value.split(/\s+/).filter(Boolean).slice(0, 3),
      hours: collectHours(),
      company_website: $('fCompanyWebsite').value,
      elapsed: Date.now() - openedAt
    };

    if (!payload.name || !payload.city || !payload.category)
      return show(err, 'Заполните название, город и сферу — без этого сайт не собрать.');
    if (payload.description.length < 40)
      return show(err, 'Описание слишком короткое. Напишите 3-4 предложения: что делаете, для кого, чем отличаетесь.');

    btn.disabled = true;
    btn.textContent = 'Собираю…';
    try {
      var data = await api('/api/generate', payload);
      draftId = data.draftId;
      STORE.set('draft', draftId);
      STORE.del('order');
      $('restore').hidden = true;
      $('resultDna').textContent = data.dnaCode;
      $('preview').srcdoc = data.html;
      $('result').hidden = false;
      $('genHint').textContent = 'Осталось бесплатных сборок сегодня: ' + data.left;
      $('result').scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      show(err, e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Собрать сайт';
    }
  }

  $('btnGenerate').addEventListener('click', generate);
  $('btnRegen').addEventListener('click', generate);

  /* ═══════════ заказ и оплата ═══════════ */

  function tenge(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  function startTimer(until) {
    clearInterval(timerId);
    timerId = setInterval(function () {
      var left = until - Date.now();
      if (left <= 0) { clearInterval(timerId); $('payTimer').textContent = 'истекла'; return; }
      var m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      $('payTimer').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }

  function openPay(o) {
    order = o;
    $('payAmount').textContent = tenge(o.amount) + ' ₸';
    $('payCode').textContent = o.code;
    $('cAmount').value = o.amount;
    $('kaspiLink').href = o.kaspiUrl || 'https://pay.kaspi.kz/pay/cwevqlzj';
    $('pay').hidden = false;
    startTimer(o.expiresAt);
  }

  $('btnCopy').addEventListener('click', function () {
    var code = $('payCode').textContent;
    var btn = this;
    function done() { btn.textContent = 'Скопирован'; setTimeout(function () { btn.textContent = 'Скопировать код'; }, 1800); }
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, done);
    else done();
  });

  $('btnTake').addEventListener('click', async function () {
    if (!draftId) return;
    var name = prompt('Как вас зовут? Имя и фамилия — они должны совпасть с именем в Kaspi.');
    if (!name) return;
    var phone = prompt('Ваш телефон в формате +7 7XX XXX XX XX');
    if (!phone) return;

    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Бронирую сумму…';
    try {
      var made = await api('/api/order', { draftId: draftId, contactName: name, contactPhone: phone });
      STORE.set('order', made.code);
      openPay(made);
      $('pay').scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      alert(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Забрать сайт';
    }
  });

  $('btnClaim').addEventListener('click', async function () {
    if (!order) return;
    var msg = $('claimMsg');
    msg.hidden = true;
    var btn = this;
    btn.disabled = true;
    try {
      var data = await api('/api/claim', {
        code: order.code,
        payerName: $('cPayer').value.trim(),
        receiptNo: $('cReceipt').value.trim(),
        amountPaid: Number(String($('cAmount').value).replace(/\D/g, '')),
        paidAt: $('cPaidAt').value
      });
      show(msg, data.message + ' Сохраните код заказа: ' + order.code, true);
    } catch (e) {
      show(msg, e.message);
    } finally {
      btn.disabled = false;
    }
  });

  /* ═══════════ статус заказа ═══════════ */

  var LABEL = {
    awaiting_payment: 'Ждём оплату',
    claimed: 'Платёж на проверке',
    paid: 'Оплачено, сайт опубликован',
    rejected: 'Отклонено',
    expired: 'Бронь истекла — соберите заказ заново'
  };

  $('btnStatus').addEventListener('click', async function () {
    var code = $('sCode').value.trim().toUpperCase();
    var out = $('statusBox');
    out.hidden = true;
    if (!code) return;
    try {
      var res = await fetch('/api/status?code=' + encodeURIComponent(code));
      var data = parse(res, await res.text());
      if (!data.ok) throw new Error(data.error);
      var text = LABEL[data.status] || data.status;
      if (data.publicUrl) text += ' → ' + location.origin + data.publicUrl;
      if (data.note) text += ' · ' + data.note;
      show(out, text, data.status === 'paid');
      if (data.status === 'awaiting_payment' || data.status === 'claimed') {
        STORE.set('order', data.code);
        openPay(data);
        $('pay').scrollIntoView({ behavior: 'smooth' });
      }
      if (data.html) {
        var link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([data.html], { type: 'text/html' }));
        link.download = code + '.html';
        link.textContent = 'Скачать файл сайта';
        link.style.cssText = 'display:inline-block;margin-top:12px;font-weight:700;color:var(--ac)';
        out.appendChild(document.createElement('br'));
        out.appendChild(link);
      }
    } catch (e) {
      show(out, e.message || 'Заказ не найден');
    }
  });

  /* ═══════════ возврат к прошлой работе ═══════════ */

  (async function restore() {
    var savedDraft = STORE.get('draft');
    var savedOrder = STORE.get('order');

    if (savedDraft) {
      try {
        var r = await fetch('/api/draft?id=' + encodeURIComponent(savedDraft));
        var d = await r.json();
        if (d.ok) {
          draftId = savedDraft;
          $('resultDna').textContent = d.dnaCode;
          $('preview').srcdoc = d.html;
          $('result').hidden = false;
          $('restore').hidden = false;
        } else {
          STORE.del('draft');
        }
      } catch (e) { /* сети нет — просто не восстанавливаем */ }
    }

    if (savedOrder) {
      try {
        var r2 = await fetch('/api/status?code=' + encodeURIComponent(savedOrder));
        var s2 = await r2.json();
        if (s2.ok && (s2.status === 'awaiting_payment' || s2.status === 'claimed')) {
          openPay(s2);
        } else if (s2.ok && s2.status === 'paid') {
          $('sCode').value = s2.code;
          $('restore').hidden = false;
          $('restore').textContent = 'Ваш сайт оплачен и опубликован. Ссылка — в блоке «Мой заказ» по коду ' + s2.code + '.';
        } else {
          STORE.del('order');
        }
      } catch (e) { /* тихо */ }
    }
  })();
})();
