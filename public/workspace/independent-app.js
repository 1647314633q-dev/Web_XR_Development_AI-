const response = await fetch('/api/auth/me', {cache: 'no-store'});
let user = response.ok ? (await response.json()).user : null;
if (!user && response.status === 401) {
  const invite = location.hash.match(/^#invite=([A-Z2-9]{8})\.[a-f0-9]{48}$/);
  let saved; try { saved = JSON.parse(sessionStorage.getItem('visionlink-room')); } catch {}
  const resumable = saved?.role === 'guest' && /^[A-Z2-9]{8}$/.test(saved.code || '') && /^[a-f0-9]{48}$/.test(saved.member || '') && saved.expiresAt > Date.now();
  if (invite || resumable) user = {id: 'guest:' + (invite?.[1] || saved.code), displayName: '房間訪客', role: 'guest'};
}
if (!user) {
  location.replace('/login#return=' + encodeURIComponent(location.pathname + location.hash));
} else {
  const guest = user.role === 'guest'; document.documentElement.dataset.access = guest ? 'guest' : 'account';
  if (sessionStorage.getItem('visionlink-auth-user') !== user.id) {
    sessionStorage.removeItem('visionlink-room'); sessionStorage.removeItem('visionlink-draft');
  }
  sessionStorage.setItem('visionlink-auth-user', user.id);
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = '/workspace/account.css'; document.head.append(stylesheet);
  const roomDialog = document.getElementById('connectDialog');
  const roomIntroduction = roomDialog.querySelector('p');
  roomIntroduction.textContent = '發起方登入後建立房間，把完整房間邀請連結交給一位夥伴。受邀者不需登入，開啟連結後按「加入房間」即可。房間有效期一小時。';
  roomDialog.querySelector('[for="inviteOutput"]').textContent = '房間邀請連結';
  roomDialog.querySelector('[for="inviteInput"]').textContent = '夥伴的房間邀請連結';
  roomDialog.querySelector('#copyInvite').textContent = '複製房間邀請連結';
  const accessNote = document.createElement('aside'); accessNote.className = 'invite-access-note';
  accessNote.innerHTML = '<p><strong>受邀者免登入</strong>：邀請只授予這個房間的即時協作權限。私人驗收紀錄與帳戶管理仍需登入。</p><p>請只將完整連結交給要加入的夥伴。發起方結束房間或一小時到期後，該連結便不能加入。</p>';
  roomIntroduction.after(accessNote);
  for (const paragraph of document.querySelectorAll('#guideDialog p')) paragraph.textContent = paragraph.textContent.replace('雙方須有此工作區的存取權限', '發起方須登入；受邀夥伴以完整房間連結免登入加入');
  const actions = document.createElement('div'); actions.className = 'account-actions' + (guest ? ' guest-session' : '');
  const display = document.createElement('span'); display.className = 'account-name'; display.textContent = user.displayName;
  const logout = document.createElement('button'); logout.textContent = guest ? '離開訪客模式' : '登出';
  actions.append(display, logout); document.querySelector('.top-actions').append(actions);
  function clearAndReload() { sessionStorage.removeItem('visionlink-room'); sessionStorage.removeItem('visionlink-draft'); sessionStorage.removeItem('visionlink-auth-user'); location.reload(); }
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('visionlink-auth') : null;
  if (channel) channel.onmessage = clearAndReload;
  logout.onclick = async () => { if (guest) { let saved; try { saved = JSON.parse(sessionStorage.getItem('visionlink-room')); } catch {} if (saved) try { await fetch('/api/session', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + saved.member}, body: JSON.stringify({action: 'leave', code: saved.code})}); } catch {} sessionStorage.removeItem('visionlink-room'); sessionStorage.removeItem('visionlink-draft'); sessionStorage.removeItem('visionlink-auth-user'); location.replace('/login'); return; } await fetch('/api/auth/logout', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}); channel?.postMessage('changed'); clearAndReload(); };
  if (user.role === 'owner') {
    const manage = document.createElement('button'); manage.textContent = '管理夥伴'; actions.prepend(manage);
    const dialog = document.createElement('dialog'); dialog.id = 'accountDialog';
    dialog.innerHTML = '<div class="dialog-header"><h2>管理協作夥伴</h2><button class="icon-button" aria-label="關閉">×</button></div><p>臨時協作只需房間邀請，夥伴免登入。只有需要建立自己的房間及儲存私人紀錄的長期夥伴，才需要帳戶邀請。帳戶邀請可使用一次，三天後過期。</p><button class="primary full" id="newMemberInvite">建立帳戶邀請</button><input id="memberInvite" readonly placeholder="建立後可複製帳戶邀請連結"><button class="secondary full" id="copyMemberInvite">複製帳戶邀請連結</button><p id="accountStatus" role="status"></p><div id="accountUsers"></div>';
    document.body.append(dialog); dialog.querySelector('[aria-label="關閉"]').onclick = () => dialog.close();
    const status = dialog.querySelector('#accountStatus');
    async function auth(path, body) { const r = await fetch('/api/auth/' + path, {method: body ? 'POST' : 'GET', headers: body ? {'Content-Type': 'application/json'} : {}, ...(body ? {body: JSON.stringify(body)} : {}), cache: 'no-store'}); const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; }
    async function users() {
      const {users} = await auth('users'), list = dialog.querySelector('#accountUsers'); list.replaceChildren();
      for (const member of users) {
        const row = document.createElement('div'); row.className = 'account-user'; const label = document.createElement('span'); label.textContent = `${member.displayName} · ${member.role === 'owner' ? '管理員' : member.disabled ? '已停用' : '協作員'}`; row.append(label);
        if (member.role !== 'owner') { const button = document.createElement('button'); button.textContent = member.disabled ? '啟用' : '停用'; button.onclick = async () => { try { await auth('users', {id: member.id, disabled: !member.disabled}); await users(); } catch (error) { status.textContent = error.message; } }; row.append(button); } list.append(row);
      }
    }
    async function openManagement() { if (roomDialog.open) roomDialog.close(); dialog.showModal(); try { await users(); } catch (error) { status.textContent = error.message; } }
    manage.onclick = openManagement;
    dialog.querySelector('#newMemberInvite').onclick = async () => { try { const data = await auth('invites', {}); dialog.querySelector('#memberInvite').value = `${location.origin}/login#invite=${data.invite}`; status.textContent = '帳戶邀請已建立，請只交給需要長期帳戶的夥伴。'; } catch (error) { status.textContent = error.message; } };
    dialog.querySelector('#copyMemberInvite').onclick = async () => { const value = dialog.querySelector('#memberInvite').value; if (!value) return; try { await navigator.clipboard.writeText(value); status.textContent = '帳戶邀請已複製。'; } catch { status.textContent = '請手動複製帳戶邀請連結。'; } };
  }
  if (guest) {
    for (const id of ['createRoom', 'copyInvite', 'navRecords', 'openRecords', 'saveRecord', 'createOffer', 'applySignal']) { const button = document.getElementById(id); button.disabled = true; button.title = '此功能需要登入帳戶'; }
    roomDialog.querySelector('[for="inviteOutput"]').hidden = true; document.getElementById('inviteOutput').hidden = true; document.getElementById('createRoom').parentElement.hidden = true;
    for (const details of roomDialog.querySelectorAll('details')) details.hidden = true;
    document.getElementById('saveStatus').textContent = '訪客可協作與匯出本次紀錄；私人雲端紀錄由已登入的發起方儲存。';
  }
  await import('./app.js');
}
