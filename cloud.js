/* BBAN Sudan V3 - Direct Supabase REST
   لا يرسل أرقام الحسابات أو BBAN أو البيانات الشخصية.
*/
(() => {
  'use strict';

  const cfg = window.BBAN_CONFIG || {};
  const base = String(cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(cfg.SUPABASE_ANON_KEY || '');

  const log = (...args) => console.log('[BBAN CLOUD]', ...args);

  if (!cfg.ENABLE_CLOUD || !base || !key ||
      base.includes('YOUR-PROJECT') || key.includes('YOUR_')) {
    log('Cloud configuration is incomplete.');
    return;
  }

  const headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    Accept: 'application/json'
  };

  async function request(path, options = {}) {
    const response = await fetch(base + '/rest/v1/' + path, {
      ...options,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: { ...headers, ...(options.headers || {}) }
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error('HTTP ' + response.status + ': ' + message.slice(0, 250));
    }

    if (response.status === 204) return null;
    return response.json();
  }

  function refreshBankUI() {
    try {
      if (typeof fillBanks === 'function') {
        fillBanks(document.getElementById('search')?.value || '');
      }
      if (typeof showFmt === 'function') showFmt();
      if (typeof paint === 'function') paint();
      if (typeof renderHist === 'function') renderHist();
    } catch (error) {
      log('UI refresh error:', error);
    }
  }

  async function syncBanks() {
    const params = new URLSearchParams({
      select: 'id,name_ar,name_en,prefix,suffix,status,enabled,logo_url,sort_order',
      enabled: 'eq.true',
      order: 'sort_order.asc'
    });

    const data = await request('banks?' + params.toString());

    if (!Array.isArray(data)) {
      throw new Error('Invalid banks response');
    }

    const mapped = data.map(b => ({
      id: String(b.id || ''),
      n: String(b.name_ar || ''),
      e: String(b.name_en || ''),
      p: String(b.prefix || ''),
      s: String(b.suffix || ''),
      st: ['ok', 'unk', 'bad'].includes(b.status) ? b.status : 'unk',
      logo_url: b.logo_url || ''
    })).filter(b =>
      b.id && b.n && b.e &&
      /^\d{1,10}$/.test(b.p) &&
      /^\d{0,10}$/.test(b.s) &&
      b.p.length + b.s.length < 14
    );

    if (!mapped.length) {
      throw new Error('No valid enabled banks returned');
    }

    if (typeof BANKS === 'undefined') {
      throw new Error('BANKS variable is unavailable');
    }

    BANKS.splice(0, BANKS.length, ...mapped);
    refreshBankUI();

    log('Loaded banks:', mapped.length);
    return mapped.length;
  }

  let lastEventAt = 0;

  async function track(eventType, bankId) {
    const now = Date.now();
    if (now - lastEventAt < 1200) return;
    lastEventAt = now;

    try {
      await request('usage_events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          event_type: eventType,
          bank_id: bankId || null,
          page_path: location.pathname.slice(0, 120)
        })
      });
    } catch (error) {
      log('Analytics skipped:', error.message);
    }
  }

  window.BBAN_TRACK = track;

  syncBanks()
    .then(count => {
      log('Synchronization successful:', count);
      alert('نجاح المزامنة: ' + count + ' بنك');
    })
    .catch(error => {
      log('Synchronization failed:', error);
      alert('فشل المزامنة: ' + error.message);
    });

  document.addEventListener('change', event => {
    if (event.target?.id === 'bank' && event.target.value) {
      track('bank_selected', event.target.value);
    }
  });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('#go')) {
      track('bban_generate',
        document.getElementById('bank')?.value || null
      );
    }
  });
})();
