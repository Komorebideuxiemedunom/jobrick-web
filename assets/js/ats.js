/**
 * Scanner ATS : verifie que le CV est lisible par les filtres automatiques
 * de recrutement (ATS). Heuristique indicative, executee entierement dans
 * le navigateur (aucun envoi du contenu du CV a un serveur tiers).
 *
 * Expose window.scanCV(blob, filename, jobKeywordsText) -> Promise<resultat>
 * resultat = { score, niveau, checks: [{label, pass, detail}] }
 */
(function () {
  "use strict";

  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js";
  }

  function normaliser(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  async function extrairePdf(arrayBuffer) {
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let texte = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const contenu = await page.getTextContent();
      texte += contenu.items.map((it) => it.str).join(" ") + "\n";
    }
    return texte;
  }

  async function extraireDocx(arrayBuffer) {
    const resultat = await mammoth.extractRawText({ arrayBuffer });
    return resultat.value || "";
  }

  const SECTIONS = [
    ["experience", "parcours professionnel", "experience professionnelle"],
    ["formation", "education", "diplome", "etudes"],
    ["competence", "competences", "skills"],
    ["contact", "coordonnees"],
  ];

  function verifierSections(texteNorm) {
    let trouvees = 0;
    SECTIONS.forEach((variantes) => {
      if (variantes.some((v) => texteNorm.includes(v))) trouvees++;
    });
    return trouvees;
  }

  function verifierContact(texte) {
    const email = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(texte);
    const tel = /(?:\+33|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}/.test(texte);
    return { email, tel };
  }

  function extraireMotsCles(jobKeywordsText) {
    return (jobKeywordsText || "")
      .split(/[\n,]/)
      .map((s) => normaliser(s.trim()))
      .filter(Boolean);
  }

  async function scanCV(blob, filename, jobKeywordsText) {
    const ext = (filename || "").toLowerCase().split(".").pop();
    const checks = [];
    let texte = "";
    let extractionOk = false;

    if (ext === "doc") {
      checks.push({
        label: "Format .doc (ancien) non analysable dans le navigateur",
        pass: false,
        detail: "Convertis-le en PDF ou .docx pour un scan complet.",
      });
      return { score: null, niveau: "inconnu", checks };
    }

    try {
      const buffer = await blob.arrayBuffer();
      if (ext === "pdf") {
        texte = await extrairePdf(buffer);
      } else if (ext === "docx") {
        texte = await extraireDocx(buffer);
      }
      extractionOk = texte.trim().length > 200;
    } catch (erreur) {
      extractionOk = false;
    }

    let score = 0;

    // 1. Texte extractible (40 pts) : sinon le CV est probablement une
    // image scannee, illisible par un ATS.
    checks.push({
      label: extractionOk
        ? "Texte du CV lisible par une machine"
        : "Aucun texte exploitable trouve (CV probablement scanne en image)",
      pass: extractionOk,
    });
    if (extractionOk) score += 40;

    const texteNorm = normaliser(texte);

    // 2. Mots-cles (30 pts) : recouvrement avec les intitules/mots-cles
    // vises dans le profil.
    const motsCles = extraireMotsCles(jobKeywordsText);
    let ratioMots = 0;
    if (extractionOk && motsCles.length) {
      const trouves = motsCles.filter((m) => texteNorm.includes(m));
      ratioMots = trouves.length / motsCles.length;
      const pass = ratioMots >= 0.4;
      checks.push({
        label: pass
          ? `${trouves.length}/${motsCles.length} mots-cles de ton profil retrouves dans le CV`
          : `Seulement ${trouves.length}/${motsCles.length} mots-cles de ton profil retrouves dans le CV`,
        pass,
      });
      score += Math.round(30 * ratioMots);
    } else if (extractionOk) {
      checks.push({ label: "Aucun mot-cle renseigne dans ton profil pour comparer", pass: false });
    }

    // 3. Sections standards (15 pts)
    if (extractionOk) {
      const nbSections = verifierSections(texteNorm);
      const pass = nbSections >= 2;
      checks.push({
        label: pass
          ? "Sections standards detectees (experience, formation, competences...)"
          : "Peu de sections standards detectees — utilise des intitules classiques",
        pass,
      });
      score += Math.round(15 * Math.min(nbSections, 4) / 4);
    }

    // 4. Coordonnees de contact (15 pts)
    if (extractionOk) {
      const { email, tel } = verifierContact(texte);
      checks.push({ label: "Adresse email detectee", pass: email });
      checks.push({ label: "Numero de telephone detecte", pass: tel });
      score += (email ? 8 : 0) + (tel ? 7 : 0);
    }

    let niveau = "bad";
    if (score >= 75) niveau = "good";
    else if (score >= 45) niveau = "warn";

    return { score, niveau, checks };
  }

  window.scanCV = scanCV;
})();
