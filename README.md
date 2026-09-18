# Uyghur Script Transcriber

A dependency-free browser tool for converting between UEY and ULY, UYY, UHY, UTY, UXY and UKY.

## Preview

```powershell
npm start
```

Open `http://127.0.0.1:4173`.

## Rules

The generated `rules.js` file comes from `Uyghur.xlsx`. Regenerate it after editing the workbook:

```powershell
python scripts/generate_rules.py
```

## Test

```powershell
npm test
```
