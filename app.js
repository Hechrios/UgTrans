(function () {
  'use strict';

  const converter = window.UyghurConverter;
  const root = document.documentElement;
  const sourceScript = document.getElementById('sourceScript');
  const targetScript = document.getElementById('targetScript');
  const inputText = document.getElementById('inputText');
  const outputText = document.getElementById('outputText');
  const convertButton = document.getElementById('convertButton');
  const copyButton = document.getElementById('copyButton');
  const copyLabel = document.getElementById('copyLabel');
  const ulyToggle = document.getElementById('ulyToggle');
  const utyToggle = document.getElementById('iToggle');
  const uhyToggle = document.getElementById('uhyToggle');
  const fontToggle = document.getElementById('fontToggle');
  const fontModeLabel = document.getElementById('fontModeLabel');
  const themeToggle = document.getElementById('themeToggle');
  const themeModeLabel = document.getElementById('themeModeLabel');
  const liveStatus = document.getElementById('liveStatus');
  const routeReadout = document.getElementById('routeReadout');
  const scriptTrack = document.getElementById('scriptTrack');
  const titleSubtitle = document.getElementById('titleSubtitle');
  const mainTitle = document.querySelector('.title-main');
  const defaultText = 'ئۇيغۇر ئېلىپبەسى';
  const brandSubtitle = 'Uyghur Yéziq Transkriptsiyesi';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const state = {
    fontMode: 'classic',
    theme: 'day',
    ulyMode: 0,
    iMode: 0,
    uhyMode: 0,
    subtitleSequence: 0
  };

  function readPreference(key, fallback) {
    try {
      return window.localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  function writePreference(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      return;
    }
  }

  function announce(message) {
    liveStatus.textContent = '';
    window.requestAnimationFrame(function () {
      liveStatus.textContent = message;
    });
  }

  function setFontMode(mode, persist) {
    state.fontMode = mode === 'noto' ? 'noto' : 'classic';
    root.classList.toggle('fonts-noto', state.fontMode === 'noto');
    root.classList.toggle('fonts-classic', state.fontMode === 'classic');
    fontModeLabel.textContent = state.fontMode === 'noto' ? 'Noto Sans' : 'UKIJ + Times';
    if (persist) writePreference('uyghur-font-mode', state.fontMode);
  }

  function setTheme(theme, persist) {
    state.theme = theme === 'night' ? 'night' : 'day';
    root.dataset.theme = state.theme;
    themeModeLabel.textContent = state.theme === 'night' ? 'Night' : 'Day';
    document.querySelector('meta[name="theme-color"]').setAttribute(
      'content',
      state.theme === 'night' ? '#172123' : '#B0C4DE'
    );
    if (persist) writePreference('uyghur-theme', state.theme);
  }

  function updateTextDirection() {
    inputText.dir = sourceScript.value === 'UEY' ? 'rtl' : 'ltr';
    outputText.dir = targetScript.value === 'UEY' ? 'rtl' : 'ltr';
    routeReadout.textContent = sourceScript.value + ' → ' + targetScript.value;

    scriptTrack.querySelectorAll('[data-script]').forEach(function (chip) {
      const script = chip.dataset.script;
      chip.classList.toggle('is-source', script === sourceScript.value);
      chip.classList.toggle('is-target', script === targetScript.value);
      chip.classList.toggle('is-active', script === sourceScript.value || script === targetScript.value);
    });
  }

  function ulyModeLabel() {
    return state.ulyMode === 1 ? 'Ë ë' : 'É é';
  }

  function iModeLabel() {
    if (state.iMode === 1) return 'I ı';
    if (state.iMode === 2) return 'İ i';
    return 'I i';
  }

  function uhyModeLabel() {
    return state.uhyMode === 1 ? 'A a' : 'Ä ä';
  }

  function updateVariantToggles() {
    const target = targetScript.value;

    ulyToggle.hidden = target !== 'ULY';
    utyToggle.hidden = target !== 'UTY';
    uhyToggle.hidden = target !== 'UHY';

    ulyToggle.textContent = ulyModeLabel();
    utyToggle.textContent = iModeLabel();
    uhyToggle.textContent = uhyModeLabel();

    ulyToggle.setAttribute('aria-label', 'Change ULY e output. Current form: ' + ulyModeLabel());
    utyToggle.setAttribute('aria-label', 'Change UTY i output. Current form: ' + iModeLabel());
    uhyToggle.setAttribute('aria-label', 'Change UHY diacritic output. Current form: ' + uhyModeLabel());
  }

  function titleCaseSubtitle(value) {
    return value.replace(/(^|[\s\-–—])(\p{L})/gu, function (_, prefix, letter) {
      return prefix + letter.toLocaleUpperCase('en-US');
    });
  }

  function subtitleTextFor(script) {
    if (script === 'UEY') return brandSubtitle;
    const sourceTitle = mainTitle.textContent.trim();
    const converted = converter.convert(sourceTitle, 'UEY', script, {
      ulyMode: 0,
      iMode: 0,
      uhyMode: 0
    });
    return titleCaseSubtitle(converted);
  }

  function graphemes(value) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), function (item) {
        return item.segment;
      });
    }
    return Array.from(value);
  }

  function typeSubtitle(script) {
    state.subtitleSequence += 1;
    const sequence = state.subtitleSequence;
    const value = subtitleTextFor(script);
    const units = graphemes(value);

    titleSubtitle.classList.add('is-typing');
    titleSubtitle.textContent = '';
    titleSubtitle.setAttribute('aria-label', value);

    if (reduceMotion.matches) {
      titleSubtitle.textContent = value;
      titleSubtitle.classList.remove('is-typing');
      return;
    }

    let index = 0;
    function typeNext() {
      if (sequence !== state.subtitleSequence) return;
      titleSubtitle.textContent += units[index] || '';
      index += 1;
      if (index < units.length) {
        window.setTimeout(typeNext, 32);
      } else {
        titleSubtitle.classList.remove('is-typing');
      }
    }

    typeNext();
  }

  function convertNow() {
    try {
      outputText.value = converter.convert(inputText.value, sourceScript.value, targetScript.value, {
        ulyMode: state.ulyMode,
        iMode: state.iMode,
        uhyMode: state.uhyMode
      });
      outputText.scrollTop = 0;
      announce('Conversion completed.');
    } catch {
      outputText.value = '';
      announce('Conversion failed.');
    }
  }

  function resetCopiedState() {
    copyButton.classList.remove('is-copied');
    copyLabel.textContent = 'كۆچۈرۈش';
  }

  async function copyOutput() {
    const text = outputText.value;
    if (!text) {
      announce('There is no output to copy.');
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        outputText.focus();
        outputText.select();
        document.execCommand('copy');
        outputText.setSelectionRange(0, 0);
        outputText.blur();
      }
      copyButton.classList.add('is-copied');
      copyLabel.textContent = 'كۆچۈرۈلدى';
      announce('Output copied.');
      window.setTimeout(resetCopiedState, 1500);
    } catch {
      announce('Copy failed.');
    }
  }

  function handleTargetChange() {
    const previous = targetScript.dataset.previous || 'ULY';
    const next = targetScript.value;

    if (next === 'ULY' && previous !== 'ULY') state.ulyMode = 0;
    if (next === 'UTY' && previous !== 'UTY') state.iMode = 0;
    if (next === 'UHY' && previous !== 'UHY') state.uhyMode = 0;

    targetScript.dataset.previous = next;
    updateVariantToggles();
    updateTextDirection();
    typeSubtitle(next);
    convertNow();
  }

  function handleSourceChange() {
    updateTextDirection();
    convertNow();
  }

  fontToggle.addEventListener('click', function () {
    setFontMode(state.fontMode === 'classic' ? 'noto' : 'classic', true);
  });

  themeToggle.addEventListener('click', function () {
    setTheme(state.theme === 'day' ? 'night' : 'day', true);
  });

  convertButton.addEventListener('click', convertNow);
  copyButton.addEventListener('click', copyOutput);
  sourceScript.addEventListener('change', handleSourceChange);
  targetScript.addEventListener('change', handleTargetChange);

  ulyToggle.addEventListener('click', function () {
    state.ulyMode = (state.ulyMode + 1) % 2;
    updateVariantToggles();
    convertNow();
    announce('ULY e output changed to ' + ulyModeLabel() + '.');
  });

  utyToggle.addEventListener('click', function () {
    state.iMode = (state.iMode + 1) % 3;
    updateVariantToggles();
    convertNow();
    announce('UTY i output changed to ' + iModeLabel() + '.');
  });

  uhyToggle.addEventListener('click', function () {
    state.uhyMode = (state.uhyMode + 1) % 2;
    updateVariantToggles();
    convertNow();
    announce('UHY diacritic output changed to ' + uhyModeLabel() + '.');
  });

  inputText.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      convertNow();
    }
  });

  inputText.value = defaultText;
  targetScript.dataset.previous = targetScript.value;
  setFontMode(readPreference('uyghur-font-mode', 'classic'), false);
  setTheme(readPreference('uyghur-theme', 'day'), false);
  updateVariantToggles();
  updateTextDirection();
  convertNow();
  typeSubtitle(targetScript.value);
}());
