/*
 * Terminal com digitação — controles, transcrição e o caminho sem JS.
 *
 * A animação em si é o `termynal.js` (Ines Montani, MIT), copiado sem
 * alteração de `param-manager/docs/assets/js/`. O que este arquivo
 * acrescenta é o que falta lá para o bloco poder existir numa página que
 * se propõe a seguir a WCAG 2.1 AA:
 *
 * - **Sem JavaScript, o bloco já está inteiro na página.** As linhas são
 *   `<span data-ty>` no HTML; o termynal as apaga e as redigita. Quem não
 *   executa JavaScript, ou pediu menos movimento, lê o terminal completo e
 *   parado — não uma caixa vazia.
 * - **Nada começa a digitar sozinho com `prefers-reduced-motion`**
 *   (WCAG 2.3.3), e o que começa tem botão para parar (WCAG 2.2.2).
 * - **Leitor de tela recebe uma transcrição**, não o texto se montando
 *   caractere a caractere. O painel animado sai da árvore de
 *   acessibilidade e no lugar dele fica um `<pre>` visualmente oculto com
 *   a sessão inteira.
 *
 * Parar no meio merece uma nota. O termynal é um `async` sem cancelamento:
 * uma vez começado, os `await` pendentes continuam anexando linhas. Em vez
 * de tentar interrompê-los, o painel é trocado por um clone limpo do HTML
 * original — a execução antiga passa a escrever num nó que já saiu do
 * documento, o que é inofensivo, e o leitor vê o conteúdo completo na
 * hora.
 */
(function () {
  'use strict';

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  /* Transcrição legível: entrada com o `$` que o CSS desenha via `::before`
     (e que, sendo pseudo-elemento, nenhum leitor de tela anuncia), saída
     como está, barra de progresso descartada — ela não carrega informação
     nenhuma além de "demorou". */
  function transcript(panel) {
    var lines = panel.querySelectorAll('[data-ty]');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var kind = lines[i].getAttribute('data-ty');
      if (kind === 'progress') {
        continue;
      }
      var text = (lines[i].textContent || '').trim();
      if (kind === 'input') {
        out.push('$ ' + text);
      } else if (text) {
        out.push(text);
      }
    }
    return out.join('\n');
  }

  function commandOf(block, panel) {
    var declared = block.getAttribute('data-pm-command');
    if (declared) {
      return declared;
    }
    var inputs = panel.querySelectorAll('[data-ty="input"]');
    var out = [];
    for (var i = 0; i < inputs.length; i++) {
      out.push((inputs[i].textContent || '').trim());
    }
    return out.join('\n');
  }

  /* O site é servido por HTTP simples no GitLab Pages local, e a Clipboard
     API só existe em contexto seguro. O caminho de baixo não é enfeite: é
     o que roda na instalação de verdade. */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (erro) {
        ok = false;
      }
      document.body.removeChild(field);
      if (ok) {
        resolve();
      } else {
        reject(new Error('execCommand recusou'));
      }
    });
  }

  function button(className, text) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.textContent = text;
    el.setAttribute('aria-label', text);
    return el;
  }

  function setUp(block) {
    var panel = block.querySelector('.termynal');
    if (!panel) {
      return;
    }

    var original = panel.outerHTML;
    var command = commandOf(block, panel);
    var playing = false;

    block.setAttribute('role', 'group');
    block.setAttribute('aria-label', window.pmText('terminalRegion'));

    var reading = document.createElement('pre');
    reading.className = 'pm-visually-hidden';
    reading.textContent =
      window.pmText('terminalTranscript') + '\n' + transcript(panel);
    block.insertBefore(reading, panel);

    var bar = document.createElement('div');
    bar.className = 'pm-terminal__barra';
    var play = button('pm-terminal__botao', window.pmText('terminalPlay'));
    var copy = button('pm-terminal__botao', window.pmText('terminalCopy'));
    bar.appendChild(play);
    bar.appendChild(copy);
    block.insertBefore(bar, panel);

    function label(el, text) {
      el.textContent = text;
      el.setAttribute('aria-label', text);
    }

    /* Trocar o painel por um clone do HTML original é o "parar": a
       execução anterior fica escrevendo num nó órfão. */
    function reset() {
      var holder = document.createElement('div');
      holder.innerHTML = original;
      var fresh = holder.firstElementChild;
      fresh.setAttribute('aria-hidden', 'true');
      panel.replaceWith(fresh);
      panel = fresh;
      return fresh;
    }

    function start() {
      var fresh = reset();
      playing = true;
      label(play, window.pmText('terminalStop'));
      /* `Termynal` é uma `class` no escopo global: declarações de classe vivem
         no ambiente léxico global, não em `window` — `window.Termynal` é
         undefined mesmo com o arquivo carregado. */
      new Termynal(fresh);
      /* Fim estimado: atraso inicial + uma folga por linha. Serve só para
         devolver o rótulo "repetir"; errar para mais não quebra nada, e a
         pessoa pode parar antes a qualquer momento. */
      var lines = fresh.querySelectorAll('[data-ty]').length;
      setTimeout(function () {
        if (playing) {
          playing = false;
          label(play, window.pmText('terminalReplay'));
        }
      }, 900 + lines * 1800);
    }

    play.addEventListener('click', function () {
      if (playing) {
        playing = false;
        reset();
        label(play, window.pmText('terminalReplay'));
      } else {
        start();
      }
    });

    copy.addEventListener('click', function () {
      copyText(command).then(
        function () {
          label(copy, window.pmText('terminalCopied'));
          setTimeout(function () {
            label(copy, window.pmText('terminalCopy'));
          }, 2000);
        },
        function () {
          label(copy, window.pmText('terminalCopyFailed'));
          setTimeout(function () {
            label(copy, window.pmText('terminalCopy'));
          }, 2000);
        }
      );
    });

    panel.setAttribute('aria-hidden', 'true');

    if (prefersReducedMotion()) {
      return;
    }

    /* Digitar fora da tela é animação que ninguém vê e que já terminou
       quando a pessoa chega. Espera o bloco aparecer, uma vez só. */
    if (typeof window.IntersectionObserver === 'function') {
      var watcher = new window.IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            watcher.disconnect();
            start();
          }
        }
      });
      watcher.observe(block);
    } else {
      start();
    }
  }

  function scan() {
    if (typeof Termynal !== 'function') {
      return;
    }
    var blocks = document.querySelectorAll('[data-pm-terminal]');
    for (var i = 0; i < blocks.length; i++) {
      if (!blocks[i].hasAttribute('data-pm-pronto')) {
        blocks[i].setAttribute('data-pm-pronto', '');
        setUp(blocks[i]);
      }
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
