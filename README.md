# 维吾尔文转写器

可将老维文（UEY）转写为各种形式，包括拉丁维文（ULY），新维文（UYY），官方转写（UHY），通用突厥语字母（UTY），民间一对一字母转写（UXY），西里尔维文（UKY），也可将这几种形式互转
点击右下角按钮可复制结果
其中ULY有é和ë两种模式，UTY有Ii、Iı、İi三种模式、UHY有带变音符号和不带变音符号两种模式
内置两种字体模式，可根据个人喜好切换
内置日间/夜间模式
使用DeepSeek V4 Flash制作

以下为大肥鱼自己生成的ReadMe内容

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
