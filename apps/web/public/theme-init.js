// Тема применяется до отрисовки, чтобы светлая не мигала тёмной. Отдельный файл, а не inline: CSP запрещает встроенные скрипты.
(function () {
  try {
    if (localStorage.getItem("latuning-theme") === "light") document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {}
})();
