// ============================================================
// app.js — ArtsFest main application logic
// ============================================================
import {
  login, logout, onAuthChange, currentUser,
  getSettings, saveSettings,
  getPrograms, addProgram, updateProgram, deleteProgram, deleteProgramCascade,
  getTeams, addTeam, updateTeam, deleteTeam, deleteTeamCascade,
  getParticipants, addParticipant, updateParticipant, deleteParticipant,
  getResults, setResult,
  logActivity, getRecentActivity,
  listenToTeams, listenToParticipants, listenToResults, listenToActivity
} from "./db.js";
import { fetchUserRole, getRole, isAdmin, isUser, clearRole, applyRoleGating } from "./auth.js";

// ══════════════════════════════════════════════════════
// LOCAL STATE (in-memory cache of Firestore data)
// ══════════════════════════════════════════════════════
let state = {
  programs:     [],
  teams:        [],
  participants: [],
  results:      [],
  settings:     { eventName: "ArtsFest", pts1: 5, pts2: 3, pts3: 1, regOpen: true },
  activity:     [],
  userEmail:    ""
};

// Firestore real-time listener unsubscribers
let unsubListeners = [];

// ══════════════════════════════════════════════════════
// INIT — Auth state listener (entry point)
// ══════════════════════════════════════════════════════
onAuthChange(async (user) => {
  hideLoading();
  if (user) {
    state.userEmail = user.email;
    await fetchUserRole(user.uid);
    await bootstrapApp();
  } else {
    clearRole();
    stopListeners();
    showLogin();
  }
});

async function bootstrapApp() {
  // Load all initial data in parallel
  const [programs, teams, participants, results, settings, activity] = await Promise.all([
    getPrograms(),
    getTeams(),
    getParticipants(),
    getResults(),
    getSettings(),
    getRecentActivity(20)
  ]);
  state.programs     = programs;
  state.teams        = teams;
  state.participants = participants;
  state.results      = results;
  state.settings     = settings;
  state.activity     = activity;

  applyRoleToUI();
  showDashboard();
  startListeners();   // real-time from here
  updateNavCounts();
  navigateTo("view-dashboard");
}

// ══════════════════════════════════════════════════════
// REAL-TIME LISTENERS
// ══════════════════════════════════════════════════════
function startListeners() {
  stopListeners();
  unsubListeners = [
    listenToTeams(data => {
      state.teams = data;
      updateNavCounts();
      if (currentView() === "view-teams")       renderTeams();
      if (currentView() === "view-leaderboard") renderLeaderboard();
      if (currentView() === "view-dashboard")   renderDashboard();
    }),
    listenToParticipants(data => {
      state.participants = data;
      updateNavCounts();
      if (currentView() === "view-participants") renderParticipants();
      if (currentView() === "view-dashboard")    renderDashboard();
    }),
    listenToResults(data => {
      state.results = data;
      if (currentView() === "view-results")     renderResults();
      if (currentView() === "view-leaderboard") renderLeaderboard();
      if (currentView() === "view-dashboard")   renderDashboard();
    }),
    listenToActivity(data => {
      state.activity = data;
      if (currentView() === "view-dashboard") renderDashboard();
    })
  ];
}
function stopListeners() { unsubListeners.forEach(u => u && u()); unsubListeners = []; }

// ══════════════════════════════════════════════════════
// ROLE-BASED UI GATING
// ══════════════════════════════════════════════════════
function applyRoleToUI() {
  // Role badge in sidebar
  const badge = document.getElementById("sidebar-role-badge");
  if (isAdmin()) {
    badge.className = "sidebar-role-badge admin";
    badge.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Admin`;
  } else {
    badge.className = "sidebar-role-badge user";
    badge.innerHTML = `<i class="fa-solid fa-user"></i> User`;
  }

  // User name / avatar
  document.getElementById("topbar-username").textContent = state.userEmail;
  const av = document.getElementById("topbar-avatar");
  av.textContent = state.userEmail.slice(0, 2).toUpperCase();
  if (!isAdmin()) av.classList.add("user-avatar");
  else            av.classList.remove("user-avatar");

  // Nav items locked for users
  const adminNavs = ["view-settings"];
  adminNavs.forEach(v => {
    const link = document.querySelector(`.nav-link[data-view="${v}"]`);
    if (link) {
      if (!isAdmin()) { link.classList.add("locked"); link.title = "Admin only"; }
      else            { link.classList.remove("locked"); link.title = ""; }
    }
  });

  // Apply data-admin attributes
  applyRoleGating();
}

// ══════════════════════════════════════════════════════
// PAGE SWITCHING
// ══════════════════════════════════════════════════════
function showLogin()      { document.getElementById("login-page").style.display = "flex"; document.getElementById("dashboard-page").style.display = "none"; }
function showDashboard()  { document.getElementById("login-page").style.display = "none"; document.getElementById("dashboard-page").style.display = "block"; }
function hideLoading()    { const el = document.getElementById("app-loading"); if (el) el.remove(); }

const PAGE_TITLES = {
  "view-dashboard":   "Dashboard",
  "view-programs":    "Programs",
  "view-teams":       "Teams",
  "view-participants":"Participants",
  "view-results":     "Results & Scoring",
  "view-leaderboard": "Leaderboard",
  "view-settings":    "Settings"
};

export function navigateTo(viewId) {
  // Block non-admin from settings
  if (viewId === "view-settings" && !isAdmin()) {
    toast("Settings are for admins only.", "warn");
    return;
  }
  document.querySelectorAll(".section-view").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-link[data-view]").forEach(l => l.classList.remove("active"));
  const view = document.getElementById(viewId);
  if (view) { view.classList.add("active"); renderView(viewId); }
  const link = document.querySelector(`.nav-link[data-view="${viewId}"]`);
  if (link) link.classList.add("active");
  document.getElementById("page-title").textContent = PAGE_TITLES[viewId] || "";
  closeMobileSidebar();
}

function currentView() {
  const el = document.querySelector(".section-view.active");
  return el ? el.id : "view-dashboard";
}

function renderView(viewId) {
  if (viewId === "view-dashboard")    renderDashboard();
  if (viewId === "view-programs")     renderPrograms();
  if (viewId === "view-teams")        renderTeams();
  if (viewId === "view-participants") renderParticipants();
  if (viewId === "view-results")      renderResults();
  if (viewId === "view-leaderboard")  renderLeaderboard();
  if (viewId === "view-settings")     renderSettings();
}

// ══════════════════════════════════════════════════════
// NAV COUNTS
// ══════════════════════════════════════════════════════
function updateNavCounts() {
  document.getElementById("count-programs").textContent    = state.programs.length;
  document.getElementById("count-teams").textContent       = state.teams.length;
  document.getElementById("count-participants").textContent= state.participants.length;
}

// ══════════════════════════════════════════════════════
// POINTS ENGINE
// ══════════════════════════════════════════════════════
function computePoints() {
  const pts = {}, medals = {};
  state.teams.forEach(t => { pts[t.id] = 0; medals[t.id] = { g: 0, s: 0, b: 0 }; });
  state.results.forEach(r => {
    const p1 = state.settings.pts1 || 5;
    const p2 = state.settings.pts2 || 3;
    const p3 = state.settings.pts3 || 1;
    if (r.first  && pts[r.first]  !== undefined) { pts[r.first]  += p1; medals[r.first].g++;  }
    if (r.second && pts[r.second] !== undefined) { pts[r.second] += p2; medals[r.second].s++; }
    if (r.third  && pts[r.third]  !== undefined) { pts[r.third]  += p3; medals[r.third].b++;  }
  });
  return { pts, medals };
}

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
function renderDashboard() {
  const { pts } = computePoints();
  document.getElementById("stat-participants").textContent = state.participants.length;
  document.getElementById("stat-teams").textContent        = state.teams.length;
  document.getElementById("stat-programs").textContent     = state.programs.length;
  document.getElementById("stat-results").textContent      = state.results.length;

  // Activity feed
  const af = document.getElementById("activity-feed");
  if (!state.activity.length) {
    af.innerHTML = `<p class="text-muted" style="font-size:0.82rem;">No activity yet.</p>`;
  } else {
    af.innerHTML = state.activity.slice(0, 8).map(a => `
      <div class="activity-item">
        <div class="activity-dot ${a.type || "green"}"></div>
        <div>
          <div class="activity-text">${a.msg}</div>
          <div class="activity-time">${a.time}${a.user ? ` · ${esc(a.user)}` : ""}</div>
        </div>
      </div>`).join("");
  }

  // Mini leaderboard
  const ml = document.getElementById("mini-leaderboard");
  const sorted = state.teams.map(t => ({ ...t, pts: pts[t.id] || 0 })).sort((a, b) => b.pts - a.pts).slice(0, 5);
  if (!sorted.length || sorted.every(t => t.pts === 0)) {
    ml.innerHTML = `<p class="text-muted" style="font-size:0.82rem;">Enter results to see standings.</p>`;
  } else {
    const max = Math.max(...sorted.map(t => t.pts), 1);
    ml.innerHTML = sorted.map((t, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--slate-50);">
        <div class="rank-badge rank-${i < 3 ? i + 1 : "n"}">${i + 1}</div>
        <div style="flex:1;min-width:0;font-size:0.82rem;font-weight:600;color:var(--slate-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.name)}</div>
        <div class="pts-bar-bg" style="width:90px;"><div class="pts-bar" style="width:${Math.round(t.pts / max * 100)}%"></div></div>
        <div style="font-size:0.82rem;font-weight:700;color:var(--green-700);min-width:40px;text-align:right;">${t.pts}pts</div>
      </div>`).join("");
  }
}

// ══════════════════════════════════════════════════════
// PROGRAMS (Admin only can create/edit/delete)
// ══════════════════════════════════════════════════════
function renderPrograms() {
  const search = document.getElementById("prog-search").value.toLowerCase();
  const catF   = document.getElementById("prog-filter-cat").value;
  const typeF  = document.getElementById("prog-filter-type").value;

  // Populate category datalist and filter
  const cats = [...new Set(state.programs.map(p => p.category))].sort();
  const catSel = document.getElementById("prog-filter-cat");
  const cv = catSel.value;
  catSel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option ${cv === c ? "selected" : ""}>${esc(c)}</option>`).join("");
  document.getElementById("cat-suggestions").innerHTML = cats.map(c => `<option value="${esc(c)}">`).join("");

  const filtered = state.programs.filter(p =>
    (p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search)) &&
    (!catF  || p.category === catF) &&
    (!typeF || p.type === typeF)
  );

  const tbody = document.getElementById("programs-tbody");
  if (!filtered.length) {
    tbody.innerHTML = emptyRow(7, state.programs.length ? "No programs match your search." : "No programs yet.", "fa-clipboard-list", isAdmin() ? 'Click "Add Program" to create the first one.' : "The admin hasn't added programs yet.");
    return;
  }
  tbody.innerHTML = filtered.map((p, i) => `
    <tr>
      <td class="text-muted">${i + 1}</td>
      <td class="primary-col">${esc(p.name)}</td>
      <td><span class="badge badge-blue">${esc(p.category)}</span></td>
      <td><span class="badge ${p.type === "Individual" ? "badge-amber" : "badge-green"}">${esc(p.type)}</span></td>
      <td>${esc(p.stage) || '<span class="text-muted">—</span>'}</td>
      <td>${p.time ? formatTime(p.time) : '<span class="text-muted">—</span>'}</td>
      <td class="actions">
        ${isAdmin() ? `
          <button class="btn-icon info" title="Edit" onclick="window._editProgram('${p.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon danger" title="Delete" onclick="window._deleteProgram('${p.id}')"><i class="fa-solid fa-trash"></i></button>
        ` : '<span class="text-muted text-sm">—</span>'}
      </td>
    </tr>`).join("");
}

// Add / Edit Program handlers
document.getElementById("btn-add-program").addEventListener("click", () => {
  if (!isAdmin()) { toast("Only admins can add programs.", "warn"); return; }
  document.getElementById("modal-program-title").textContent = "Add Program";
  document.getElementById("form-program").reset();
  document.getElementById("prog-id").value = "";
  clearErrors("form-program");
  openModal("modal-program");
});

window._editProgram = (id) => {
  if (!isAdmin()) return;
  const p = state.programs.find(x => x.id === id);
  if (!p) return;
  document.getElementById("modal-program-title").textContent = "Edit Program";
  document.getElementById("prog-id").value   = id;
  document.getElementById("prog-name").value = p.name;
  document.getElementById("prog-cat").value  = p.category;
  document.getElementById("prog-type").value = p.type;
  document.getElementById("prog-stage").value= p.stage  || "";
  document.getElementById("prog-time").value = p.time   || "";
  document.getElementById("prog-maxpart").value = p.maxPart || "";
  clearErrors("form-program");
  openModal("modal-program");
};

window._deleteProgram = async (id) => {
  if (!isAdmin()) return;
  const p = state.programs.find(x => x.id === id);
  if (!p) return;
  const ok = await showConfirm("Delete Program", `Delete "${p.name}"? Results for this program will also be removed.`);
  if (!ok) return;
  try {
    await deleteProgramCascade(id);
    state.programs     = state.programs.filter(x => x.id !== id);
    state.results      = state.results.filter(x => x.id !== id);
    state.participants.forEach(pa => { pa.programs = (pa.programs || []).filter(pid => pid !== id); });
    await logActivity(`Deleted program <strong>${esc(p.name)}</strong>`, "red");
    renderPrograms();
    toast("Program deleted.");
  } catch (e) { toast("Failed to delete program.", "error"); }
};

document.getElementById("btn-save-program").addEventListener("click", async () => {
  if (!isAdmin()) return;
  clearErrors("form-program");
  const name = document.getElementById("prog-name").value.trim();
  const cat  = document.getElementById("prog-cat").value.trim();
  const type = document.getElementById("prog-type").value;
  let valid  = true;
  if (!name) { showError("prog-name-err"); document.getElementById("prog-name").classList.add("error"); valid = false; }
  if (!cat)  { showError("prog-cat-err");  document.getElementById("prog-cat").classList.add("error");  valid = false; }
  if (!type) { showError("prog-type-err"); document.getElementById("prog-type").classList.add("error"); valid = false; }
  if (!valid) return;

  const id   = document.getElementById("prog-id").value;
  const data = {
    name, category: cat, type,
    stage:   document.getElementById("prog-stage").value.trim(),
    time:    document.getElementById("prog-time").value,
    maxPart: parseInt(document.getElementById("prog-maxpart").value) || null
  };

  try {
    setBtnLoading("btn-save-program", true);
    if (id) {
      await updateProgram(id, data);
      const idx = state.programs.findIndex(x => x.id === id);
      if (idx !== -1) state.programs[idx] = { id, ...data };
      await logActivity(`Updated program <strong>${esc(name)}</strong>`, "blue");
      toast("Program updated.");
    } else {
      const ref = await addProgram(data);
      state.programs.push({ id: ref.id, ...data });
      await logActivity(`Added program <strong>${esc(name)}</strong>`);
      toast("Program added!");
    }
    closeModal("modal-program");
    updateNavCounts();
    renderPrograms();
  } catch (e) { toast("Failed to save program.", "error"); }
  finally { setBtnLoading("btn-save-program", false); }
});

document.getElementById("prog-search").addEventListener("input", renderPrograms);
document.getElementById("prog-filter-cat").addEventListener("change", renderPrograms);
document.getElementById("prog-filter-type").addEventListener("change", renderPrograms);

// ══════════════════════════════════════════════════════
// TEAMS (Admin + Users can add; admin can delete)
// ══════════════════════════════════════════════════════
function renderTeams() {
  const search = document.getElementById("team-search").value.toLowerCase();
  const { pts, medals } = computePoints();
  const sorted = [...state.teams]
    .map(t => ({ ...t, pts: pts[t.id] || 0, medals: medals[t.id] || { g: 0, s: 0, b: 0 } }))
    .sort((a, b) => b.pts - a.pts);
  const filtered = sorted.filter(t =>
    t.name.toLowerCase().includes(search) || t.captain.toLowerCase().includes(search)
  );

  const tbody = document.getElementById("teams-tbody");
  if (!filtered.length) {
    tbody.innerHTML = emptyRow(6, state.teams.length ? "No teams match your search." : "No teams yet.", "fa-flag", 'Click "Register Team" to add the first team.');
    return;
  }
  tbody.innerHTML = filtered.map((t, i) => {
    const memberCount = state.participants.filter(p => p.teamId === t.id).length;
    const canEdit = isAdmin() || t.createdBy === currentUser()?.uid;
    return `<tr>
      <td><div class="rank-badge rank-${i < 3 ? i + 1 : "n"}">${i + 1}</div></td>
      <td class="primary-col">${esc(t.name)}${t.color ? ` <span class="text-muted text-sm">(${esc(t.color)})</span>` : ""}</td>
      <td>${esc(t.captain)}</td>
      <td>${memberCount}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="points-pill">${t.pts} pts</span>
          <span class="text-muted text-sm">🥇${t.medals.g} 🥈${t.medals.s} 🥉${t.medals.b}</span>
        </div>
      </td>
      <td class="actions">
        ${canEdit ? `<button class="btn-icon info" title="Edit" onclick="window._editTeam('${t.id}')"><i class="fa-solid fa-pen"></i></button>` : ""}
        ${isAdmin() ? `<button class="btn-icon danger" title="Delete" onclick="window._deleteTeam('${t.id}')"><i class="fa-solid fa-trash"></i></button>` : ""}
      </td>
    </tr>`;
  }).join("");
}

document.getElementById("btn-add-team").addEventListener("click", () => {
  document.getElementById("modal-team-title").textContent = "Register Team";
  document.getElementById("form-team").reset();
  document.getElementById("team-id").value = "";
  clearErrors("form-team");
  openModal("modal-team");
});

window._editTeam = (id) => {
  const t = state.teams.find(x => x.id === id);
  if (!t) return;
  if (!isAdmin() && t.createdBy !== currentUser()?.uid) { toast("You can only edit your own teams.", "warn"); return; }
  document.getElementById("modal-team-title").textContent = "Edit Team";
  document.getElementById("team-id").value      = id;
  document.getElementById("team-name").value    = t.name;
  document.getElementById("team-captain").value = t.captain;
  document.getElementById("team-color").value   = t.color || "";
  document.getElementById("team-notes").value   = t.notes || "";
  clearErrors("form-team");
  openModal("modal-team");
};

window._deleteTeam = async (id) => {
  if (!isAdmin()) { toast("Only admins can delete teams.", "warn"); return; }
  const t = state.teams.find(x => x.id === id);
  if (!t) return;
  const pIds = state.participants.filter(p => p.teamId === id).map(p => p.id);
  const ok   = await showConfirm("Delete Team", `Delete "${t.name}"? ${pIds.length} participant(s) will also be removed.`);
  if (!ok) return;
  try {
    await deleteTeamCascade(id, pIds);
    state.teams        = state.teams.filter(x => x.id !== id);
    state.participants = state.participants.filter(p => p.teamId !== id);
    state.results.forEach(r => {
      if (r.first  === id) r.first  = null;
      if (r.second === id) r.second = null;
      if (r.third  === id) r.third  = null;
    });
    await logActivity(`Deleted team <strong>${esc(t.name)}</strong>`, "red");
    updateNavCounts();
    renderTeams();
    toast("Team deleted.");
  } catch (e) { toast("Failed to delete team.", "error"); }
};

document.getElementById("btn-save-team").addEventListener("click", async () => {
  clearErrors("form-team");
  const name    = document.getElementById("team-name").value.trim();
  const captain = document.getElementById("team-captain").value.trim();
  let valid     = true;
  if (!name)    { showError("team-name-err");    document.getElementById("team-name").classList.add("error"); valid = false; }
  if (!captain) { showError("team-captain-err"); document.getElementById("team-captain").classList.add("error"); valid = false; }
  if (!valid) return;

  const id   = document.getElementById("team-id").value;
  const data = {
    name, captain,
    color: document.getElementById("team-color").value.trim(),
    notes: document.getElementById("team-notes").value.trim()
  };

  try {
    setBtnLoading("btn-save-team", true);
    if (id) {
      await updateTeam(id, data);
      const idx = state.teams.findIndex(x => x.id === id);
      if (idx !== -1) state.teams[idx] = { ...state.teams[idx], ...data };
      await logActivity(`Updated team <strong>${esc(name)}</strong>`, "blue");
      toast("Team updated.");
    } else {
      const ref = await addTeam(data);
      state.teams.push({ id: ref.id, ...data, createdBy: currentUser()?.uid });
      await logActivity(`Registered team <strong>${esc(name)}</strong>`);
      toast("Team registered!");
    }
    closeModal("modal-team");
    updateNavCounts();
    renderTeams();
  } catch (e) { toast("Failed to save team.", "error"); }
  finally { setBtnLoading("btn-save-team", false); }
});

document.getElementById("team-search").addEventListener("input", renderTeams);

// ══════════════════════════════════════════════════════
// PARTICIPANTS (Admin + Users can manage)
// ══════════════════════════════════════════════════════
function renderParticipants() {
  const teamSel = document.getElementById("part-filter-team");
  const curTeam = teamSel.value;
  teamSel.innerHTML = '<option value="">All Teams</option>' +
    state.teams.map(t => `<option value="${t.id}" ${curTeam == t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("");

  const search = document.getElementById("part-search").value.toLowerCase();
  const teamF  = document.getElementById("part-filter-team").value;

  const filtered = state.participants.filter(p =>
    p.name.toLowerCase().includes(search) &&
    (!teamF || p.teamId == teamF)
  );

  const tbody = document.getElementById("participants-tbody");
  if (!filtered.length) {
    tbody.innerHTML = emptyRow(6, state.participants.length ? "No matches." : "No participants yet.", "fa-user-check", "Add participants after registering teams.");
    return;
  }
  tbody.innerHTML = filtered.map((p, i) => {
    const team = state.teams.find(t => t.id === p.teamId);
    const progs = (p.programs || []).map(pid => state.programs.find(pr => pr.id === pid)).filter(Boolean);
    const canEdit = isAdmin() || p.createdBy === currentUser()?.uid;
    return `<tr>
      <td class="text-muted">${i + 1}</td>
      <td class="primary-col">${esc(p.name)}</td>
      <td>${team ? `<span class="badge badge-slate">${esc(team.name)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>${esc(p.grade) || '<span class="text-muted">—</span>'}</td>
      <td>
        <div class="participant-programs">
          ${progs.length ? progs.map(pr => `<span class="prog-chip">${esc(pr.name)}</span>`).join("") : '<span class="text-muted text-sm">None</span>'}
        </div>
      </td>
      <td class="actions">
        ${canEdit ? `<button class="btn-icon info" title="Edit" onclick="window._editParticipant('${p.id}')"><i class="fa-solid fa-pen"></i></button>` : ""}
        ${(isAdmin() || p.createdBy === currentUser()?.uid) ? `<button class="btn-icon danger" title="Remove" onclick="window._deleteParticipant('${p.id}')"><i class="fa-solid fa-trash"></i></button>` : ""}
      </td>
    </tr>`;
  }).join("");
}

document.getElementById("btn-add-participant").addEventListener("click", () => {
  if (!state.teams.length) { toast("Register at least one team first.", "error"); return; }
  if (!state.programs.length) { toast("Programs must be added by admin first.", "warn"); return; }
  document.getElementById("modal-participant-title").textContent = "Add Participant";
  document.getElementById("form-participant").reset();
  document.getElementById("part-id").value = "";
  populatePartTeams(null);
  populatePartPrograms([]);
  clearErrors("form-participant");
  openModal("modal-participant");
});

window._editParticipant = (id) => {
  const p = state.participants.find(x => x.id === id);
  if (!p) return;
  document.getElementById("modal-participant-title").textContent = "Edit Participant";
  document.getElementById("part-id").value      = id;
  document.getElementById("part-name").value    = p.name;
  document.getElementById("part-grade").value   = p.grade   || "";
  document.getElementById("part-contact").value = p.contact || "";
  populatePartTeams(p.teamId);
  populatePartPrograms(p.programs || []);
  clearErrors("form-participant");
  openModal("modal-participant");
};

window._deleteParticipant = async (id) => {
  const p = state.participants.find(x => x.id === id);
  if (!p) return;
  const ok = await showConfirm("Remove Participant", `Remove "${p.name}" from the event?`, "Remove");
  if (!ok) return;
  try {
    await deleteParticipant(id);
    state.participants = state.participants.filter(x => x.id !== id);
    await logActivity(`Removed participant <strong>${esc(p.name)}</strong>`, "red");
    updateNavCounts();
    renderParticipants();
    toast("Participant removed.");
  } catch (e) { toast("Failed to remove participant.", "error"); }
};

function populatePartTeams(selectedId) {
  const sel = document.getElementById("part-team");
  sel.innerHTML = '<option value="">Select team…</option>' +
    state.teams.map(t => `<option value="${t.id}" ${t.id == selectedId ? "selected" : ""}>${esc(t.name)}</option>`).join("");
}

function populatePartPrograms(selected = []) {
  const container = document.getElementById("part-programs-list");
  if (!state.programs.length) {
    container.innerHTML = '<p class="text-muted" style="grid-column:span 2;font-size:0.8rem;">No programs available yet.</p>';
    return;
  }
  container.innerHTML = state.programs.map(pr => `
    <label style="display:flex;align-items:center;gap:7px;font-size:0.8rem;cursor:pointer;padding:4px 0;">
      <input type="checkbox" value="${pr.id}" ${selected.includes(pr.id) ? "checked" : ""}
        style="accent-color:var(--green-600);width:14px;height:14px;">
      <span>${esc(pr.name)} <span class="text-muted">(${esc(pr.type)})</span></span>
    </label>`).join("");
}

document.getElementById("btn-save-participant").addEventListener("click", async () => {
  clearErrors("form-participant");
  const name   = document.getElementById("part-name").value.trim();
  const teamId = document.getElementById("part-team").value;
  let valid    = true;
  if (!name)   { showError("part-name-err"); document.getElementById("part-name").classList.add("error"); valid = false; }
  if (!teamId) { showError("part-team-err"); document.getElementById("part-team").classList.add("error"); valid = false; }
  if (!valid) return;

  const progIds = [...document.querySelectorAll("#part-programs-list input[type=checkbox]:checked")].map(cb => cb.value);
  const id   = document.getElementById("part-id").value;
  const data = {
    name, teamId,
    grade:    document.getElementById("part-grade").value.trim(),
    contact:  document.getElementById("part-contact").value.trim(),
    programs: progIds
  };

  try {
    setBtnLoading("btn-save-participant", true);
    if (id) {
      await updateParticipant(id, data);
      const idx = state.participants.findIndex(x => x.id === id);
      if (idx !== -1) state.participants[idx] = { ...state.participants[idx], ...data };
      await logActivity(`Updated participant <strong>${esc(name)}</strong>`, "blue");
      toast("Participant updated.");
    } else {
      const ref = await addParticipant(data);
      state.participants.push({ id: ref.id, ...data, createdBy: currentUser()?.uid });
      await logActivity(`Added participant <strong>${esc(name)}</strong>`);
      toast("Participant added!");
    }
    closeModal("modal-participant");
    updateNavCounts();
    renderParticipants();
  } catch (e) { toast("Failed to save participant.", "error"); }
  finally { setBtnLoading("btn-save-participant", false); }
});

document.getElementById("part-search").addEventListener("input", renderParticipants);
document.getElementById("part-filter-team").addEventListener("change", renderParticipants);

// ══════════════════════════════════════════════════════
// RESULTS (Admin only)
// ══════════════════════════════════════════════════════
function renderResults() {
  if (!isAdmin()) {
    // Show read-only view for users
    document.getElementById("results-admin-bar").style.display = "none";
  }
  const search = document.getElementById("result-search").value.toLowerCase();
  const catF   = document.getElementById("result-filter-cat").value;
  const statF  = document.getElementById("result-filter-status").value;

  const cats   = [...new Set(state.programs.map(p => p.category))].sort();
  const catSel = document.getElementById("result-filter-cat");
  const cv     = catSel.value;
  catSel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option ${cv === c ? "selected" : ""}>${esc(c)}</option>`).join("");

  const filtered = state.programs.filter(p => {
    const r = state.results.find(r => r.id === p.id || r.programId === p.id);
    const has = r && (r.first || r.second || r.third);
    return (
      (p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search)) &&
      (!catF  || p.category === catF) &&
      (!statF || (statF === "entered" && has) || (statF === "pending" && !has))
    );
  });

  const tbody = document.getElementById("results-tbody");
  if (!filtered.length) {
    tbody.innerHTML = emptyRow(7, state.programs.length ? "No matches." : "No programs yet.", "fa-trophy", "Add programs first, then enter results.");
    return;
  }
  tbody.innerHTML = filtered.map(p => {
    const r      = state.results.find(x => x.id === p.id || x.programId === p.id);
    const getTeamName = id => { const t = state.teams.find(x => x.id === id); return t ? esc(t.name) : "—"; };
    const has    = r && (r.first || r.second || r.third);
    return `<tr>
      <td class="primary-col">${esc(p.name)}</td>
      <td><span class="badge badge-blue">${esc(p.category)}</span></td>
      <td>${r && r.first  ? `<span class="result-indicator ri-winner">🥇 ${getTeamName(r.first)}</span>`  : '<span class="text-muted">—</span>'}</td>
      <td>${r && r.second ? `<span class="result-indicator ri-runner">🥈 ${getTeamName(r.second)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>${r && r.third  ? `<span class="result-indicator ri-third">🥉 ${getTeamName(r.third)}</span>`   : '<span class="text-muted">—</span>'}</td>
      <td>${has ? '<span class="badge badge-green">Scored</span>' : '<span class="badge badge-slate">Pending</span>'}</td>
      <td>
        ${isAdmin() ? `
          <button class="btn btn-sm ${has ? "btn-secondary" : "btn-primary"}" onclick="window._openResultModal('${p.id}')">
            ${has ? '<i class="fa-solid fa-pen"></i> Edit' : '<i class="fa-solid fa-plus"></i> Enter'}
          </button>` : '<span class="text-muted text-sm">—</span>'}
      </td>
    </tr>`;
  }).join("");
}

window._openResultModal = (progId) => {
  if (!isAdmin()) { toast("Only admins can enter results.", "warn"); return; }
  if (!state.teams.length) { toast("Register teams first.", "error"); return; }
  const p = state.programs.find(x => x.id === progId);
  if (!p) return;
  const r = state.results.find(x => x.id === progId || x.programId === progId) || {};

  document.getElementById("modal-result-title").textContent = `Result — ${p.name}`;
  document.getElementById("result-prog-id").value = progId;
  document.getElementById("modal-result-prog-info").innerHTML =
    `<strong>${esc(p.name)}</strong> &nbsp;·&nbsp; ${esc(p.category)} &nbsp;·&nbsp; ${esc(p.type)}${p.stage ? ` &nbsp;·&nbsp; ${esc(p.stage)}` : ""}`;

  const opts = '<option value="">— None —</option>' + state.teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  ["result-1st", "result-2nd", "result-3rd"].forEach(id => { document.getElementById(id).innerHTML = opts; });
  if (r.first)  document.getElementById("result-1st").value = r.first;
  if (r.second) document.getElementById("result-2nd").value = r.second;
  if (r.third)  document.getElementById("result-3rd").value = r.third;
  document.getElementById("result-dup-err").style.display = "none";
  updatePointsPreview();
  openModal("modal-result");
};

["result-1st", "result-2nd", "result-3rd"].forEach(id => {
  document.getElementById(id).addEventListener("change", updatePointsPreview);
});

function updatePointsPreview() {
  const v1 = document.getElementById("result-1st").value;
  const v2 = document.getElementById("result-2nd").value;
  const v3 = document.getElementById("result-3rd").value;
  const pv = document.getElementById("points-preview");
  const pc = document.getElementById("points-preview-content");
  const getN = id => { const t = state.teams.find(x => x.id == id); return t ? t.name : ""; };
  const lines = [];
  if (v1) lines.push(`<span class="badge badge-green">🥇 ${esc(getN(v1))} +${state.settings.pts1}pts</span>`);
  if (v2) lines.push(`<span class="badge badge-slate">🥈 ${esc(getN(v2))} +${state.settings.pts2}pts</span>`);
  if (v3) lines.push(`<span class="badge badge-amber">🥉 ${esc(getN(v3))} +${state.settings.pts3}pts</span>`);
  pv.style.display = lines.length ? "block" : "none";
  pc.innerHTML     = lines.join("");
}

document.getElementById("btn-save-result").addEventListener("click", async () => {
  if (!isAdmin()) return;
  const progId = document.getElementById("result-prog-id").value;
  const first  = document.getElementById("result-1st").value || null;
  const second = document.getElementById("result-2nd").value || null;
  const third  = document.getElementById("result-3rd").value || null;
  const errEl  = document.getElementById("result-dup-err");

  const placed = [first, second, third].filter(Boolean);
  if (new Set(placed).size !== placed.length) {
    errEl.textContent = "A team cannot be placed more than once.";
    errEl.style.display = "block";
    return;
  }
  errEl.style.display = "none";

  const prog = state.programs.find(x => x.id === progId);
  try {
    setBtnLoading("btn-save-result", true);
    await setResult(progId, { programId: progId, first, second, third });
    const existing = state.results.find(x => x.id === progId || x.programId === progId);
    if (existing) { Object.assign(existing, { first, second, third }); }
    else { state.results.push({ id: progId, programId: progId, first, second, third }); }
    await logActivity(`Published result for <strong>${esc(prog?.name || progId)}</strong>`, "amber");
    closeModal("modal-result");
    renderResults();
    toast("Result published!");
  } catch (e) { toast("Failed to save result.", "error"); }
  finally { setBtnLoading("btn-save-result", false); }
});

document.getElementById("result-search").addEventListener("input", renderResults);
document.getElementById("result-filter-cat").addEventListener("change", renderResults);
document.getElementById("result-filter-status").addEventListener("change", renderResults);

// ══════════════════════════════════════════════════════
// LEADERBOARD (read-only for users)
// ══════════════════════════════════════════════════════
function renderLeaderboard() {
  const { pts, medals } = computePoints();
  const sorted = [...state.teams]
    .map(t => ({ ...t, pts: pts[t.id] || 0, medals: medals[t.id] || { g: 0, s: 0, b: 0 } }))
    .sort((a, b) => b.pts - a.pts || b.medals.g - a.medals.g || b.medals.s - a.medals.s);
  const max    = Math.max(...sorted.map(t => t.pts), 1);
  const tbody  = document.getElementById("leaderboard-tbody");
  if (!sorted.length) {
    tbody.innerHTML = emptyRow(7, "No teams registered yet.", "fa-ranking-star", "Register teams and enter results to see live standings.");
    return;
  }
  tbody.innerHTML = sorted.map((t, i) => {
    const pct = Math.round(t.pts / max * 100);
    return `<tr>
      <td><div class="rank-badge rank-${i < 3 ? i + 1 : "n"}" style="width:28px;height:28px;font-size:0.8rem;">${i + 1}</div></td>
      <td class="primary-col">${esc(t.name)}${t.color ? ` <span class="text-muted text-sm">(${esc(t.color)})</span>` : ""}</td>
      <td><strong>${t.medals.g}</strong> 🥇</td>
      <td><strong>${t.medals.s}</strong> 🥈</td>
      <td><strong>${t.medals.b}</strong> 🥉</td>
      <td><span class="points-pill">${t.pts} pts</span></td>
      <td style="min-width:120px;"><div class="pts-bar-bg"><div class="pts-bar" style="width:${pct}%"></div></div></td>
    </tr>`;
  }).join("");
}

// ══════════════════════════════════════════════════════
// SETTINGS (Admin only)
// ══════════════════════════════════════════════════════
function renderSettings() {
  document.getElementById("setting-event-name").value    = state.settings.eventName || "";
  document.getElementById("setting-pts-1").value         = state.settings.pts1 || 5;
  document.getElementById("setting-pts-2").value         = state.settings.pts2 || 3;
  document.getElementById("setting-pts-3").value         = state.settings.pts3 || 1;
  document.getElementById("setting-reg-open").checked    = state.settings.regOpen !== false;
  document.getElementById("setting-results-public").checked = !!state.settings.resultsPublic;
}

document.getElementById("btn-save-settings").addEventListener("click", async () => {
  if (!isAdmin()) { toast("Admin access required.", "warn"); return; }
  const data = {
    eventName:     document.getElementById("setting-event-name").value.trim() || "ArtsFest",
    pts1:          parseInt(document.getElementById("setting-pts-1").value) || 5,
    pts2:          parseInt(document.getElementById("setting-pts-2").value) || 3,
    pts3:          parseInt(document.getElementById("setting-pts-3").value) || 1,
    regOpen:       document.getElementById("setting-reg-open").checked,
    resultsPublic: document.getElementById("setting-results-public").checked
  };
  try {
    await saveSettings(data);
    state.settings = data;
    toast("Settings saved.");
  } catch (e) { toast("Failed to save settings.", "error"); }
});

document.getElementById("btn-export").addEventListener("click", () => {
  if (!isAdmin()) return;
  const blob = new Blob([JSON.stringify({ programs: state.programs, teams: state.teams, participants: state.participants, results: state.results }, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url; a.download = "artsfest-export.json"; a.click();
  URL.revokeObjectURL(url);
  toast("Data exported.", "info");
});

// Change Password via Firebase Auth
document.getElementById("btn-change-pw").addEventListener("click", () => {
  document.getElementById("pw-current").value = "";
  document.getElementById("pw-new").value     = "";
  document.getElementById("pw-confirm").value = "";
  clearErrors("form-change-pw");
  openModal("modal-change-pw");
});

document.getElementById("btn-save-pw").addEventListener("click", async () => {
  clearErrors("form-change-pw");
  const cur  = document.getElementById("pw-current").value;
  const nw   = document.getElementById("pw-new").value;
  const conf = document.getElementById("pw-confirm").value;
  let valid  = true;
  if (!cur)         { showError("pw-current-err"); valid = false; }
  if (nw.length < 6){ showError("pw-new-err");     valid = false; }
  if (nw !== conf)  { showError("pw-confirm-err"); valid = false; }
  if (!valid) return;
  try {
    // Re-authenticate then change password
    const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const user       = currentUser();
    const credential = EmailAuthProvider.credential(user.email, cur);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, nw);
    closeModal("modal-change-pw");
    toast("Password updated.");
  } catch (e) {
    document.getElementById("pw-current").classList.add("error");
    showError("pw-current-err");
    document.getElementById("pw-current-err").textContent = "Incorrect current password.";
  }
});

// ══════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors("loginForm");
  const email = document.getElementById("uname").value.trim();
  const pass  = document.getElementById("upass").value;
  let valid   = true;
  if (!email) { showError("uname-err"); valid = false; }
  if (!pass)  { showError("upass-err"); valid = false; }
  if (!valid) return;

  const btn = document.getElementById("loginBtn");
  btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Signing in…';
  btn.disabled  = true;

  try {
    await login(email, pass);
    // onAuthChange fires automatically → bootstrapApp
  } catch (err) {
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
    btn.disabled  = false;
    const errEl   = document.getElementById("login-error");
    errEl.classList.add("visible");
    document.getElementById("upass").value = "";
    document.getElementById("upass").focus();
    setTimeout(() => errEl.classList.remove("visible"), 5000);
  }
});

document.getElementById("togglePw").addEventListener("click", () => {
  const inp  = document.getElementById("upass");
  const icon = document.getElementById("togglePwIcon");
  inp.type   = inp.type === "password" ? "text" : "password";
  icon.className = inp.type === "password" ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
});

// ══════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════
document.getElementById("logoutBtn").addEventListener("click", async () => {
  const ok = await showConfirm("Sign Out", "Are you sure you want to sign out?", "Sign Out");
  if (!ok) return;
  stopListeners();
  await logout();
  // onAuthChange fires → showLogin
});

// ══════════════════════════════════════════════════════
// NAVIGATION WIRING
// ══════════════════════════════════════════════════════
document.querySelectorAll(".nav-link[data-view]").forEach(link => {
  link.addEventListener("click", () => {
    if (link.classList.contains("locked")) return;
    navigateTo(link.dataset.view);
  });
});

document.getElementById("mobile-menu-btn").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("open");
});
document.getElementById("sidebar-overlay").addEventListener("click", closeMobileSidebar);

function closeMobileSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("open");
}

// ══════════════════════════════════════════════════════
// MODAL SYSTEM
// ══════════════════════════════════════════════════════
function openModal(id)  { document.getElementById(id).classList.add("open"); document.body.style.overflow = "hidden"; }
function closeModal(id) { document.getElementById(id).classList.remove("open"); document.body.style.overflow = ""; }

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(overlay.id); });
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(m => closeModal(m.id));
});

// ══════════════════════════════════════════════════════
// CONFIRM DIALOG
// ══════════════════════════════════════════════════════
function showConfirm(title, msg, okLabel = "Delete") {
  return new Promise(resolve => {
    document.getElementById("confirm-title").textContent   = title;
    document.getElementById("confirm-msg").textContent     = msg;
    document.getElementById("confirm-ok").textContent      = okLabel;
    openModal("confirm-dialog");
    const ok = document.getElementById("confirm-ok");
    const ca = document.getElementById("confirm-cancel");
    function done(v) {
      closeModal("confirm-dialog");
      ok.removeEventListener("click", yes);
      ca.removeEventListener("click", no);
      resolve(v);
    }
    function yes() { done(true); }
    function no()  { done(false); }
    ok.addEventListener("click", yes);
    ca.addEventListener("click", no);
  });
}

// ══════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════
function toast(msg, type = "success", dur = 3500) {
  const icons = { success: "fa-circle-check", error: "fa-circle-xmark", info: "fa-circle-info", warn: "fa-triangle-exclamation" };
  const el    = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  document.getElementById("toast-container").appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, dur);
}

// ══════════════════════════════════════════════════════
// FORM HELPERS
// ══════════════════════════════════════════════════════
function showError(id) { const el = document.getElementById(id); if (el) el.classList.add("visible"); }
function clearErrors(scopeId) {
  const scope = document.getElementById(scopeId);
  if (!scope) return;
  scope.querySelectorAll(".field-error").forEach(el => el.classList.remove("visible"));
  scope.querySelectorAll(".error").forEach(el => el.classList.remove("error"));
}
function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function emptyRow(cols, heading, icon, sub = "") {
  return `<tr><td colspan="${cols}"><div class="empty-state"><div class="ei"><i class="fa-solid ${icon}"></i></div><h4>${heading}</h4><p>${sub}</p></div></td></tr>`;
}
function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}
function setBtnLoading(id, on) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = on;
  if (on) { btn.dataset.origText = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Saving…'; }
  else    { btn.innerHTML = btn.dataset.origText || "Save"; }
}
