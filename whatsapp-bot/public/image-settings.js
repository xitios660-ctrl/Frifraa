'use strict';
(() => {
  const checkbox = document.getElementById('imagesEnabled');
  const notice = document.getElementById('imageStatus');
  const dashboard = document.getElementById('dashboard');
  if (!checkbox || !notice || !dashboard) return;
  let loading = false;
  let saving = false;
  async function request(url, options) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || 'Não foi possível atualizar a configuração.');
    return json;
  }
  const show = (text, ok) => {
    notice.textContent = text;
    notice.className = 'notice' + (ok ? ' ok' : '');
  };
  async function refresh() {
    if (dashboard.hidden || loading || saving) return;
    loading = true;
    try {
      const data = await request('/api/status');
      checkbox.checked = !!data.imagesEnabled;
      show(data.imagesEnabled
        ? '🎨 Ativado: até ' + data.dailyImageLimit + ' imagens/tentativas por dia. Modelo: ' + data.imageModel
        : '⏸️ Desativado. Para ativar, é necessário que sua chave Gemini tenha faturamento habilitado.',
        !!data.imagesEnabled
      );
    } catch (error) { show(error.message, false); }
    finally { loading = false; }
  }
  checkbox.addEventListener('change', async () => {
    const enabled = checkbox.checked;
    if (enabled && !window.confirm('A API Gemini cobra pela geração de imagens e não tem nível gratuito. Ativar até 4 tentativas por dia no grupo?')) {
      checkbox.checked = false;
      return;
    }
    saving = true;
    checkbox.disabled = true;
    try {
      await request('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagesEnabled: enabled })
      });
      show(enabled ? '✅ Geração de imagens ativada no grupo autorizado.' : '⏸️ Geração de imagens desativada.', enabled);
    } catch (error) {
      checkbox.checked = !enabled;
      show(error.message, false);
    } finally {
      checkbox.disabled = false;
      saving = false;
    }
  });
  setInterval(refresh, 7000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
})();