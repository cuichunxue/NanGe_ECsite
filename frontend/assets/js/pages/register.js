import { initLayout } from '../layout.js';
import { Auth } from '../auth.js';
import { authApi, getErrorMessage } from '../api.js';

initLayout({ base: '' });

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorMsg = document.getElementById('error-msg');
  errorMsg.classList.add('hidden');
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '登録中…';
  try {
    const form = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      password: document.getElementById('password').value,
    };
    const res = await authApi.register(form);
    const { user, accessToken, refreshToken } = res.data;
    Auth.setAuth(user, accessToken, refreshToken);
    location.href = 'index.html';
  } catch (err) {
    errorMsg.textContent = getErrorMessage(err, '登録に失敗しました');
    errorMsg.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = '同意して登録する';
  }
});
