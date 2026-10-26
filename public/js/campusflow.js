const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { user: null, events: [], view: "explore", ready: false, firebase: null, scannerStream: null, scanTimer: null };
const categorySymbols = { Technology: "⌘", Creative: "✳", Career: "↗", Community: "◎" };

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function api(path, method = "GET", data) {
  const options = { method, credentials: "same-origin", headers: { Accept: "application/json" } };
  if (data !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.headers["X-CSRF-Token"] = "1";
    options.body = JSON.stringify(data);
  }
  const response = await fetch(`/api${path}`, options);
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: "The server returned an unreadable response." }; }
  if (!response.ok) throw new Error(body.error || "The request could not be completed.");
  return body;
}

let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 4500);
}

const modal = $("#modal");
function openModal(title, body) {
  $("#modal-content").innerHTML = `<h2 id="modal-title">${escapeHTML(title)}</h2>${body}`;
  if (!modal.open) modal.showModal();
}
function closeModal() {
  stopScanner();
  if (modal.open) modal.close();
}
$("#close-modal").addEventListener("click", closeModal);
modal.addEventListener("close", stopScanner);

function setStatus(message, role = "status") {
  const status = $("#page-status");
  status.textContent = message;
  status.setAttribute("role", role);
}

function setControlsEnabled(enabled) {
  for (const element of [$("#sign-in"), $("#search"), $(".search-button"), $("#category"), $("#sort"), ...$$(".pill"), ...$$("[data-view]").filter((button) => button.dataset.view !== "explore")]) {
    if (element) element.disabled = !enabled;
  }
}

function renderAccount() {
  const account = $("#account");
  if (!state.user) {
    account.innerHTML = '<button class="button dark" id="sign-in" type="button">Sign in <span aria-hidden="true">↗</span></button>';
    $("#sign-in").disabled = !state.ready;
    $("#sign-in").addEventListener("click", googleSignIn);
  } else {
    const firstName = escapeHTML(state.user.full_name.split(/\s+/)[0]);
    account.innerHTML = `<span class="user-label">Hi, ${firstName}</span><button class="button" id="sign-out" type="button">Sign out</button>`;
    $("#sign-out").addEventListener("click", signOut);
  }
  $("#manage-nav").hidden = state.user?.role !== "organizer";
  $("[data-view='tickets']").hidden = !state.user;
}

async function googleSignIn() {
  try {
    setStatus("Connecting to Google sign-in…");
    const config = (await api("/config")).firebase;
    if (!config) throw new Error("Firebase sign-in is not configured. Check the setup instructions.");
    const version = "13.1.0";
    const [{ initializeApp }, { getAuth, GoogleAuthProvider, inMemoryPersistence, setPersistence, signInWithPopup, signOut: firebaseSignOut }] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
    ]);
    const app = initializeApp(config, "campusflow-auth");
    const auth = getAuth(app);
    await setPersistence(auth, inMemoryPersistence);
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    const idToken = await result.user.getIdToken();
    await api("/auth/session", "POST", { idToken });
    await firebaseSignOut(auth);
    state.user = (await api("/auth/me")).user;
    renderAccount();
    await loadView();
    toast("You’re signed in.");
  } catch (error) {
    setStatus(error.message, "alert");
  }
}

async function signOut() {
  try {
    await api("/auth/logout", "POST", {});
    state.user = null;
    state.view = "explore";
    renderAccount();
    updateView();
    await loadView();
    toast("You have signed out.");
  } catch (error) { toast(error.message); }
}

const viewCopy = {
  explore: ["Your campus, your plans", "Find your next thing"],
  bookings: ["Make room for good things", "My registrations"],
  saved: ["Keep a little inspiration", "Saved for later"],
  tickets: ["Everything you’ve booked", "My tickets"],
  manage: ["Bring people together", "Organizer workspace"],
};
function updateView() {
  const [kicker, title] = viewCopy[state.view] || viewCopy.explore;
  $("#section-kicker").textContent = kicker;
  $("#section-title").textContent = `${title}.`;
  $("#hero").hidden = state.view !== "explore";
  $("#filters").hidden = !["explore", "saved"].includes(state.view);
  $(".category-pills").hidden = state.view !== "explore";
  $("#create-event").hidden = state.view !== "manage";
  for (const button of $$('[data-view]')) {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}

function formatDate(value) {
  const date = new Date(value);
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function eventCard(event) {
  const booked = Number(event.booked ?? event.registrations ?? 0);
  const available = Math.max(0, event.capacity - booked);
  const registered = Boolean(event.registered);
  const ended = new Date(event.starts_at) <= new Date();
  const stateLabel = registered ? "✓ Registered" : ended ? "Event ended" : available ? `${available} spots left` : "Event full";
  return `<article class="event-card"><div class="event-art ${escapeHTML(event.category)}"><span class="art-symbol" aria-hidden="true">${categorySymbols[event.category] || "◎"}</span><span class="art-caption" aria-hidden="true">${escapeHTML(event.category.toUpperCase())} / CAMPUSFLOW</span><button class="save-button" type="button" data-action="save" data-id="${escapeHTML(event.id)}" aria-pressed="${Boolean(event.saved)}" aria-label="${event.saved ? "Remove" : "Save"} ${escapeHTML(event.title)}">${event.saved ? "♥" : "♡"}</button></div><div class="event-body"><div class="meta-row"><span class="tag">${escapeHTML(event.category)}</span><span class="free">FREE ENTRY</span></div><h3>${escapeHTML(event.title)}</h3><p class="event-description">${escapeHTML(event.description)}</p><div class="event-info"><div class="event-meta">${escapeHTML(formatDate(event.starts_at))}</div><div class="event-meta">${escapeHTML(event.venue)}</div></div><div class="card-foot"><span class="seats">${stateLabel}</span><button class="button" type="button" data-action="detail" data-id="${escapeHTML(event.id)}">View event <span aria-hidden="true">↗</span></button></div>${state.view === "manage" ? `<div class="admin-actions"><button class="button" type="button" data-action="edit" data-id="${escapeHTML(event.id)}">Edit</button><button class="button" type="button" data-action="attendees" data-id="${escapeHTML(event.id)}">Attendees (${Number(event.registrations || event.booked || 0)})</button><button class="button" type="button" data-action="delete" data-id="${escapeHTML(event.id)}">Delete</button><button class="button" type="button" data-action="export" data-id="${escapeHTML(event.id)}">Export CSV</button></div>` : ""}</div></article>`;
}

function ticketCard(ticket) {
  return `<article class="event-card ticket-card"><div class="ticket-qr"><img src="${escapeHTML(ticket.qr)}" alt="QR ticket for ${escapeHTML(ticket.event.title)}" width="220" height="220"></div><div class="event-body"><div class="meta-row"><span class="tag">${escapeHTML(ticket.status.replaceAll("_", " "))}</span></div><h3>${escapeHTML(ticket.event.title)}</h3><p>${escapeHTML(formatDate(ticket.event.starts_at))}</p><p>${escapeHTML(ticket.event.venue)}</p><div class="card-foot"><button class="button" type="button" data-action="print-ticket" data-id="${escapeHTML(ticket.id)}">Print ticket</button><button class="button" type="button" data-action="ticket-detail" data-id="${escapeHTML(ticket.id)}">Ticket details</button></div></div></article>`;
}

function render(items, { tickets = false } = {}) {
  const grid = $("#events-grid");
  $("#result-count").textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;
  if (!items.length) {
    const message = state.view === "bookings" ? "Your next memory is waiting." : state.view === "saved" ? "A little inspiration goes a long way." : state.view === "tickets" ? "Your tickets will appear here after you register for an event." : state.view === "manage" ? "You haven’t created an event yet." : "No events found.";
    grid.innerHTML = `<div class="empty"><h3>${message}</h3><p>${state.view === "explore" ? "Try another search or category, or check back soon." : "Explore campus events to get started."}</p></div>`;
    return;
  }
  grid.innerHTML = items.map((item) => tickets ? ticketCard(item) : eventCard(item)).join("");
}

async function loadView() {
  updateView();
  if (!state.ready) {
    setStatus("CampusFlow needs Firebase and Supabase configuration before event services can start.");
    render([]);
    return;
  }
  setStatus("Loading…");
  try {
    let rows;
    if (state.view === "bookings") rows = await api("/registrations");
    else if (state.view === "saved") rows = await api("/saved");
    else if (state.view === "tickets") rows = await api("/tickets");
    else if (state.view === "manage") rows = await api("/organizer/analytics");
    else rows = await api(`/events?${new URLSearchParams({ q: $("#search").value, category: $("#category").value, sort: $("#sort").value })}`);
    state.events = rows;
    setStatus("");
    render(rows, { tickets: state.view === "tickets" });
  } catch (error) {
    render([]);
    setStatus(error.message, "alert");
  }
}

function eventDetail(event) {
  const canRegister = state.user && new Date(event.starts_at) > new Date() && Number(event.booked) < event.capacity;
  const action = event.registered ? "Cancel registration" : "Register for this event";
  openModal(event.title, `<p class="eyebrow">${escapeHTML(event.category)} · Free entry</p><p>${escapeHTML(event.description)}</p><div class="detail-info"><p><strong>When:</strong> ${escapeHTML(formatDate(event.starts_at))}</p><p><strong>Where:</strong> ${escapeHTML(event.venue)}</p><p><strong>Hosted by:</strong> ${escapeHTML(event.organizer || "CampusFlow organizer")}</p><p><strong>Availability:</strong> ${Math.max(0, event.capacity - Number(event.booked || 0))} of ${event.capacity} seats</p></div><div id="detail-error" class="form-error" role="alert"></div><button class="button dark" id="register-event" type="button" ${!event.registered && !canRegister ? "disabled" : ""}>${event.registered || canRegister ? action : "Registration unavailable"}</button>`);
  $("#register-event").addEventListener("click", async () => {
    const button = $("#register-event");
    button.disabled = true;
    try {
      if (event.registered) await api(`/events/${event.id}/registrations`, "DELETE", {});
      else await api(`/events/${event.id}/registrations`, "POST", {});
      closeModal();
      await loadView();
      toast(event.registered ? "Registration cancelled. The seat is available again." : "You’re registered. Your ticket is ready in My tickets.");
    } catch (error) { $("#detail-error").textContent = error.message; button.disabled = false; }
  });
}

function localDateTime(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function editEvent(event = null) {
  const body = `<form id="event-form"><div><label for="event-title">Event name</label><input id="event-title" name="title" minlength="3" maxlength="100" required value="${escapeHTML(event?.title || "")}"></div><div><label for="event-description">Description</label><textarea id="event-description" name="description" minlength="20" maxlength="2000" required>${escapeHTML(event?.description || "")}</textarea></div><div class="form-row"><div><label for="event-category">Category</label><select id="event-category" name="category" required>${["Technology","Creative","Career","Community"].map((name) => `<option ${event?.category === name ? "selected" : ""}>${name}</option>`).join("")}</select></div><div><label for="event-capacity">Capacity</label><input id="event-capacity" name="capacity" type="number" min="1" max="10000" required value="${Number(event?.capacity || 40)}"></div></div><div><label for="event-venue">Venue</label><input id="event-venue" name="venue" minlength="3" maxlength="120" required value="${escapeHTML(event?.venue || "")}"></div><div><label for="event-starts">Date and time</label><input id="event-starts" name="starts_at" type="datetime-local" required value="${event ? localDateTime(event.starts_at) : ""}"></div><p id="event-error" class="form-error" role="alert"></p><button class="button dark" type="submit">${event ? "Save changes" : "Create event"}</button></form>`;
  openModal(event ? "Edit event" : "Create an event", body);
  $("#event-form").addEventListener("submit", async (submit) => {
    submit.preventDefault();
    const button = submit.currentTarget.querySelector("[type=submit]");
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(submit.currentTarget));
      data.capacity = Number(data.capacity);
      data.starts_at = new Date(data.starts_at).toISOString();
      await api(event ? `/events/${event.id}` : "/events", event ? "PUT" : "POST", data);
      closeModal();
      await loadView();
      toast(event ? "Event updated." : "Event created.");
    } catch (error) { $("#event-error").textContent = error.message; button.disabled = false; }
  });
}

async function showTicket(ticketId) {
  const ticket = await api(`/tickets/${ticketId}`);
  openModal("Your digital ticket", `<article class="print-ticket"><h3>${escapeHTML(ticket.event.title)}</h3><p>${escapeHTML(formatDate(ticket.event.starts_at))}</p><p>${escapeHTML(ticket.event.venue)}</p><img src="${escapeHTML(ticket.qr)}" alt="Secure QR ticket" width="280" height="280"><p>Keep this ticket private. The QR code contains a one-time access token.</p><p class="ticket-status">Status: ${escapeHTML(ticket.status.replaceAll("_", " "))}</p><button type="button" class="button dark" id="print-current-ticket">Print ticket</button></article>`);
  $("#print-current-ticket").addEventListener("click", () => window.print());
}

async function attendeeList(eventId) {
  const rows = await api(`/events/${eventId}/attendees`);
  const items = rows.map((row) => `<li><strong>${escapeHTML(row.full_name)}</strong><span>${escapeHTML(row.email)}</span></li>`).join("");
  openModal("Event attendees", `<ul class="attendee-list">${items || "<li>No registrations yet.</li>"}</ul><p><button type="button" id="download-csv" class="button dark">Download CSV</button></p>`);
  $("#download-csv").addEventListener("click", () => { window.location.href = `/api/organizer/events/${eventId}/attendees.csv`; });
}

async function startScanner() {
  openModal("Check in a ticket", `<p>Allow camera access to scan a ticket, or enter its code manually.</p><div id="scanner-error" class="form-error" role="alert"></div><video id="ticket-video" muted playsinline aria-label="Ticket scanner camera"></video><form id="manual-checkin"><label for="ticket-token">Ticket code</label><input id="ticket-token" name="token" autocomplete="off" required minlength="32" maxlength="128"><button class="button dark" type="submit">Check in</button></form><div id="checkin-result" role="status"></div>`);
  $("#manual-checkin").addEventListener("submit", async (submit) => {
    submit.preventDefault();
    const token = new FormData(submit.currentTarget).get("token");
    try {
      const result = await api("/tickets/check-in", "POST", { token });
      $("#checkin-result").textContent = `Checked in for ${result.event_title}.`;
    } catch (error) { $("#scanner-error").textContent = error.message; }
  });
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera scanning is unavailable in this browser. Use manual ticket entry.");
    const module = await import("https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.11.0/dist/inlined/main.mjs");
    const video = $("#ticket-video");
    state.scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = state.scannerStream;
    await video.play();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    state.scanTimer = setInterval(async () => {
      if (!video.videoWidth || !video.videoHeight || !modal.open) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      try {
        const symbols = await module.scanImageData(context.getImageData(0, 0, canvas.width, canvas.height));
        if (symbols.length) {
          $("#ticket-token").value = symbols[0].decode();
          $("#manual-checkin").requestSubmit();
          stopScanner();
        }
      } catch { /* Non-QR camera frames are expected while scanning. */ }
    }, 350);
  } catch (error) {
    const message = error.name === "NotAllowedError" ? "Camera permission was denied. Enter the ticket code manually." : error.message;
    $("#scanner-error").textContent = message;
  }
}

function stopScanner() {
  clearInterval(state.scanTimer);
  state.scanTimer = null;
  if (state.scannerStream) {
    for (const track of state.scannerStream.getTracks()) track.stop();
    state.scannerStream = null;
  }
}

async function downloadCsv(eventId) {
  window.location.href = `/api/organizer/events/${eventId}/attendees.csv`;
}

$("#events-grid").addEventListener("click", async (click) => {
  const button = click.target.closest("[data-action]");
  if (!button) return;
  const item = state.events.find((row) => String(row.id) === button.dataset.id);
  try {
    switch (button.dataset.action) {
      case "detail": eventDetail(item); break;
      case "save":
        if (!state.user) return toast("Sign in to save events.");
        button.disabled = true;
        await api(`/events/${item.id}/save`, item.saved ? "DELETE" : "POST", {});
        await loadView();
        toast(item.saved ? "Removed from saved events." : "Saved for later.");
        break;
      case "edit": editEvent(item); break;
      case "attendees": await attendeeList(item.id); break;
      case "delete":
        if (window.confirm("Delete this event and its registrations?")) {
          await api(`/events/${item.id}`, "DELETE", {});
          await loadView();
          toast("Event deleted.");
        }
        break;
      case "export": await downloadCsv(item.id); break;
      case "ticket-detail": await showTicket(button.dataset.id); break;
      case "print-ticket": await showTicket(button.dataset.id); break;
    }
  } catch (error) { toast(error.message); }
  finally { if (button.isConnected) button.disabled = false; }
});

for (const button of $$('[data-view]')) {
  button.addEventListener("click", async () => {
    const nextView = button.dataset.view;
    if (["bookings", "saved", "tickets", "manage"].includes(nextView) && !state.user) return googleSignIn();
    if (nextView === "manage" && state.user?.role !== "organizer") return toast("Organizer access is required.");
    state.view = nextView;
    await loadView();
  });
}

function syncPills() {
  for (const button of $$("[data-category]")) {
    const active = button.dataset.category === $("#category").value;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  }
}
for (const button of $$("[data-category]")) button.addEventListener("click", () => { $("#category").value = button.dataset.category; syncPills(); loadView(); });
$("#filters").addEventListener("submit", (event) => { event.preventDefault(); loadView(); });
$("#category").addEventListener("change", () => { syncPills(); loadView(); });
$("#sort").addEventListener("change", loadView);
$("#create-event").addEventListener("click", () => editEvent());
$("#explore-cta").addEventListener("click", () => { $("#section-title").scrollIntoView({ behavior: "smooth" }); $("#search").focus({ preventScroll: true }); });

const scannerButton = document.createElement("button");
scannerButton.className = "nav-link";
scannerButton.type = "button";
scannerButton.textContent = "Scan tickets";
scannerButton.hidden = true;
scannerButton.addEventListener("click", startScanner);
$("nav[aria-label='Main navigation']").append(scannerButton);

async function initialize() {
  try {
    const [config, session] = await Promise.all([api("/config"), api("/auth/me")]);
    state.ready = Boolean(config.ready && config.firebase);
    state.user = session.user;
    setControlsEnabled(state.ready);
    scannerButton.hidden = state.user?.role !== "organizer";
    renderAccount();
    await loadView();
  } catch (error) {
    state.ready = false;
    setControlsEnabled(false);
    renderAccount();
    render([]);
    setStatus(`CampusFlow services are not ready: ${error.message}`, "alert");
  }
}

initialize();
