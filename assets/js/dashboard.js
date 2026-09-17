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
    if (profile.cv_filename) {
      showCvFilled(profile.cv_filename);
    }
  }

  document.getElementById("notify-discord").addEventListener("change", (e) => {
    document.getElementById("discord-webhook").hidden = !e.target.checked;
  });

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
      color: "#4F46E5",
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
  }

  function removeZone(zone) {
    map.removeLayer(zone.marker);
    map.removeLayer(zone.circle);
    zones = zones.filter((z) => z !== zone);
    renderZonesList();
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
  // Enregistrer
  // ------------------------------------------------------------------
  document.getElementById("btn-save").addEventListener("click", async () => {
    const saveStatus = document.getElementById("save-status");
    saveStatus.textContent = "Enregistrement…";
    saveStatus.className = "field-status";

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

      pendingCvFile = null;
      saveStatus.textContent = "Enregistre ✓";
      saveStatus.className = "field-status field-status-ok";
    } catch (err) {
      console.error(err);
      saveStatus.textContent = "Erreur : " + err.message;
      saveStatus.className = "field-status field-status-error";
    }
  });

  // ------------------------------------------------------------------
  // Resultats
  // ------------------------------------------------------------------
  {
    const { data, error } = await supa
      .from("job_results")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    const container = document.getElementById("results-list");
    if (error) {
      console.error("resultats:", error);
    }
    if (!data || !data.length) {
      container.innerHTML = `<p class="empty-state">Rien pour l'instant — la veille tourne deux fois par jour, reviens un peu plus tard.</p>`;
    } else {
      container.innerHTML = data.map((r) => `
        <a class="result-item" href="${r.url}" target="_blank" rel="noopener noreferrer">
          <div class="result-score">${r.score ?? "–"}</div>
          <div class="result-body">
            <div class="result-title">${escapeHtml(r.titre || "Sans titre")}</div>
            <div class="result-meta">${escapeHtml(r.employeur || "")} · ${escapeHtml(r.lieu || "")}</div>
            ${r.raison ? `<div class="result-reason">${escapeHtml(r.raison)}</div>` : ""}
          </div>
        </a>
      `).join("");
    }
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
})();
