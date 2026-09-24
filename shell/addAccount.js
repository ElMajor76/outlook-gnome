const dialogLabel = document.getElementById('dialog-label');
const dialogType = document.getElementById('dialog-type');
const dialogParentWrap = document.getElementById('dialog-parent-wrap');
const dialogParent = document.getElementById('dialog-parent');
const dialogEmailWrap = document.getElementById('dialog-email-wrap');
const dialogEmail = document.getElementById('dialog-email');
const dialogCancel = document.getElementById('dialog-cancel');
const dialogConfirm = document.getElementById('dialog-confirm');

async function updateFields() {
  const isShared = dialogType.value === 'shared';
  dialogParentWrap.classList.toggle('hidden', !isShared);
  dialogEmailWrap.classList.toggle('hidden', !isShared);
  if (isShared) {
    const parents = await window.dialogApi.listParentAccounts();
    dialogParent.innerHTML = parents.map((a) => `<option value="${a.id}">${a.label}</option>`).join('');
  }
}

dialogType.onchange = updateFields;
updateFields();

dialogCancel.onclick = () => window.dialogApi.cancel();

dialogConfirm.onclick = async () => {
  const label = dialogLabel.value.trim() || 'Compte';
  const type = dialogType.value;
  const payload = { label, type };
  if (type === 'shared') {
    payload.email = dialogEmail.value.trim();
    payload.parentId = dialogParent.value;
    if (!payload.email || !payload.parentId) {
      alert("Renseigne le compte délégué et l'adresse de la boîte partagée.");
      return;
    }
  }
  await window.dialogApi.submit(payload);
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.dialogApi.cancel();
});
