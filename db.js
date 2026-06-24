// ============================================================
// db.js — Firebase Firestore database layer
// ============================================================
// HOW TO SET UP (one-time, 5 minutes):
//   1. Go to https://console.firebase.google.com
//   2. Create a new project → Add a web app → Copy config below
//   3. In Firestore → "Create database" → Start in test mode
//   4. In Authentication → Sign-in method → Enable Email/Password
//   5. Create admin user:  admin@artsfest.com / yourpassword
//   6. Create user accounts: user@school.com / theirpassword
//   7. Replace the firebaseConfig object below with your own
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getFirestore, collection, doc,
  getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ── YOUR FIREBASE CONFIG ─────────────────────────────────────
// Replace this entire object with the one from your Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyBrPawHDgM_qLWp5YvGJQUpYexbcNFy51w",
  authDomain: "eventmanagementdb-96827.firebaseapp.com",
  projectId: "eventmanagementdb-96827",
  storageBucket: "eventmanagementdb-96827.firebasestorage.app",
  messagingSenderId: "389609505903",
  appId: "1:389609505903:web:94bc753b4ce5bfc025f99a",
  measurementId: "G-17EV9PH07L"
};

// ── INIT ─────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── COLLECTION NAMES ─────────────────────────────────────────
const PROGRAMS     = "programs";
const TEAMS        = "teams";
const PARTICIPANTS = "participants";
const RESULTS      = "results";
const SETTINGS     = "settings";
const ACTIVITY     = "activity";

// ── AUTH HELPERS ─────────────────────────────────────────────
export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function currentUser() {
  return auth.currentUser;
}

// ── SETTINGS ─────────────────────────────────────────────────
export async function getSettings() {
  const snap = await getDoc(doc(db, SETTINGS, "main"));
  if (snap.exists()) return snap.data();
  // defaults
  return { eventName: "State School Arts Festival", pts1: 5, pts2: 3, pts3: 1, regOpen: true };
}

export async function saveSettings(data) {
  await setDoc(doc(db, SETTINGS, "main"), data, { merge: true });
}

// ── PROGRAMS (Admin only) ─────────────────────────────────────
export async function getPrograms() {
  const snap = await getDocs(query(collection(db, PROGRAMS), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addProgram(data) {
  return addDoc(collection(db, PROGRAMS), { ...data, createdAt: serverTimestamp() });
}

export async function updateProgram(id, data) {
  return updateDoc(doc(db, PROGRAMS, id), data);
}

export async function deleteProgram(id) {
  return deleteDoc(doc(db, PROGRAMS, id));
}

// ── TEAMS (Users can add, admin can edit/delete) ──────────────
export async function getTeams() {
  const snap = await getDocs(query(collection(db, TEAMS), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addTeam(data) {
  return addDoc(collection(db, TEAMS), {
    ...data,
    createdBy: currentUser()?.uid || "unknown",
    createdAt: serverTimestamp()
  });
}

export async function updateTeam(id, data) {
  return updateDoc(doc(db, TEAMS, id), data);
}

export async function deleteTeam(id) {
  return deleteDoc(doc(db, TEAMS, id));
}

// ── PARTICIPANTS (Users can add/edit their team's) ────────────
export async function getParticipants() {
  const snap = await getDocs(query(collection(db, PARTICIPANTS), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addParticipant(data) {
  return addDoc(collection(db, PARTICIPANTS), {
    ...data,
    createdBy: currentUser()?.uid || "unknown",
    createdAt: serverTimestamp()
  });
}

export async function updateParticipant(id, data) {
  return updateDoc(doc(db, PARTICIPANTS, id), data);
}

export async function deleteParticipant(id) {
  return deleteDoc(doc(db, PARTICIPANTS, id));
}

// ── RESULTS (Admin only) ─────────────────────────────────────
export async function getResults() {
  const snap = await getDocs(collection(db, RESULTS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function setResult(programId, data) {
  // one result per program — use programId as document ID
  return setDoc(doc(db, RESULTS, programId), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser()?.uid || "unknown"
  });
}

export async function deleteResult(programId) {
  return deleteDoc(doc(db, RESULTS, programId));
}

// ── ACTIVITY LOG ─────────────────────────────────────────────
export async function logActivity(msg, type = "green") {
  return addDoc(collection(db, ACTIVITY), {
    msg, type,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    createdAt: serverTimestamp(),
    user: currentUser()?.email || "unknown"
  });
}

export async function getRecentActivity(limit = 10) {
  const snap = await getDocs(query(collection(db, ACTIVITY), orderBy("createdAt", "desc")));
  return snap.docs.slice(0, limit).map(d => d.data());
}

// ── REAL-TIME LISTENERS ──────────────────────────────────────
// Use these for live updates across all devices
export function listenToTeams(callback) {
  return onSnapshot(query(collection(db, TEAMS), orderBy("name")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function listenToParticipants(callback) {
  return onSnapshot(query(collection(db, PARTICIPANTS), orderBy("name")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function listenToResults(callback) {
  return onSnapshot(collection(db, RESULTS), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function listenToActivity(callback) {
  return onSnapshot(
    query(collection(db, ACTIVITY), orderBy("createdAt", "desc")),
    snap => {
      callback(snap.docs.slice(0, 20).map(d => d.data()));
    }
  );
}

// ── BATCH DELETE (cascade) ───────────────────────────────────
export async function deleteTeamCascade(teamId, participantIds) {
  const batch = writeBatch(db);
  batch.delete(doc(db, TEAMS, teamId));
  participantIds.forEach(pid => batch.delete(doc(db, PARTICIPANTS, pid)));
  return batch.commit();
}

export async function deleteProgramCascade(programId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, PROGRAMS, programId));
  batch.delete(doc(db, RESULTS, programId)); // may not exist, that's fine
  return batch.commit();
}
