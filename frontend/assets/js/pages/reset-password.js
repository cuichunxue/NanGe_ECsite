import { initLayout } from '../layout.js';
import { authApi, getErrorMessage } from '../api.js';

initLayout({ base: '' });

const params = new URLSearchParams(location.search);
const token = params.get('token') ?? '';

if (!token) {
  document.getElementById('invalid-token-view').classList.remove('hidden');
} else {
  const formView = document.getElementById('form-view');
  formView.classList.remove('hidden');
  formView.classList.add('flex');

  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorMsg = document.getElementById('error-msg');
    errorMsg.classList.add('hidden');
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '設定中…';
    try {
      await authApi.resetPassword({ token, newPassword: document.getElementById('new-password').value });
      location.href = 'login.html';
    } catch (err) {
      errorMsg.textContent = getErrorMessage(err, '再設定に失敗しました');
      errorMsg.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'パスワードを再設定する';
    }
  });
}
