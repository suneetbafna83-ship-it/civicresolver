export type AppLanguage = 'en' | 'hi';

export interface UiStrings {
  readonly tabReport: string;
  readonly tabTrack: string;
  readonly tabAdmin: string;
  readonly signOutSwitch: string;
  readonly reportLead: string;
  readonly reportTitle: string;
  readonly addPhoto: string;
  readonly changePhoto: string;
  readonly speakIssue: string;
  readonly stopSpeaking: string;
  readonly analyzeAi: string;
  readonly submitReport: string;
  readonly useGps: string;
  readonly pinOnMap: string;
  readonly speechLang: string;
  readonly trackLead: string;
  readonly trackTitle: string;
  readonly receiptBtn: string;
}

const EN_STRINGS: UiStrings = {
  tabReport: '1. Report Issue',
  tabTrack: '2. Track Complaints',
  tabAdmin: 'Municipal Admin Desk',
  signOutSwitch: 'Sign Out / Switch Portal',
  reportLead: 'Citizen Portal,',
  reportTitle: 'Report a Local Civic Problem',
  addPhoto: 'Add Photo (Optional)',
  changePhoto: 'Change Photo',
  speakIssue: 'Speak Issue (Voice)',
  stopSpeaking: 'Stop Speaking',
  analyzeAi: '1. Analyze with Gemini AI',
  submitReport: '2. Submit Official Report',
  useGps: '1. Use My GPS Location',
  pinOnMap: '2. Pin Point on Map',
  speechLang: 'en-IN',
  trackLead: 'Live Progress,',
  trackTitle: 'Citizen Issue Tracking Dashboard',
  receiptBtn: 'Official Receipt',
};

const HI_STRINGS: UiStrings = {
  tabReport: '1. शिकायत दर्ज करें',
  tabTrack: '2. शिकायत ट्रैक करें',
  tabAdmin: 'नगरपालिका एडमिन डेस्क',
  signOutSwitch: 'साइन आउट / पोर्टल बदलें',
  reportLead: 'नागरिक पोर्टल,',
  reportTitle: 'स्थानीय समस्या की रिपोर्ट करें',
  addPhoto: 'फ़ोटो जोड़ें (वैकल्पिक)',
  changePhoto: 'फ़ोटो बदलें',
  speakIssue: 'बोलकर लिखें (आवाज़)',
  stopSpeaking: 'रिकॉर्डिंग रोकें',
  analyzeAi: '1. Gemini AI से जांचें',
  submitReport: '2. आधिकारिक रिपोर्ट भेजें',
  useGps: '1. मेरा GPS स्थान चुनें',
  pinOnMap: '2. मानचित्र पर पिन लगाएं',
  speechLang: 'hi-IN',
  trackLead: 'लाइव स्थिति,',
  trackTitle: 'नागरिक शिकायत ट्रैकिंग डैशबोर्ड',
  receiptBtn: 'आधिकारिक रसीद',
};

export function getUiStrings(lang: AppLanguage): UiStrings {
  return lang === 'hi' ? HI_STRINGS : EN_STRINGS;
}
