/*
 * "Salvar em PDF" na barra superior.
 *
 * Quem gera o PDF é a caixa de impressão do navegador; a folha `@media print`
 * em `assets/css/a11y.css` é que recorta a navegação, de modo que o arquivo
 * sai só com o conteúdo.
 *
 * O botão é escrito em `overrides/partials/header.html` com `hidden`, e é este
 * arquivo que o revela. Sem JavaScript ele não faria nada ao ser clicado, e o
 * navegador já oferece Ctrl+P para o mesmo fim — melhor não existir do que
 * existir inerte. É a mesma regra do seletor de fonte ao lado.
 *
 * O clique é ouvido no document, e não no botão, porque o Material troca o
 * conteúdo sem recarregar a página quando a navegação instantânea está ligada:
 * ligar direto no botão perderia o vínculo na segunda página.
 */
document.addEventListener('click', function (evento) {
  var botao = evento.target.closest('[data-doc-print]');
  if (!botao) {
    return;
  }
  evento.preventDefault();
  window.print();
});

(function () {
  'use strict';

  function scan() {
    var botoes = document.querySelectorAll('[data-doc-print][hidden]');
    for (var i = 0; i < botoes.length; i++) {
      botoes[i].removeAttribute('hidden');
    }
  }

  if (window.document$ && typeof window.document$.subscribe === 'function') {
    window.document$.subscribe(scan);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
})();
