/* ============================================================
   Manech — interactions discrètes, zéro dépendance
   Filtres de galerie · carrousel scroll-snap · visionneuse
   Respecte prefers-reduced-motion.
   ============================================================ */
(function () {
  "use strict";

  var reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- porte d'accès (PBKDF2-SHA256 via WebCrypto) ----------
     Le code en clair n'existe dans aucun fichier : on ne stocke qu'un
     hachage dérivé (SEL + nombre d'itérations + clé attendue).
     Voir tools/code_acces.py pour régénérer une clé. */
  var MEMOIRE = "manech-acces";
  var SEL = "4d616e6563682d706f7274652d61636365732d323032362d7631";
  var ITER = 600000;
  var CLE = "f5e017b51bcb258373e4a3fd3bf4ed7bc9bfb840135b22a7b0d0eae0a3914a5d";

  function lireMemoire(cle) {
    try {
      var v = sessionStorage.getItem(cle);
      if (v !== null) { return v; }
    } catch (e1) { /* ignore */ }
    try { return localStorage.getItem(cle); } catch (e2) { return null; }
  }

  function ecrireMemoire(cle, valeur) {
    try { sessionStorage.setItem(cle, valeur); return; } catch (e1) { /* ignore */ }
    try { localStorage.setItem(cle, valeur); } catch (e2) { /* ignore */ }
  }

  function octets(hex) {
    var n = hex.length / 2;
    var t = new Uint8Array(n);
    for (var i = 0; i < n; i++) { t[i] = parseInt(hex.substr(i * 2, 2), 16); }
    return t;
  }

  function memeChose(a, b) {
    if (a.length !== b.length) { return false; }
    var d = 0;
    for (var i = 0; i < a.length; i++) { d |= a.charCodeAt(i) ^ b.charCodeAt(i); }
    return d === 0;
  }

  function verifierCode(code) {
    if (!window.crypto || !crypto.subtle) {
      return Promise.reject(new Error("webcrypto-indisponible"));
    }
    return crypto.subtle.importKey(
      "raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]
    ).then(function (cle) {
      return crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: octets(SEL), iterations: ITER, hash: "SHA-256" },
        cle, 256);
    }).then(function (bits) {
      var v = "";
      var o = new Uint8Array(bits);
      for (var i = 0; i < o.length; i++) {
        v += ("0" + o[i].toString(16)).slice(-2);
      }
      return memeChose(v, CLE);
    });
  }

  var porte = document.getElementById("porte");
  if (porte) {
    if (lireMemoire(MEMOIRE) === "1") {
      document.documentElement.classList.remove("ferme");
      porte.parentNode.removeChild(porte);
      porte = null;
    } else {
      (function () {
        var formulaire = porte.querySelector(".porte-form");
        var champ = porte.querySelector(".porte-champ");
        var erreur = porte.querySelector(".porte-erreur");
        var bouton = porte.querySelector(".porte-bouton");
        var tentatives = 0;
        var blocage = 0;

        var dire = function (texte) {
          erreur.textContent = texte;
          erreur.hidden = false;
          champ.setAttribute("aria-invalid", "true");
        };

        var nettoyer = function () {
          erreur.hidden = true;
          erreur.textContent = "";
          champ.removeAttribute("aria-invalid");
        };

        champ.addEventListener("input", function () {
          var propre = champ.value.replace(/\D/g, "").slice(0, 6);
          if (propre !== champ.value) { champ.value = propre; }
          if (!erreur.hidden) { nettoyer(); }
        });

        formulaire.addEventListener("submit", function (e) {
          e.preventDefault();
          if (Date.now() < blocage) { return; }
          var code = champ.value.replace(/\D/g, "");
          if (code.length !== 6) {
            dire("Le code comporte six chiffres.");
            champ.focus();
            return;
          }
          nettoyer();
          bouton.disabled = true;
          verifierCode(code).then(function (ok) {
            bouton.disabled = false;
            if (ok) {
              ecrireMemoire(MEMOIRE, "1");
              document.documentElement.classList.remove("ferme");
              porte.parentNode.removeChild(porte);
              var marque = document.querySelector(".marque");
              if (marque) { marque.focus(); }
              return;
            }
            tentatives += 1;
            champ.value = "";
            champ.focus();
            if (tentatives >= 3) {
              var secondes = Math.min(2 + (tentatives - 3) * 2, 10);
              blocage = Date.now() + secondes * 1000;
              bouton.disabled = true;
              dire("Code incorrect. Réessayez dans " + secondes + " s.");
              window.setTimeout(function () {
                bouton.disabled = false;
                nettoyer();
                champ.focus();
              }, secondes * 1000);
            } else {
              dire("Code incorrect.");
            }
          }).catch(function () {
            bouton.disabled = false;
            dire("Vérification impossible : WebCrypto indisponible.");
          });
        });

        champ.focus();
      })();
    }
  }

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
    if (document.documentElement.classList.contains("ferme")) { return; }
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
    var triOrdre = "recent";
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
      var ordre = triOrdre;
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
    /* --- tri : liste déroulante maison (role=listbox, focus dans le menu) --- */
    if (tri) {
      (function () {
        var boutonTri = tri.querySelector("[data-tri-bouton]");
        var menuTri = tri.querySelector("[data-tri-menu]");
        var valeurTri = tri.querySelector("[data-tri-valeur]");
        var optionsTri = Array.prototype.slice.call(
          tri.querySelectorAll("[role=option]"));

        var optionActive = function () {
          var act = document.activeElement;
          return optionsTri.indexOf(act) !== -1 ? act : null;
        };

        var focusOption = function (opt) {
          if (!opt) { return; }
          try { opt.focus({ preventScroll: true }); } catch (e) { opt.focus(); }
        };

        var fermerTri = function (rendreFocus) {
          menuTri.hidden = true;
          boutonTri.setAttribute("aria-expanded", "false");
          if (rendreFocus) { boutonTri.focus(); }
        };

        var ouvrirTri = function () {
          menuTri.hidden = false;
          boutonTri.setAttribute("aria-expanded", "true");
          var cible = null;
          optionsTri.forEach(function (opt) {
            if (opt.getAttribute("aria-selected") === "true") { cible = opt; }
          });
          focusOption(cible || optionsTri[0]);
        };

        var choisirTri = function (opt) {
          triOrdre = opt.getAttribute("data-valeur");
          optionsTri.forEach(function (autre) {
            autre.setAttribute("aria-selected",
                               autre === opt ? "true" : "false");
          });
          valeurTri.textContent = opt.textContent;
          fermerTri(true);
          appliquer();
        };

        boutonTri.addEventListener("click", function () {
          if (menuTri.hidden) { ouvrirTri(); } else { fermerTri(false); }
        });

        boutonTri.addEventListener("keydown", function (e) {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            ouvrirTri();
          }
        });

        menuTri.addEventListener("keydown", function (e) {
          var act = optionActive();
          if (!act) { return; }
          var i = optionsTri.indexOf(act);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            focusOption(optionsTri[(i + 1) % optionsTri.length]);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusOption(optionsTri[(i + optionsTri.length - 1) %
                                   optionsTri.length]);
          } else if (e.key === "Home") {
            e.preventDefault();
            focusOption(optionsTri[0]);
          } else if (e.key === "End") {
            e.preventDefault();
            focusOption(optionsTri[optionsTri.length - 1]);
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            choisirTri(act);
          } else if (e.key === "Escape") {
            e.preventDefault();
            fermerTri(true);
          } else if (e.key === "Tab") {
            fermerTri(true);
          }
        });

        optionsTri.forEach(function (opt) {
          opt.addEventListener("click", function () { choisirTri(opt); });
        });

        document.addEventListener("click", function (e) {
          if (!menuTri.hidden && !tri.contains(e.target)) { fermerTri(false); }
        });
      })();
    }
    appliquer();
  }
})();
