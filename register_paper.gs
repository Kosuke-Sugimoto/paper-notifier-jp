function register_main() {
  const ss = SpreadsheetApp.getActive();
  const vcSheet = ss.getSheetByName(VC_SHEETNAME);
  const ssSheet = ss.getSheetByName(SS_SHEETNAME);
  let vcData = vcSheet.getDataRange().getValues();
  let ssData = ssSheet.getDataRange().getValues();
  const vcHeaderSize = vcData[0].length;
  const ssHeaderSize = ssData[0].length;
  const vcUrlColumnIndex = vcData[0].indexOf("URL");
  const ssUrlColumnIndex = ssData[0].indexOf("URL");
  let vcSeenUrls = [];
  let ssSeenUrls = [];
  for (let i = 1; i < vcData.length; i++) {
    vcSeenUrls.push(vcData[i][vcUrlColumnIndex]);
  }
  for (let i = 1; i < ssData.length; i++) {
    ssSeenUrls.push(ssData[i][ssUrlColumnIndex]);
  }

  let start = START;
  vcArxivPapersInfo = getArxivPapersInfo(
    VC_QUERY, MAX_RESULTS, start, SORTBY, OPTIONS, vcSeenUrls
  )
  start = START;
  ssArxivPapersInfo = getArxivPapersInfo(
    SS_QUERY, MAX_RESULTS, START, SORTBY, OPTIONS, ssSeenUrls
  )
  console.log(vcArxivPapersInfo.length)
  console.log(ssArxivPapersInfo.length)

  register_spreadsheet(vcSheet, vcArxivPapersInfo, vcHeaderSize);
  register_spreadsheet(ssSheet, ssArxivPapersInfo, ssHeaderSize);
}

function getArxivPapersInfo(
  query, maxResults, start, sortBy, urlFetchOption, seenUrls
) {
  let realArxivPapersInfo = [];
  let continue_while = true;

  do {
    arxivPapersInfo = _getArxivPapersInfo(query, maxResults, start, sortBy, urlFetchOption);
    start += maxResults; // もしも重複があった場合、新規の範囲を検索する

    arxivPapersInfo.forEach(paperInfo => {
      if (!seenUrls.includes(paperInfo.url)) {
        // 新規
        realArxivPapersInfo.push(paperInfo);
      }
      if (new Date(paperInfo.updated) < LIMITDATE){
        continue_while = false;
      }
    })
  } while(arxivPapersInfo.length>=maxResults && continue_while);

  return realArxivPapersInfo;
}

function _getArxivPapersInfo(
  query, maxResults, start, sortBy, urlFetchOption
) {
  const url = `http://export.arxiv.org/api/query?search_query=${query}&max_results=${maxResults}&start=${start}&sortBy=${sortBy}&sortOrder=descending`;

  try {
    const xml = UrlFetchApp.fetch(url, urlFetchOption).getContentText();
    const document = XmlService.parse(xml);
    const root = document.getRootElement(); 
    /** arxivだと<feed>がrootにあたる */
    const common_namespace = XmlService.getNamespace("http://www.w3.org/2005/Atom")
    const comment_namespace = XmlService.getNamespace("arxiv", "http://arxiv.org/schemas/atom")
    /** <feed>にて名前空間が定義されているとき、子要素は名前空間を指定しないと適切にアクセスできない場合が考えられる */
    const entries = root.getChildren("entry", common_namespace);
    /** 各論文<entry>は1つだが、今回は複数個の論文を取得するため複数個の<entry>が存在する */

    const papersInfo = entries.map((entry) => {
      const url = entry.getChildText("id", common_namespace);
      const updated = entry.getChildText("updated", common_namespace);
      const published = entry.getChildText("published", common_namespace);
      const title = entry.getChildText("title", common_namespace);
      const abstruct = entry.getChildText("summary", common_namespace);
      const authors = entry.getChildren("author", common_namespace).map((author) => {
        return author.getChildText("name", common_namespace);
      });
      const comment = entry.getChildText("comment", comment_namespace);

      return {
        url: url,
        updated: updated,
        published: published,
        title: title,
        abstruct: abstruct,
        authors: authors,
        comment: comment
      };
    });

    return papersInfo;
  } catch(e) {
    console.log(e);
  }
}

function register_spreadsheet(
  sheet, arxivPapersInfo, headerSize
) {
  let lastRow = sheet.getLastRow();

  arxivPapersInfo.forEach(paperInfo => {
    lastRow++;
    sheet
      .getRange(lastRow, 1, 1, headerSize)
      .setValues([[new Date(), paperInfo["title"], paperInfo["url"], false]]);
  })
}
