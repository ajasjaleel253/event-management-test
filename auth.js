// ============================================================
// auth.js — Role definitions and permission checks
// ============================================================
// ROLE SYSTEM:
//   admin  → full access: programs, teams, participants, results, settings
//   user   → limited:     can add teams & participants to existing programs
//                         cannot: create/edit/delete programs, enter results,
//                         view/edit settings, or touch the leaderboard scores
//
// HOW ROLES WORK:
//   Roles are stored in Firestore under /roles/{uid} = { role: "admin" | "user" }
//   When you create a user in Firebase Auth, also create that document.
//   The app reads the role on login and gates all UI + DB calls.
//
// QUICK SETUP:
//   In Firebase console → Firestore → Create collection "roles"
//   Add doc with ID = the user's UID, field role = "admin" or "user"
// ============================================================

import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

let _currentRole = null; // cached in memory for the session

// ── Fetch role from Firestore ─────────────────────────────────
export async function fetchUserRole(uid) {
  try {
    const db   = getFirestore(getApp());
    const snap = await getDoc(doc(db, "roles", uid));
    _currentRole = snap.exists() ? snap.data().role : "user";
  } catch (e) {
    _currentRole = "user"; // fail safe — least privilege
  }
  return _currentRole;
}

// ── Role getters ──────────────────────────────────────────────
export function getRole()    { return _currentRole; }
export function isAdmin()    { return _currentRole === "admin"; }
export function isUser()     { return _currentRole === "user"; }
export function clearRole()  { _currentRole = null; }

// ── Permission matrix ────────────────────────────────────────
// Returns true if the current user can perform an action
export const can = {
  createProgram:      () => isAdmin(),
  editProgram:        () => isAdmin(),
  deleteProgram:      () => isAdmin(),

  createTeam:         () => isAdmin() || isUser(),
  editTeam:           () => isAdmin() || isUser(),  // users can edit their own teams
  deleteTeam:         () => isAdmin(),

  createParticipant:  () => isAdmin() || isUser(),
  editParticipant:    () => isAdmin() || isUser(),
  deleteParticipant:  () => isAdmin() || isUser(),

  enterResult:        () => isAdmin(),
  editResult:         () => isAdmin(),

  viewLeaderboard:    () => isAdmin() || isUser(),  // read-only for users
  editSettings:       () => isAdmin(),
};

// ── UI gating helper ─────────────────────────────────────────
// Hides or disables elements based on role
export function applyRoleGating() {
  // Elements with data-admin="true" are hidden from users
  document.querySelectorAll("[data-admin]").forEach(el => {
    el.style.display = isAdmin() ? "" : "none";
  });

  // Elements with data-role="user" are hidden from admins
  document.querySelectorAll("[data-user-only]").forEach(el => {
    el.style.display = isUser() ? "" : "none";
  });

  // Disable-only (visible but non-interactive for users)
  document.querySelectorAll("[data-admin-action]").forEach(el => {
    if (!isAdmin()) {
      el.disabled = true;
      el.title    = "Admin access required";
      el.style.opacity = "0.4";
      el.style.cursor  = "not-allowed";
    }
  });
}
