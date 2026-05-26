const { readFileSync } = require('fs');
const text = `Sugar, BP, আনে control যা বানালে। Okay, okay. పాపానికి చాలా ఆఫ్టర్నూన్ అయితే చాలా ఉంటు� �ది. హామ్మ్. కోడ్ ఓ వెల్యూ ఏం కావాలి అడి? కానీ, ఆ, పో-పోర్షన్స్ லேட் అయింది. సిలబస్ லேட் అయింది. ప్లஸ் మా వేరே � ఆ, వాళ్ళకి ఏంటంటే, నెక్స్ట్ మந்த் 30 వారికి కాలేజ్ ఎஸ் వాళ్ళ கா లేజ్ అయிபోతే మా మన్నానికి కూడా అయిపోయి వెళ్దిగాని. ఇప్పుడు సెలబ్రేషన్స్ అంతా లేట్ லே . ఇప్పుడు వాళ్ళు కూడా ఏం తీసుకెళ్ళలేరు மళ్ళா. ఆ எక్స்டెండ్ చేస్తాను. ఎஸ்டిమేట్ எప్పుడు రావడం కూడా ఏం లేదు अंडी. జస్ట్ எக்ஸామ్ वిన్నప్పుడు � ஓకே. ஸ்டாப். ஸ்டோர் చెప్పండి. బార్-- ఉమ్... Thank you. College Hello, hello. மலை அப்புறம் தான் வேண்டும். ஆ, அதுக்கு முன்னாடி என்ன பண்ணலாம்? முன்னாடி என்ன பண்ணலாம்? அவுங்க. இல்ல இல்ல மேடம். மல்லா, πρώτο ఆஃப்டర்னூன் மல்லா కొంచம் மேபి ஏதாவது அப்படியே பென்சியன్ இருக்கும். இருக்கும். சரி. ஓ, சரி. வேற என்ன பண்ணிக்கலாம்? அதான் உனக்கு வந்து கொஞ்சம் ஆட்டோ ஸ்லீப் செய்து இருக்கேன். அதுக்கு பில் கால் முத்தம். முத்தம் பில் அந்த டைట్టா చేసి அ cancel பண்ணிட்டு பஸ் స్టాండ్ కి போயிட்டு இருக்கேன். ஆஹா, உன்னைக்கு இன்னைக்கு இல்ல, இன்னைக்கு இனிமேல் இல்ல. சொந்தக்கா ஆஹா, சொந்தக்கா இல்ல. சொந்தக்கா தான். ம். ಹ್ಮ್, ಕನ್ಯಾಬಳ್ಳಾಪುರ ಇಲ್ಲ ಅಲ್ಲಿ ವಾಟಿಕನ್ ಇದೆ. ಕೊತ್ತಂಬರಿ ಅಂತೆ ಪ್ರಾಬ್ಲಮ� �. ಹ್ಮ್. ہ্ম். ମୋ ନାଁ ଜଣେ ଜଣେ ଚିହ୍ନଟ ହେଇଗଲା ଆଉ ସେ ସାଙ୍ଗରେ ପ୍ରାଇଭେଟ୍‌� ହୁଁ, ଜେପା। ହୁଁ। Okay. Okay.`;

function splitSentences(text) {
  return (text.match(/[^.!?\u0964\n]+[.!?\u0964\n]*/g) || [])
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function analyze(text) {
  const sentences = splitSentences(text);
  const stopwords = new Set(['the','and','is','in','to','of','a','for','that','on','with','as','are','was','it','by','an','be','this','from','or','at','have','has','but','not','you','we','they','i','he','she','them']);
  const tokens = text.toLowerCase().replace(/[^\p{L}0-9\s]/gu,' ').split(/\s+/u).filter(w=>w.length>1 && !stopwords.has(w));
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t]||0)+1;

  const scored = sentences.map((sentence, idx) => {
    const words = sentence.toLowerCase().replace(/[^\p{L}0-9\s]/gu,' ').split(/\s+/u).filter(w=>w.length>1 && !stopwords.has(w));
    const score = words.reduce((acc,w)=>acc+(freq[w]||0),0)/Math.max(words.length,1);
    return { idx, sentence, words, score };
  });

  console.log('Total sentences:', sentences.length);
  for (const s of scored) {
    console.log('---');
    console.log('idx:', s.idx, 'score:', s.score.toFixed(2), 'words:', s.words.length);
    console.log(s.sentence);
  }
}

analyze(text);
