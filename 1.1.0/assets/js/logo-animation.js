/*
 * Animação da marca — laço contínuo, como no site do `param-manager`.
 *
 * O desenho vem de `assets/js/LogoAnimation.js`, o mesmo arquivo gerado que
 * aquele site usa. O comportamento também é o de lá: desenha, e recomeça a
 * cada 9 segundos — 8,5 s de traçado mais meio segundo de respiro. Sem
 * controle na tela, sem intervalo longo entre as voltas.
 *
 * Duas coisas continuam diferentes do original, e as duas são invisíveis para
 * quem lê:
 *
 * 1. **O arquivo de 17 MB não entra no `extra_javascript`.** Lá ele seria
 *    baixado nas 21 páginas do site, e o site de referência ainda o carrega
 *    duas vezes na página inicial — uma pelo `extra_javascript` e outra por um
 *    `<script>` no corpo do Markdown. Aqui ele é buscado uma vez, e só na
 *    página que tem o bloco da marca.
 *
 * 2. **Com `prefers-reduced-motion: reduce` nada se move e nada é baixado.**
 *    A página fica no cartaz estático (`assets/marca-animada.svg`), que é o
 *    quadro final da própria animação. Não custa um controle na tela nem uma
 *    linha de interface: quem não pediu isso ao sistema operacional não vê
 *    diferença nenhuma.
 *
 * O cartaz também é o que aparece enquanto os 17 MB não chegam. Sem ele a área
 * ficaria vazia até o arquivo carregar, e o texto ao lado saltaria de lugar
 * quando ele chegasse.
 */
(function () {
  'use strict';

  /* Precisa ser lido agora, na avaliação síncrona do script: depois de
     qualquer callback, `currentScript` já é null. A URL do arquivo grande é
     derivada da deste, e não escrita à mão, porque as páginas em inglês
     recebem `../assets/js/...` e uma constante fixa apontaria para
     `/en/assets/`, que não existe. */
  var ANIMATION_URL = (function () {
    var self = document.currentScript;
    return self
      ? self.src.replace(/[^/]+$/, 'LogoAnimation.js')
      : 'assets/js/LogoAnimation.js';
  })();

  /* Mesmo intervalo do site do `param-manager`. O arquivo gerado dura 8500 ms;
     o restante é o intervalo entre uma volta e a seguinte. */
  var INTERVAL_MS = 9000;

  var loading = null;

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function loadDrawing() {
    if (typeof window.renderLogoAnimation === 'function') {
      return Promise.resolve();
    }
    if (loading) {
      return loading;
    }
    loading = new Promise(function (resolve, reject) {
      var tag = document.createElement('script');
      tag.src = ANIMATION_URL;
      tag.onload = resolve;
      tag.onerror = function () {
        loading = null;
        reject(new Error('LogoAnimation.js não carregou'));
      };
      document.head.appendChild(tag);
    });
    return loading;
  }

  /* `elemento.hidden = false` **não** funciona aqui, e falha em silêncio: a
     propriedade `hidden` é definida em `HTMLElement`, e o alvo da animação é
     um `<svg>`, que é um `SVGElement`. A atribuição cria um campo qualquer no
     objeto JavaScript, o atributo `hidden` do HTML permanece, e a regra
     `[hidden] { display: none }` continua valendo — a animação desenha os 29
     traços, corretamente, dentro de um elemento invisível. Foi assim que ela
     apareceu em branco numa captura de tela, com o console limpo. Mexer no
     atributo funciona para os dois tipos de elemento. */
  function show(element, visible) {
    if (visible) {
      element.removeAttribute('hidden');
    } else {
      element.setAttribute('hidden', '');
    }
  }

  function setUp(block) {
    var canvas = block.querySelector('#LogoAnimation');
    var poster = block.querySelector('.pm-marca__cartaz');
    if (!canvas || !poster) {
      return;
    }

    if (prefersReducedMotion()) {
      return;
    }

    loadDrawing().then(function () {
      show(poster, false);
      show(canvas, true);
      desenhar();
      window.setInterval(desenhar, INTERVAL_MS);
    });

    /* O arquivo gerado captura o elemento uma vez, na carga, e desenha sempre
       naquela referência. Reatribuir a cada volta é o que mantém a animação
       ligada ao nó que está no documento agora. */
    function desenhar() {
      window.logoanimation = canvas;
      window.renderLogoAnimation();
    }
  }

  function scan() {
    var blocks = document.querySelectorAll('[data-pm-logo]');
    for (var i = 0; i < blocks.length; i++) {
      if (!blocks[i].hasAttribute('data-pm-pronto')) {
        blocks[i].setAttribute('data-pm-pronto', '');
        setUp(blocks[i]);
      }
    }
  }

  /* `document$` é o observável que o Material emite a cada troca de página;
     usá-lo mantém isto funcionando se a navegação instantânea for ligada um
     dia. Quando não existe, o evento nativo basta. */
  if (window.document$ && typeof window.document$.subscribe === 'function') {
    window.document$.subscribe(scan);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
})();
