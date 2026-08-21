import { initLayout } from '../layout.js';
import { requireAuth } from '../guards.js';
import { Auth } from '../auth.js';
import { addressApi, authApi, getErrorMessage } from '../api.js';
import { escapeHtml } from '../format.js';
import { notify } from '../notify.js';

if (requireAuth('')) {
  initLayout({ base: '' });

  const user = Auth.getUser();
  let addresses = [];

  document.getElementById('profile-email').value = user.email;
  document.getElementById('profile-name').value = user.name;
  document.getElementById('profile-phone').value = user.phone ?? '';

  function showMessage(text) {
    const el = document.getElementById('message');
    el.textContent = text;
    el.classList.toggle('hidden', !text);
  }

  function setTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('bg-brand-500', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('bg-white', !active);
      btn.classList.toggle('text-gray-600', !active);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== `tab-${tab}`);
    });
  }

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
  setTab('profile');

  function renderAddresses() {
    const el = document.getElementById('address-list');
    if (addresses.length === 0) {
      el.innerHTML = '<p class="text-sm text-gray-400">登録済みの住所はありません（チェックアウト時に追加できます）</p>';
      return;
    }
    el.innerHTML = addresses
      .map(
        (a) => `
        <div class="card flex items-center justify-between p-4" data-address-id="${a.id}">
          <div class="text-sm">
            <p class="font-medium">${escapeHtml(a.recipient)} (${escapeHtml(a.phone)}) ${a.isDefault ? '<span class="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-600">既定</span>' : ''}</p>
            <p class="text-gray-500">${escapeHtml(a.province)}${escapeHtml(a.city)}${escapeHtml(a.district)}${escapeHtml(a.detail)}</p>
          </div>
          <button data-action="delete-address" class="text-sm text-red-500 hover:underline">削除</button>
        </div>
      `,
      )
      .join('');
    el.querySelectorAll('[data-address-id]').forEach((row) => {
      row.querySelector('[data-action="delete-address"]').addEventListener('click', async () => {
        try {
        await addressApi.remove(row.dataset.addressId);
      } catch (err) {
        notify(getErrorMessage(err, '住所を削除できませんでした'));
        return;
      }
        addresses = addresses.filter((a) => a.id !== row.dataset.addressId);
        renderAddresses();
      });
    });
  }

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await authApi.updateProfile({
      name: document.getElementById('profile-name').value,
      phone: document.getElementById('profile-phone').value,
    });
    Auth.setUser(res.data);
    showMessage('プロフィールを更新しました');
  });

  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage('');
    try {
      await authApi.changePassword({
        currentPassword: document.getElementById('current-password').value,
        newPassword: document.getElementById('new-password').value,
      });
      showMessage('パスワードを変更しました');
      document.getElementById('current-password').value = '';
      document.getElementById('new-password').value = '';
    } catch (err) {
      showMessage(getErrorMessage(err));
    }
  });

  addressApi.list().then((res) => {
    addresses = res.data;
    renderAddresses();
  });
}
