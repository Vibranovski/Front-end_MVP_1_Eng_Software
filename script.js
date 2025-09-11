// ======== CONFIG BÁSICA ========
const API_BASE = "http://127.0.0.1:5000";
const ROUTES = {
  login: `${API_BASE}/login`,
  tarefas: `${API_BASE}/tarefas`,
  tarefasByStatus: (statusId) => `${API_BASE}/tarefas/status/${statusId}`,
  updateTaskStatus: (taskId) => `${API_BASE}/tarefas/${taskId}/status`,
  logout: `${API_BASE}/logout`,
  tarefaById: (id) => `${API_BASE}/tarefas/${id}`,
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
  wireTaskModal();

  // Se abrir direto em /tarefas/... mostra kanban
  if (location.pathname.startsWith("/tarefas")) {
    showKanbanAndLoad();
  }
});

function wireTaskModal() {
  const modal = document.getElementById("taskModal");
  const closeBtn = document.getElementById("closeTaskModal");
  closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
}

// ======== LOGIN ========
function wireLogin() {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginMsg.textContent = "Entrando...";
    setFormEnabled(false);

    const payload = {
      usuario: document.getElementById("username").value.trim(),
      senha: document.getElementById("password").value
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
  showLogin();
  });
}

// ======== NAV SPA ========
function wirePopState(){
  // Navegação SPA desabilitada para compatibilidade com file://
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
    throw new Error(txt || `Falha ao buscar ${ROUTES.tarefasByStatus(statusId)}`);
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
  // Corrige para aceitar tanto id quanto ID
  el.draggable = true;
  el.dataset.taskId = task.id || task.ID;
  el.addEventListener("click", onTaskCardClick);

  el.innerHTML = `
    <div class="title">${escapeHtml(task.Titulo || `Tarefa #${task.id || task.ID}`)}</div>
    <div class="meta">${escapeHtml(task.Descricao_tarefa || "Sem descrição")}</div>
    <div class="meta-date">${escapeHtml(task.Prazo_de_conclusao || "Sem prazo")}</div>
  `;
  return el;
}

async function onTaskCardClick(e) {
  e.stopPropagation();
  const taskId = this.dataset.taskId;
  const modal = document.getElementById("taskModal");
  const fields = {
    id: document.getElementById("modal-id"),
    titulo: document.getElementById("modal-titulo"),
    descricao: document.getElementById("modal-descricao"),
    criacao: document.getElementById("modal-criacao"),
    prazo: document.getElementById("modal-prazo"),
    estimado: document.getElementById("modal-estimado"),
    prioridade: document.getElementById("modal-prioridade"),
    status: document.getElementById("modal-status"),
    usuario: document.getElementById("modal-usuario")
  };
  try {
    fields.id.textContent = fields.titulo.textContent = fields.descricao.textContent = fields.criacao.textContent = fields.prazo.textContent = fields.estimado.textContent = fields.prioridade.textContent = fields.status.textContent = fields.usuario.textContent = "...";
    modal.classList.remove("hidden");
    const resp = await fetch(ROUTES.tarefaById(taskId), {credentials: "include"});
    if (!resp.ok) throw new Error("Falha ao buscar detalhes da tarefa");
    const t = await resp.json();
    fields.id.textContent = t.id || t.ID || "-";
    fields.titulo.textContent = t.Titulo || t.titulo || "-";
    fields.descricao.textContent = t.Descricao_tarefa || t.descricao || "-";
    fields.criacao.textContent = t.Data_de_criacao || "-";
    fields.prazo.textContent = t.Prazo_de_conclusao || "-";
    fields.estimado.textContent = t.Tempo_estimado || "-";
    fields.prioridade.textContent = t.prioridade || "-";
    fields.status.textContent = t.status || "-";
    fields.usuario.textContent = t.usuario || "-";
  } catch (err) {
    fields.titulo.textContent = "Erro ao carregar tarefa.";
  }
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
