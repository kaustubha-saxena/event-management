const $ = (s) => document.querySelector(s);
const state = { user: null, events: [], view: "explore" };
const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const dateOf = (e) => new Date(e.starts_at.replace(" ", "T") + "Z");
const dateLabel = (e) =>
  dateOf(e).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const timeLabel = (e) =>
  dateOf(e).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
async function api(url, method = "GET", data) {
  const res = await fetch("/api" + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Unable to complete request.");
  return body;
}
let toastTimer;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 4000);
}
const modal = $("#modal");
$("#close-modal").onclick = () => modal.close();
function openModal(html) {
  $("#modal-content").innerHTML = html;
  if (!modal.open) modal.showModal();
}
function account() {
  $("#account").innerHTML = state.user
    ? `<span class="user-label">Hi, ${escapeHTML(state.user.name.split(" ")[0])}</span><button class="button" id="sign-out">Sign out</button>`
    : '<button class="button dark" id="sign-in" disabled title="Available after authentication is configured">Sign in (later stage)</button>';
  $("#manage-nav").hidden = state.user?.role !== "organizer";
  if (state.user)
    $("#sign-out").onclick = async () => {
      try {
        await api("/auth/logout", "POST", {});
        state.user = null;
        state.view = "explore";
        account();
        await load();
        toast("You have signed out.");
      } catch (e) {
        toast(e.message);
      }
    };
  else $("#sign-in").onclick = () => authDialog();
}
function authDialog(register = false) {
  openModal(
    `<p class="eyebrow">Your campus connection</p><h2 id="modal-title">${register ? "Make yourself at home." : "Good to see you."}</h2><p>${register ? "Create a student account to book and save events." : "Sign in to pick up where you left off."}</p><form id="auth-form">${register ? '<div><label for="name">Full name (required)</label><input id="name" name="name" autocomplete="name" minlength="2" maxlength="80" required></div>' : ""}<div><label for="email">Email address (required)</label><input id="email" name="email" type="email" autocomplete="email" maxlength="190" required></div><div><label for="password">Password (required)</label><input id="password" name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="8" maxlength="128" aria-describedby="password-hint" required><small id="password-hint">Use 8–128 characters.</small></div><div class="form-error" id="auth-error" role="alert"></div><button class="button dark" type="submit">${register ? "Create account" : "Sign in"} ↗</button></form><button class="text-button" id="switch-auth">${register ? "Already have an account? Sign in" : "New here? Create an account"}</button>`,
  );
  $("#switch-auth").onclick = () => authDialog(!register);
  $("#auth-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("[type=submit]");
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(event.target));
      state.user = (
        await api("/auth/" + (register ? "register" : "login"), "POST", data)
      ).user;
      modal.close();
      account();
      await load();
      toast(
        register
          ? "Your account is ready. Welcome!"
          : "Signed in successfully.",
      );
    } catch (e) {
      $("#auth-error").textContent = e.message;
    } finally {
      button.disabled = false;
    }
  };
}
function askLogin() {
  if (!state.user) {
    authDialog();
    return true;
  }
  return false;
}
function updateView() {
  const views = {
    explore: ["Your campus, your plans", "Find your next thing"],
    bookings: ["Make room for good things", "My registrations"],
    saved: ["Keep a little inspiration", "Saved for later"],
    manage: ["Bring people together", "Organizer workspace"],
  };
  const [k, t] = views[state.view];
  $("#section-kicker").textContent = k;
  $("#section-title").textContent = t + ".";
  $("#hero").hidden = state.view !== "explore";
  $("#create-event").hidden = state.view !== "manage";
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view);
    if (b.dataset.view === state.view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}
async function load() {
  updateView();
  state.events = [];
  $("#events-grid").replaceChildren();
  $("#result-count").textContent = "0 events";
  $("#page-status").textContent =
    "Event listings, accounts, and registrations will be available after the data and authentication stages are configured.";
}
function render() {
  let events = state.events.filter((e) =>
    state.view === "bookings"
      ? e.registered
      : state.view === "saved"
        ? e.saved
        : state.view === "manage"
          ? e.owner_id === state.user?.id
          : dateOf(e) > new Date(),
  );
  const sort = $("#sort").value;
  events.sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title)
      : sort === "seats"
        ? b.capacity - b.booked - (a.capacity - a.booked)
        : dateOf(a) - dateOf(b),
  );
  $("#result-count").textContent =
    `${events.length} ${events.length === 1 ? "event" : "events"}`;
  const symbols = {
    Technology: "⌘",
    Creative: "✳",
    Career: "↗",
    Community: "◎",
  };
  $("#events-grid").innerHTML = events.length
    ? events
        .map(
          (e) =>
            `<article class="event-card"><div class="event-art ${escapeHTML(e.category)}"><span class="art-symbol" aria-hidden="true">${symbols[e.category] || "◎"}</span><span class="art-caption" aria-hidden="true">${escapeHTML(e.category.toUpperCase())} / CAMPUSFLOW</span><button class="save-button" data-action="save" data-id="${e.id}" aria-pressed="${!!e.saved}" aria-label="${e.saved ? "Unsave" : "Save"} ${escapeHTML(e.title)}">${e.saved ? "♥" : "♡"}</button></div><div class="event-body"><div class="meta-row"><span class="tag">${escapeHTML(e.category)}</span><span class="free">FREE ENTRY</span></div><h3>${escapeHTML(e.title)}</h3><p class="event-description">${escapeHTML(e.description)}</p><div class="event-info"><div class="event-meta"><span aria-hidden="true">▦</span> ${dateLabel(e)} · ${timeLabel(e)}</div><div class="event-meta"><span aria-hidden="true">●</span> ${escapeHTML(e.venue)}</div></div><div class="card-foot"><span class="seats">${e.registered ? "✓ Registered" : dateOf(e) <= new Date() ? "Event ended" : e.capacity - e.booked + " spots left"}</span><button class="button" data-action="detail" data-id="${e.id}">View event <span aria-hidden="true">↗</span></button></div>${state.view === "manage" ? `<div class="admin-actions"><button class="button" data-action="edit" data-id="${e.id}">Edit</button><button class="button" data-action="attendees" data-id="${e.id}">Attendees (${e.booked})</button><button class="button" data-action="delete" data-id="${e.id}">Delete</button></div>` : ""}</div></article>`,
        )
        .join("")
    : `<div class="empty"><h3>${state.view === "bookings" ? "Your next memory is waiting." : state.view === "saved" ? "A little inspiration goes a long way." : "No events found."}</h3><p>${state.view === "bookings" ? "Explore events and register for something you love." : state.view === "saved" ? "Use the heart button to keep events here." : "Try another search or category."}</p></div>`;
}
async function refreshEvent(id) {
  await load();
  return state.events.find((e) => e.id === id);
}
function detail(e) {
  const closed = dateOf(e) <= new Date();
  openModal(
    `<p class="eyebrow">${escapeHTML(e.category)} · Free entry</p><h2 id="modal-title">${escapeHTML(e.title)}</h2><p>${escapeHTML(e.description)}</p><div class="detail-info"><p><strong>When:</strong> ${dateLabel(e)} · ${timeLabel(e)} (your local time)</p><p><strong>Where:</strong> ${escapeHTML(e.venue)}</p><p><strong>Hosted by:</strong> ${escapeHTML(e.organizer)}</p><p><strong>Availability:</strong> ${e.capacity - e.booked} of ${e.capacity} seats</p></div><div id="detail-error" class="form-error" role="alert"></div><button id="book-event" class="button dark" ${!e.registered && (closed || e.booked >= e.capacity) ? "disabled" : ""}>${e.registered ? "Cancel registration" : closed ? "Registration closed" : e.booked >= e.capacity ? "Event full" : "Register for this event ↗"}</button>`,
  );
  $("#book-event").onclick = async () => {
    if (askLogin()) return;
    if (e.registered) {
      confirmAction(
        "Cancel your registration?",
        "Your seat will become available to another student.",
        async () => {
          await api(`/events/${e.id}/book`, "DELETE", {});
          await load();
          toast("Registration cancelled.");
        },
      );
      return;
    }
    const b = $("#book-event");
    b.disabled = true;
    try {
      await api(`/events/${e.id}/book`, "POST", {});
      modal.close();
      await load();
      toast("You’re in! Find this event in My registrations.");
    } catch (error) {
      $("#detail-error").textContent = error.message;
      b.disabled = false;
    }
  };
}
function confirmAction(title, message, action) {
  openModal(
    `<h2 id="modal-title">${title}</h2><p>${message}</p><div id="confirm-error" class="form-error" role="alert"></div><button class="button dark" id="confirm-yes">Confirm</button> <button class="button" id="confirm-no">Keep it</button>`,
  );
  $("#confirm-no").onclick = () => modal.close();
  $("#confirm-yes").onclick = async () => {
    const button = $("#confirm-yes");
    button.disabled = true;
    try {
      await action();
      modal.close();
    } catch (e) {
      $("#confirm-error").textContent = e.message;
      button.disabled = false;
    }
  };
}
function editor(e) {
  const localDate = e
    ? new Date(dateOf(e).getTime() - dateOf(e).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
  openModal(
    `<p class="eyebrow">Organizer workspace</p><h2 id="modal-title">${e ? "Edit your event." : "Make something happen."}</h2><p>All fields are required. Dates use your local time.</p><form id="event-form"><div><label for="event-title">Event title</label><input id="event-title" name="title" required minlength="3" maxlength="100" value="${escapeHTML(e?.title || "")}"></div><div><label for="description">Description</label><textarea id="description" name="description" required minlength="20" maxlength="2000">${escapeHTML(e?.description || "")}</textarea></div><div class="form-row"><div><label for="event-category">Category</label><select id="event-category" name="category">${["Technology", "Creative", "Career", "Community"].map((c) => `<option ${e?.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div><div><label for="capacity">Capacity (1–10,000)</label><input id="capacity" name="capacity" type="number" min="1" max="10000" required value="${e?.capacity || 40}"></div></div><div><label for="venue">Venue</label><input id="venue" name="venue" minlength="3" maxlength="120" required value="${escapeHTML(e?.venue || "")}"></div><div><label for="starts-at">Date and time</label><input id="starts-at" name="starts_at" type="datetime-local" required value="${localDate}"></div><div id="event-error" class="form-error" role="alert"></div><button class="button dark" type="submit">${e ? "Save changes" : "Publish event"} ↗</button></form>`,
  );
  $("#event-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("[type=submit]");
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(event.target));
      data.starts_at = new Date(data.starts_at).toISOString();
      await api("/events" + (e ? "/" + e.id : ""), e ? "PUT" : "POST", data);
      modal.close();
      await load();
      toast(e ? "Event updated." : "Your event is live.");
    } catch (error) {
      $("#event-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
$("#events-grid").onclick = async (event) => {
  const b = event.target.closest("[data-action]");
  if (!b) return;
  const e = state.events.find((x) => x.id === Number(b.dataset.id));
  if (!e) return;
  try {
    switch (b.dataset.action) {
      case "detail":
        detail(e);
        break;
      case "save":
        if (askLogin()) return;
        b.disabled = true;
        await api(`/events/${e.id}/save`, e.saved ? "DELETE" : "POST", {});
        await refreshEvent(e.id);
        toast(e.saved ? "Event removed from saved." : "Saved for later.");
        break;
      case "edit":
        editor(e);
        break;
      case "delete":
        confirmAction(
          "Delete this event?",
          "The event and all its registrations will be permanently removed.",
          async () => {
            await api("/events/" + e.id, "DELETE", {});
            await load();
            toast("Event deleted.");
          },
        );
        break;
      case "attendees": {
        const rows = await api("/events/" + e.id + "/attendees");
        openModal(
          `<p class="eyebrow">${escapeHTML(e.title)}</p><h2 id="modal-title">Attendee list (${rows.length})</h2>${rows.length ? rows.map((r) => `<div class="attendee"><strong>${escapeHTML(r.name)}</strong><span>${escapeHTML(r.email)}</span></div>`).join("") : "<p>No registrations yet.</p>"}`,
        );
        break;
      }
    }
  } catch (error) {
    toast(error.message);
  } finally {
    b.disabled = false;
  }
};
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      if (b.dataset.view !== "explore" && askLogin()) return;
      state.view = b.dataset.view;
      $("#search").value = "";
      $("#category").value = "";
      syncPills();
      load();
    }),
);
function syncPills() {
  document.querySelectorAll("[data-category]").forEach((b) => {
    const active = b.dataset.category === $("#category").value;
    b.classList.toggle("selected", active);
    b.setAttribute("aria-pressed", String(active));
  });
}
document.querySelectorAll("[data-category]").forEach(
  (b) =>
    (b.onclick = () => {
      $("#category").value = b.dataset.category;
      syncPills();
      load();
    }),
);
$("#filters").onsubmit = (e) => {
  e.preventDefault();
  load();
};
$("#category").onchange = () => {
  syncPills();
  load();
};
$("#sort").onchange = render;
$("#create-event").onclick = () => editor();
$("#explore-cta").onclick = () => {
  $("#section-title").scrollIntoView({ behavior: "smooth" });
  $("#search").focus({ preventScroll: true });
};
account();
load();
