'use strict';
const photoInput = document.getElementById('profilePhoto');
const profileMessage = document.getElementById('profileMessage');
document.getElementById('applyProfile').addEventListener('click', async () => {
  const button = document.getElementById('applyProfile');
  button.disabled = true;
  try {
    const file = photoInput.files[0];
    let avatar = null;
    if (file) {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      const scale = Math.max(256 / bitmap.width, 256 / bitmap.height);
      const w = bitmap.width * scale, h = bitmap.height * scale;
      context.drawImage(bitmap, (256 - w) / 2, (256 - h) / 2, w, h);
      avatar = canvas.toDataURL('image/jpeg', 0.76);
      bitmap.close();
    }
    const response = await fetch('/api/profile', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({avatar})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar o perfil.');
    profileMessage.textContent = result.imageChanged ? '✅ Nome Bot e foto atualizados!' : '✅ Nome Bot atualizado. Escolha a imagem para atualizar a foto.';
  } catch (error) { profileMessage.textContent = error.message; }
  finally { button.disabled = false; }
});