/* BBAN Sudan V2 — مزامنة البنك وإحصائيات مجمعة فقط.
   لا يرسل رقم الحساب أو BBAN أو البريد أو اسم المستخدم إلى قاعدة البيانات. */
(() => {
  'use strict';
  const cfg = window.BBAN_CONFIG || {};
  const configured = cfg.ENABLE_CLOUD && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !String(cfg.SUPABASE_URL).includes('YOUR-PROJECT') && !String(cfg.SUPABASE_ANON_KEY).includes('YOUR_');
  if (!configured || !window.supabase?.createClient) {
    console.info('[BBAN] Cloud is not configured; using local bank data.');
    return;
  }
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  window.BBAN_SUPABASE = client;

  const refreshBankUI = () => {
    try {
      if (typeof fillBanks === 'function') fillBanks(document.getElementById('search')?.value || '');
      if (typeof showFmt === 'function') showFmt();
      if (typeof paint === 'function') paint();
      if (typeof renderHist === 'function') renderHist();
    } catch (e) { console.warn('[BBAN] UI refresh skipped:', e); }
  };

  async function syncBanks() {
    const { data, error } = await client.from('banks')
      .select('id,name_ar,name_en,prefix,suffix,status,enabled,logo_url,sort_order')
      .eq('enabled', true).order('sort_order', { ascending: true });
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) return;
    const mapped = data.map(b => ({
      id: String(b.id), n: String(b.name_ar || ''), e: String(b.name_en || ''),
      p: String(b.prefix || ''), s: String(b.suffix || ''),
      st: ['ok','unk','bad'].includes(b.status) ? b.status : 'unk',
      logo_url: b.logo_url || ''
    })).filter(b => b.id && b.n && b.e && /^\d{1,10}$/.test(b.p) && /^\d{0,10}$/.test(b.s) && b.p.length + b.s.length < 14);
    if (!mapped.length) return;
    BANKS.splice(0, BANKS.length, ...mapped);
    refreshBankUI();
    console.info(`[BBAN] Loaded ${mapped.length} bank records from Supabase.`);
  }

  // Counts only; never include the account input, generated number, names, email or IP.
  let lastEventAt = 0;
  async function track(eventType, bankId) {
    const now = Date.now();
    if (now - lastEventAt < 1200) return;
    lastEventAt = now;
    try {
      await client.from('usage_events').insert({
        event_type: eventType,
        bank_id: bankId || null,
        page_path: location.pathname.slice(0, 120)
      });
    } catch (_) { /* Analytics must never interrupt BBAN generation. */ }
  }
  window.BBAN_TRACK = track;

  syncBanks().catch(err => console.warn('[BBAN] Cloud bank sync failed; local list retained.', err));
  document.addEventListener('change', e => {
    if (e.target?.id === 'bank' && e.target.value) track('bank_selected', e.target.value);
  });
  document.addEventListener('click', e => {
    if (e.target?.closest?.('#go')) track('bban_generate', document.getElementById('bank')?.value || null);
  });
})();
