// ========================================
// p5.js 英文選擇題測驗
// 題庫來源：Google Sheets 發布的 CSV
// ========================================

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSdztwgbcBRz5tdDP1HkCOThHKGKcvyhNy8CAEeOsraqUnEykzrs8a1lJQ2oDqiGoMwqwWC3yEU5sHN/pub?gid=1879474077&single=true&output=csv";

const sansFont = "Noto Sans TC";
const serifFont = "Noto Serif TC";
const QUESTIONS_PER_QUIZ = 5;

let fontsReady = false;
let csvReady = false;
let isLoading = true;
let loadError = "";

// buttons[0]～buttons[3]：四個選項；buttons[4]：下一題；buttons[5]：上一題。
let buttons = [];
let questionBank = [];
let quizQuestions = [];
let currentIndex = 0;
let score = 0;
let showFinalResult = false;
let answeredList = [];
let selectedList = [];

// ========================================
// p5.js 初始化
// ========================================

function setup() {
  createCanvas(windowWidth, windowHeight);
  useSansFont();
  updateLayout();
  loadFontsAndCSV();
}

async function loadFontsAndCSV() {
  try {
    await waitForFonts();
    fontsReady = true;
    await loadQuestionCSV();
    csvReady = true;
    prepareQuiz();
    isLoading = false;
    redraw();
  } catch (error) {
    console.error(error);
    const message = error && error.message
      ? error.message
      : "發生未知錯誤。";

    loadError =
      "資料載入失敗：\n" +
      message +
      "\n\n請確認：\n" +
      "1. Google Sheets 已發布到網路\n" +
      "2. SHEET_CSV_URL 網址正確\n" +
      "3. 第一列欄位為 Question,A,B,C,D,Answer\n" +
      "4. 使用 Live Server 開啟此 p5.js 專案";

    isLoading = false;
    redraw();
  }
}

// ========================================
// Noto Sans TC / Noto Serif TC 字體等待
// ========================================

async function waitForFonts() {
  if (!document.fonts || typeof document.fonts.load !== "function") {
    return;
  }

  await document.fonts.load('400 16px "Noto Sans TC"');
  await document.fonts.load('500 16px "Noto Sans TC"');
  await document.fonts.load('700 16px "Noto Sans TC"');
  await document.fonts.load('700 16px "Noto Serif TC"');
}

// ========================================
// Google Sheets CSV 讀取
// ========================================

async function loadQuestionCSV() {
  const csvUrl = new URL(SHEET_CSV_URL);
  csvUrl.searchParams.set("t", Date.now().toString());

  const response = await fetch(csvUrl.toString(), {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      "無法讀取 Google Sheets 發布的 CSV（HTTP " +
      response.status + "）。"
    );
  }

  // 使用 arrayBuffer + TextDecoder，確保中文以 UTF-8 正確解碼。
  const buffer = await response.arrayBuffer();
  const decoder = new TextDecoder("utf-8");
  let csvText = decoder.decode(buffer);
  csvText = csvText.replace(/^\uFEFF/, "");

  const rows = parseCSV(csvText);

  if (rows.length < 2) {
    throw new Error("CSV 裡沒有足夠的題目資料。");
  }

  const headers = rows[0].map(header =>
    String(header).trim().toLowerCase()
  );

  const questionColumn = headers.indexOf("question");
  const aColumn = headers.indexOf("a");
  const bColumn = headers.indexOf("b");
  const cColumn = headers.indexOf("c");
  const dColumn = headers.indexOf("d");
  const answerColumn = headers.indexOf("answer");

  if (
    questionColumn === -1 ||
    aColumn === -1 ||
    bColumn === -1 ||
    cColumn === -1 ||
    dColumn === -1 ||
    answerColumn === -1
  ) {
    throw new Error(
      "CSV 欄位必須包含：Question,A,B,C,D,Answer"
    );
  }

  questionBank = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) {
      continue;
    }

    const questionText = String(row[questionColumn] || "").trim();
    const choices = [
      String(row[aColumn] || "").trim(),
      String(row[bColumn] || "").trim(),
      String(row[cColumn] || "").trim(),
      String(row[dColumn] || "").trim()
    ];
    const answerText = String(row[answerColumn] || "").trim();

    if (
      questionText === "" ||
      choices.some(choice => choice === "") ||
      answerText === ""
    ) {
      continue;
    }

    const originalAnswerIndex =
      convertAnswerToIndex(answerText, choices);

    if (originalAnswerIndex === -1) {
      console.warn(
        "第 " + (i + 1) + " 列的答案格式無法辨識：",
        answerText
      );
      continue;
    }

    questionBank.push({
      q: questionText,
      choices,
      originalAnswerIndex
    });
  }

  if (questionBank.length < QUESTIONS_PER_QUIZ) {
    throw new Error(
      "CSV 有效題目少於 " +
      QUESTIONS_PER_QUIZ +
      " 題，目前只有 " +
      questionBank.length +
      " 題。"
    );
  }
}

// ========================================
// CSV 自訂 Parser
// 支援中文、雙引號、欄位內逗號、欄位內換行、跳脫雙引號
// ========================================

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    const nextCharacter = text[i + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        field += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === "," && !insideQuotes) {
      row.push(field);
      field = "";
    } else if (
      (character === "\n" || character === "\r") &&
      !insideQuotes
    ) {
      if (character === "\r" && nextCharacter === "\n") {
        i++;
      }

      row.push(field);
      field = "";

      if (row.length > 1 || row[0].trim() !== "") {
        rows.push(row);
      }
      row = [];
    } else {
      field += character;
    }
  }

  if (insideQuotes) {
    throw new Error("CSV 內容有未結束的雙引號。");
  }

  row.push(field);
  if (row.length > 1 || row[0].trim() !== "") {
    rows.push(row);
  }

  return rows;
}

// ========================================
// Answer 轉成索引
// 支援 A/B/C/D、0/1/2/3、答案文字
// ========================================

function convertAnswerToIndex(answerText, choices) {
  const answer = String(answerText).trim();
  const upperAnswer = answer.toUpperCase();

  if (["A", "B", "C", "D"].includes(upperAnswer)) {
    return upperAnswer.charCodeAt(0) - "A".charCodeAt(0);
  }

  if (["0", "1", "2", "3"].includes(answer)) {
    return Number(answer);
  }

  const normalizedAnswer = answer
    .replace(/\s+/g, " ")
    .toLowerCase();

  return choices.findIndex(choice =>
    choice.replace(/\s+/g, " ").toLowerCase() === normalizedAnswer
  );
}

// ========================================
// 隨機抽 5 題與選項洗牌
// ========================================

function prepareQuiz() {
  currentIndex = 0;
  score = 0;
  showFinalResult = false;

  const shuffledBank = shuffleArray([...questionBank]);
  const selectedQuestions = shuffledBank.slice(
    0,
    Math.min(QUESTIONS_PER_QUIZ, shuffledBank.length)
  );

  quizQuestions = selectedQuestions.map(question => {
    const options = question.choices.map((choice, index) => ({
      text: choice,
      originalIndex: index
    }));

    const shuffledOptions = shuffleArray(options);
    const newAnswerIndex = shuffledOptions.findIndex(option =>
      option.originalIndex === question.originalAnswerIndex
    );

    return {
      q: question.q,
      choices: shuffledOptions.map(option => option.text),
      answer: newAnswerIndex
    };
  });

  answeredList = new Array(quizQuestions.length).fill(false);
  selectedList = new Array(quizQuestions.length).fill(-1);
  updateLayout();
}

function shuffleArray(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// ========================================
// 畫面配置
// ========================================

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateLayout();
}

function updateLayout() {
  buttons = [];

  const marginX = max(20, width * 0.05);
  const contentW = max(0, width - marginX * 2);
  const gap = constrain(height * 0.018, 7, 15);
  const bottomButtonHeight = 46;
  const bottomY = height - bottomButtonHeight - 20;

  let questionLineCount = 1;
  if (quizQuestions.length > 0 && quizQuestions[currentIndex]) {
    const questionFontSize = min(20, width * 0.045);
    questionLineCount = splitTextLines(
      "Q. " + quizQuestions[currentIndex].q,
      max(120, contentW),
      questionFontSize,
      "serif"
    ).length;
  }

  const questionLineHeight = min(30, width * 0.065);
  const startY = max(
    135,
    58 + questionLineCount * questionLineHeight + 18
  );

  let buttonHeight =
    (bottomY - 18 - startY - gap * 3) / 4;
  buttonHeight = constrain(buttonHeight, 44, 86);

  // 選項按鈕索引固定為 0、1、2、3。
  for (let i = 0; i < 4; i++) {
    buttons.push({
      type: "choice",
      x: marginX,
      y: startY + i * (buttonHeight + gap),
      w: contentW,
      h: buttonHeight,
      label: String.fromCharCode(65 + i)
    });
  }

  const bottomButtonWidth = min(150, contentW * 0.36);

  // 下一題按鈕索引固定為 4。
  buttons.push({
    type: "next",
    x: width - marginX - bottomButtonWidth,
    y: bottomY,
    w: bottomButtonWidth,
    h: bottomButtonHeight,
    label: "下一題"
  });

  // 上一題按鈕索引固定為 5。
  buttons.push({
    type: "prev",
    x: marginX,
    y: bottomY,
    w: bottomButtonWidth,
    h: bottomButtonHeight,
    label: "回上頁"
  });
}

// ========================================
// p5.js draw
// ========================================

function draw() {
  background(245);

  if (isLoading) {
    drawLoadingScreen();
    return;
  }

  if (loadError !== "") {
    drawErrorScreen();
    return;
  }

  if (!fontsReady || !csvReady) {
    drawLoadingScreen();
    return;
  }

  if (showFinalResult) {
    drawFinalResult();
    return;
  }

  drawQuiz();
}

function drawLoadingScreen() {
  useSansFont();
  noStroke();
  fill(40);
  textAlign(CENTER, CENTER);
  textSize(min(20, width * 0.055));
  text("題目載入中...", width / 2, height / 2);
}

function drawErrorScreen() {
  useSansFont();
  noStroke();
  fill(180, 0, 0);
  textAlign(CENTER, TOP);

  const fontSize = min(18, width * 0.045);
  const lines = splitTextLines(
    loadError,
    max(160, width * 0.86),
    fontSize,
    "sans"
  );
  const lineHeight = fontSize * 1.55;
  const totalHeight = lines.length * lineHeight;
  const startY = max(20, height / 2 - totalHeight / 2);

  for (let i = 0; i < lines.length; i++) {
    text(lines[i], width / 2, startY + i * lineHeight);
  }
}

function drawQuiz() {
  if (!quizQuestions[currentIndex]) {
    return;
  }

  const marginX = max(20, width * 0.05);
  const contentW = width - marginX * 2;
  const question = quizQuestions[currentIndex];

  useSansFont();
  noStroke();
  fill(30);
  textAlign(LEFT, TOP);
  textSize(min(24, width * 0.055));
  text("英文選擇題測驗", marginX, 15);

  textAlign(RIGHT, TOP);
  textSize(min(15, width * 0.038));
  text(
    "題目 " + (currentIndex + 1) + " / " + quizQuestions.length,
    width - marginX,
    20
  );

  useSerifFont();
  textAlign(LEFT, TOP);
  const questionFontSize = min(20, width * 0.045);
  const questionLineHeight = min(30, width * 0.065);
  textSize(questionFontSize);

  drawWrappedText(
    "Q. " + question.q,
    marginX,
    58,
    contentW,
    questionLineHeight,
    "serif",
    questionFontSize
  );

  for (let i = 0; i < 4; i++) {
    drawChoiceButton(i, question);
  }

  drawPreviousButton();
  drawNextButton();
}

function drawChoiceButton(index, question) {
  const button = buttons[index];
  if (!button) {
    return;
  }

  let backgroundColor = color(255);
  let borderColor = color(120);

  if (answeredList[currentIndex]) {
    if (index === question.answer) {
      backgroundColor = color(200, 255, 200);
      borderColor = color(0, 170, 0);
    }

    if (
      selectedList[currentIndex] === index &&
      index !== question.answer
    ) {
      backgroundColor = color(255, 200, 200);
      borderColor = color(200, 0, 0);
    }
  } else if (isMouseOver(button)) {
    backgroundColor = color(235, 245, 255);
    borderColor = color(70, 130, 200);
  }

  stroke(borderColor);
  strokeWeight(1.5);
  fill(backgroundColor);
  rect(button.x, button.y, button.w, button.h, 8);

  const fontSize = min(17, button.h * 0.34);
  const textValue = button.label + ". " + question.choices[index];

  useSansFont();
  textSize(fontSize);
  textAlign(LEFT, TOP);
  fill(30);
  noStroke();

  const lines = splitTextLines(
    textValue,
    max(40, button.w - 24),
    fontSize,
    "sans"
  );
  const lineHeight = fontSize * 1.25;
  const totalHeight = lines.length * lineHeight;
  const startY = button.y + max(6, (button.h - totalHeight) / 2);

  for (let i = 0; i < lines.length; i++) {
    text(lines[i], button.x + 12, startY + i * lineHeight);
  }
}

function drawPreviousButton() {
  const button = buttons[5];
  if (!button) {
    return;
  }

  const enabled = currentIndex > 0;
  stroke(enabled ? 80 : 160);
  strokeWeight(1);
  fill(enabled ? color(240) : color(230));
  rect(button.x, button.y, button.w, button.h, 6);

  useSansFont();
  noStroke();
  fill(enabled ? 40 : 130);
  textAlign(CENTER, CENTER);
  textSize(16);
  text("回上頁", button.x + button.w / 2, button.y + button.h / 2);
}

function drawNextButton() {
  const button = buttons[4];
  if (!button || !answeredList[currentIndex]) {
    return;
  }

  const isLastQuestion = currentIndex === quizQuestions.length - 1;
  stroke(80);
  strokeWeight(1);
  fill(isLastQuestion ? color(200, 230, 255) : color(240));
  rect(button.x, button.y, button.w, button.h, 6);

  useSansFont();
  noStroke();
  fill(40);
  textAlign(CENTER, CENTER);
  textSize(16);
  text(
    isLastQuestion ? "看結果" : "下一題",
    button.x + button.w / 2,
    button.y + button.h / 2
  );
}

function drawFinalResult() {
  useSansFont();
  noStroke();
  fill(30);
  textAlign(CENTER, CENTER);

  textSize(min(32, width * 0.075));
  text("測驗結束！", width / 2, height * 0.30);

  textSize(min(25, width * 0.06));
  text(
    "你的總分：" + score + " / " + quizQuestions.length,
    width / 2,
    height * 0.42
  );

  const percentage = Math.round(score / quizQuestions.length * 100);
  textSize(min(19, width * 0.045));
  text("答對率：" + percentage + "%", width / 2, height * 0.50);

  const restartButton = getRestartButton();
  stroke(70, 110, 160);
  strokeWeight(1);
  fill(
    isMouseOver(restartButton)
      ? color(215, 235, 255)
      : color(235, 245, 255)
  );
  rect(
    restartButton.x,
    restartButton.y,
    restartButton.w,
    restartButton.h,
    8
  );

  noStroke();
  fill(30);
  textSize(17);
  text(
    "重新開始",
    restartButton.x + restartButton.w / 2,
    restartButton.y + restartButton.h / 2
  );
}

function getRestartButton() {
  return {
    x: width / 2 - min(180, width * 0.45) / 2,
    y: height * 0.62,
    w: min(180, width * 0.45),
    h: 48
  };
}

// ========================================
// 使用者操作
// ========================================

function mousePressed() {
  if (isLoading || loadError !== "") {
    return;
  }

  if (showFinalResult) {
    if (isMouseOver(getRestartButton())) {
      prepareQuiz();
    }
    return;
  }

  // 上一題按鈕固定為 buttons[5]。
  if (isMouseOver(buttons[5])) {
    if (currentIndex > 0) {
      currentIndex--;
      updateLayout();
    }
    return;
  }

  // 下一題／看結果按鈕固定為 buttons[4]。
  if (isMouseOver(buttons[4])) {
    if (!answeredList[currentIndex]) {
      return;
    }

    if (currentIndex < quizQuestions.length - 1) {
      currentIndex++;
      updateLayout();
    } else {
      showFinalResult = true;
    }
    return;
  }

  // 四個選項按鈕固定為 buttons[0]～buttons[3]。
  for (let i = 0; i < 4; i++) {
    if (isMouseOver(buttons[i])) {
      if (!answeredList[currentIndex]) {
        selectedList[currentIndex] = i;
        answeredList[currentIndex] = true;

        if (i === quizQuestions[currentIndex].answer) {
          score++;
        }
      }
      return;
    }
  }
}

function isMouseOver(button) {
  if (!button) {
    return false;
  }

  return (
    mouseX >= button.x &&
    mouseX <= button.x + button.w &&
    mouseY >= button.y &&
    mouseY <= button.y + button.h
  );
}

// ========================================
// 字體設定
// ========================================

function useSansFont() {
  textFont(sansFont);
  textStyle(NORMAL);
}

function useSerifFont() {
  textFont(serifFont);
  textStyle(BOLD);
}

// ========================================
// 中英文自動換行
// ========================================

function isCJKCharacter(character) {
  if (!character) {
    return false;
  }

  const codePoint = character.codePointAt(0);
  return (
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x3000 && codePoint <= 0x303f)
  );
}

function tokenizeText(value) {
  const tokens = [];
  let word = "";

  for (const character of String(value)) {
    if (/\s/.test(character)) {
      if (word !== "") {
        tokens.push(word);
        word = "";
      }
      if (tokens.length > 0 && tokens[tokens.length - 1] !== " ") {
        tokens.push(" ");
      }
    } else if (isCJKCharacter(character)) {
      if (word !== "") {
        tokens.push(word);
        word = "";
      }
      tokens.push(character);
    } else {
      word += character;
    }
  }

  if (word !== "") {
    tokens.push(word);
  }
  return tokens;
}

function splitTextLines(textValue, maxWidth, fontSize, fontType) {
  if (fontType === "serif") {
    useSerifFont();
  } else {
    useSansFont();
  }

  textSize(fontSize);
  const safeWidth = max(1, maxWidth);
  const paragraphs = String(textValue).replace(/\r/g, "").split("\n");
  const lines = [];

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    const tokens = tokenizeText(paragraphs[paragraphIndex]);
    let line = "";

    for (const token of tokens) {
      if (token === " " && line === "") {
        continue;
      }

      // 避免長英文單字或網址超出畫面，必要時逐字切開。
      if (token !== " " && textWidth(token) > safeWidth) {
        if (line !== "") {
          lines.push(line.trimEnd());
          line = "";
        }

        for (const character of Array.from(token)) {
          if (line !== "" && textWidth(line + character) > safeWidth) {
            lines.push(line);
            line = character;
          } else {
            line += character;
          }
        }
        continue;
      }

      const candidate = line + token;
      if (line !== "" && textWidth(candidate) > safeWidth) {
        lines.push(line.trimEnd());
        line = token === " " ? "" : token;
      } else {
        line = candidate;
      }
    }

    if (line !== "") {
      lines.push(line.trimEnd());
    }

    if (paragraphIndex < paragraphs.length - 1) {
      lines.push("");
    }
  }

  return lines.length > 0 ? lines : [""];
}

function drawWrappedText(
  textValue,
  x,
  y,
  maxWidth,
  lineHeight,
  fontType,
  fontSize
) {
  const lines = splitTextLines(
    textValue,
    maxWidth,
    fontSize,
    fontType
  );

  for (let i = 0; i < lines.length; i++) {
    text(lines[i], x, y + i * lineHeight);
  }

  if (fontType === "serif") {
    useSerifFont();
  } else {
    useSansFont();
  }
}