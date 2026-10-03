/* 360Plus public website behaviour. No dependencies, no inline handlers (CSP: script-src 'self').
 *
 * - Navigation: mobile menu toggle and accessible disclosure menus.
 * - Product tour: ARIA tabs.
 * - Consultation form: validation, campaign attribution, submission (or preview mode).
 * - Analytics: Google tag (GA4 / Google Ads) ONLY when ids were configured at build time.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");

  var config = {};
  try {
    config = JSON.parse(document.getElementById("site-config").textContent || "{}");
  } catch (e) { config = {}; }

  /* ------------------------------------------------------------------ analytics */
  var analyticsOn = Boolean(config.ga4 || config.ads);

  function gtag() {
    if (!analyticsOn) { return; }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function track(eventName, params) {
    if (analyticsOn) { gtag("event", eventName, params || {}); }
  }

  if (analyticsOn) {
    var consent = config.consentDefault === "granted" ? "granted" : "denied";
    gtag("consent", "default", {
      ad_storage: consent,
      ad_user_data: consent,
      ad_personalization: consent,
      analytics_storage: consent
    });
    gtag("js", new Date());
    if (config.ga4) { gtag("config", config.ga4); }
    if (config.ads) { gtag("config", config.ads); }
    var tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(config.ga4 || config.ads);
    document.head.appendChild(tag);
  }

  // Hook for a future consent banner: window.plus360.setConsent("granted" | "denied").
  window.plus360 = {
    setConsent: function (value) {
      var v = value === "granted" ? "granted" : "denied";
      gtag("consent", "update", { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v });
    }
  };

  document.addEventListener("click", function (event) {
    var el = event.target.closest && event.target.closest("[data-cta]");
    if (el) { track("cta_click", { cta_id: el.getAttribute("data-cta"), page_path: config.page }); }
  });

  if (config.page === "/consultation/thank-you") {
    track("generate_lead", { form_id: "consultation_request" });
    if (config.adsLeadSendTo) { gtag("event", "conversion", { send_to: config.adsLeadSendTo }); }
  }

  /* ------------------------------------------------------------------ navigation */
  var header = document.querySelector("[data-header]");
  var toggle = document.querySelector("[data-nav-toggle]");
  if (header && toggle) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  var menus = Array.prototype.slice.call(document.querySelectorAll("[data-menu]"));
  function closeMenu(menu, focusButton) {
    menu.classList.remove("is-open");
    var btn = menu.querySelector("[data-menu-button]");
    btn.setAttribute("aria-expanded", "false");
    if (focusButton) { btn.focus(); }
  }
  menus.forEach(function (menu) {
    var btn = menu.querySelector("[data-menu-button]");
    btn.addEventListener("click", function () {
      var willOpen = !menu.classList.contains("is-open");
      menus.forEach(function (other) { if (other !== menu) { closeMenu(other, false); } });
      menu.classList.toggle("is-open", willOpen);
      btn.setAttribute("aria-expanded", String(willOpen));
    });
    menu.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menu.classList.contains("is-open")) {
        event.preventDefault();
        closeMenu(menu, true);
      }
    });
    menu.addEventListener("focusout", function (event) {
      if (!menu.contains(event.relatedTarget)) { closeMenu(menu, false); }
    });
  });
  document.addEventListener("click", function (event) {
    menus.forEach(function (menu) { if (!menu.contains(event.target)) { closeMenu(menu, false); } });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && header && header.classList.contains("nav-open")) {
      header.classList.remove("nav-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus();
    }
  });

  /* ------------------------------------------------------------------ product tour tabs */
  Array.prototype.forEach.call(document.querySelectorAll("[data-tabs]"), function (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll("[role=tab]"));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var selected = t === tab;
        t.setAttribute("aria-selected", String(selected));
        t.tabIndex = selected ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
      });
      if (focus) { tab.focus(); }
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(tab, false); track("tour_tab", { tab: tab.id }); });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight") { next = tabs[(i + 1) % tabs.length]; }
        if (event.key === "ArrowLeft") { next = tabs[(i - 1 + tabs.length) % tabs.length]; }
        if (event.key === "Home") { next = tabs[0]; }
        if (event.key === "End") { next = tabs[tabs.length - 1]; }
        if (next) { event.preventDefault(); select(next, true); }
      });
    });
    tablist.hidden = false;
    select(tabs[0], false);
  });

  /* ------------------------------------------------------------------ consultation form */
  var ATTRIBUTION = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"];
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function captureAttribution() {
    // Remember first-touch campaign parameters for this browser tab only (sessionStorage),
    // so a visitor who lands on /lp/... and then browses to /consultation keeps attribution.
    var stored = {};
    try { stored = JSON.parse(sessionStorage.getItem("plus360_attribution") || "{}"); } catch (e) { stored = {}; }
    var params = new URLSearchParams(window.location.search);
    var fresh = false;
    ATTRIBUTION.forEach(function (key) {
      var value = params.get(key);
      if (value && !stored[key]) { stored[key] = value.slice(0, 200); fresh = true; }
    });
    if (fresh) {
      try { sessionStorage.setItem("plus360_attribution", JSON.stringify(stored)); } catch (e) { /* private mode */ }
    }
    return stored;
  }

  function fieldError(form, input, message) {
    var box = form.querySelector("#" + input.getAttribute("aria-describedby").split(" ").filter(function (id) {
      return id.indexOf("-error") > 0;
    })[0]);
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (box) { box.textContent = message || ""; }
  }

  function validate(form) {
    var errors = [];
    Array.prototype.forEach.call(form.querySelectorAll("[data-validate]"), function (input) {
      var value = (input.type === "checkbox") ? input.checked : input.value.trim();
      var label = input.getAttribute("data-label");
      var message = "";
      if (input.required && !value) {
        if (input.type === "checkbox") {
          message = "Please confirm " + label + ".";
        } else {
          message = (input.tagName === "SELECT" ? "Choose your " : "Enter your ") + label + ".";
        }
      } else if (input.type === "email" && value && !EMAIL.test(value)) {
        message = "Enter a valid work email address.";
      } else if (input.maxLength > 0 && typeof value === "string" && value.length > input.maxLength) {
        message = label.charAt(0).toUpperCase() + label.slice(1) + " is too long.";
      }
      fieldError(form, input, message);
      if (message) { errors.push({ input: input, message: message }); }
    });
    return errors;
  }

  function showSummary(form, errors) {
    var summary = form.querySelector("[data-error-summary]");
    var list = summary.querySelector("ul");
    list.textContent = "";
    errors.forEach(function (err) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + err.input.id;
      a.textContent = err.message;
      a.addEventListener("click", function (event) { event.preventDefault(); err.input.focus(); });
      li.appendChild(a);
      list.appendChild(li);
    });
    summary.hidden = errors.length === 0;
    if (errors.length) { summary.focus(); }
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-consult-form]"), function (form) {
    var attribution = captureAttribution();
    ATTRIBUTION.forEach(function (key) {
      var input = form.querySelector("input[name=" + key + "]");
      if (input && attribution[key]) { input.value = attribution[key]; }
    });
    var status = form.querySelector("[data-form-status]");
    var submit = form.querySelector("[type=submit]");
    var submitLabel = submit.textContent;
    var started = false;
    var formToken = null;
    submit.disabled = false;  // disabled in HTML so the form cannot submit without this script

    // The request-handling service (360Plus Snapshot) issues a signed time-to-complete stamp; a request
    // sent without one, or too quickly after it was issued, is treated as automated. Fetched when the
    // visitor starts typing, and again at submit if that first fetch failed.
    function fetchToken() {
      if (!config.formEndpoint) { return Promise.resolve(null); }
      return fetch(config.formEndpoint + "/form-token", { credentials: "omit", mode: "cors" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (body) { formToken = body && body.form_token ? body.form_token : formToken; return formToken; })
        .catch(function () { return formToken; });
    }

    form.addEventListener("input", function () {
      if (!started) {
        started = true;
        track("form_start", { form_id: "consultation_request" });
        fetchToken();
      }
    });
    form.addEventListener("change", function (event) {
      if (event.target.hasAttribute("data-validate") && event.target.getAttribute("aria-invalid") === "true") {
        validate(form);
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      status.className = "form-status";
      status.textContent = "";
      var errors = validate(form);
      showSummary(form, errors);
      if (errors.length) { return; }
      if (form.querySelector("input[name=hp_field]").value) { return; }  // honeypot: silently drop

      var data = {};
      new FormData(form).forEach(function (value, key) {
        // hp_field (the honeypot) IS sent: it is empty for a person, and the service discards any
        // request where it is filled, including one posted without running this script.
        if (data[key] !== undefined) {
          data[key] = [].concat(data[key], value);
        } else {
          data[key] = value;
        }
      });
      data.page = config.page;

      if (!config.formEndpoint) {
        // PREVIEW MODE: no lead-processing backend is connected, so nothing is transmitted.
        status.className = "form-status is-preview";
        status.textContent = "Preview build: your details were checked but not sent anywhere. " +
          "Consultation requests will be delivered once the request-handling service is connected.";
        status.focus();
        return;
      }

      submit.disabled = true;
      submit.textContent = "Sending…";
      (formToken ? Promise.resolve(formToken) : fetchToken()).then(function (token) {
        data.form_token = token || "";
        return fetch(config.formEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(data),
          credentials: "omit",
          mode: "cors"
        });
      }).then(function (response) {
        if (response.status === 400) {
          // The service names the field it refused (for example a Social Security number typed into
          // the message); show its message on that field rather than a generic failure.
          return response.json().then(function (body) {
            var input = body && body.field ? form.querySelector("[name=" + body.field + "]") : null;
            var message = (body && body.message) || "Please check the form and try again.";
            if (input && input.hasAttribute("aria-describedby")) {
              fieldError(form, input, message);
              showSummary(form, [{ input: input, message: message }]);
            }
            throw new Error("invalid");
          });
        }
        if (!response.ok) { throw new Error("HTTP " + response.status); }
        window.location.assign("/consultation/thank-you");
      }).catch(function (err) {
        submit.disabled = false;
        submit.textContent = submitLabel;
        if (err && err.message === "invalid") { return; }
        status.className = "form-status is-error";
        status.textContent = "Sorry — we couldn't send your request. Please try again in a moment.";
        status.focus();
      });
    });
  });
})();
