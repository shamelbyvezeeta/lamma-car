/* Lamma Car admin — progressive enhancement only. Every action works as a plain form without JS
   except the confirmation dialog, which falls back to window.confirm. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Mobile navigation drawer
  $$('[data-nav-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function (e) {
    if (document.body.classList.contains('nav-open') && !e.target.closest('.sidebar') && !e.target.closest('[data-nav-toggle]')) document.body.classList.remove('nav-open');
  });

  // Confirmation before destructive / irreversible actions: <form data-confirm="message">
  var dlg = $('#confirm-dialog');
  $$('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (form.dataset.confirmed === '1') return;
      e.preventDefault();
      var msg = form.getAttribute('data-confirm');
      var title = form.getAttribute('data-confirm-title') || (dlg && dlg.dataset.title) || '';
      if (!dlg || typeof dlg.showModal !== 'function') {
        if (window.confirm(msg)) { form.dataset.confirmed = '1'; form.submit(); }
        return;
      }
      $('[data-d-title]', dlg).textContent = title;
      $('[data-d-msg]', dlg).textContent = msg;
      var ok = $('[data-d-ok]', dlg);
      ok.className = 'btn ' + (form.hasAttribute('data-danger') ? 'btn-danger' : 'btn-primary');
      ok.textContent = form.getAttribute('data-confirm-ok') || dlg.dataset.ok;
      dlg.returnValue = '';
      dlg.showModal();
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        if (dlg.returnValue === 'ok') {
          form.dataset.confirmed = '1';
          var btn = form.querySelector('[type=submit]');
          if (btn) btn.disabled = true;
          form.submit();
        }
      });
    });
  });

  // Prevent double submission on all POST forms (server also enforces idempotency where it matters)
  $$('form[method=post]:not([data-confirm])').forEach(function (form) {
    form.addEventListener('submit', function () {
      setTimeout(function () { $$('[type=submit]', form).forEach(function (b) { b.disabled = true; }); }, 0);
    });
  });

  // Filter toolbars: submit on select/date change
  $$('form[data-autosubmit] select, form[data-autosubmit] input[type=date]').forEach(function (el) {
    el.addEventListener('change', function () { el.form.submit(); });
  });

  // Copy to clipboard
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-copy');
      if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () {
        var t = b.textContent; b.textContent = b.getAttribute('data-copied') || '✓'; setTimeout(function () { b.textContent = t; }, 1400);
      });
    });
  });

  // Photo input preview
  $$('input[type=file][data-preview]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var img = $(inp.getAttribute('data-preview'));
      if (img && inp.files && inp.files[0]) { img.src = URL.createObjectURL(inp.files[0]); img.hidden = false; }
    });
  });

  // Privacy form: consent method is required whenever a choice is recorded
  $$('[data-public-warning]').forEach(function (box) {
    var form = box.closest('form');
    var sync = function () {
      var pub = form.querySelector('input[name=phone_visibility][value=public]');
      box.hidden = !(pub && pub.checked);
    };
    $$('input[name=phone_visibility]', form).forEach(function (r) { r.addEventListener('change', sync); });
    sync();
  });

  // Sale form: customer search → vehicles → sticker
  var saleForm = $('form[data-sale-form]');
  if (saleForm) {
    var cSearch = $('#customer_search', saleForm), cId = $('#customer_id', saleForm), cList = $('#customer_results', saleForm);
    var vSel = $('#vehicle_id', saleForm), qSel = $('#qr_code_id', saleForm);
    var i18n = saleForm.dataset;
    var timer;
    var loadVehicles = function (customerId, keepVehicle) {
      vSel.innerHTML = '';
      qSel.innerHTML = '<option value="">' + i18n.noSticker + '</option>';
      if (!customerId) { vSel.innerHTML = '<option value="">' + i18n.pickCustomer + '</option>'; return; }
      fetch('/admin/api/customers/' + encodeURIComponent(customerId) + '/vehicles', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (rows) {
          if (!rows.length) { vSel.innerHTML = '<option value="">' + i18n.noVehicles + '</option>'; return; }
          vSel.innerHTML = '<option value="">' + i18n.pickVehicle + '</option>';
          rows.forEach(function (v) {
            var o = document.createElement('option');
            o.value = v.id; o.textContent = v.ref + ' — ' + v.label; o.dataset.qr = v.qr ? JSON.stringify(v.qr) : '';
            if (keepVehicle && keepVehicle === v.id) o.selected = true;
            vSel.appendChild(o);
          });
          syncQr();
        });
    };
    var syncQr = function () {
      var opt = vSel.options[vSel.selectedIndex];
      var keep = qSel.dataset.initial;
      qSel.innerHTML = '<option value="">' + i18n.noSticker + '</option>';
      if (opt && opt.dataset.qr) {
        var q = JSON.parse(opt.dataset.qr);
        var o = document.createElement('option'); o.value = q.id; o.textContent = q.serial + ' (' + (i18n['st' + q.status] || q.status) + ')';
        o.selected = !keep || keep === q.id;
        qSel.appendChild(o);
      }
    };
    vSel.addEventListener('change', function () { qSel.dataset.initial = ''; syncQr(); });
    if (cSearch) {
      cSearch.addEventListener('input', function () {
        clearTimeout(timer);
        var q = cSearch.value.trim();
        if (q.length < 2) { cList.hidden = true; return; }
        timer = setTimeout(function () {
          fetch('/admin/api/customers?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } })
            .then(function (r) { return r.json(); })
            .then(function (rows) {
              cList.innerHTML = '';
              if (!rows.length) { cList.innerHTML = '<div class="pick-empty">' + i18n.noResults + '</div>'; }
              rows.forEach(function (c) {
                var b = document.createElement('button');
                b.type = 'button'; b.className = 'pick';
                b.innerHTML = '<strong></strong><span></span>';
                b.querySelector('strong').textContent = c.name; b.querySelector('span').textContent = c.ref;
                b.addEventListener('click', function () {
                  cId.value = c.id; cSearch.value = c.name + ' · ' + c.ref; cList.hidden = true; loadVehicles(c.id);
                });
                cList.appendChild(b);
              });
              cList.hidden = false;
            });
        }, 220);
      });
    }
    if (cId && cId.value) loadVehicles(cId.value, vSel.dataset.initial);
  }
})();
