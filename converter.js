(function (root) {
  'use strict';

  const RULES = root.UYGHUR_RULES || (typeof require === 'function' ? require('./rules.js') : []);
  const SCRIPTS = ['UEY', 'ULY', 'UYY', 'UHY', 'UTY', 'UXY', 'UKY'];
  const VOWELS = new Set(['ا', 'ە', 'و', 'ۇ', 'ۆ', 'ۈ', 'ې', 'ى']);
  const WORD_BOUNDARIES = new Set([' ', '\t', '\r', '\n', '.', ',', ':', ';', '!', '?', '،', '؛', '؟', '«', '»', '"', '“', '”', '(', ')', '[', ']', '{', '}', '-', '—']);
  const SENTENCE_END = new Set(['.', '!', '?', '؟', '\n']);

  const PUNCT_TO_UEY = new Map([
    ['.', '.'], [',', '،'], [':', ':'], [';', '؛'], ['?', '؟'], ['!', '!'],
    ['-', '-'], ['"', '«'], ['“', '«'], ['”', '»'], ['»', '»']
  ]);
  const PUNCT_FROM_UEY = new Map([
    ['،', ','], ['؛', ';'], ['؟', '?'], ['«', '"'], ['»', '"']
  ]);

  const MANUAL_DECODE = {
    ULY: [
      ['ë', 'ې'],
      ["ch'h", 'چھ'],
      ["s'h", 'سھ'],
      ["c'h", 'چھ'],
      ["g'h", 'گھ'],
      ["z'h", 'زھ'],
      ["n'g", 'نگ']
    ],
    UHY: [
      ['j', 'ژ'],
      ['y', 'ي']
    ],
    UKY: [
      ['лп', 'لىپ'],
      ['ǝ', 'ە']
    ]
  };

  function normalize(value) {
    return String(value || '')
      .normalize('NFC')
      .replace(/\u00a0/g, ' ')
      .replace(/İ/g, 'I')
      .replace(/ı/g, 'i')
      .toLowerCase();
  }

  function parseCell(value) {
    return String(value || '')
      .split('/')
      .map(function (part) { return part.trim(); })
      .filter(Boolean)
      .map(function (part) {
        const pieces = part.split(/\s+/).filter(Boolean);
        const upper = pieces[0] || '';
        const lower = pieces[1] || upper.toLocaleLowerCase('en-US');
        return { upper: upper, lower: lower };
      });
  }

  const rulesByUEY = new Map();
  const sourceTokens = {};
  SCRIPTS.forEach(function (script) { sourceTokens[script] = []; });

  RULES.forEach(function (rule) {
    if (!rule || !rule.uey) return;
    rulesByUEY.set(rule.uey, rule);
    SCRIPTS.slice(1).forEach(function (script) {
      if (script === 'UHY' && rule.uey === 'تس') return;
      parseCell(rule[script]).forEach(function (pair) {
        [pair.upper, pair.lower].forEach(function (raw) {
          if (!raw) return;
          sourceTokens[script].push({ raw: raw, norm: normalize(raw), uey: rule.uey, priority: 0 });
        });
      });
    });
  });

  Object.keys(MANUAL_DECODE).forEach(function (script) {
    MANUAL_DECODE[script].forEach(function (item) {
      sourceTokens[script].push({ raw: item[0], norm: normalize(item[0]), uey: item[1], priority: 1 });
    });
  });

  Object.keys(sourceTokens).forEach(function (script) {
    const byKey = new Map();
    sourceTokens[script].forEach(function (token) {
      const key = token.norm + '\u0000' + token.uey;
      const current = byKey.get(key);
      if (!current || token.priority > current.priority ||
          (token.priority === current.priority && token.norm.length > current.norm.length)) {
        byKey.set(key, token);
      }
    });
    sourceTokens[script] = Array.from(byKey.values())
      .sort(function (a, b) { return (b.priority - a.priority) || (b.norm.length - a.norm.length); });
  });

  function isWordBoundary(char) {
    return !char || WORD_BOUNDARIES.has(char) || /\s/.test(char);
  }

  function isVowel(char) {
    return VOWELS.has(char);
  }

  function findSourceToken(text, index, script) {
    const tokens = sourceTokens[script] || [];
    const remaining = text.slice(index);
    const normalizedRemaining = normalize(remaining);
    for (let indexToken = 0; indexToken < tokens.length; indexToken += 1) {
      const token = tokens[indexToken];
      if (token.norm.length > remaining.length) continue;
      if (normalizedRemaining.slice(0, token.norm.length) === token.norm) {
        return token;
      }
    }
    return null;
  }

  function peekSourceToken(text, index, script) {
    return findSourceToken(text, index, script);
  }

  function decodeToUEY(text, script) {
    if (script === 'UEY') return text;
    let output = '';
    let index = 0;
    let wordStart = true;

    while (index < text.length) {
      const char = text[index];
      if (/\s/.test(char)) {
        output += char;
        wordStart = true;
        index += 1;
        continue;
      }
      if (WORD_BOUNDARIES.has(char) && char !== "'") {
        output += PUNCT_TO_UEY.get(char) || char;
        wordStart = true;
        index += 1;
        continue;
      }

      const token = findSourceToken(text, index, script);
      if (!token) {
        output += char;
        if (!isWordBoundary(char)) wordStart = false;
        index += 1;
        continue;
      }

      const canonical = token.uey;
      if (canonical === 'ئ' && wordStart) {
        const next = peekSourceToken(text, index + token.raw.length, script);
        if (next && next.uey.length === 1 && isVowel(next.uey)) {
          index += token.raw.length;
          continue;
        }
      }

      if (wordStart && canonical.length === 1 && isVowel(canonical)) {
        output += 'ئ';
      }
      output += canonical;
      wordStart = false;
      index += token.raw.length;
    }

    return output;
  }

  function stripDiacritics(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function applyLetterCase(value, uppercase) {
    if (!value) return value;
    if (!uppercase) return value;
    return value.charAt(0).toLocaleUpperCase('en-US') + value.slice(1);
  }

  function isSyllableOnset(text, index) {
    if (index <= 0) return true;
    const previous = text[index - 1];
    return isWordBoundary(previous) || isVowel(previous);
  }

  function selectVariant(rule, target, uppercase, context, options) {
    const variants = parseCell(rule[target]);
    if (!variants.length) return '';

    let index = 0;
    if (target === 'ULY' && rule.uey === 'ې') {
      const mode = Number(options && options.ulyMode) || 0;
      return mode === 1
        ? (uppercase ? 'Ë' : 'ë')
        : (uppercase ? 'É' : 'é');
    }
    if (target === 'UTY' && rule.uey === 'ى') {
      const mode = Number(options && options.iMode) || 0;
      if (mode === 1) return uppercase ? 'I' : 'ı';
      if (mode === 2) return uppercase ? 'İ' : 'i';
      return uppercase ? 'I' : 'i';
    }
    if (target === 'UHY' && rule.uey === 'ژ') {
      index = isSyllableOnset(context.text, context.index) ? 0 : Math.min(1, variants.length - 1);
    }

    const variant = variants[index] || variants[0];
    const selected = uppercase ? variant.upper : variant.lower;
    if (target === 'UHY' && Number(options && options.uhyMode) === 1) {
      return stripDiacritics(selected);
    }
    return selected;
  }

  function selectSpecial(text, index, target, uppercase) {
    if (target === 'UKY' && text.slice(index, index + 2) === 'يا') {
      return { length: 2, value: uppercase ? 'Я' : 'я' };
    }
    if (target === 'UKY' && text.slice(index, index + 2) === 'يۇ') {
      return { length: 2, value: uppercase ? 'Ю' : 'ю' };
    }
    if (target === 'ULY') {
      const pair = text.slice(index, index + 2);
      const special = {
        'سھ': "s'h",
        'چھ': "c'h",
        'گھ': "g'h",
        'زھ': "z'h",
        'نگ': "n'g"
      }[pair];
      if (special) return { length: 2, value: applyLetterCase(special, uppercase) };
    }
    return null;
  }

  function fromUEY(text, target, options) {
    if (target === 'UEY') return text;
    const settings = options || {};
    const shouldCapitalize = Boolean(settings.capitalize);
    let output = '';
    let index = 0;
    let sentenceStart = shouldCapitalize;
    let wordStart = true;

    while (index < text.length) {
      const char = text[index];

      if (char === '«' && text[index + 1] === '»') {
        output += '""';
        index += 2;
        wordStart = true;
        continue;
      }

      if (/\s/.test(char)) {
        output += char;
        if (char === '\n') sentenceStart = shouldCapitalize;
        wordStart = true;
        index += 1;
        continue;
      }

      if (PUNCT_FROM_UEY.has(char) || WORD_BOUNDARIES.has(char)) {
        output += PUNCT_FROM_UEY.get(char) || char;
        if (SENTENCE_END.has(char)) sentenceStart = shouldCapitalize;
        wordStart = true;
        index += 1;
        continue;
      }

      if (char === 'ئ' && wordStart && isVowel(text[index + 1])) {
        index += 1;
        continue;
      }

      const uppercase = shouldCapitalize && sentenceStart;
      const special = selectSpecial(text, index, target, uppercase);
      if (special) {
        output += special.value;
        sentenceStart = false;
        wordStart = false;
        index += special.length;
        continue;
      }

      const rule = rulesByUEY.get(char);
      const value = rule
        ? selectVariant(rule, target, uppercase, { text: text, index: index }, settings)
        : char;
      output += value;
      sentenceStart = false;
      wordStart = false;
      index += 1;
    }

    return output;
  }

  function convert(text, from, to, options) {
    const source = String(text == null ? '' : text);
    if (!SCRIPTS.includes(from) || !SCRIPTS.includes(to)) {
      throw new Error('Unsupported script.');
    }
    if (from === to) return source;
    const canonical = decodeToUEY(source, from);
    if (to === 'UEY') return canonical;
    return fromUEY(canonical, to, Object.assign({}, options, {
      capitalize: from === 'UEY'
    }));
  }

  const api = {
    convert: convert,
    decodeToUEY: decodeToUEY,
    fromUEY: fromUEY,
    scripts: SCRIPTS.slice(),
    normalize: normalize
  };

  root.UyghurConverter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
