function notify_main() {
  const ss = SpreadsheetApp.getActive();
  const vcSheet = ss.getSheetByName(VC_SHEETNAME);
  let vcData = vcSheet.getDataRange().getValues();
  const vcHeaderSize = vcData[0].length;
  const vcUrlColumnIndex = vcData[0].indexOf("URL");
  const vcCheckColumnIndex = vcData[0].indexOf("Check");

  const result = getPapersInfoFromSpread(
    vcSheet, vcData, vcUrlColumnIndex, vcCheckColumnIndex
  );

  let finalResult = [];
  let allTokensNum = 0;
  let allTokens = "";
  let toEnglish = {1: "First", 2: "Second", 3: "Third"};
  let tmpJpText = "";

  result.texts.forEach((text, index) => {
    resultDict = send2GPT(text);
    allTokens += `${toEnglish[index+1]} Paper Token: ${resultDict["numTokens"]["total_tokens"]}\n`;
    allTokens += `${toEnglish[index+1]} Paper Cost: ${resultDict["numTokens"]["prompt_tokens"]/1000*0.147+resultDict["numTokens"]["completion_tokens"]/1000*0.294}\n`
    allTokensNum += resultDict["numTokens"]["total_tokens"];
    tmpJpText = LanguageApp.translate(resultDict["message"]["content"], "en", "ja");
    finalResult.push(`[URL]\n${result.urls[index]}\n`);
    finalResult.push("[Abstruct]\n");
    finalResult.push(tmpJpText);
  });
  
  allTokens += `Total Paper Token: ${allTokensNum}`;
  finalResult.push(allTokens);
  
  send2Slack(finalResult);
}

function send2GPT(
  text
) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const token = scriptProperties.getProperty("CHATGPTAPITOKEN");
  const chatgptUrl = "https://api.openai.com/v1/chat/completions";

  const prompt = {"role": "system",
  "content": `I will be sending the full text of a research paper shortly. Please summarize the content of the paper according to the following format:
  1. What is the paper about?
  2. How is it significant compared to prior studies?
  3. What is the core of the technology or methodology?
  4. How was its effectiveness validated?
  Additionally, the paper I will send has been transcribed, and some parts, like captions, may be misformatted. Please feel free to ignore these issues.`};
  const messages = [prompt, {"role": "user", "content": `${text}`}];

  const headers = {
    "Authorization": "Bearer " + token,
    "Content-type": "application/json",
    "X-Slack-No-Retry": 1
    // 3秒以内に返送されないと再送する？(↑ を指定しないと)
  };

  const options = {
    "muteHttpExceptions": true,
    "headers": headers,
    "method": "POST",
    "payload": JSON.stringify({
      "model": "gpt-3.5-turbo-1106",
      "max_tokens" : 1000,
      "temperature" : 0.9,
      "messages": messages})
  };
  // gpt-3.5-turboとだけ指定すると公式の表示と違い、
  // 自動でgpt-3.5-turbo-0613になってしまうらしく
  // 最大長が入力・出力合わせて4096となる
  // gpt-3.5-turbo-1106と指定すれば公式の表示通り、
  // 最大長が入力・出力合わせて16384となる
  // この際、最大長はmax_tokenで指定した数＋送ったプロンプトのトークン数となっている
  // つまり、恐らくmax_tokenは出力の最大長
  // 2024/1/30現在、
  // 1000トークン辺り、Input: 0.001ドル、Output: 0.002ドル
  // 1000トークン辺り、Input: 0.147円、Output: 0.294円

  try {
    const response = UrlFetchApp.fetch(chatgptUrl, options);
    let json = JSON.parse(response.getContentText());
    let numTokens = json["usage"];
    return {"numTokens": numTokens, "message": json["choices"][0]["message"]};
  } catch(e) {
    console.log(e);
    console.log("error");
  }
}

function getPapersInfoFromSpread(
  sheet,
  sheetData,
  urlColumnIndex,
  checkColumnIndex
) {
  let targetUrls = [];

  for(let i=1; i<sheetData.length; i++) {
    if(!sheetData[i][checkColumnIndex]) {
      // getRangeの引数は(行番号, 列番号)なので、インデクスなら+1しなきゃダメ
      sheet.getRange(i+1, checkColumnIndex+1).setValue(true);
      targetUrls.push(sheetData[i][urlColumnIndex]);
    }
    if(targetUrls.length>=MAX_NOTIFICATION) break;
  }

  resultTexts = customOCR(targetUrls);

  return {
    texts: resultTexts,
    urls: targetUrls
  };
}

function customOCR(
  targetUrls
) {
  // OCRを作るにあたってとても参考になったページ
  // https://stackoverflow.com/questions/77675659/apps-script-drive-files-insert-not-a-function

  let resource = {
    "name": "tmp",
    "mimeType": MimeType.GOOGLE_DOCS
  };

  let option = {
    "ocr": true,
    "ocrLanguage": "ja"
  };

  let resultTexts = [];

  targetUrls.forEach(url => {
    url = url.replace("abs", "pdf");
    let pdfBlob = UrlFetchApp.fetch(url).getAs("application/pdf");
    
    // OCR処理のためのコピー
    const {id, name} = Drive.Files.create(
      resource, pdfBlob, option
    )
    let text = DocumentApp.openById(id).getBody().getText();
    // コピーはいらないのでゴミ箱に
    DriveApp.getFileById(id).setTrashed(true);

    resultTexts.push(replaceBreak(text));
  })

  return resultTexts;
}


function send2LineNotify(
  arxivPapersInfo
) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const token = scriptProperties.getProperty("LINENOTIFYTOKEN");

  lineNotifyOptions = {
    "method": "post",
    "headers": {"Authorization": "Bearer " + token},
    "payload": {"message": "sample"}
  };

  arxivPapersInfo.forEach(paperInfo => {
    lineNotifyOptions.payload.message = parser(paperInfo);

    UrlFetchApp.fetch("https://notify-api.line.me/api/notify", lineNotifyOptions)
  });
}

function replaceBreak(data){
  const br = /[\r\n]+/g; //改行
  const rep = " "; //置換文字列
  return data.replace(br,rep);
}

// TODO
// title, abstractは改行を消した方が綺麗？
function parser(paperInfo) {
  let message = "\n"; // 何故か[表示名]から改行なしで始まるため

  for(let key in paperInfo){
    message += `[${key}]\n`;
    if (key == "title" || key == "abstruct"){
      message += `${replaceBreak(paperInfo[key])}\n`;
    } else {
      message += `${paperInfo[key]}\n`;
    }
  }

  return message;
}

function send2Slack(
  arxivPapersInfo
) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const token = scriptProperties.getProperty("SLACKAPITOKEN");
  const slackApp = SlackApp.create(token);
  const channelId = "#論文Bot";

  arxivPapersInfo.forEach(paperInfo => {
    // const message = parser(paperInfo);
    const message = paperInfo;

    slackApp.chatPostMessage(
      channel = channelId,
      text = message
    );
  });
}