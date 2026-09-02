import { initLayout } from '../layout.js';
import { authApi, getErrorMessage } from '../api.js';

initLayout({ base: '' });

document.getElementById('forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorMsg = document.getElementById('error-msg');
  const successMsg = document.getElementById('success-msg');
  const devLinkMsg = document.getElementById('dev-link-msg');
  errorMsg.classList.add('hidden');
  successMsg.classList.add('hidden');
  devLinkMsg.classList.add('hidden');
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '送信中…';
  try {
    const res = await authApi.forgotPassword(document.getElementById('email').value);
    successMsg.textContent = res.data.message;
    successMsg.classList.remove('hidden');
    if (res.data.devToken) {
      document.getElementById('dev-link').href = `reset-password.html?token=${res.data.devToken}`;
      devLinkMsg.classList.remove('hidden');
    }
  } catch (err) {
    errorMsg.textContent = getErrorMessage(err, '送信に失敗しました');
    errorMsg.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '送信する';
  }
});
