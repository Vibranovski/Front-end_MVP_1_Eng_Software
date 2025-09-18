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
const addTaskBtn = document.getElementById("addTaskBtn");
const addTaskModal = document.getElementById("addTaskModal");
const closeAddTaskModal = document.getElementById("closeAddTaskModal");
const addTaskForm = document.getElementById("addTaskForm");
const addTaskMsg = document.getElementById("addTaskMsg");
const addPrioridade = document.getElementById("addPrioridade");
const addStatus = document.getElementById("addStatus");
const addCategorias = document.getElementById("addCategorias");
const deleteTaskBtn = document.getElementById("deleteTaskBtn");
const deleteTaskMsg = document.getElementById("deleteTaskMsg");
const addUserBtn = document.getElementById("addUserBtn");
const addUserModal = document.getElementById("addUserModal");
const closeAddUserModal = document.getElementById("closeAddUserModal");
const addUserForm = document.getElementById("addUserForm");
const addUserMsg = document.getElementById("addUserMsg");
const userFilter = document.getElementById("userFilter");


let currentUserFilter = ""; // id do usuário selecionado
let loggedUserId = null;


// ======== INICIALIZA ========
document.addEventListener("DOMContentLoaded", () => {
  wireLogin();
  wireLogout();
  wirePopState();
  wireTaskModal();


  // Tenta carregar Kanban, se falhar mostra login
  showKanbanAndLoad().catch(() => showLogin());
});


// Remova localStorage para login
function isLoggedIn() {
  return false;
}
function setLoggedIn(val) {
  // não faz nada
}


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


      const result = await resp.json();
      if (!result || !result.user_id) {
        throw new Error("Resposta inesperada do servidor.");
      }


      loggedUserId = result.user_id; // Salva o id do usuário logado


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
  await loadUserFilter();
  try {
    await loadAllColumns();
    kanbanMsg.textContent = "";
  } catch (err) {
    // Se falhar (ex: não autenticado), volta para login
    showLogin();
    kanbanMsg.textContent = "";
    throw err;
  }
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


  let url;
  if (currentUserFilter) {
    url = `${API_BASE}/tarefas/usuario/${currentUserFilter}`;
  } else {
    url = ROUTES.tarefas;
  }
  const resp = await fetch(url, {credentials:"include"});
  if(!resp.ok){
    const txt = await safeText(resp);
    throw new Error(txt || `Falha ao buscar ${url}`);
  }
  let data = await resp.json();
  // Se filtrando por usuário, filtrar também por status
  if (currentUserFilter) {
    data = (data || []).filter(t => t.fk_status == statusId || t.fk_status === statusId);
  } else {
    data = (data || []).filter(t => t.fk_status == statusId || t.fk_status === statusId);
  }


  col.innerHTML = "";
  (data || []).forEach(t => col.appendChild(createTaskCard(t)));
  counter.textContent = (data || []).length;


  if ((data || []).length === 0) {
    col.innerHTML = `<div class="msg">Sem tarefas em “${STATUS_LABEL[statusId]}”.</div>`;
  }
}


function formatDateBR(dateStr) {
  if (!dateStr) return "-";
  // Aceita formatos yyyy-mm-dd ou yyyy-mm-ddTHH:mm:ss
  const [y, m, d] = dateStr.split("T")[0].split("-");
  if (y && m && d) return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  return dateStr;
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
    <div class="meta-date">${escapeHtml(formatDateBR(task.Prazo_de_conclusao) || "Sem prazo")}</div>
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
    usuario: document.getElementById("modal-usuario"),
    categorias: document.getElementById("modal-categorias")
  };
  // Salva o id da tarefa para exclusão
  modal.dataset.taskId = taskId;
  try {
    fields.id.textContent = fields.titulo.textContent = fields.descricao.textContent = fields.criacao.textContent = fields.prazo.textContent = fields.estimado.textContent = fields.prioridade.textContent = fields.status.textContent = fields.usuario.textContent = "...";
    fields.categorias.textContent = "...";
    deleteTaskMsg.textContent = "";
    modal.classList.remove("hidden");
    const resp = await fetch(ROUTES.tarefaById(taskId), {credentials: "include"});
    if (!resp.ok) throw new Error("Falha ao buscar detalhes da tarefa");
    const t = await resp.json();
    fields.id.textContent = t.id || t.ID || "-";
    fields.titulo.textContent = t.Titulo || t.titulo || "-";
    fields.descricao.textContent = t.Descricao_tarefa || t.descricao || "-";
    fields.criacao.textContent = formatDateBR(t.Data_de_criacao) || "-";
    fields.prazo.textContent = formatDateBR(t.Prazo_de_conclusao) || "-";
    fields.estimado.textContent = t.Tempo_estimado || "-";
    fields.prioridade.textContent = t.prioridade || "-";
    fields.status.textContent = t.status || "-";
    fields.usuario.textContent = t.usuario || "-";
    // Buscar categorias da tarefa
    await loadCategoriasDaTarefa(taskId, fields.categorias);
  } catch (err) {
    fields.titulo.textContent = "Erro ao carregar tarefa.";
    fields.categorias.textContent = "";
  }
}


// Adiciona função para buscar categorias da tarefa
async function loadCategoriasDaTarefa(taskId, el) {
  el.textContent = "...";
  try {
    const resp = await fetch(`${API_BASE}/tarefas/${taskId}/categorias`);
    if (!resp.ok) throw new Error();
    const data = await resp.json();
    if (!data || data.length === 0) {
      el.textContent = "Nenhuma";
      return;
    }
    el.innerHTML = data.map(cat =>
      `<span class="modal-cat-tag">${escapeHtml(cat.Nome_categoria || cat.name)}</span>`
    ).join(" ");
  } catch {
    el.textContent = "Erro ao carregar";
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
    // Reload automático das colunas após mudança de status
    await loadAllColumns();
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


// ======== MODAL CRIAR TAREFA ========
addTaskBtn.addEventListener("click", async () => {
  addTaskForm.reset();
  addTaskMsg.textContent = "";
  await loadPrioridades();
  await loadStatus();
  await loadCategorias();
  addTaskModal.classList.remove("hidden");
});


closeAddTaskModal.addEventListener("click", () => addTaskModal.classList.add("hidden"));
addTaskModal.addEventListener("click", (e) => {
  if (e.target === addTaskModal) addTaskModal.classList.add("hidden");
});


// Prioridades
async function loadPrioridades() {
  addPrioridade.innerHTML = `<option value="">Carregando...</option>`;
  try {
    const resp = await fetch(`${API_BASE}/prioridades`);
    const data = await resp.json();
    addPrioridade.innerHTML = data.map(p =>
      `<option value="${p.ID}">${escapeHtml(p.Nome_prioridade || p.nome)}</option>`
    ).join("");
  } catch {
    addPrioridade.innerHTML = `<option value="">Erro ao carregar</option>`;
  }
}


// Status
async function loadStatus() {
  addStatus.innerHTML = `<option value="">Carregando...</option>`;
  try {
    const resp = await fetch(`${API_BASE}/status`);
    const data = await resp.json();
    addStatus.innerHTML = data.map(s =>
      `<option value="${s.ID}">${escapeHtml(s.Nome_status || s.nome)}</option>`
    ).join("");
  } catch {
    addStatus.innerHTML = `<option value="">Erro ao carregar</option>`;
  }
}


// Categorias (bolhas multiselect)
async function loadCategorias() {
  addCategorias.innerHTML = "";
  try {
    const resp = await fetch(`${API_BASE}/categoria`);
    const data = await resp.json();
    data.forEach(cat => {
      const bubble = document.createElement("span");
      bubble.textContent = cat.Nome_categoria || cat.name;
      bubble.className = "cat-bubble";
      bubble.dataset.id = cat.ID;
      bubble.style.cssText = `
        padding:6px 14px; border-radius:999px; background:#222633; color:#7c5cff; cursor:pointer; user-select:none;
        border:1px solid #2a3142; font-size:13px;
      `;
      bubble.addEventListener("click", function() {
        bubble.classList.toggle("selected");
        bubble.style.background = bubble.classList.contains("selected") ? "#7c5cff" : "#222633";
        bubble.style.color = bubble.classList.contains("selected") ? "#fff" : "#7c5cff";
      });
      addCategorias.appendChild(bubble);
    });
  } catch {
    addCategorias.innerHTML = `<span style="color:red;">Erro ao carregar categorias</span>`;
  }
}


// Usuários (filtro)
async function loadUserFilter() {
  userFilter.innerHTML = `<option value="">Todos os Usuários</option>`;
  try {
    const resp = await fetch(`${API_BASE}/usuarios`);
    const data = await resp.json();
    data.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.ID;
      opt.textContent = u.Nome_usuario;
      userFilter.appendChild(opt);
    });
  } catch {
    userFilter.innerHTML = `<option value="">Erro ao carregar usuários</option>`;
  }
}


// Atualiza filtro ao selecionar usuário
userFilter.addEventListener("change", async () => {
  currentUserFilter = userFilter.value;
  await showKanbanAndLoad();
});


// ======== SUBMIT CRIAR TAREFA ========
addTaskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addTaskMsg.textContent = "";


  // Validação: prazo não pode ser menor que data de início
  const dataInicio = addTaskForm.Data_de_criacao.value;
  const prazo = addTaskForm.Prazo_de_conclusao.value;
  if (dataInicio && prazo && prazo < dataInicio) {
    addTaskMsg.textContent = "O prazo de conclusão não pode ser menor que a data de início.";
    return;
  }


  addTaskMsg.textContent = "Salvando...";
  addTaskForm.querySelector("button[type=submit]").disabled = true;


  // Monta payload
  const payload = {
    Titulo: addTaskForm.Titulo.value.trim(),
    Descricao_tarefa: addTaskForm.Descricao_tarefa.value.trim(),
    Data_de_criacao: addTaskForm.Data_de_criacao.value,
    Prazo_de_conclusao: addTaskForm.Prazo_de_conclusao.value,
    Tempo_estimado: addTaskForm.Tempo_estimado.value.trim(),
    fk_prioridade: Number(addTaskForm.fk_prioridade.value),
    fk_status: Number(addTaskForm.fk_status.value),
    fk_usuario: loggedUserId // Usa o id do usuário logado
  };


  try {
    // Cria tarefa
    const resp = await fetch(`${API_BASE}/tarefas`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      credentials: "include",
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(await safeText(resp));
    const result = await resp.json();
    const tarefaId = result.id;


    // Categorias selecionadas
    const selectedCats = Array.from(addCategorias.querySelectorAll(".cat-bubble.selected"))
      .map(b => Number(b.dataset.id));
    // Adiciona relação categoria_tarefa
    for (const catId of selectedCats) {
      await fetch(`${API_BASE}/categoria_tarefa`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        credentials: "include",
        body: JSON.stringify({ fk_tarefa: tarefaId, fk_categoria: catId })
      });
    }


    addTaskMsg.textContent = "Tarefa criada!";
    addTaskModal.classList.add("hidden");
    await showKanbanAndLoad();
  } catch (err) {
    addTaskMsg.textContent = err.message || "Erro ao criar tarefa.";
  } finally {
    addTaskForm.querySelector("button[type=submit]").disabled = false;
  }
});


deleteTaskBtn.addEventListener("click", async () => {
  const modal = document.getElementById("taskModal");
  const taskId = modal.dataset.taskId;
  if (!taskId) return;
  // Removido o confirm
  deleteTaskMsg.textContent = "Excluindo...";
  deleteTaskBtn.disabled = true;
  try {
    const resp = await fetch(`${API_BASE}/tarefas/${taskId}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!resp.ok) throw new Error(await safeText(resp));
    deleteTaskMsg.textContent = "Tarefa excluída!";
    modal.classList.add("hidden");
    await showKanbanAndLoad();
  } catch (err) {
    deleteTaskMsg.textContent = err.message || "Erro ao excluir tarefa.";
  } finally {
    deleteTaskBtn.disabled = false;
  }
});


// Abrir modal de adicionar usuário
addUserBtn.addEventListener("click", () => {
  addUserForm.reset();
  addUserMsg.textContent = "";
  addUserModal.classList.remove("hidden");
});


// Fechar modal de adicionar usuário
closeAddUserModal.addEventListener("click", () => addUserModal.classList.add("hidden"));
addUserModal.addEventListener("click", (e) => {
  if (e.target === addUserModal) addUserModal.classList.add("hidden");
});


// Submeter novo usuário
addUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addUserMsg.textContent = "Salvando...";
  addUserForm.querySelector("button[type=submit]").disabled = true;
  const payload = {
    Nome_usuario: addUserForm.Nome_usuario.value.trim(),
    senha: addUserForm.senha.value
  };
  try {
    const resp = await fetch(`${API_BASE}/adicionarusuario`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      credentials: "include",
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(await safeText(resp));
    addUserMsg.textContent = "Usuário criado com sucesso!";
    setTimeout(() => addUserModal.classList.add("hidden"), 1200);
  } catch (err) {
    addUserMsg.textContent = err.message || "Erro ao criar usuário.";
  } finally {
    addUserForm.querySelector("button[type=submit]").disabled = false;
  }
});