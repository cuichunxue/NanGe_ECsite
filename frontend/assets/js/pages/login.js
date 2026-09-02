import { initLayout } from '../layout.js';
import { Auth } from '../auth.js';
import { authApi, getErrorMessage } from '../api.js';
import { safeRedirect } from '../format.js';

initLayout({ base: '' });

const params = new URLSearchParams(location.search);
const from = params.get('from');

// アカウントが停止されて追い出された場合は、その理由をここで伝える。
// 伝えないと「急にログアウトされた」としか見えず、問い合わせるきっかけも掴めない。
if (params.get('reason') === 'suspended') {
  const errorMsg = document.getElementById('error-msg');
  errorMsg.textContent = 'このアカウントは停止されています。お心当たりがない場合はお問い合わせください。';
  errorMsg.classList.remove('hidden');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorMsg = document.getElementById('error-msg');
  errorMsg.classList.add('hidden');
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'ログイン中…';
  try {
    const res = await authApi.login({
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    });
    const { user, accessToken, refreshToken } = res.data;
    Auth.setAuth(user, accessToken, refreshToken);
    location.href = safeRedirect(from);
  } catch (err) {
    errorMsg.textContent = getErrorMessage(err, 'ログインに失敗しました');
    errorMsg.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'ログイン';
  }
});
