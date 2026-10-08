const $ = id => document.getElementById(id);
const fragment = new URLSearchParams(location.hash.slice(1));
const invitation = fragment.get('invite');
const requestedReturn = fragment.get('return');
function returnPath() {
  if (!requestedReturn || !requestedReturn.startsWith('/') || requestedReturn.startsWith('//')) return '/workspace/';
  const value = new URL(requestedReturn, location.origin);
  return value.origin === location.origin && value.pathname.startsWith('/workspace') ? value.pathname + value.search + value.hash : '/workspace/';
}
const returningToRoom = /^#invite=[A-Z2-9]{8}\.[a-f0-9]{48}$/.test(new URL(returnPath(), location.origin).hash);
async function api(path, body) {
  const response = await fetch('/api/auth/' + path, {method: body ? 'POST' : 'GET', headers: body ? {'Content-Type': 'application/json'} : {}, ...(body ? {body: JSON.stringify(body)} : {}), cache: 'no-store'});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '登入服務暫時無法使用。');
  return result;
}
let mode = 'login';
try {
  if (returningToRoom && !invitation) location.replace(returnPath());
  const status = await api('status');
  if (status.setupRequired) {
    mode = 'bootstrap';
    $('loginTitle').textContent = '設定你的工作空間';
    $('loginDescription').textContent = '輸入本機部署流程提供的管理員設定碼，建立第一個管理員。';
    $('keyLabel').textContent = '管理員設定碼';
    $('nameRow').hidden = false;
    $('loginSubmit').textContent = '建立管理員';
  } else if (invitation) {
    mode = 'redeem';
    $('loginTitle').textContent = '加入 VisionLink';
    $('loginDescription').textContent = '你的管理員已邀請你加入。輸入顯示名稱以建立個人存取金鑰。';
    $('nameRow').hidden = false;
    $('keyRow').hidden = true;
    $('loginSubmit').textContent = '接受邀請';
  } else if (returningToRoom) {
    $('loginTitle').textContent = '正在開啟房間邀請';
    $('loginDescription').textContent = '受邀夥伴不需登入。開啟房間後按「加入房間」即可。';
    $('loginForm').hidden = true;
  } else if (status.registrationEnabled) {
    $('switchAuth').hidden = false;
    $('loginDescription').textContent = '已有帳戶請使用個人金鑰登入。首次使用可免費建立帳戶；受邀者直接開啟完整房間連結即可。';
  }
} catch (error) { $('loginStatus').textContent = error.message; $('loginSubmit').disabled = true; }
$('switchAuth').onclick = () => {
  mode = mode === 'register' ? 'login' : 'register';
  const registering = mode === 'register';
  $('loginTitle').textContent = registering ? '免費建立你的帳戶' : '登入你的工作空間';
  $('loginDescription').textContent = registering ? '輸入顯示名稱即可建立個人帳戶。下一步請保存你的登入金鑰，再建立房間邀請夥伴。' : '使用你自己保存的存取金鑰登入。受邀者憑完整房間連結免登入加入。';
  $('nameRow').hidden = !registering;
  $('displayName').required = registering;
  $('keyRow').hidden = registering;
  $('accessKey').value = '';
  $('loginSubmit').textContent = registering ? '建立帳戶' : '登入';
  $('switchAuth').textContent = registering ? '已有金鑰？返回登入' : '首次使用？免費建立帳戶';
  $('loginStatus').textContent = '';
};
function enter() {
  sessionStorage.removeItem('visionlink-room');
  sessionStorage.removeItem('visionlink-draft');
  sessionStorage.removeItem('visionlink-auth-user');
  if ('BroadcastChannel' in window) { const channel = new BroadcastChannel('visionlink-auth'); channel.postMessage('changed'); channel.close(); }
  location.replace(returnPath());
}
$('loginForm').onsubmit = async event => {
  event.preventDefault(); $('loginSubmit').disabled = true; $('loginStatus').textContent = '正在登入…';
  try {
    const data = await api(mode, mode === 'bootstrap' ? {bootstrapKey: $('accessKey').value.trim(), displayName: $('displayName').value} : mode === 'redeem' ? {invite: invitation, displayName: $('displayName').value} : mode === 'register' ? {displayName: $('displayName').value} : {accessKey: $('accessKey').value.trim()});
    $('accessKey').value = ''; $('loginStatus').textContent = '';
    if (data.accessKey) { $('createdKey').value = data.accessKey; $('loginForm').hidden = true; $('switchAuth').hidden = true; $('newKey').hidden = false; }
    else enter();
  } catch (error) { $('loginStatus').textContent = error.message; }
  finally { $('loginSubmit').disabled = false; }
};
$('copyKey').onclick = async () => { try { await navigator.clipboard.writeText($('createdKey').value); $('loginStatus').textContent = '金鑰已複製，請保存在安全位置。'; } catch { $('loginStatus').textContent = '瀏覽器未允許複製，請使用下載金鑰備份。'; } };
$('downloadKey').onclick = () => {
  const link = document.createElement('a'), url = URL.createObjectURL(new Blob([`VisionLink 存取金鑰\n網站：${location.origin}\n${$('createdKey').value}\n請勿與其他人共用。\n`], {type: 'text/plain;charset=utf-8'}));
  link.href = url; link.download = 'VisionLink-存取金鑰.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('continueLogin').onclick = enter;
