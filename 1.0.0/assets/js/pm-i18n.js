/*
 * Cadeias dos controles que o JavaScript injeta na página.
 *
 * O site é bilíngue pelo mkdocs-static-i18n: o build em português vai para
 * a raiz e o inglês para `/en/`, e cada um sai com o `lang` correto no
 * `<html>` — conferido no HTML gerado, não suposto. Tudo que o Jinja
 * escreve (overrides/main.html) já se traduz lá. O que sobra é o que nasce
 * em tempo de execução: o botão de pausa da animação, os controles do
 * terminal e o retorno do "copiar".
 *
 * Este arquivo é o único lugar onde essas cadeias existem. A alternativa —
 * literais espalhados pelos três scripts — transforma "acrescentar um
 * idioma" numa caçada, e é assim que um site bilíngue passa a ter metade
 * da interface num idioma só sem ninguém notar.
 */
(function () {
  'use strict';

  var STRINGS = {
    pt: {
      terminalRegion: 'Exemplo em terminal',
      terminalPlay: 'Reproduzir a digitação',
      terminalStop: 'Parar e mostrar tudo',
      terminalReplay: 'Repetir a digitação',
      terminalCopy: 'Copiar comando',
      terminalCopied: 'Copiado',
      terminalCopyFailed: 'Não foi possível copiar',
      terminalTranscript: 'Transcrição do terminal:',
      fontLabel: 'Fonte',
      fontHelp: 'Troca a fonte do texto desta documentação. A escolha fica guardada neste navegador.',
      fontDefault: 'Padrão do tema',
      fontReadable: 'Atkinson Hyperlegible (alta legibilidade)',
      fontSerif: 'Source Serif 4 (com serifa)',
      fontSystem: 'Do sistema (sem fonte da web)',
    },
    en: {
      terminalRegion: 'Terminal example',
      terminalPlay: 'Play the typing',
      terminalStop: 'Stop and show everything',
      terminalReplay: 'Replay the typing',
      terminalCopy: 'Copy command',
      terminalCopied: 'Copied',
      terminalCopyFailed: 'Could not copy',
      terminalTranscript: 'Terminal transcript:',
      fontLabel: 'Font',
      fontHelp: 'Switches the text font of this documentation. The choice is kept in this browser.',
      fontDefault: 'Theme default',
      fontReadable: 'Atkinson Hyperlegible (high legibility)',
      fontSerif: 'Source Serif 4 (serif)',
      fontSystem: 'System (no web font)',
    },
  };

  /* O `lang` do documento vem do tema: `pt` na raiz, `en` em /en/. Um
     idioma desconhecido cai no português, que é o idioma padrão do site —
     nunca em `undefined` na tela. */
  function currentLanguage() {
    var lang = document.documentElement.getAttribute('lang') || 'pt';
    return lang.toLowerCase().indexOf('en') === 0 ? 'en' : 'pt';
  }

  window.pmLanguage = currentLanguage;

  window.pmText = function (key) {
    var table = STRINGS[currentLanguage()];
    return key in table ? table[key] : STRINGS.pt[key];
  };
})();
