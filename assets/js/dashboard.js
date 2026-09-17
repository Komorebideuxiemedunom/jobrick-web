(async function () {
  "use strict";

  const session = await requireAuth();
  if (!session) return;

  const supa = window.supabaseClient;
  const user = session.user;

  document.getElementById("user-email").textContent = user.email;
  document.getElementById("notif-email-addr").textContent = user.email;

  document.getElementById("btn-logout").addEventListener("click", async () => {
    await supa.auth.signOut();
    window.location.href = "index.html";
  });

  // ------------------------------------------------------------------
  // Chargement du profil existant
  // ------------------------------------------------------------------
  let profile = null;
  {
    const { data, error } = await supa.from("profiles").select("*").eq("id", user.id).single();
    if (error) console.error("profil:", error);
    profile = data;
  }

  if (profile) {
    document.getElementById("job-keywords").value = profile.job_keywords || "";
    document.getElementById("notify-email").checked = profile.notify_email ?? true;
    document.getElementById("notify-discord").checked = profile.notify_discord ?? false;
    document.getElementById("discord-webhook").value = profile.discord_webhook_url || "";
    document.getElementById("discord-webhook").hidden = !profile.notify_discord;
    document.getElementById("discord-user-id").value = profile.discord_user_id || "";
    document.getElementById("discord-user-id").hidden = !profile.notify_discord;
    document.getElementById("discord-user-id-hint").hidden = !profile.notify_discord;
    if (profile.cv_filename) {
      showCvFilled(profile.cv_filename);
    }
  }

  document.getElementById("notify-discord").addEventListener("change", (e) => {
    document.getElementById("discord-webhook").hidden = !e.target.checked;
    document.getElementById("discord-user-id").hidden = !e.target.checked;
    document.getElementById("discord-user-id-hint").hidden = !e.target.checked;
    updateOnboarding();
  });
  document.getElementById("notify-email").addEventListener("change", updateOnboarding);
  document.getElementById("job-keywords").addEventListener("input", updateOnboarding);

  // ------------------------------------------------------------------
  // CV : drag & drop + upload vers Supabase Storage
  // ------------------------------------------------------------------
  const dropzone = document.getElementById("dropzone");
  const cvInput = document.getElementById("cv-input");
  const cvStatus = document.getElementById("cv-status");
  let pendingCvFile = null;

  function showCvFilled(filename) {
    document.getElementById("dropzone-empty").hidden = true;
    document.getElementById("dropzone-filled").hidden = false;
    document.getElementById("cv-filename-text").textContent = filename;
  }

  dropzone.addEventListener("click", () => cvInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dropzone-over"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dropzone-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dropzone-over");
    if (e.dataTransfer.files.length) handleCvFile(e.dataTransfer.files[0]);
  });
  cvInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleCvFile(e.target.files[0]);
  });

  function handleCvFile(file) {
    const okTypes = [".pdf", ".doc", ".docx"];
    const ok = okTypes.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!ok) {
      cvStatus.textContent = "Format non reconnu — PDF, DOC ou DOCX uniquement.";
      cvStatus.className = "field-status field-status-error";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      cvStatus.textContent = "Fichier trop lourd (10 Mo max).";
      cvStatus.className = "field-status field-status-error";
      return;
    }
    pendingCvFile = file;
    showCvFilled(file.name + " (pas encore enregistre)");
    cvStatus.textContent = "";
    updateAtsButtonState();
    updateOnboarding();
  }

  // ------------------------------------------------------------------
  // Carte + zones
  // ------------------------------------------------------------------
  const map = L.map("map").setView([46.6, 2.5], 5); // centre France
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  let zones = []; // {id?, label, lat, lng, rayon_km, marker, circle}

  function addZoneMarker(zone) {
    const marker = L.marker([zone.lat, zone.lng], { draggable: true }).addTo(map);
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.rayon_km * 1000,
      color: "#8C4A94",
      fillOpacity: 0.08,
    }).addTo(map);

    marker.on("drag", (e) => {
      const pos = e.target.getLatLng();
      zone.lat = pos.lat;
      zone.lng = pos.lng;
      circle.setLatLng(pos);
    });

    zone.marker = marker;
    zone.circle = circle;
    zones.push(zone);
    renderZonesList();
    updateOnboarding();
  }

  function removeZone(zone) {
    map.removeLayer(zone.marker);
    map.removeLayer(zone.circle);
    zones = zones.filter((z) => z !== zone);
    renderZonesList();
    updateOnboarding();
  }

  function renderZonesList() {
    const ul = document.getElementById("zones-list");
    ul.innerHTML = "";
    zones.forEach((zone) => {
      const li = document.createElement("li");
      li.className = "zone-item";

      const label = document.createElement("input");
      label.type = "text";
      label.value = zone.label;
      label.placeholder = "Nom du lieu";
      label.addEventListener("input", (e) => { zone.label = e.target.value; });

      const radius = document.createElement("input");
      radius.type = "number";
      radius.min = "1";
      radius.max = "200";
      radius.value = zone.rayon_km;
      radius.className = "zone-radius";
      radius.addEventListener("input", (e) => {
        zone.rayon_km = parseInt(e.target.value, 10) || 25;
        zone.circle.setRadius(zone.rayon_km * 1000);
      });

      const radiusUnit = document.createElement("span");
      radiusUnit.textContent = "km";
      radiusUnit.className = "zone-radius-unit";

      const del = document.createElement("button");
      del.textContent = "✕";
      del.className = "zone-del";
      del.addEventListener("click", () => removeZone(zone));

      li.appendChild(label);
      li.appendChild(radius);
      li.appendChild(radiusUnit);
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  map.on("click", async (e) => {
    const { lat, lng } = e.latlng;
    let label = "Nouveau lieu";
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`
      );
      const data = await res.json();
      label = data.address?.city || data.address?.town || data.address?.village || data.name || label;
    } catch (_) { /* geocodage silencieux : on garde le libelle par defaut */ }
    addZoneMarker({ label, lat, lng, rayon_km: 25 });
  });

  // Charge les zones existantes
  {
    const { data, error } = await supa.from("zones").select("*").eq("user_id", user.id);
    if (error) console.error("zones:", error);
    if (data && data.length) {
      const bounds = [];
      data.forEach((z) => {
        addZoneMarker({ id: z.id, label: z.label, lat: z.lat, lng: z.lng, rayon_km: z.rayon_km });
        bounds.push([z.lat, z.lng]);
      });
      map.fitBounds(bounds, { maxZoom: 9, padding: [40, 40] });
    }
  }

  // ------------------------------------------------------------------
  // Onboarding : checklist de mise en route
  // ------------------------------------------------------------------
  function updateOnboarding() {
    const card = document.getElementById("onboarding-card");
    if (!card) return;
    const steps = [
      { label: "CV ajoute", done: !!(pendingCvFile || profile?.cv_filename) },
      { label: "Zone de recherche ajoutee", done: zones.length > 0 },
      { label: "Mots-cles renseignes", done: !!document.getElementById("job-keywords").value.trim() },
      { label: "Canal de notification choisi", done: document.getElementById("notify-email").checked || document.getElementById("notify-discord").checked },
    ];
    const done = steps.filter((s) => s.done).length;
    document.getElementById("onboarding-count").textContent = `${done}/4`;
    document.getElementById("onboarding-bar-fill").style.width = `${(done / 4) * 100}%`;
    document.getElementById("onboarding-steps").innerHTML = steps.map((s) => `
      <span class="onboarding-step ${s.done ? "is-done" : ""}"><span class="dot"></span>${s.label}</span>
    `).join("");
    card.hidden = done === 4;
  }
  updateOnboarding();

  // ------------------------------------------------------------------
  // Nav : ancres de section actives au scroll
  // ------------------------------------------------------------------
  function initNavScrollspy() {
    const links = document.querySelectorAll(".nav-pill-links a");
    if (!links.length || !window.IntersectionObserver) return;
    const map2 = {};
    links.forEach((a) => { map2[a.getAttribute("href").slice(1)] = a; });
    const sections = Object.keys(map2).map((id) => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          Object.values(map2).forEach((a) => a.classList.remove("is-active"));
          map2[entry.target.id].classList.add("is-active");
        }
      });
    }, { rootMargin: "-40% 0px -50% 0px", threshold: 0 });
    sections.forEach((s) => observer.observe(s));
  }
  initNavScrollspy();

  // ------------------------------------------------------------------
  // Scanner ATS
  // ------------------------------------------------------------------
  const btnScan = document.getElementById("btn-scan-ats");
  const atsStatus = document.getElementById("ats-status");
  const atsPanel = document.getElementById("ats-panel");

  function updateAtsButtonState() {
    btnScan.disabled = !(pendingCvFile || profile?.cv_path);
  }
  updateAtsButtonState();

  function renderAtsResult(resultat) {
    atsPanel.hidden = false;
    if (resultat.score === null) {
      atsPanel.innerHTML = `<p class="ats-note">${escapeHtml(resultat.checks[0].detail || resultat.checks[0].label)}</p>`;
      return;
    }
    const niveauLabel = { good: "ATS-friendly", warn: "A ameliorer", bad: "Risque eleve" }[resultat.niveau];
    atsPanel.innerHTML = `
      <div class="ats-score-row">
        <div class="ats-score-badge is-${resultat.niveau}">${resultat.score}</div>
        <div class="ats-score-label"><strong>${niveauLabel}</strong><br>Score indicatif sur 100</div>
      </div>
      <ul class="ats-checks">
        ${resultat.checks.map((c) => `<li class="${c.pass ? "" : "is-fail"}"><span class="ats-icon">${c.pass ? "✓" : "✕"}</span>${escapeHtml(c.label)}</li>`).join("")}
      </ul>
      <p class="ats-note">Analyse indicative, executee dans ton navigateur — aucun contenu du CV n'est envoye a un serveur externe. Elle ne garantit pas le passage d'un ATS reel, mais repere les blocages les plus frequents.</p>
    `;
  }

  btnScan.addEventListener("click", async () => {
    if (typeof window.scanCV !== "function") {
      atsStatus.textContent = "Scanner indisponible pour le moment.";
      atsStatus.className = "field-status field-status-error";
      return;
    }
    btnScan.disabled = true;
    atsStatus.textContent = "Analyse en cours…";
    atsStatus.className = "field-status";
    atsPanel.hidden = true;
    try {
      let blob, filename;
      if (pendingCvFile) {
        blob = pendingCvFile;
        filename = pendingCvFile.name;
      } else {
        const { data, error } = await supa.storage.from("cvs").download(profile.cv_path);
        if (error) throw error;
        blob = data;
        filename = profile.cv_filename;
      }
      const resultat = await window.scanCV(blob, filename, document.getElementById("job-keywords").value);
      renderAtsResult(resultat);
      atsStatus.textContent = "";
    } catch (err) {
      console.error("scan ATS:", err);
      atsStatus.textContent = "Erreur pendant l'analyse.";
      atsStatus.className = "field-status field-status-error";
    } finally {
      updateAtsButtonState();
    }
  });

  // ------------------------------------------------------------------
  // Enregistrer
  // ------------------------------------------------------------------
  const btnSave = document.getElementById("btn-save");
  const btnSaveLabel = btnSave.querySelector(".btn-label");

  btnSave.addEventListener("click", async () => {
    const saveStatus = document.getElementById("save-status");
    saveStatus.textContent = "";
    saveStatus.className = "field-status";
    btnSave.disabled = true;
    btnSave.classList.remove("is-success");
    btnSave.classList.add("is-loading");
    btnSaveLabel.innerHTML = `<span class="spinner"></span><span class="btn-label-text">Enregistrement…</span>`;

    const discordUserId = document.getElementById("discord-user-id").value.trim();
    if (discordUserId && !/^\d{15,25}$/.test(discordUserId)) {
      saveStatus.textContent = "ID Discord invalide — ce sont uniquement des chiffres (ex. 123456789012345678).";
      saveStatus.className = "field-status field-status-error";
      btnSave.classList.remove("is-loading");
      btnSaveLabel.innerHTML = `<span class="btn-label-text">Enregistrer</span>`;
      btnSave.disabled = false;
      return;
    }

    try {
      // 1. CV, si un nouveau fichier a ete depose
      let cvPath = profile?.cv_path;
      let cvFilename = profile?.cv_filename;
      if (pendingCvFile) {
        const path = `${user.id}/${Date.now()}_${pendingCvFile.name}`;
        const { error: upErr } = await supa.storage.from("cvs").upload(path, pendingCvFile, { upsert: true });
        if (upErr) throw upErr;
        cvPath = path;
        cvFilename = pendingCvFile.name;
      }

      // 2. Profil
      const { error: profErr } = await supa.from("profiles").upsert({
        id: user.id,
        email: user.email,
        job_keywords: document.getElementById("job-keywords").value,
        notify_email: document.getElementById("notify-email").checked,
        notify_discord: document.getElementById("notify-discord").checked,
        discord_webhook_url: document.getElementById("discord-webhook").value || null,
        discord_user_id: document.getElementById("discord-user-id").value.trim() || null,
        cv_path: cvPath,
        cv_filename: cvFilename,
        cv_uploaded_at: pendingCvFile ? new Date().toISOString() : profile?.cv_uploaded_at,
        updated_at: new Date().toISOString(),
      });
      if (profErr) throw profErr;

      // 3. Zones : on supprime tout puis on reinsere (simple et suffisant a ce stade)
      await supa.from("zones").delete().eq("user_id", user.id);
      if (zones.length) {
        const rows = zones.map((z) => ({
          user_id: user.id,
          label: z.label,
          lat: z.lat,
          lng: z.lng,
          rayon_km: z.rayon_km,
        }));
        const { error: zErr } = await supa.from("zones").insert(rows);
        if (zErr) throw zErr;
      }

      profile = { ...(profile || {}), cv_path: cvPath, cv_filename: cvFilename };
      pendingCvFile = null;
      updateAtsButtonState();
      updateOnboarding();
      saveStatus.textContent = "";
      btnSave.classList.remove("is-loading");
      btnSave.classList.add("is-success");
      btnSaveLabel.innerHTML = `<span class="check">✓</span><span class="btn-label-text">Enregistre</span>`;
      setTimeout(() => {
        btnSave.classList.remove("is-success");
        btnSaveLabel.innerHTML = `<span class="btn-label-text">Enregistrer</span>`;
        btnSave.disabled = false;
      }, 1800);
    } catch (err) {
      console.error(err);
      saveStatus.textContent = "Erreur : " + err.message;
      saveStatus.className = "field-status field-status-error";
      btnSave.classList.remove("is-loading");
      btnSaveLabel.innerHTML = `<span class="btn-label-text">Enregistrer</span>`;
      btnSave.disabled = false;
    }
  });

  // ------------------------------------------------------------------
  // Resultats : skeleton, tri, filtre, marquage "vu", export CSV,
  // statut "postule", reseautage, relance
  // ------------------------------------------------------------------
  const resultsContainer = document.getElementById("results-list");
  const sortSelect = document.getElementById("results-sort");
  const hideSeenCheckbox = document.getElementById("results-hide-seen");
  const exportBtn = document.getElementById("btn-export");
  let allResults = [];

  resultsContainer.innerHTML = Array.from({ length: 3 }).map(() => `
    <div class="skeleton-item">
      <div class="skeleton-block skeleton-score"></div>
      <div class="skeleton-lines">
        <div class="skeleton-block skeleton-line skeleton-line--title"></div>
        <div class="skeleton-block skeleton-line skeleton-line--meta"></div>
      </div>
    </div>
  `).join("");

  function updateStats() {
    const semaineDepuis = Date.now() - 7 * 24 * 3600 * 1000;
    const visibles = allResults.filter((r) => r.interet !== false);
    document.getElementById("stat-nouvelles").textContent = visibles.filter((r) => !r.vu).length;
    document.getElementById("stat-semaine").textContent = visibles.filter((r) => r.vu && new Date(r.created_at).getTime() >= semaineDepuis).length;
    document.getElementById("stat-attente").textContent = visibles.filter((r) => r.postule).length;
  }

  function reseauPanelHtml(employeur) {
    const q = encodeURIComponent(employeur || "");
    return `
      <div class="reseau-panel" hidden>
        <a href="https://www.linkedin.com/search/results/people/?keywords=${q}%20CEO" target="_blank" rel="noopener noreferrer">Chercher le/la CEO sur LinkedIn →</a>
        <a href="https://www.linkedin.com/search/results/people/?keywords=${q}%20RH%20recrutement" target="_blank" rel="noopener noreferrer">Chercher RH / recrutement sur LinkedIn →</a>
        <a href="https://www.linkedin.com/search/results/companies/?keywords=${q}" target="_blank" rel="noopener noreferrer">Voir la page entreprise sur LinkedIn →</a>
      </div>
    `;
  }

  function relanceHtml(r) {
    const SEPT_JOURS = 7 * 24 * 3600 * 1000;
    if (!r.postule || !r.postule_at) return "";
    if (Date.now() - new Date(r.postule_at).getTime() < SEPT_JOURS) return "";
    const message = `Bonjour, je me permets de relancer suite a ma candidature pour le poste de ${r.titre || "..."} chez ${r.employeur || "..."} — je reste tres interesse(e) et disponible pour en echanger. Bonne journee.`;
    return `
      <button class="chip-relance relance-btn" data-id="${r.id}">Relance conseillee (J+7)</button>
      <div class="relance-panel" hidden>
        Suggestion de message a copier :
        <textarea rows="3" readonly>${escapeHtml(message)}</textarea>
      </div>
    `;
  }

  function renderResults() {
    let list = allResults.filter((r) => r.interet !== false);
    if (hideSeenCheckbox.checked) list = list.filter((r) => !r.vu);
    if (sortSelect.value === "score") {
      list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    } else {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    if (!list.length) {
      resultsContainer.innerHTML = allResults.length
        ? `<p class="empty-state">Rien a afficher avec ce filtre.</p>`
        : `<p class="empty-state">Rien pour l'instant — la veille tourne deux fois par jour, reviens un peu plus tard.</p>`;
      updateStats();
      return;
    }

    resultsContainer.innerHTML = list.map((r) => `
      <div class="result-item ${r.vu ? "" : "is-new"}" data-id="${r.id}">
        <a class="result-link" href="${r.url}" target="_blank" rel="noopener noreferrer">
          <div class="result-score">${r.score ?? "–"}</div>
          <div class="result-body">
            <div class="result-title-row">
              <div class="result-title">${escapeHtml(r.titre || "Sans titre")}</div>
              ${r.vu ? "" : `<span class="result-new-badge">Nouveau</span>`}
            </div>
            <div class="result-meta">${escapeHtml(r.employeur || "")} · ${escapeHtml(r.lieu || "")}</div>
            ${r.raison ? `<div class="result-reason">${escapeHtml(r.raison)}</div>` : ""}
          </div>
        </a>
        <div class="result-actions">
          <button class="chip-btn postule-btn ${r.postule ? "is-active" : ""}" data-id="${r.id}">${r.postule ? "Postule ✓" : "Marquer postule"}</button>
          <button class="chip-btn reseau-btn" data-id="${r.id}">Reseautage</button>
          ${relanceHtml(r)}
        </div>
        ${reseauPanelHtml(r.employeur)}
      </div>
    `).join("");

    updateStats();
  }

  async function markAsSeen(id) {
    const item = allResults.find((r) => r.id === id);
    if (!item || item.vu) return;
    item.vu = true;
    updateStats();
    const { error } = await supa.from("job_results").update({ vu: true }).eq("id", id);
    if (error) console.error("marquage vu:", error);
  }

  async function togglePostule(id, btn) {
    const item = allResults.find((r) => r.id === id);
    if (!item) return;
    item.postule = !item.postule;
    item.postule_at = item.postule ? new Date().toISOString() : null;
    btn.classList.toggle("is-active", item.postule);
    btn.textContent = item.postule ? "Postule ✓" : "Marquer postule";
    updateStats();
    const { error } = await supa.from("job_results").update({ postule: item.postule, postule_at: item.postule_at }).eq("id", id);
    if (error) console.error("statut postule:", error);
  }

  // Delegation d'evenements : reste valide apres chaque re-rendu de la liste.
  resultsContainer.addEventListener("click", (e) => {
    const link = e.target.closest(".result-link");
    if (link) {
      const id = link.closest(".result-item")?.dataset.id;
      if (id) markAsSeen(id);
      return;
    }
    const postuleBtn = e.target.closest(".postule-btn");
    if (postuleBtn) {
      e.preventDefault();
      togglePostule(postuleBtn.dataset.id, postuleBtn);
      return;
    }
    const reseauBtn = e.target.closest(".reseau-btn");
    if (reseauBtn) {
      e.preventDefault();
      const panel = reseauBtn.closest(".result-item").querySelector(".reseau-panel");
      if (panel) panel.hidden = !panel.hidden;
      return;
    }
    const relanceBtn = e.target.closest(".relance-btn");
    if (relanceBtn) {
      e.preventDefault();
      const panel = relanceBtn.nextElementSibling;
      if (panel && panel.classList.contains("relance-panel")) panel.hidden = !panel.hidden;
      return;
    }
  });

  sortSelect.addEventListener("change", renderResults);
  hideSeenCheckbox.addEventListener("change", renderResults);

  exportBtn.addEventListener("click", () => {
    if (!allResults.length) return;
    const header = ["Titre", "Employeur", "Lieu", "Score", "Raison", "URL", "Vu", "Postule", "Date"];
    const rows = allResults.map((r) => [
      r.titre || "", r.employeur || "", r.lieu || "", r.score ?? "",
      r.raison || "", r.url || "", r.vu ? "oui" : "non", r.postule ? "oui" : "non", r.created_at || "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jobrick-offres.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  // ------------------------------------------------------------------
  // Mode tri (swipe façon Tinder) : droite = interessant, gauche = ecarte
  // ------------------------------------------------------------------
  function initSwipe() {
    const toggleBtn = document.getElementById("btn-swipe-mode");
    const section = document.getElementById("swipe-section");
    const deckEl = document.getElementById("swipe-deck");
    const btnYes = document.getElementById("swipe-yes");
    const btnNo = document.getElementById("swipe-no");
    let active = false;
    let currentId = null;

    toggleBtn.addEventListener("click", () => {
      active = !active;
      section.hidden = !active;
      resultsContainer.hidden = active;
      toggleBtn.textContent = active ? "Fermer le tri" : "Mode tri";
      if (active) renderDeck();
    });

    function queue() {
      return allResults
        .filter((r) => r.interet === null || r.interet === undefined)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    function renderDeck() {
      const q = queue();
      if (!q.length) {
        deckEl.innerHTML = `<div class="swipe-empty">Tout est trie ! Reviens plus tard pour de nouvelles offres.</div>`;
        currentId = null;
        return;
      }
      const r = q[0];
      currentId = r.id;
      deckEl.innerHTML = `
        <div class="swipe-card" id="swipe-card-active">
          <span class="swipe-stamp swipe-stamp--like">INTERESSE</span>
          <span class="swipe-stamp swipe-stamp--nope">PASSE</span>
          <div class="result-score">${r.score ?? "–"}</div>
          <div class="result-title">${escapeHtml(r.titre || "Sans titre")}</div>
          <div class="result-meta">${escapeHtml(r.employeur || "")} · ${escapeHtml(r.lieu || "")}</div>
          ${r.raison ? `<div class="result-reason">${escapeHtml(r.raison)}</div>` : ""}
        </div>
      `;
      wireDrag(document.getElementById("swipe-card-active"));
    }

    function wireDrag(card) {
      let startX = 0, dx = 0, dragging = false;
      const like = card.querySelector(".swipe-stamp--like");
      const nope = card.querySelector(".swipe-stamp--nope");

      card.addEventListener("pointerdown", (e) => {
        dragging = true;
        startX = e.clientX;
        card.setPointerCapture(e.pointerId);
      });
      card.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        dx = e.clientX - startX;
        card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
        like.style.opacity = Math.max(0, Math.min(1, dx / 80));
        nope.style.opacity = Math.max(0, Math.min(1, -dx / 80));
      });
      const release = () => {
        if (!dragging) return;
        dragging = false;
        if (Math.abs(dx) > 100) {
          commit(dx > 0);
        } else {
          card.style.transition = "transform .25s ease";
          card.style.transform = "";
          setTimeout(() => { if (card) card.style.transition = ""; }, 250);
        }
        dx = 0;
      };
      card.addEventListener("pointerup", release);
      card.addEventListener("pointercancel", release);
    }

    function commit(liked) {
      const card = document.getElementById("swipe-card-active");
      if (!card || !currentId) return;
      const id = currentId;
      card.style.transition = "transform .35s ease, opacity .35s ease";
      card.style.transform = `translateX(${(liked ? 1 : -1) * 600}px) rotate(${liked ? 20 : -20}deg)`;
      card.style.opacity = "0";
      decide(id, liked);
      setTimeout(renderDeck, 260);
    }

    btnYes.addEventListener("click", () => currentId && commit(true));
    btnNo.addEventListener("click", () => currentId && commit(false));

    async function decide(id, liked) {
      const item = allResults.find((r) => r.id === id);
      if (!item) return;
      item.interet = liked;
      item.vu = true;
      renderResults();
      const { error } = await supa.from("job_results").update({ interet: liked, vu: true }).eq("id", id);
      if (error) console.error("swipe:", error);
    }
  }

  {
    const { data, error } = await supa
      .from("job_results")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) console.error("resultats:", error);
    allResults = data || [];
    exportBtn.disabled = !allResults.length;
    renderResults();
    initSwipe();
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
})();
