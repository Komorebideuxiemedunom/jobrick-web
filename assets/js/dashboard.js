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

  // Identite Discord recuperee automatiquement si l'utilisateur s'est
  // connecte via ce provider. Sinon il devra coller son identifiant a la
  // main pour que le bot puisse le DM (cf. discord-manual-block).
  const discordIdentity = (user.identities || []).find((i) => i.provider === "discord");
  const discordAutoId = discordIdentity?.identity_data?.provider_id || null;
  const discordAutoName = discordIdentity?.identity_data?.full_name || discordIdentity?.identity_data?.name || null;

  function renderDiscordSection(checked) {
    document.getElementById("discord-connected-badge").hidden = !(checked && discordAutoId);
    document.getElementById("discord-connected-name").textContent = discordAutoName || "";
    document.getElementById("discord-manual-block").hidden = !(checked && !discordAutoId);
  }

  if (profile) {
    document.getElementById("job-keywords").value = profile.job_keywords || "";
    document.getElementById("notify-email").checked = profile.notify_email ?? true;
    document.getElementById("notify-discord").checked = profile.notify_discord ?? false;
    document.getElementById("discord-user-id").value = discordAutoId ? "" : (profile.discord_user_id || "");
    renderDiscordSection(document.getElementById("notify-discord").checked);
    if (profile.cv_filename) {
      showCvFilled(profile.cv_filename);
    }
  }

  document.getElementById("notify-discord").addEventListener("change", (e) => {
    renderDiscordSection(e.target.checked);
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

  /**
   * Supabase Storage refuse les clefs contenant autre chose que de l'ASCII
   * (accents, emoji, caracteres exotiques) : l'upload repond "Invalid key" et
   * l'enregistrement echoue en entier. Un CV nomme "CV Ruiz-Noemie 2026.pdf"
   * avec un accent suffit a tout bloquer, donc on assainit le nom avant de
   * s'en servir comme chemin. Le nom d'origine, lui, reste affiche a l'ecran
   * et stocke dans profiles.cv_filename.
   */
  function nomDeFichierSur(nom) {
    const brut = (nom || "cv.pdf").trim();
    const point = brut.lastIndexOf(".");
    const base = point > 0 ? brut.slice(0, point) : brut;
    const ext = point > 0 ? brut.slice(point + 1).toLowerCase() : "pdf";

    const baseSure = base
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")   // enleve les accents
      .replace(/[^a-zA-Z0-9._-]+/g, "-")  // tout le reste devient un tiret
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80);

    const extSure = ext.replace(/[^a-z0-9]/g, "").slice(0, 8) || "pdf";
    return `${baseSure || "cv"}.${extSure}`;
  }

  function handleCvFile(file) {
    const okTypes = [".pdf", ".doc", ".docx"];
    const ok = okTypes.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!ok) {
      cvStatus.textContent = "Format non reconnu : PDF, DOC ou DOCX uniquement.";
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
  const map = L.map("map", {
    zoomControl: false,
    scrollWheelZoom: false, // la molette fait defiler la page, pas zoomer la carte
  }).setView([46.6, 2.5], 5); // centre France

  /**
   * Fond de carte : OpenFreeMap "positron", vectoriel et sans clef d'API.
   * Tres pale, net a tous les zooms, et il garde les noms de villes lisibles,
   * ce qui compte pour poser ses zones. Le fond OSM par defaut (routes jaunes,
   * forets vertes, hachures partout) se bagarrait avec la charte et noyait les
   * cercles mauves.
   *
   * Le vectoriel demande WebGL : si le navigateur ne suit pas, on retombe sur
   * un fond raster gris clair plutot que sur une carte blanche.
   */
  function poserFondDeCarte(m) {
    const credits =
      '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> ' +
      '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> ' +
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

    if (typeof L.maplibreGL === "function" && window.WebGLRenderingContext) {
      try {
        L.maplibreGL({
          style: "https://tiles.openfreemap.org/styles/positron",
          attribution: credits,
        }).addTo(m);
        return;
      } catch (_) { /* WebGL indisponible : on prend le fond raster */ }
    }

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, attribution: "Fond de carte Esri, HERE, Garmin, OpenStreetMap" }
    ).addTo(m);
  }
  poserFondDeCarte(map);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  const ACCENT = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#8C4A94";

  // Pastille maison a la place du gros marqueur bleu de Leaflet, qui jurait
  // avec le reste de la page.
  const iconeZone = L.divIcon({
    className: "zone-pin",
    html: '<span class="zone-pin-dot"></span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  /**
   * Sur telephone, un doigt pose sur la carte deplace la carte et non la
   * page : on reste bloque a mi-parcours sans comprendre pourquoi. La carte
   * demarre donc inerte, sous un voile qui dit comment la reveiller, et se
   * rendort des qu'on touche ailleurs.
   */
  function initCarteTactile() {
    const tactile = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (!tactile) return;

    const voile = document.createElement("button");
    voile.type = "button";
    voile.className = "map-voile";
    voile.innerHTML = "<span>Touche la carte pour la deplacer</span>";
    document.getElementById("map").appendChild(voile);

    const gestes = [map.dragging, map.touchZoom, map.doubleClickZoom];
    let eveillee = false;

    function endormir() {
      if (!eveillee) return;
      eveillee = false;
      gestes.forEach((g) => g.disable());
      voile.hidden = false;
    }

    gestes.forEach((g) => g.disable());

    voile.addEventListener("click", () => {
      eveillee = true;
      gestes.forEach((g) => g.enable());
      voile.hidden = true;
    });

    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest("#map")) endormir();
    });
  }
  initCarteTactile();

  let zones = []; // {id?, label, lat, lng, rayon_km, marker, circle}

  function addZoneMarker(zone) {
    const marker = L.marker([zone.lat, zone.lng], { draggable: true, icon: iconeZone }).addTo(map);
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.rayon_km * 1000,
      color: ACCENT,
      weight: 1.5,
      fillColor: ACCENT,
      fillOpacity: 0.1,
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

  // Recherche de ville par texte, en plus du clic sur la carte : meme
  // resultat (addZoneMarker), juste un autre point d'entree.
  {
    const input = document.getElementById("zone-search-input");
    const resultsEl = document.getElementById("zone-search-results");
    let debounceTimer = null;
    let requestToken = 0;

    function hideResults() {
      resultsEl.hidden = true;
      resultsEl.innerHTML = "";
    }

    async function search(query) {
      const token = ++requestToken;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`
        );
        const data = await res.json();
        if (token !== requestToken) return; // une frappe plus recente a deja relance une recherche
        if (!data.length) {
          resultsEl.innerHTML = `<li class="zone-search-empty">Aucun lieu trouve.</li>`;
          resultsEl.hidden = false;
          return;
        }
        resultsEl.innerHTML = data.map((place, i) => `
          <li data-i="${i}">${escapeHtml(place.display_name)}</li>
        `).join("");
        resultsEl.hidden = false;
        resultsEl.dataset.places = JSON.stringify(data);
      } catch (_) { /* pas de connexion / API indisponible : on n'affiche rien */ }
    }

    input.addEventListener("input", () => {
      const query = input.value.trim();
      clearTimeout(debounceTimer);
      if (query.length < 3) { hideResults(); return; }
      debounceTimer = setTimeout(() => search(query), 350);
    });

    resultsEl.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-i]");
      if (!li) return;
      const places = JSON.parse(resultsEl.dataset.places || "[]");
      const place = places[Number(li.dataset.i)];
      if (!place) return;
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lon);
      const label = place.address?.city || place.address?.town || place.address?.village
        || place.address?.municipality || place.display_name.split(",")[0];
      addZoneMarker({ label, lat, lng, rayon_km: 25 });
      map.setView([lat, lng], 10);
      input.value = "";
      hideResults();
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".zone-search")) hideResults();
    });
  }

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

  // Encadre de mise en garde : le score ATS n'a pas le meme sens selon le
  // metier. Dans les filieres creatives, le CV est lu par un humain et le
  // parti pris visuel est justement l'argument, pas un defaut a corriger.
  const ATS_PORTEE_HTML = `
    <details class="ats-portee">
      <summary>Est-ce que ce score compte pour ton metier ?</summary>
      <p>
        Ce scanner mesure une seule chose : est-ce qu'un logiciel de tri
        automatique arrive a lire ton CV. Ce n'est pas une note de qualite, et
        selon le secteur ca ne pese pas du tout pareil.
      </p>
      <p>
        <strong>Le score compte vraiment</strong> quand tu postules via des
        plateformes et de gros services RH : informatique, ingenierie, finance,
        commercial, logistique, fonctions support, grands groupes, cabinets de
        recrutement et interim. La, un CV mal lu est ecarte avant meme qu'un
        humain l'ouvre.
      </p>
      <p>
        <strong>Le score compte beaucoup moins</strong> en design, direction
        artistique, illustration, architecture, mode, audiovisuel, evenementiel
        ou artisanat. Un designer qui rend un CV tout sobre en une colonne se
        prive de son meilleur argument : dans ces metiers la mise en page fait
        partie de la candidature, elle est lue par un humain, et le portfolio
        pese plus lourd que n'importe quel mot-cle. Un score bas n'y est pas un
        probleme en soi.
      </p>
      <p class="ats-portee-astuce">
        La parade si tu es dans ce cas : garde ton CV travaille pour les envois
        directs, le portfolio et les salons, et prepare a cote une version
        sobre, une colonne, texte selectionnable, uniquement pour les depots sur
        plateforme. Meme contenu, deux emballages.
      </p>
    </details>
  `;

  function atsCheckHtml(c, ouvert) {
    const icone = c.pass ? "✓" : "✕";
    const corps = [
      c.detail ? `<p class="ats-check-detail">${escapeHtml(c.detail)}</p>` : "",
      c.action ? `<p class="ats-check-action"><strong>A faire :</strong> ${escapeHtml(c.action)}</p>` : "",
    ].join("");

    if (!corps) {
      return `<li class="ats-check ${c.pass ? "is-pass" : "is-fail"}">
        <div class="ats-check-head"><span class="ats-icon">${icone}</span><span class="ats-check-label">${escapeHtml(c.label)}</span></div>
      </li>`;
    }
    return `<li class="ats-check ${c.pass ? "is-pass" : "is-fail"}">
      <details ${ouvert ? "open" : ""}>
        <summary class="ats-check-head"><span class="ats-icon">${icone}</span><span class="ats-check-label">${escapeHtml(c.label)}</span></summary>
        ${corps}
      </details>
    </li>`;
  }

  function renderAtsResult(resultat) {
    atsPanel.hidden = false;

    // Format non analysable ici : un seul message, pas de score.
    if (resultat.score === null) {
      const b = resultat.blocage || {};
      atsPanel.innerHTML = `
        <p class="ats-blocage"><strong>${escapeHtml(b.label || "Analyse impossible")}</strong></p>
        ${b.action ? `<p class="ats-check-action">${escapeHtml(b.action)}</p>` : ""}
        ${ATS_PORTEE_HTML}
      `;
      return;
    }

    const niveauLabel = {
      good: "Lisible par un ATS",
      warn: "Lisible, avec des reserves",
      bad: "Risque d'etre mal lu",
    }[resultat.niveau];

    // On rededuit la liste depuis les checks plutot que de faire confiance a
    // resultat.aRegarder : le panneau et le score restent d'accord entre eux
    // meme si le scanner evolue.
    const aRegarder = resultat.checks
      .filter((c) => !c.pass)
      .sort((a, b) => (b.poids || 0) - (a.poids || 0));
    const reussis = resultat.checks.filter((c) => c.pass);
    const resume = aRegarder.length
      ? `${aRegarder.length} point${aRegarder.length > 1 ? "s" : ""} a corriger, du plus penalisant au moins genant.`
      : "Rien a corriger cote lisibilite machine.";

    atsPanel.innerHTML = `
      <div class="ats-score-row">
        <div class="ats-score-badge is-${resultat.niveau}">${resultat.score}</div>
        <div class="ats-score-label">
          <strong>${niveauLabel}</strong><br>
          Score de lisibilite sur 100. ${escapeHtml(resume)}
        </div>
      </div>

      ${aRegarder.length ? `
        <h4 class="ats-group-title">Ce qu'il faut ameliorer</h4>
        <p class="ats-group-sub">Touche une ligne pour voir quoi changer, et pourquoi.</p>
        <ul class="ats-checks">${aRegarder.map((c, i) => atsCheckHtml(c, i === 0)).join("")}</ul>
      ` : ""}

      ${reussis.length ? `
        <h4 class="ats-group-title">Ce qui passe deja</h4>
        <ul class="ats-checks">${reussis.map((c) => atsCheckHtml(c, false)).join("")}</ul>
      ` : ""}

      ${ATS_PORTEE_HTML}

      <p class="ats-note">
        Analyse indicative, calculee dans ton navigateur : aucun contenu de ton
        CV n'est envoye ailleurs. Elle ne garantit pas le passage d'un vrai ATS,
        chaque editeur a ses propres regles, mais elle repere les blocages les
        plus courants.
      </p>
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
  /**
   * Les erreurs Supabase sont ecrites pour un developpeur : "Invalid key:
   * 8508.../1789..._CV.pdf" ne dit rien a personne et, sur mobile, ce pave
   * rouge occupe la moitie de l'ecran. On les traduit en une phrase courte
   * qui dit quoi faire, le detail technique reste dans la console.
   */
  function messageErreurLisible(err) {
    const brut = (err && (err.message || err.error_description)) || "";
    const b = brut.toLowerCase();

    if (b.includes("invalid key")) {
      return "Le nom de ton fichier bloque l'envoi. Renomme-le simplement (lettres, chiffres et tirets) puis reessaie.";
    }
    if (b.includes("payload too large") || b.includes("entity too large") || b.includes("exceeded the maximum")) {
      return "Fichier trop lourd pour l'envoi. Allege ton CV ou reexporte-le en PDF compresse.";
    }
    if (b.includes("row-level security") || b.includes("jwt") || b.includes("not authenticated")) {
      return "Ta session a expire. Reconnecte-toi, puis enregistre de nouveau.";
    }
    if (b.includes("failed to fetch") || b.includes("networkerror") || b.includes("network request failed")) {
      return "Connexion perdue pendant l'enregistrement. Verifie ton reseau et reessaie.";
    }
    if (b.includes("bucket not found")) {
      return "L'espace de stockage des CV n'est pas accessible. Reessaie dans un moment.";
    }
    return "L'enregistrement n'a pas abouti. Reessaie dans un moment.";
  }

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

    const discordUserId = discordAutoId || document.getElementById("discord-user-id").value.trim();
    if (discordUserId && !/^\d{15,25}$/.test(discordUserId)) {
      saveStatus.textContent = "ID Discord invalide : ce sont uniquement des chiffres (ex. 123456789012345678).";
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
        const path = `${user.id}/${Date.now()}_${nomDeFichierSur(pendingCvFile.name)}`;
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
        discord_user_id: discordUserId || null,
        discord_username: discordAutoName || profile?.discord_username || null,
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
      saveStatus.textContent = messageErreurLisible(err);
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
    const nouvelles = visibles.filter((r) => !r.vu).length;
    const semaine = visibles.filter((r) => r.vu && new Date(r.created_at).getTime() >= semaineDepuis).length;

    document.getElementById("stat-nouvelles").textContent = nouvelles;
    document.getElementById("stat-semaine").textContent = semaine;
    document.getElementById("stat-attente").textContent = visibles.filter((r) => r.postule).length;

    // "1 nouvelles offres" se lisait mal : les libelles s'accordent au compte.
    document.getElementById("stat-nouvelles-label").textContent =
      nouvelles > 1 ? "nouvelles offres" : "nouvelle offre";
    document.getElementById("stat-semaine-label").textContent =
      semaine > 1 ? "vues cette semaine" : "vue cette semaine";
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
    const message = `Bonjour, je me permets de relancer suite a ma candidature pour le poste de ${r.titre || "..."} chez ${r.employeur || "..."}. Je reste tres interesse(e) et disponible pour en echanger. Bonne journee.`;
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
        : `<p class="empty-state">Rien pour l'instant : la veille tourne deux fois par jour, reviens un peu plus tard.</p>`;
      updateStats();
      return;
    }

    resultsContainer.innerHTML = list.map((r) => `
      <div class="result-item ${r.vu ? "" : "is-new"}" data-id="${r.id}">
        <a class="result-link" href="${escapeHtml(r.url || "#")}" target="_blank" rel="noopener noreferrer">
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
