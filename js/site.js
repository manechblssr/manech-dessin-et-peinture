/* ============================================================
   Manech — interactions discrètes, zéro dépendance
   Filtres de galerie · carrousel scroll-snap · visionneuse
   Respecte prefers-reduced-motion.
   ============================================================ */
(function () {
  "use strict";

  var reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function normal(s) {
    return (s || "").toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  /* ---------- apparitions au défilement ---------- */
  var vignettes = document.querySelectorAll(".vignette");
  if (vignettes.length && !reduit && "IntersectionObserver" in window) {
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          obs.unobserve(e.target);
        }
      });
    }, { rootMargin: "120px 0px" });
    vignettes.forEach(function (v) { obs.observe(v); });
  } else {
    vignettes.forEach(function (v) { v.classList.add("visible"); });
  }

  /* ---------- carrousel (page d'œuvre) ---------- */
  var carrousel = document.querySelector("[data-carrousel]");
  var nbVisuels = 0;
  var aller = function () {};
  var majCarrousel = function () {};

  if (carrousel) {
    var pistes = carrousel.querySelector(".pistes");
    var slides = Array.prototype.slice.call(
      carrousel.querySelectorAll(".visuel"));
    var points = Array.prototype.slice.call(
      carrousel.querySelectorAll(".points button"));
    var compteur = carrousel.querySelector(".compteur");
    /* p.legende uniquement : les <li> portent aussi data-legende (lecture) */
    var legende = carrousel.querySelector("p.legende");
    var btnPrec = carrousel.querySelector("[data-prec]");
    var btnSuiv = carrousel.querySelector("[data-suiv]");
    nbVisuels = slides.length;

    var courant = function () {
      var l = pistes.scrollLeft;
      var c = Math.max(1, pistes.clientWidth);
      return Math.max(0, Math.min(nbVisuels - 1, Math.round(l / c)));
    };

    var cible = 0;      /* position visée (cumule les pressions rapides) */
    var prog = false;   /* défilement programmático en cours */

    majCarrousel = function () {
      var i = courant();
      if (!prog) {
        cible = i;
      } else if (Math.abs(pistes.scrollLeft - cible * pistes.clientWidth) <= 2) {
        prog = false;   /* arrivé à la position visée */
      }
      points.forEach(function (p, k) {
        if (k === i) { p.setAttribute("aria-current", "true"); }
        else { p.removeAttribute("aria-current"); }
      });
      if (compteur) { compteur.textContent = (i + 1) + " / " + nbVisuels; }
      if (legende) {
        legende.textContent = slides[i].getAttribute("data-legende") || "";
      }
      if (btnPrec) { btnPrec.disabled = i === 0; }
      if (btnSuiv) { btnSuiv.disabled = i === nbVisuels - 1; }
    };

    /* position de référence : la cible si une animation est en cours,
       sinon la position réelle (swipe de l'utilisateur) */
    var positionCourante = function () {
      return prog ? cible : courant();
    };

    aller = function (i) {
      i = Math.max(0, Math.min(nbVisuels - 1, i));
      prog = true;
      cible = i;
      pistes.scrollTo({
        left: i * pistes.clientWidth,
        behavior: reduit ? "auto" : "smooth"
      });
    };

    var attente = false;
    pistes.addEventListener("scroll", function () {
      if (attente) { return; }
      attente = true;
      window.requestAnimationFrame(function () {
        attente = false;
        majCarrousel();
      });
    });
    if (btnPrec) {
      btnPrec.addEventListener("click", function () {
        aller(positionCourante() - 1);
      });
    }
    if (btnSuiv) {
      btnSuiv.addEventListener("click", function () {
        aller(positionCourante() + 1);
      });
    }
    points.forEach(function (p, k) {
      p.addEventListener("click", function () { aller(k); });
    });
    window.addEventListener("resize", majCarrousel);
    majCarrousel();
  }

  /* ---------- visionneuse plein écran ---------- */
  var lb = document.querySelector("[data-lightbox]");
  var lbOuverte = false;
  var lbIndex = 0;
  var lbVisuels = [];
  var dernierFocus = null;

  if (lb) {
    lbVisuels = Array.prototype.slice.call(
      document.querySelectorAll(".visuel")).map(function (v) {
        var im = v.querySelector("img");
        return {
          src: v.getAttribute("data-large"),
          alt: im ? im.getAttribute("alt") : "",
          legende: v.getAttribute("data-legende") || ""
        };
      });

    var lbImg = lb.querySelector(".scene img");
    var lbCompteur = lb.querySelector("[data-lb-compteur]");
    var lbTitre = lb.querySelector("[data-lb-titre]");
    var lbPrec = lb.querySelector("[data-lb-prec]");
    var lbSuiv = lb.querySelector("[data-lb-suiv]");
    var lbFermer = lb.querySelector("[data-lb-fermer]");

    var lbRendre = function () {
      var v = lbVisuels[lbIndex];
      lbImg.removeAttribute("src");
      lbImg.setAttribute("src", v.src);
      lbImg.setAttribute("alt", v.alt);
      lbImg.classList.remove("zoomee");
      lbImg.style.transform = "";
      lbImg.style.transformOrigin = "";
      if (lbCompteur) {
        lbCompteur.textContent = (lbIndex + 1) + " / " + lbVisuels.length;
      }
      if (lbTitre) { lbTitre.textContent = v.legende; }
      var seul = lbVisuels.length < 2;
      if (lbPrec) { lbPrec.disabled = seul || lbIndex === 0; }
      if (lbSuiv) {
        lbSuiv.disabled = seul || lbIndex === lbVisuels.length - 1;
      }
    };

    var lbOuvrir = function (i) {
      if (!lbVisuels.length) { return; }
      lbIndex = Math.max(0, Math.min(lbVisuels.length - 1, i));
      lbOuverte = true;
      dernierFocus = document.activeElement;
      lb.classList.add("ouverte");
      lb.setAttribute("aria-hidden", "false");
      document.body.classList.add("verrouillee");
      lbRendre();
      if (lbFermer) { lbFermer.focus(); }
    };

    var lbFermerFn = function () {
      lbOuverte = false;
      lb.classList.remove("ouverte");
      lb.setAttribute("aria-hidden", "true");
      document.body.classList.remove("verrouillee");
      if (dernierFocus && dernierFocus.focus) { dernierFocus.focus(); }
    };

    Array.prototype.slice.call(
      document.querySelectorAll(".visuel")).forEach(function (v, i) {
      var im = v.querySelector("img");
      if (!im) { return; }
      im.addEventListener("click", function () { lbOuvrir(i); });
      im.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          lbOuvrir(i);
        }
      });
    });

    if (lbFermer) { lbFermer.addEventListener("click", lbFermerFn); }
    if (lbPrec) {
      lbPrec.addEventListener("click", function () {
        lbIndex -= 1; lbRendre();
      });
    }
    if (lbSuiv) {
      lbSuiv.addEventListener("click", function () {
        lbIndex += 1; lbRendre();
      });
    }

    /* zoom au clic sur l'image (origine = point cliqué) */
    var scene = lb.querySelector(".scene");
    lbImg.addEventListener("click", function (e) {
      e.stopPropagation();
      if (lbImg.classList.contains("zoomee")) {
        lbImg.classList.remove("zoomee");
        lbImg.style.transform = "";
        lbImg.style.transformOrigin = "";
        return;
      }
      var r = lbImg.getBoundingClientRect();
      var ox = ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
      var oy = ((e.clientY - r.top) / Math.max(1, r.height)) * 100;
      lbImg.style.transformOrigin = ox.toFixed(1) + "% " + oy.toFixed(1) + "%";
      lbImg.style.transform = "scale(2.4)";
      lbImg.classList.add("zoomee");
    });
    /* clic sur le fond (hors image) : fermer */
    scene.addEventListener("click", function (e) {
      if (e.target === scene) { lbFermerFn(); }
    });

    /* swipe au doigt */
    var toucheX = null;
    var toucheY = null;
    scene.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) { return; }
      toucheX = e.touches[0].clientX;
      toucheY = e.touches[0].clientY;
    }, { passive: true });
    scene.addEventListener("touchend", function (e) {
      if (toucheX === null) { return; }
      var t = e.changedTouches[0];
      var dx = t.clientX - toucheX;
      var dy = t.clientY - toucheY;
      toucheX = toucheY = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) { lbIndex += 1; } else { lbIndex -= 1; }
        lbIndex = Math.max(0, Math.min(lbVisuels.length - 1, lbIndex));
        lbRendre();
      }
    }, { passive: true });

    lb.setAttribute("aria-hidden", "true");
  }

  /* ---------- clavier ---------- */
  document.addEventListener("keydown", function (e) {
    if (lbOuverte) {
      if (e.key === "Escape") { e.preventDefault(); lbFermerFn(); }
      else if (e.key === "ArrowRight") {
        e.preventDefault();
        lbIndex = Math.min(lbVisuels.length - 1, lbIndex + 1);
        lbRendre ? lbRendre() : null;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        lbIndex = Math.max(0, lbIndex - 1);
        lbRendre ? lbRendre() : null;
      }
      return;
    }
    var cible = e.target;
    if (cible && /^(INPUT|SELECT|TEXTAREA)$/.test(cible.tagName)) { return; }
    if (!carrousel || nbVisuels < 2 || typeof positionCourante !== "function") {
      return;
    }
    if (e.key === "ArrowRight") { e.preventDefault(); aller(positionCourante() + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); aller(positionCourante() - 1); }
  });

  /* ---------- filtres de galerie ---------- */
  var galerie = document.querySelector("[data-galerie]");
  if (galerie) {
    var items = Array.prototype.slice.call(
      galerie.querySelectorAll(".vignette"));
    var recherche = document.querySelector("[data-recherche]");
    var tri = document.querySelector("[data-tri]");
    var compte = document.querySelector("[data-compte]");
    var vide = document.querySelector("[data-vide]");
    var etat = { serie: "", technique: "", annee: "" };

    var correspond = function (item) {
      if (etat.serie && item.getAttribute("data-serie") !== etat.serie) {
        return false;
      }
      if (etat.technique) {
        var techs = normal(item.getAttribute("data-techniques")).split(";");
        if (techs.indexOf(etat.technique) === -1) { return false; }
      }
      if (etat.annee && item.getAttribute("data-annee") !== etat.annee) {
        return false;
      }
      if (recherche) {
        var q = normal(recherche.value.trim());
        if (q) {
          var foin = normal(item.getAttribute("data-titre") + " " +
                            item.getAttribute("data-materiel"));
          if (foin.indexOf(q) === -1) { return false; }
        }
      }
      return true;
    };

    var appliquer = function () {
      var ordre = tri ? tri.value : "recent";
      var liste = items.slice().sort(function (a, b) {
        if (ordre === "titre") {
          return a.getAttribute("data-titre")
            .localeCompare(b.getAttribute("data-titre"), "fr");
        }
        var ca = a.getAttribute("data-cle") || "";
        var cb = b.getAttribute("data-cle") || "";
        /* « Non daté » toujours en bas */
        if (!ca && !cb) { return 0; }
        if (!ca) { return 1; }
        if (!cb) { return -1; }
        if (ordre === "ancien") { return ca < cb ? -1 : ca > cb ? 1 : 0; }
        return ca > cb ? -1 : ca < cb ? 1 : 0;
      });
      var n = 0;
      liste.forEach(function (item) {
        var ok = correspond(item);
        item.hidden = !ok;
        if (ok) { n += 1; }
        galerie.appendChild(item);
      });
      if (compte) {
        compte.textContent = n > 1 ? n + " œuvres"
          : n === 1 ? "1 œuvre" : "0 œuvre";
      }
      if (vide) { vide.style.display = n === 0 ? "block" : "none"; }
    };

    Array.prototype.slice.call(
      document.querySelectorAll("[data-filtre]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var groupe = btn.getAttribute("data-groupe");
        etat[groupe] = btn.getAttribute("data-valeur");
        Array.prototype.slice.call(
          document.querySelectorAll('[data-groupe="' + groupe + '"]')
        ).forEach(function (b) {
          if (b === btn) { b.setAttribute("aria-pressed", "true"); }
          else { b.setAttribute("aria-pressed", "false"); }
        });
        appliquer();
      });
    });
    if (recherche) {
      recherche.addEventListener("input", appliquer);
    }
    if (tri) { tri.addEventListener("change", appliquer); }
    appliquer();
  }
})();
