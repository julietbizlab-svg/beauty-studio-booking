(function () {
  "use strict";
  var tabs = Array.from(document.querySelectorAll("[data-panel]"));
  var panels = Array.from(document.querySelectorAll("[data-demo-panel]"));
  function show(name) {
    tabs.forEach(function (tab) { tab.classList.toggle("active", tab.dataset.panel === name); });
    panels.forEach(function (panel) {
      var active = panel.dataset.demoPanel === name;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { show(tab.dataset.panel); });
  });
  document.querySelectorAll("[data-open-case]").forEach(function (button) {
    button.addEventListener("click", function () {
      show(button.dataset.openCase);
      window.scrollTo({ top: document.querySelector(".demo-tabs").offsetTop - 12, behavior: "smooth" });
    });
  });
})();
