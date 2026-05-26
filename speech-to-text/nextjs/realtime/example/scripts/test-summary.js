const text = `Sugar, BP, আনে control যা বানালে। Okay, okay. పాపానికి చాలా ఆఫ్టర్నూన్ అయితే చాలా ఉంటుది. హామ్మ్. కోడ్ ఓ వెల్యూ ఏం కావాలి అడీ? కానీ, ఆ, పో-పోర్షన్స్ లేట్ అయింది. సిలబస్ లేట్ అయింది. ప్లస్ మా వేరే ఆ వాళ్ళకి ఏంటంటే, నెక్స్ట్ మంత్ 30 వారికి కాలేజ్ ఎస్ వాళ్ళ కళేజ్ అయిపోతే మా మన్నానికి కూడా అయిపోయి వెళ్దిగాని. ఇప్పుడు సెలబ్రేషన్స్ అంతా లేట్ లే. ఇప్పుడు వాళ్ళు కూడా ఏం తీసుకెళ్ళలేరు మళ్ళా. ఆ ఎక్స్టెండ్ చేస్తాను. ఎస్టిమేట్ ఎప్పుడు రావడం కూడా ఏం లేదు. జస్ట్ ఎగ్జామ్ విన్నప్పుడు ఓకే. స్టాప్. స్టోర్ చెప్పండి. బార్-- ఉమ్... Thank you. College Hello, hello. மலை அப்புறம் தான் வேண்டும். ఆ, அதுக்கு முன்னాడి என்ன பண்ணலாம்? முன்னాడి என்ன பண்ணலாம்? అవுங்க. இல்ல இல்ல மேடம். மல்லா, முதல் ఆఫ్టర్‌నూన్ மல்லா కొంచం మేబీ ఏదొకటి ఉంటుంది. ఉంటుంది. சரి. ஓ, சரி. வேற என்ன பண்ணிக்கலாம்? அதான் உனக்கு வந்து கொஞ்சம் ఆட்டో స్లீప్ செய்து இருக்கேன். அதుకు பில் கால் முத்தம். మுத்தం బిల్ அந்த டைட்டா చేసి cancel பண்ணிட்டு బస్ స్టాండ్ కి போయிட்டு இருக்கேன். ఆஹా, உன்னைக்கு இன்னைக்கு இல்ல, இன்னைக்கு இனிமேல் இல்ல. சொந்தக்கా ஆஹా, சொந்தக்கா இல்ல. சொந்தக்கా தான். ம். ಹ್ಮ್, కన್ಯాబಳ್ಳాపುರ లేదు అಲ್ಲಿ ವಾಟికನ್ ఉంది. కొత్తంభరి అంటే సమస్య. హ్మ్. హ్మ్. ମୋ ନାଁ ଜଣେ ଜଣେ ଚିହ୍ନଟ ହେଇଗଲା ଆଉ ସେ ସାଙ୍ଗରେ ପ୍ରାଇଭେଟ୍‌ ହୁଁ, ଜେపా. హుం. Okay. Okay.`;

function splitSentences(text) {
  return (text.match(/[^.!?\u0964\n]+[.!?\u0964\n]*/g) || [])
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function buildLocalSummaryLocal(text) {
  const sentences = splitSentences(text);
  if (!sentences.length) return text.trim().slice(0, 300) + (text.length>300? '…':'');

  const stopwords = new Set(['the','and','is','in','to','of','a','for','that','on','with','as','are','was','it','by','an','be','this','from','or','at','have','has','but','not','you','we','they','i','he','she','them']);
  const tokens = text.toLowerCase().replace(/[^\p{L}0-9\s]/gu,' ').split(/\s+/u).filter(w=>w.length>1 && !stopwords.has(w));
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t]||0)+1;

  const scored = sentences.map((sentence, idx) => {
    const words = sentence.toLowerCase().replace(/[^\p{L}0-9\s]/gu,' ').split(/\s+/u).filter(w=>w.length>1 && !stopwords.has(w));
    const score = words.reduce((acc,w)=>acc+(freq[w]||0),0)/Math.max(words.length,1);
    return { sentence, idx, score, contentCount: words.length };
  });

  const substantive = scored.filter(s => s.contentCount >= 3);
  const pool = substantive.length? substantive : scored;
  const picked = pool.sort((a,b)=> b.score - a.score).slice(0,5).sort((a,b)=> a.idx - b.idx).map(x=>x.sentence);

  const paragraph = picked.join(' ').replace(/\s+/g,' ').trim();
  const cleaned = paragraph.replace(/\b(um|uh|you know|like|I mean)\b/gi,'').replace(/\s+\./g,'.').trim();
  const result = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return result.endsWith('.')? result: result + '.';
}

console.log('SUMMARY:\n', buildLocalSummaryLocal(text));
