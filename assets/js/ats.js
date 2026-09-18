/**
 * Scanner ATS : verifie que le CV est lisible par les filtres automatiques
 * de recrutement (ATS). Heuristique indicative, executee entierement dans
 * le navigateur (aucun envoi du contenu du CV a un serveur tiers).
 *
 * Chaque verification renvoie un conseil concret : le score seul ne dit pas
 * quoi corriger, c'est le detail qui sert a quelque chose.
 *
 * Expose window.scanCV(blob, filename, jobKeywordsText) -> Promise<resultat>
 * resultat = {
 *   score, niveau,
 *   checks: [{ label, pass, poids, detail, action }],
 *   aRegarder: [...checks en echec, tries par poids decroissant]
 * }
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

  /**
   * Extraction PDF. On garde au passage la position horizontale de chaque
   * fragment de texte : c'est ce qui permet de reperer une mise en page en
   * deux colonnes, que la plupart des ATS lisent de travers (ils aplatissent
   * la page ligne par ligne et melangent les deux colonnes).
   */
  async function extrairePdf(arrayBuffer) {
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let texte = "";
    const positions = []; // { x, largeurPage } par fragment
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const largeurPage = page.getViewport({ scale: 1 }).width;
      const contenu = await page.getTextContent();
      contenu.items.forEach((it) => {
        if (it.str && it.str.trim() && it.transform) {
          positions.push({ x: it.transform[4], largeurPage });
        }
      });
      texte += contenu.items.map((it) => it.str).join(" ") + "\n";
    }
    return { texte, positions };
  }

  async function extraireDocx(arrayBuffer) {
    const resultat = await mammoth.extractRawText({ arrayBuffer });
    return { texte: resultat.value || "", positions: [] };
  }

  /**
   * Deux colonnes ? On regarde si une part significative du texte demarre
   * dans la moitie droite de la page alors qu'une autre part demarre a
   * gauche. Un CV sur une seule colonne a presque tous ses debuts de ligne
   * cales a gauche.
   */
  function detecterDeuxColonnes(positions) {
    if (positions.length < 40) return false;
    let gauche = 0;
    let droite = 0;
    positions.forEach((p) => {
      const ratio = p.x / p.largeurPage;
      if (ratio < 0.35) gauche++;
      else if (ratio > 0.5) droite++;
    });
    const total = positions.length;
    return gauche / total > 0.25 && droite / total > 0.25;
  }

  const SECTIONS = [
    { nom: "Experience", variantes: ["experience", "parcours professionnel", "experiences professionnelles"] },
    { nom: "Formation", variantes: ["formation", "education", "diplome", "etudes", "scolarite"] },
    { nom: "Competences", variantes: ["competence", "competences", "skills", "savoir-faire"] },
    { nom: "Contact", variantes: ["contact", "coordonnees", "me contacter"] },
  ];

  function verifierSections(texteNorm) {
    const trouvees = [];
    const manquantes = [];
    SECTIONS.forEach((s) => {
      if (s.variantes.some((v) => texteNorm.includes(v))) trouvees.push(s.nom);
      else manquantes.push(s.nom);
    });
    return { trouvees, manquantes };
  }

  function verifierContact(texte) {
    const email = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(texte);
    const tel = /(?:\+33|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}/.test(texte);
    return { email, tel };
  }

  function extraireMotsCles(jobKeywordsText) {
    return (jobKeywordsText || "")
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((brut) => ({ brut, norm: normaliser(brut) }));
  }

  function listeLisible(items, max) {
    const visibles = items.slice(0, max);
    const reste = items.length - visibles.length;
    let texte = visibles.join(", ");
    if (reste > 0) texte += ` et ${reste} autre${reste > 1 ? "s" : ""}`;
    return texte;
  }

  async function scanCV(blob, filename, jobKeywordsText) {
    const ext = (filename || "").toLowerCase().split(".").pop();
    const checks = [];

    if (ext === "doc") {
      return {
        score: null,
        niveau: "inconnu",
        checks: [],
        aRegarder: [],
        blocage: {
          label: "Format .doc (ancien) non analysable ici",
          action:
            "Ouvre le fichier puis enregistre-le en PDF ou en .docx, et redepose-le. " +
            "Le vieux format .doc pose aussi probleme a beaucoup d'ATS, donc ce n'est pas " +
            "qu'une limite du scanner : autant en profiter pour le convertir.",
        },
      };
    }

    let texte = "";
    let positions = [];
    let extractionOk = false;

    try {
      const buffer = await blob.arrayBuffer();
      if (ext === "pdf") {
        const r = await extrairePdf(buffer);
        texte = r.texte;
        positions = r.positions;
      } else if (ext === "docx") {
        const r = await extraireDocx(buffer);
        texte = r.texte;
      }
      extractionOk = texte.trim().length > 200;
    } catch (erreur) {
      extractionOk = false;
    }

    let score = 0;
    const texteNorm = normaliser(texte);

    // ----------------------------------------------------------------
    // 1. Texte extractible (35 pts). Le point le plus bloquant : un CV
    //    exporte en image ne contient litteralement rien a lire.
    // ----------------------------------------------------------------
    if (extractionOk) {
      score += 35;
      checks.push({
        label: "Le texte de ton CV est lisible par une machine",
        pass: true,
        poids: 35,
        detail: "Un ATS peut recuperer le contenu, c'est la base et elle est acquise.",
      });
    } else {
      checks.push({
        label: "Aucun texte exploitable dans le fichier",
        pass: false,
        poids: 35,
        detail:
          "Ton CV est presque surement une image : scan, photo, ou export a plat " +
          "depuis un outil de design (Canva, Figma, Illustrator). Pour un ATS, " +
          "cette page est vide, donc ta candidature ne remonte sur aucune recherche.",
        action:
          "Verifie d'abord : ouvre le PDF et essaie de selectionner ton nom a la souris. " +
          "Si rien ne se surligne, c'est une image. Reexporte depuis l'outil d'origine " +
          "en cochant \"texte selectionnable\" ou \"ne pas vectoriser les polices\", " +
          "ou refais une version dans Word, Google Docs ou Pages.",
      });
    }

    // ----------------------------------------------------------------
    // 2. Mise en page sur une colonne (10 pts), PDF uniquement.
    // ----------------------------------------------------------------
    if (extractionOk && ext === "pdf") {
      const deuxColonnes = detecterDeuxColonnes(positions);
      if (deuxColonnes) {
        checks.push({
          label: "Mise en page sur deux colonnes detectee",
          pass: false,
          poids: 10,
          detail:
            "Beaucoup d'ATS lisent la page ligne par ligne, de gauche a droite. " +
            "Avec deux colonnes, ils collent bout a bout un morceau de la colonne " +
            "gauche et un morceau de la droite : tes intitules de poste se retrouvent " +
            "melanges a ta liste de logiciels, et plus rien n'est comprehensible.",
          action:
            "Pour les depots sur plateforme, garde une seule colonne du haut en bas. " +
            "Tu peux conserver ta version deux colonnes pour les envois directs par mail.",
        });
      } else {
        score += 10;
        checks.push({
          label: "Mise en page sur une seule colonne",
          pass: true,
          poids: 10,
          detail: "L'ordre de lecture est clair, un ATS ne melangera pas tes rubriques.",
        });
      }
    } else if (extractionOk) {
      // .docx : on ne sait pas juger la mise en page, on ne penalise pas.
      score += 10;
    }

    // ----------------------------------------------------------------
    // 3. Mots-cles (25 pts) : recouvrement avec les intitules vises.
    // ----------------------------------------------------------------
    const motsCles = extraireMotsCles(jobKeywordsText);
    if (extractionOk && motsCles.length) {
      const trouves = motsCles.filter((m) => texteNorm.includes(m.norm));
      const manquants = motsCles.filter((m) => !texteNorm.includes(m.norm));
      const ratio = trouves.length / motsCles.length;
      score += Math.round(25 * ratio);
      if (manquants.length) {
        checks.push({
          label: `${trouves.length}/${motsCles.length} de tes mots-cles apparaissent dans le CV`,
          pass: ratio >= 0.5,
          poids: 25,
          detail: `Absents du CV : ${listeLisible(manquants.map((m) => m.brut), 6)}.`,
          action:
            "Un ATS cherche des correspondances litterales, pas des synonymes. " +
            "Si tu vises vraiment ces postes, reprends leur intitule exact quelque part " +
            "dans le CV : titre en haut, resume de profil, ou libelle d'une experience. " +
            "Ne recopie que ce que tu sais faire, un mot-cle qui ne tient pas en entretien " +
            "se retourne contre toi.",
        });
      } else {
        checks.push({
          label: "Tous tes mots-cles apparaissent dans le CV",
          pass: true,
          poids: 25,
          detail: "Le vocabulaire de ton CV colle a ce que tu cherches.",
        });
      }
    } else if (extractionOk) {
      checks.push({
        label: "Aucun mot-cle renseigne dans ton profil",
        pass: false,
        poids: 25,
        detail:
          "Sans intitules de poste vises, impossible de dire si le vocabulaire de ton " +
          "CV correspond a ta cible. C'est aussi ce qui sert a noter les offres.",
        action:
          "Remplis \"Ce que tu cherches\" un peu plus haut, une idee par ligne, " +
          "avec les intitules tels qu'ils sont ecrits dans les offres, puis relance le scan.",
      });
    }

    // ----------------------------------------------------------------
    // 4. Sections standards (15 pts).
    // ----------------------------------------------------------------
    if (extractionOk) {
      const { trouvees, manquantes } = verifierSections(texteNorm);
      score += Math.round((15 * trouvees.length) / SECTIONS.length);
      if (manquantes.length) {
        checks.push({
          label: `${trouvees.length}/${SECTIONS.length} rubriques standards reperees`,
          pass: manquantes.length <= 1,
          poids: 15,
          detail: `Introuvables sous un intitule classique : ${manquantes.join(", ")}.`,
          action:
            "Les ATS decoupent le CV a partir des titres de rubriques. Un titre " +
            "original (\"Mon parcours\", \"Ce qui m'anime\") n'est pas reconnu et le " +
            "contenu qui suit est mal range. Utilise les mots attendus : Experience " +
            "professionnelle, Formation, Competences, Contact.",
        });
      } else {
        checks.push({
          label: "Rubriques standards toutes presentes",
          pass: true,
          poids: 15,
          detail: "Experience, formation, competences et contact sont identifiables.",
        });
      }
    }

    // ----------------------------------------------------------------
    // 5. Coordonnees (15 pts) : sans elles, le dossier est inexploitable.
    // ----------------------------------------------------------------
    if (extractionOk) {
      const { email, tel } = verifierContact(texte);
      if (email) score += 8;
      if (tel) score += 7;

      if (email && tel) {
        checks.push({
          label: "Email et telephone detectes",
          pass: true,
          poids: 15,
          detail: "Un recruteur peut te joindre sans avoir a chercher.",
        });
      } else {
        const absents = [!email && "email", !tel && "telephone"].filter(Boolean);
        checks.push({
          label: `Coordonnees incompletes : ${absents.join(" et ")} introuvable${absents.length > 1 ? "s" : ""}`,
          pass: false,
          poids: 15,
          detail:
            "Souvent le meme piege : les coordonnees sont dans l'en-tete du document, " +
            "dans un pied de page, ou dans un petit bloc image. Ces zones sont ignorees " +
            "par une bonne partie des ATS.",
          action:
            "Ecris ton email et ton telephone en texte simple, dans le corps de la page, " +
            "juste sous ton nom. Numero au format 06 12 34 56 78 ou +33 6 12 34 56 78.",
        });
      }
    }

    // ----------------------------------------------------------------
    // 6. Longueur (bonus informatif, non note) : un CV trop court est
    //    souvent le signe d'une extraction partielle.
    // ----------------------------------------------------------------
    const nbMots = texte.trim().split(/\s+/).filter(Boolean).length;
    if (extractionOk && nbMots < 180) {
      checks.push({
        label: "Tres peu de texte recupere (" + nbMots + " mots)",
        pass: false,
        poids: 0,
        detail:
          "Soit le CV est vraiment tres succinct, soit une partie du contenu est dans " +
          "des images ou des zones de texte que l'extraction ne voit pas.",
        action:
          "Compare avec ton fichier : si des paragraphes entiers manquent a l'appel, " +
          "c'est qu'ils sont dans un bloc non textuel, a reprendre en texte normal.",
      });
    }

    let niveau = "bad";
    if (score >= 75) niveau = "good";
    else if (score >= 45) niveau = "warn";

    const aRegarder = checks
      .filter((c) => !c.pass)
      .sort((a, b) => b.poids - a.poids);

    return { score, niveau, checks, aRegarder };
  }

  window.scanCV = scanCV;
})();
