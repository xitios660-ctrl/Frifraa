'use strict';
(() => {
 const $ = id => document.getElementById(id);
 let loaded = false;
 let active = false;
 async function api(url, init) {
   const response = await fetch(url, { credentials:'same-origin', cache:'no-store', ...init });
   const data = await response.json().catch(() => ({}));
   if (!response.ok) throw new Error(data.error || 'Falha na conexão');
   return data;
 }
 function info(text, good = false) {
   const element = $('groupStatus');
   element.textContent = text;
   element.className = 'notice' + (good ? ' ok' : '');
 }
 async function loadGroups() {
   if ($('dashboard').hidden) return;
   try {
     const data = await api('/api/groups');
     const select = $('groupSelect');
     select.replaceChildren();
     const empty = new Option('Nenhum grupo — Bot em silêncio', '');
     select.add(empty);
     for (const group of data.groups) {
       const text = group.name + (group.members == null ? '' : ' (' + group.members + ' participantes)');
       select.add(new Option(text, group.id));
     }
     select.value = data.selectedGroupId || '';
     loaded = true;
     const chosen = data.groups.find(g => g.id === data.selectedGroupId);
     info(chosen ? '✅ Somente este grupo: ' + chosen.name : '⚠️ Nenhum grupo foi escolhido. O Bot não responde a ninguém.', !!chosen);
   } catch (error) {
     loaded = false;
     info(error.message);
   }
 }
 $('refreshGroups').addEventListener('click', loadGroups);
 $('saveGroup').addEventListener('click', async () => {
   const button = $('saveGroup'); button.disabled = true;
   try {
     const groupId = $('groupSelect').value;
     await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId }) });
     info(groupId ? '✅ Grupo definido. O Bot só fala nele!' : '⏸️ Nenhum grupo autorizado. O Bot não responde.', true);
   } catch (error) { info(error.message); }
   finally { button.disabled = false; }
 });
 setInterval(() => {
   const visible = !$('dashboard').hidden;
   if (visible && (!active || !loaded)) { active = true; loaded = true; loadGroups(); }
   else if (!visible) { active = false; loaded = false; }
 }, 3000);
})();