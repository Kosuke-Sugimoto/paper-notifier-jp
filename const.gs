const VC_QUERY = "abs:%22Voice+Conversion%22+AND+%28co:interspeech+OR+co:icassp%29";
const SS_QUERY = "abs:%22Speech+Synthesis%22+AND+%28co:interspeech+OR+co:icassp%29";
// %22 %22 == " ", %28 %29 == ( )
let MAX_NOTIFICATION = 3;
let START = 0;
const SORTBY = "submittedDate"; // or lastUpdatedDate or relevant
const OPTIONS = {
  "method": "get",
  "muteHttpExceptions" : true,
  "validateHttpsCertificates" : false,
  "followRedirects" : false
};
const VC_SHEETNAME = "VoiceConversion";
const SS_SHEETNAME = "SpeechSynthesis";
let MAX_RESULTS = 500;
const LIMITDATE = new Date("2019/1/1");