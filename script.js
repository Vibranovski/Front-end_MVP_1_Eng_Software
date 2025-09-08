// static/app.js

// ======== CONFIG BÁSICA ========
const API_BASE = "";
const ROUTES = {
  login: `${API_BASE}/login`,
  tarefasByStatus: (statusId) => `${API_BASE}/api/tarefas/status/${statusId}`,
  updateTaskStatus: (taskId) => `${API_BASE}/api/tarefas/${taskId}/status`,
  logout: `${API_BASE}/logout`,
};

const STATUS_LABEL = { 1: "A Fazer", 2: "Fazendo", 3: "Feito", 4: "Atrasado" };

// ======== ELEMENTOS ========
const loginView  = document.getElementById("loginView");
const kanbanView = document.getElementById("kanbanView");
const loginForm  = document.getElementById("loginForm");
const loginMsg   = document.getElementById("loginMsg");
const kanbanMsg  = document.getElementById("kanbanMsg");
const logoutBtn  = document.getElementById("logoutBtn");

// ======== INICIALIZA ========
document.addEventListener("DOMContentLoaded", () => {
  wireLogin();
  wireLogout();
  wirePopState();

  // Se abrir direto em /tarefas/... mostra kanban
  if (location.pathname.startsWith("/tarefas")) {
    showKanbanAndLoad();
  }
});

// ======== LOGIN ========
function wireLogin() {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginMsg.textContent = "Entrando...";
    setFormEnabled(false);

    const payload = {
      username: document.getElementById("username").value.trim(),
      password: document.getElementById("password").value
    };

    try {
      const resp = await fetch(ROUTES.login, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
        credentials: "include"
      });

      if (!resp.ok) {
        const txt = await safeText(resp);
        throw new Error(txt || `Erro de login (${resp.status})`);
      }

      history.pushState({view:"kanban"}, "", "/tarefas/status/1");
      await showKanbanAndLoad();

    } catch (err) {
      loginMsg.textContent = err.message || "Falha no login.";
    } finally {
      setFormEnabled(true);
    }
  });
}

function setFormEnabled(enabled){
  [...loginForm.elements].forEach(el => el.disabled = !enabled);
}

// ======== LOGOUT ========
function wireLogout(){
  logoutBtn.addEventListener("click", async () => {
    try { await fetch(ROUTES.logout, {method:"POST", credentials:"include"}); } catch {}
    history.pushState({view:"login"}, "", "/login");
    showLogin();
  });
}

// ======== NAV SPA ========
function wirePopState(){
  window.addEventListener("popstate", () => {
    if (location.pathname.startsWith("/tarefas")) {
      showKanbanAndLoad();
    } else {
      showLogin();
    }
  });
}

function showLogin(){
  kanbanView.classList.add("hidden");
  loginView.classList.remove("hidden");
  logoutBtn.hidden = true;
}

function showKanban(){
  loginView.classList.add("hidden");
  kanbanView.classList.remove("hidden");
  logoutBtn.hidden = false;
}

// ======== KANBAN LOAD ========
async function showKanbanAndLoad(){
  showKanban();
  kanbanMsg.textContent = "Carregando tarefas...";
  await loadAllColumns();
  kanbanMsg.textContent = "";
}

async function loadAllColumns(){
  const statusIds = [1,2,3,4];
  // retry simples por coluna
  await Promise.all(statusIds.map((id) => retry(() => loadColumn(id), 2)));
  enableDragAndDrop();
}

async function loadColumn(statusId){
  const col = document.getElementById(`col-${statusId}`);
  const counter = document.getElementById(`count-${statusId}`);
  col.innerHTML = `<div class="msg">Carregando...</div>`;
  counter.textContent = "…";

  const resp = await fetch(ROUTES.tarefasByStatus(statusId), {credentials:"include"});
  if(!resp.ok){
    const txt = await safeText(resp);
    throw new Error(txt || `Falha ao buscar /api/tarefas/status/${statusId}`);
  }
  const data = await resp.json();

  col.innerHTML = "";
  (data || []).forEach(t => col.appendChild(createTaskCard(t)));
  counter.textContent = (data || []).length;

  if ((data || []).length === 0) {
    col.innerHTML = `<div class="msg">Sem tarefas em “${STATUS_LABEL[statusId]}”.</div>`;
  }
}

function createTaskCard(task){
  const el = document.createElement("article");
  el.className = "card-task";
  el.draggable = true;
  el.dataset.taskId = task.id;

  el.innerHTML = `
    <div class="title">${escapeHtml(task.titulo || `Tarefa #${task.id}`)}</div>
    <div class="meta">${escapeHtml(task.descricao || "Sem descrição")}</div>
  `;
  return el;
}

// ======== DRAG & DROP ========
function enableDragAndDrop(){
  const draggables = document.querySelectorAll(".card-task");
  const droppables = document.querySelectorAll(".droppable");

  draggables.forEach(d => {
    d.addEventListener("dragstart", onDragStart);
    d.addEventListener("dragend", onDragEnd);
  });

  droppables.forEach(drop => {
    drop.addEventListener("dragover", onDragOver);
    drop.addEventListener("dragleave", onDragLeave);
    drop.addEventListener("drop", onDrop);
  });
}

let dragged = null;
let dropLock = false; // evita múltiplos PUTs no mesmo drop

function onDragStart(e){
  dragged = e.currentTarget;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragged.dataset.taskId);
}
function onDragEnd(){
  dragged = null;
}

function onDragOver(e){
  e.preventDefault();
  e.currentTarget.classList.add("drag-over");
}
function onDragLeave(e){
  e.currentTarget.classList.remove("drag-over");
}

async function onDrop(e){
  e.preventDefault();
  const container = e.currentTarget;
  container.classList.remove("drag-over");
  if(!dragged || dropLock) return;

  dropLock = true;

  const originParent = dragged.parentElement; // para rollback se falhar
  container.appendChild(dragged);

  const newStatusId = Number(container.parentElement.dataset.status);
  const taskId = Number(dragged.dataset.taskId);

  updateCounts();

  try{
    await updateTaskStatus(taskId, newStatusId);
    toast(`Tarefa #${taskId} → ${STATUS_LABEL[newStatusId]}`);
  }catch(err){
    // rollback visual
    originParent.appendChild(dragged);
    updateCounts();
    toast(`Falha ao atualizar #${taskId}: ${err.message}`);
  }finally{
    dropLock = false;
  }
}

function updateCounts(){
  [1,2,3,4].forEach(s => {
    const count = document.querySelectorAll(`#col-${s} .card-task`).length;
    document.getElementById(`count-${s}`).textContent = count;
  });
}

// ======== API CALLS ========
async function updateTaskStatus(taskId, statusId){
  const resp = await fetch(ROUTES.updateTaskStatus(taskId), {
    method: "PUT",
    headers: {"Content-Type":"application/json"},
    credentials: "include",
    body: JSON.stringify({ status_id: statusId })
  });
  if(!resp.ok){
    const txt = await safeText(resp);
    throw new Error(txt || `HTTP ${resp.status}`);
  }
  return resp.json().catch(() => ({}));
}

// ======== HELPERS ========
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[s]));
}

async function safeText(resp){
  try{ return await resp.text(); }catch{ return ""; }
}

function toast(message){
  kanbanMsg.textContent = message;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => kanbanMsg.textContent = "", 2500);
}

async function retry(fn, times = 1){
  let attempt = 0, lastErr;
  while (attempt <= times){
    try { return await fn(); }
    catch(e){ lastErr = e; attempt += 1; await wait(250 * attempt); }
  }
  throw lastErr;
}
function wait(ms){ return new Promise(r => setTimeout(r, ms)); }
