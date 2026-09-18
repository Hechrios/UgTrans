const test = require('node:test');
const assert = require('node:assert/strict');
const converter = require('../converter.js');

test('converts the UEY reference phrase into every target script', () => {
  const source = 'ئۇيغۇر ئېلىپبەسى';
  assert.equal(converter.convert(source, 'UEY', 'ULY'), 'Uyghur élipbesi');
  assert.equal(converter.convert(source, 'UEY', 'UYY'), 'Uyƣur elipbəsi');
  assert.equal(converter.convert(source, 'UEY', 'UHY'), 'Uyĝur êlipbäsi');
  assert.equal(converter.convert(source, 'UEY', 'UTY'), 'Uyğur elipbäsi');
  assert.equal(converter.convert(source, 'UEY', 'UXY'), 'Uyğur elipbäsi');
  assert.equal(converter.convert(source, 'UEY', 'UKY'), 'Уйғур елипбәси');
});

test('cycles ULY e output between accent forms', () => {
  assert.equal(converter.convert('ئې', 'UEY', 'ULY', { ulyMode: 0 }), 'É');
  assert.equal(converter.convert('ئې', 'UEY', 'ULY', { ulyMode: 1 }), 'Ë');
  assert.equal(converter.convert('ë', 'ULY', 'UEY'), 'ئې');
});

test('removes UHY diacritics in the optional output mode', () => {
  assert.equal(converter.convert('ئۇيغۇر ئېلىپبەسى', 'UEY', 'UHY', { uhyMode: 0 }), 'Uyĝur êlipbäsi');
  assert.equal(converter.convert('ئۇيغۇر ئېلىپبەسى', 'UEY', 'UHY', { uhyMode: 1 }), 'Uygur elipbasi');
});

test('does not map UEY Ts to UHY C', () => {
  assert.equal(converter.convert('تس', 'UEY', 'UHY'), 'Ts');
});

test('decodes every reference script back to UEY', () => {
  const expected = 'ئۇيغۇر ئېلىپبەسى';
  assert.equal(converter.convert('Uyghur Élipbesi', 'ULY', 'UEY'), expected);
  assert.equal(converter.convert('Uyƣur Elipbəsi', 'UYY', 'UEY'), expected);
  assert.equal(converter.convert('Uyĝur Êlipbäsi', 'UHY', 'UEY'), expected);
  assert.equal(converter.convert('Uyğur Elipbäsi', 'UTY', 'UEY'), expected);
  assert.equal(converter.convert('Uyğur Elipbäsi', 'UXY', 'UEY'), expected);
  assert.equal(converter.convert('Уйғур Елпбǝси', 'UKY', 'UEY'), expected);
});

test('capitalizes each UEY sentence start', () => {
  assert.equal(
    converter.convert('ئۇيغۇر. ئېلىپبەسى! ب', 'UEY', 'ULY'),
    'Uyghur. Élipbesi! B'
  );
});

test('cycles the UTY i output states', () => {
  assert.equal(converter.convert('بى', 'UEY', 'UTY', { iMode: 0 }), 'Bi');
  assert.equal(converter.convert('بى', 'UEY', 'UTY', { iMode: 1 }), 'Bı');
  assert.equal(converter.convert('بى', 'UEY', 'UTY', { iMode: 2 }), 'Bi');
});

test('handles ULY separator forms from the workbook note', () => {
  assert.equal(converter.convert('سھ چھ گھ زھ نگ', 'UEY', 'ULY'), "S'h c'h g'h z'h n'g");
  assert.equal(converter.convert("s'h c'h g'h z'h n'g", 'ULY', 'UEY'), 'سھ چھ گھ زھ نگ');
});

test('keeps unmatched punctuation usable across scripts', () => {
  assert.equal(converter.convert('ئۇيغۇر، ئېلىپبەسى؟', 'UEY', 'ULY'), 'Uyghur, élipbesi?');
  assert.equal(converter.convert('Uyghur, Élipbesi?', 'ULY', 'UEY'), 'ئۇيغۇر، ئېلىپبەسى؟');
});
