import type {
  Department,
  IssueStatus,
  PriorityLevel,
} from '../../../shared/types/civic.js';

export type AppLanguage = 'en' | 'hi' | 'ta';

export function getNextAppLanguage(current: AppLanguage): AppLanguage {
  if (current === 'en') {
    return 'hi';
  }
  if (current === 'hi') {
    return 'ta';
  }
  return 'en';
}

export interface UiStrings {
  readonly languageBadge: string;
  readonly languageShort: string;
  readonly tabReport: string;
  readonly tabTrack: string;
  readonly tabAdmin: string;
  readonly signOutSwitch: string;
  readonly switchShort: string;
  readonly gateBadge: string;
  readonly gateWelcomePrefix: string;
  readonly gateWelcomeMain: string;
  readonly gateSubtitle: string;
  readonly citizenPortalTitle: string;
  readonly citizenPortalSub: string;
  readonly citizenRoleBadge: string;
  readonly enterCitizenWorkspace: string;
  readonly citizenGoogleBtn: string;
  readonly citizenEmailHeading: string;
  readonly citizenRegisterHeading: string;
  readonly createCitizenLink: string;
  readonly haveAccountLink: string;
  readonly fullNameLabel: string;
  readonly citizenEmailLabel: string;
  readonly passwordLabel: string;
  readonly citizenEmailSubmit: string;
  readonly citizenRegisterSubmit: string;
  readonly citizenLockNote: string;
  readonly adminPortalTitle: string;
  readonly adminPortalSub: string;
  readonly adminRoleBadge: string;
  readonly enterAdminDemoBtn: string;
  readonly verifiedOfficerHeading: string;
  readonly roleDeptCheckedBadge: string;
  readonly deptClearanceLabel: string;
  readonly allDeptsSuperAdmin: string;
  readonly scopedStaffSuffix: string;
  readonly officerEmailLabel: string;
  readonly officerPasskeyLabel: string;
  readonly adminSignInSubmit: string;
  readonly adminLockNote: string;
  readonly reportLead: string;
  readonly reportTitle: string;
  readonly addPhoto: string;
  readonly changePhoto: string;
  readonly speakIssue: string;
  readonly stopSpeaking: string;
  readonly issueTitleLabel: string;
  readonly issueDescLabel: string;
  readonly streetAddressLabel: string;
  readonly categoryLabel: string;
  readonly autoDetectAi: string;
  readonly analyzeAi: string;
  readonly submitReport: string;
  readonly submittingLabel: string;
  readonly analyzingLabel: string;
  readonly pinLocationTitle: string;
  readonly pinLocationHint: string;
  readonly aiRoutingTitle: string;
  readonly aiPreviewHint: string;
  readonly useGps: string;
  readonly pinOnMap: string;
  readonly speechLang: string;
  readonly trackLead: string;
  readonly trackTitle: string;
  readonly trackSubtitle: string;
  readonly allStatuses: string;
  readonly allCategories: string;
  readonly searchPlaceholder: string;
  readonly communityMapTitle: string;
  readonly receiptBtn: string;
  readonly upvotedLabel: string;
  readonly upvoteActionLabel: string;
  readonly reportedByLabel: string;
  readonly municipalUpdateLabel: string;
  readonly stepReported: string;
  readonly stepInProgress: string;
  readonly stepResolved: string;
  readonly adminLead: string;
  readonly adminTitle: string;
  readonly adminSubtitleAll: string;
  readonly adminSubtitleScoped: string;
  readonly exportCsvBtn: string;
  readonly allDepartments: string;
  readonly statusActionLabel: string;
  readonly attachAfterPhoto: string;
  readonly updateAfterPhoto: string;
  readonly proofAttached: string;
  readonly assignedDeptLabel: string;
  readonly lockedDeptLabel: string;
  readonly dispatchNoteLabel: string;
  readonly saveBtn: string;
  readonly overdueOnlyBtn: string;
  readonly showAllQueueBtn: string;
  readonly transferQueueTitle: string;
  readonly requestTransferBtn: string;
  readonly auditLogTitle: string;
  readonly slaHealthTitle: string;
  readonly totalScopeLabel: string;
  readonly activeQueueLabel: string;
  readonly overdueSlaLabel: string;
  readonly resolvedRateLabel: string;
  readonly severityBreakdownTitle: string;
  readonly intakeTrendTitle: string;
  readonly aiSpotlightTitle: string;
  readonly civicVitalsTitle: string;
  readonly nextStepTitle: string;
  readonly rbacScopeTitle: string;
  readonly aiVaultTitle: string;
  readonly cadSpecBtn: string;
  readonly footerNotice: string;
  readonly citizenWorkspaceTag: string;
  readonly allDeptAdminTag: string;
  readonly onlyTag: string;
}

const EN_STRINGS: UiStrings = {
  languageBadge: 'EN / हिंदी / தமிழ்',
  languageShort: 'EN',
  tabReport: '1. Report Issue',
  tabTrack: '2. Track Complaints',
  tabAdmin: 'Municipal Admin Desk',
  signOutSwitch: 'Sign Out / Switch Portal',
  switchShort: 'Switch',
  gateBadge: 'Strict RBAC Sign-In Gate',
  gateWelcomePrefix: 'Welcome to CivicResolve,',
  gateWelcomeMain: 'Select Your Dedicated Workspace',
  gateSubtitle:
    'Citizen and Municipal Admin workspaces are strictly isolated. Sign in to the portal that matches your role.',
  citizenPortalTitle: 'Citizen Portal Sign In',
  citizenPortalSub: 'Access: 1. Report Issue & 2. Track Complaints',
  citizenRoleBadge: 'Citizen Role',
  enterCitizenWorkspace: 'Enter Citizen Workspace (1-Click Demo Citizen)',
  citizenGoogleBtn: 'Citizen Google Sign-In',
  citizenEmailHeading: 'Citizen Email & Password',
  citizenRegisterHeading: 'Register Citizen Account',
  createCitizenLink: 'Create citizen account',
  haveAccountLink: 'Have an account? Sign in',
  fullNameLabel: 'Full Name',
  citizenEmailLabel: 'Citizen Email',
  passwordLabel: 'Password',
  citizenEmailSubmit: 'Sign In as Citizen with Email',
  citizenRegisterSubmit: 'Create Citizen Account',
  citizenLockNote:
    'Citizen accounts cannot access the Municipal Admin Command Desk.',
  adminPortalTitle: 'Municipal Admin Sign In',
  adminPortalSub: 'Access: Admin Command Desk & Department Dispatch Only',
  adminRoleBadge: 'Admin Role',
  enterAdminDemoBtn: 'Enter Admin Command Desk (1-Click Demo Admin)',
  verifiedOfficerHeading: 'Verified Department Staff & Officer Sign In',
  roleDeptCheckedBadge: 'PBKDF2 & Dept Checked',
  deptClearanceLabel: 'Department Clearance Scope',
  allDeptsSuperAdmin: 'All Departments (City Ops Super Admin)',
  scopedStaffSuffix: 'Scoped Staff Only',
  officerEmailLabel: 'Officer Email',
  officerPasskeyLabel: 'Department Passkey',
  adminSignInSubmit: 'Sign In as Department Officer',
  adminLockNote:
    'Department staff cannot view, query, or update other departments’ tasks.',
  reportLead: 'Citizen Portal,',
  reportTitle: 'Report a Local Civic Problem',
  addPhoto: 'Add Photo (Optional)',
  changePhoto: 'Change Photo',
  speakIssue: 'Speak Issue (Voice)',
  stopSpeaking: 'Stop Speaking',
  issueTitleLabel: 'Short Issue Title',
  issueDescLabel: 'What Happened & Public Impact',
  streetAddressLabel: 'Street / Landmark Location',
  categoryLabel: 'Issue Category',
  autoDetectAi: 'Auto-Detect with Gemini AI',
  analyzeAi: '1. Analyze with Gemini AI',
  submitReport: '2. Submit Official Report',
  submittingLabel: 'Submitting...',
  analyzingLabel: 'Analyzing...',
  pinLocationTitle: 'Pin Problem Location',
  pinLocationHint: 'GPS or click directly on map',
  aiRoutingTitle: 'Gemini AI Classification & Routing',
  aiPreviewHint:
    'Click a sample preset above or press "1. Analyze with Gemini AI" to preview category, urgency, and department dispatch.',
  useGps: '1. Use My GPS Location',
  pinOnMap: '2. Pin Point on Map',
  speechLang: 'en-IN',
  trackLead: 'Live Progress,',
  trackTitle: 'Citizen Issue Tracking Dashboard',
  trackSubtitle:
    'Follow every report with live SLA countdowns, before/after photo proof, and official downloadable receipts.',
  allStatuses: 'All Statuses',
  allCategories: 'All Categories',
  searchPlaceholder: 'Search street, title, or department...',
  communityMapTitle: 'Community Issue Map',
  receiptBtn: 'Official Receipt',
  upvotedLabel: 'Upvoted',
  upvoteActionLabel: '+1 Affected',
  reportedByLabel: 'Reported by',
  municipalUpdateLabel: 'Municipal Update:',
  stepReported: '1. Reported',
  stepInProgress: '2. In Progress',
  stepResolved: '3. Resolved',
  adminLead: 'Operations,',
  adminTitle: 'Municipal Admin Command Desk',
  adminSubtitleAll:
    'Review cross-department complaints sorted by urgency, approve transfer requests, attach After-Repair proof, and export dispatch queues.',
  adminSubtitleScoped:
    'Restricted Department Clearance: managing tasks assigned exclusively to your department.',
  exportCsvBtn: 'Export Queue (CSV)',
  allDepartments: 'All Departments',
  statusActionLabel: 'Status Action',
  attachAfterPhoto: 'Attach After-Repair Proof',
  updateAfterPhoto: 'Update After-Repair Photo',
  proofAttached: 'Proof Attached',
  assignedDeptLabel: 'Assigned Department',
  lockedDeptLabel: 'Department (Locked)',
  dispatchNoteLabel: 'Official Dispatch / Resolution Note',
  saveBtn: 'Save',
  overdueOnlyBtn: 'Overdue SLA Only',
  showAllQueueBtn: 'Show Full Queue',
  transferQueueTitle: 'Cross-Department Handover Queue',
  requestTransferBtn: 'Request Dept Handover',
  auditLogTitle: 'Immutable Municipal Audit Log',
  slaHealthTitle: 'SLA Health & Readiness',
  totalScopeLabel: 'Total Scope',
  activeQueueLabel: 'Active Queue',
  overdueSlaLabel: 'Overdue SLA',
  resolvedRateLabel: 'Resolved Rate',
  severityBreakdownTitle: 'Severity & Workload Breakdown',
  intakeTrendTitle: '6-Day Intake vs. Resolution Trend',
  aiSpotlightTitle: 'AI Priority Spotlight',
  civicVitalsTitle: 'Civic Vitals & Engagement',
  nextStepTitle: 'Next Operational Step',
  rbacScopeTitle: 'RBAC Clearance Scope',
  aiVaultTitle: 'Civic AI & Vault',
  cadSpecBtn: 'UI Spec Sheet (CAD)',
  footerNotice:
    'CivicResolve · Scoped Department RBAC · Google Gemini, Firebase Spark & Maps',
  citizenWorkspaceTag: 'Citizen Workspace',
  allDeptAdminTag: 'All-Dept Admin',
  onlyTag: 'Only',
};

const HI_STRINGS: UiStrings = {
  languageBadge: 'हिंदी / தமிழ் / EN',
  languageShort: 'हिं',
  tabReport: '1. शिकायत दर्ज करें',
  tabTrack: '2. शिकायत ट्रैक करें',
  tabAdmin: 'नगरपालिका एडमिन डेस्क',
  signOutSwitch: 'साइन आउट / पोर्टल बदलें',
  switchShort: 'बदलें',
  gateBadge: 'सख्त RBAC साइन-इन गेट',
  gateWelcomePrefix: 'CivicResolve में आपका स्वागत है,',
  gateWelcomeMain: 'अपना समर्पित कार्यक्षेत्र चुनें',
  gateSubtitle:
    'नागरिक और नगरपालिका एडमिन कार्यक्षेत्र पूरी तरह अलग हैं। अपनी भूमिका के अनुसार साइन इन करें।',
  citizenPortalTitle: 'नागरिक पोर्टल साइन इन',
  citizenPortalSub: 'पहुंच: 1. शिकायत दर्ज करें और 2. शिकायत ट्रैक करें',
  citizenRoleBadge: 'नागरिक भूमिका',
  enterCitizenWorkspace: 'नागरिक कार्यक्षेत्र में प्रवेश करें (1-क्लिक डेमो)',
  citizenGoogleBtn: 'नागरिक Google साइन-इन',
  citizenEmailHeading: 'नागरिक ईमेल और पासवर्ड',
  citizenRegisterHeading: 'नया नागरिक खाता बनाएं',
  createCitizenLink: 'नागरिक खाता बनाएं',
  haveAccountLink: 'खाता है? साइन इन करें',
  fullNameLabel: 'पूरा नाम',
  citizenEmailLabel: 'नागरिक ईमेल',
  passwordLabel: 'पासवर्ड',
  citizenEmailSubmit: 'ईमेल से नागरिक साइन इन',
  citizenRegisterSubmit: 'नागरिक खाता बनाएं',
  citizenLockNote:
    'नागरिक खाते नगरपालिका एडमिन कमांड डेस्क तक नहीं पहुंच सकते।',
  adminPortalTitle: 'नगरपालिका एडमिन साइन इन',
  adminPortalSub: 'पहुंच: केवल एडमिन कमांड डेस्क और विभाग डिस्पैच',
  adminRoleBadge: 'एडमिन भूमिका',
  enterAdminDemoBtn: 'एडमिन कमांड डेस्क खोलें (1-क्लिक डेमो एडमिन)',
  verifiedOfficerHeading: 'सत्यापित विभाग अधिकारी साइन इन',
  roleDeptCheckedBadge: 'PBKDF2 और विभाग सत्यापित',
  deptClearanceLabel: 'विभाग अनुमति क्षेत्र',
  allDeptsSuperAdmin: 'सभी विभाग (सिटी ऑप्स सुपर एडमिन)',
  scopedStaffSuffix: 'केवल विभाग कर्मचारी',
  officerEmailLabel: 'अधिकारी ईमेल',
  officerPasskeyLabel: 'विभाग पासकी',
  adminSignInSubmit: 'विभाग अधिकारी साइन इन',
  adminLockNote:
    'विभाग के कर्मचारी अन्य विभागों के कार्य देख या बदल नहीं सकते।',
  reportLead: 'नागरिक पोर्टल,',
  reportTitle: 'स्थानीय समस्या की रिपोर्ट करें',
  addPhoto: 'फ़ोटो जोड़ें (वैकल्पिक)',
  changePhoto: 'फ़ोटो बदलें',
  speakIssue: 'बोलकर लिखें (आवाज़)',
  stopSpeaking: 'रिकॉर्डिंग रोकें',
  issueTitleLabel: 'समस्या का संक्षिप्त शीर्षक',
  issueDescLabel: 'क्या हुआ और जन प्रभाव',
  streetAddressLabel: 'सड़क / स्थान का पता',
  categoryLabel: 'समस्या श्रेणी',
  autoDetectAi: 'Gemini AI द्वारा स्वतः पहचानें',
  analyzeAi: '1. Gemini AI से जांचें',
  submitReport: '2. आधिकारिक रिपोर्ट भेजें',
  submittingLabel: 'भेजा जा रहा है...',
  analyzingLabel: 'जांच हो रही है...',
  pinLocationTitle: 'समस्या का स्थान पिन करें',
  pinLocationHint: 'GPS या मानचित्र पर क्लिक करें',
  aiRoutingTitle: 'Gemini AI वर्गीकरण और विभाग रूटिंग',
  aiPreviewHint:
    'श्रेणी, प्राथमिकता और विभाग देखने के लिए ऊपर नमूना चुनें या "Gemini AI से जांचें" दबाएं।',
  useGps: '1. मेरा GPS स्थान चुनें',
  pinOnMap: '2. मानचित्र पर पिन लगाएं',
  speechLang: 'hi-IN',
  trackLead: 'लाइव स्थिति,',
  trackTitle: 'नागरिक शिकायत ट्रैकिंग डैशबोर्ड',
  trackSubtitle:
    'लाइव SLA काउंटडाउन, मरम्मत के पहले/बाद की फ़ोटो और आधिकारिक रसीद के साथ हर शिकायत ट्रैक करें।',
  allStatuses: 'सभी स्थितियां',
  allCategories: 'सभी श्रेणियां',
  searchPlaceholder: 'सड़क, शीर्षक या विभाग खोजें...',
  communityMapTitle: 'सामुदायिक समस्या मानचित्र',
  receiptBtn: 'आधिकारिक रसीद',
  upvotedLabel: 'समर्थित',
  upvoteActionLabel: '+1 प्रभावित',
  reportedByLabel: 'रिपोर्टकर्ता',
  municipalUpdateLabel: 'नगरपालिका अपडेट:',
  stepReported: '1. दर्ज',
  stepInProgress: '2. प्रगति पर',
  stepResolved: '3. हल हुआ',
  adminLead: 'संचालन,',
  adminTitle: 'नगरपालिका एडमिन कमांड डेस्क',
  adminSubtitleAll:
    'प्राथमिकता के अनुसार सभी विभागों की शिकायतें देखें, ट्रांसफर अनुरोध स्वीकृत करें और CSV निर्यात करें।',
  adminSubtitleScoped:
    'सीमित विभाग अनुमति: केवल आपके विभाग को सौंपे गए कार्य प्रबंधित करें।',
  exportCsvBtn: 'कतार निर्यात करें (CSV)',
  allDepartments: 'सभी विभाग',
  statusActionLabel: 'स्थिति कार्रवाई',
  attachAfterPhoto: 'मरम्मत के बाद फ़ोटो प्रमाण जोड़ें',
  updateAfterPhoto: 'मरम्मत फ़ोटो अपडेट करें',
  proofAttached: 'प्रमाण जुड़ा है',
  assignedDeptLabel: 'सौंपा गया विभाग',
  lockedDeptLabel: 'विभाग (लॉक)',
  dispatchNoteLabel: 'आधिकारिक डिस्पैच / समाधान नोट',
  saveBtn: 'सहेजें',
  overdueOnlyBtn: 'केवल विलंबित SLA',
  showAllQueueBtn: 'पूरी कतार दिखाएं',
  transferQueueTitle: 'अंतर-विभाग ट्रांसफर अनुरोध कतार',
  requestTransferBtn: 'विभाग ट्रांसफर अनुरोध',
  auditLogTitle: 'अपरिवर्तनीय नगरपालिका ऑडिट लॉग',
  slaHealthTitle: 'SLA स्वास्थ्य और तैयारी',
  totalScopeLabel: 'कुल शिकायतें',
  activeQueueLabel: 'सक्रिय कतार',
  overdueSlaLabel: 'विलंबित SLA',
  resolvedRateLabel: 'समाधान दर',
  severityBreakdownTitle: 'गंभीरता और कार्यभार विश्लेषण',
  intakeTrendTitle: '6-दिन शिकायत बनाम समाधान रुझान',
  aiSpotlightTitle: 'AI प्राथमिकता फोकस',
  civicVitalsTitle: 'नागरिक सहभागिता और आंकड़े',
  nextStepTitle: 'अगला परिचालन कदम',
  rbacScopeTitle: 'RBAC अनुमति क्षेत्र',
  aiVaultTitle: 'Civic AI और वॉल्ट',
  cadSpecBtn: 'UI स्पेक शीट (CAD)',
  footerNotice:
    'CivicResolve · विभाग-सीमित RBAC · Google Gemini, Firebase Spark और Maps',
  citizenWorkspaceTag: 'नागरिक कार्यक्षेत्र',
  allDeptAdminTag: 'सभी-विभाग एडमिन',
  onlyTag: 'केवल',
};

const TA_STRINGS: UiStrings = {
  languageBadge: 'தமிழ் / EN / हिंदी',
  languageShort: 'தமி',
  tabReport: '1. புகார் பதிவு செய்க',
  tabTrack: '2. புகார்களை கண்காணிக்கவும்',
  tabAdmin: 'நகராட்சி நிர்வாக மேசை',
  signOutSwitch: 'வெளியேறு / போர்டல் மாற்று',
  switchShort: 'மாற்று',
  gateBadge: 'கடுமையான RBAC உள்நுழைவு',
  gateWelcomePrefix: 'CivicResolve-க்கு வரவேற்கிறோம்,',
  gateWelcomeMain: 'உங்கள் பிரத்யேக பணியிடத்தைத் தேர்ந்தெடுக்கவும்',
  gateSubtitle:
    'குடிமக்கள் மற்றும் நகராட்சி நிர்வாக பணியிடங்கள் முற்றிலும் தனித்தனியானவை. உங்கள் பொறுப்பிற்கு ஏற்ப உள்நுழையவும்.',
  citizenPortalTitle: 'குடிமக்கள் போர்டல் உள்நுழைவு',
  citizenPortalSub: 'அணுகல்: 1. புகார் பதிவு & 2. புகார் கண்காணிப்பு',
  citizenRoleBadge: 'குடிமகன் பங்கு',
  enterCitizenWorkspace: 'குடிமக்கள் பணியிடத்தில் நுழைக (1-கிளிக் டெமோ)',
  citizenGoogleBtn: 'குடிமகன் Google உள்நுழைவு',
  citizenEmailHeading: 'குடிமகன் மின்னஞ்சல் & கடவுச்சொல்',
  citizenRegisterHeading: 'புதிய குடிமகன் கணக்கு உருவாக்கு',
  createCitizenLink: 'குடிமகன் கணக்கு உருவாக்கு',
  haveAccountLink: 'கணக்கு உள்ளதா? உள்நுழைக',
  fullNameLabel: 'முழு பெயர்',
  citizenEmailLabel: 'குடிமகன் மின்னஞ்சல்',
  passwordLabel: 'கடவுச்சொல்',
  citizenEmailSubmit: 'மின்னஞ்சல் மூலம் உள்நுழைக',
  citizenRegisterSubmit: 'குடிமகன் கணக்கு உருவாக்கு',
  citizenLockNote:
    'குடிமகன் கணக்குகள் நகராட்சி நிர்வாக மேசையை அணுக முடியாது.',
  adminPortalTitle: 'நகராட்சி நிர்வாக உள்நுழைவு',
  adminPortalSub: 'அணுகல்: நிர்வாக கட்டளை மேசை & துறை ஒதுக்கீடு மட்டும்',
  adminRoleBadge: 'நிர்வாக பங்கு',
  enterAdminDemoBtn: 'நிர்வாக கட்டளை மேசை (1-கிளிக் டெமோ நிர்வாகி)',
  verifiedOfficerHeading: 'சரிபார்க்கப்பட்ட துறை அதிகாரி உள்நுழைவு',
  roleDeptCheckedBadge: 'PBKDF2 & துறை சரிபார்ப்பு',
  deptClearanceLabel: 'துறை அனுமதி வரம்பு',
  allDeptsSuperAdmin: 'அனைத்து துறைகள் (நகர சூப்பர் நிர்வாகி)',
  scopedStaffSuffix: 'துறை பணியாளர் மட்டும்',
  officerEmailLabel: 'அதிகாரி மின்னஞ்சல்',
  officerPasskeyLabel: 'துறை கடவுச்சாவி (Passkey)',
  adminSignInSubmit: 'துறை அதிகாரியாக உள்நுழைக',
  adminLockNote:
    'துறை பணியாளர்கள் பிற துறைகளின் பணிகளை பார்க்கவோ மாற்றவோ முடியாது.',
  reportLead: 'குடிமக்கள் போர்டல்,',
  reportTitle: 'உள்ளூர் குடிமைப் பிரச்சினையைப் புகாரளிக்கவும்',
  addPhoto: 'புகைப்படம் சேர் (விருப்பம்)',
  changePhoto: 'புகைப்படத்தை மாற்று',
  speakIssue: 'குரல் மூலம் பதிவு செய்க',
  stopSpeaking: 'பதிவை நிறுத்து',
  issueTitleLabel: 'புகாரின் சுருக்கத் தலைப்பு',
  issueDescLabel: 'நடந்த விவரம் & பொதுமக்கள் பாதிப்பு',
  streetAddressLabel: 'தெரு / அடையாள முகவரி',
  categoryLabel: 'புகார் வகை',
  autoDetectAi: 'Gemini AI தானாக கண்டறியவும்',
  analyzeAi: '1. Gemini AI மூலம் பகுப்பாய்வு செய்க',
  submitReport: '2. அதிகாரப்பூர்வ புகாரை சமர்ப்பிக்கவும்',
  submittingLabel: 'சமர்ப்பிக்கப்படுகிறது...',
  analyzingLabel: 'பகுப்பாய்வு செய்கிறது...',
  pinLocationTitle: 'பிரச்சினை இடத்தைக் குறிக்கவும்',
  pinLocationHint: 'GPS அல்லது வரைபடத்தில் கிளிக் செய்க',
  aiRoutingTitle: 'Gemini AI வகைப்பாடு & துறை வழிநடத்தல்',
  aiPreviewHint:
    'வகை, அவசர நிலை மற்றும் துறையைப் பார்க்க மேலே மாதிரியைத் தேர்ந்தெடுக்கவும் அல்லது "Gemini AI" பொத்தானை அழுத்தவும்.',
  useGps: '1. எனது GPS இடத்தைப் பயன்படுத்து',
  pinOnMap: '2. வரைபடத்தில் இடம் குறிக்கவும்',
  speechLang: 'ta-IN',
  trackLead: 'நேரடி நிலை,',
  trackTitle: 'குடிமக்கள் புகார் கண்காணிப்பு பலகை',
  trackSubtitle:
    'நேரடி SLA கவுண்டவுன், பழுதுபார்க்கும் முன்/பின் புகைப்படம் மற்றும் அதிகாரப்பூர்வ ரசீதுடன் புகார்களைக் கண்காணிக்கவும்.',
  allStatuses: 'அனைத்து நிலைகள்',
  allCategories: 'அனைத்து வகைகள்',
  searchPlaceholder: 'தெரு, தலைப்பு அல்லது துறையைத் தேடு...',
  communityMapTitle: 'சமூக புகார் வரைபடம்',
  receiptBtn: 'அதிகாரப்பூர்வ ரசீது',
  upvotedLabel: 'ஆதரிக்கப்பட்டது',
  upvoteActionLabel: '+1 பாதிக்கப்பட்டவர்',
  reportedByLabel: 'புகாரளித்தவர்',
  municipalUpdateLabel: 'நகராட்சி அறிவிப்பு:',
  stepReported: '1. பதிவானது',
  stepInProgress: '2. பணியில்',
  stepResolved: '3. தீர்வு காணப்பட்டது',
  adminLead: 'செயல்பாடுகள்,',
  adminTitle: 'நகராட்சி நிர்வாக கட்டளை மேசை',
  adminSubtitleAll:
    'அவசர வரிசையில் புகார்களை மதிப்பாய்வு செய்து, துறை மாற்றக் கோரிக்கைகளை அங்கீகரித்து CSV ஏற்றுமதி செய்க.',
  adminSubtitleScoped:
    'கட்டுப்படுத்தப்பட்ட துறை அனுமதி: உங்கள் துறைக்கு ஒதுக்கப்பட்ட பணிகள் மட்டுமே.',
  exportCsvBtn: 'வரிசையை ஏற்றுமதி செய் (CSV)',
  allDepartments: 'அனைத்து துறைகள்',
  statusActionLabel: 'நிலை நடவடிக்கை',
  attachAfterPhoto: 'பழுதுபார்த்த பின் புகைப்படச் சான்று சேர்',
  updateAfterPhoto: 'பழுதுபார்த்த புகைப்படத்தை மாற்று',
  proofAttached: 'சான்று இணைக்கப்பட்டது',
  assignedDeptLabel: 'ஒதுக்கப்பட்ட துறை',
  lockedDeptLabel: 'துறை (பூட்டப்பட்டது)',
  dispatchNoteLabel: 'அதிகாரப்பூர்வ பணி / தீர்வு குறிப்பு',
  saveBtn: 'சேமி',
  overdueOnlyBtn: 'காலாவதியான SLA மட்டும்',
  showAllQueueBtn: 'முழு வரிசையையும் காட்டு',
  transferQueueTitle: 'துறை மாற்றக் கோரிக்கை வரிசை',
  requestTransferBtn: 'துறை மாற்றம் கோரு',
  auditLogTitle: 'மாற்ற முடியாத நகராட்சி தணிக்கை பதிவு',
  slaHealthTitle: 'SLA ஆரோக்கியம் & தயார்நிலை',
  totalScopeLabel: 'மொத்த புகார்கள்',
  activeQueueLabel: 'செயலில் உள்ளவை',
  overdueSlaLabel: 'தாமதமான SLA',
  resolvedRateLabel: 'தீர்வு விகிதம்',
  severityBreakdownTitle: 'தீவிரம் & பணிச்சுமை பகுப்பாய்வு',
  intakeTrendTitle: '6-நாள் புகார் vs தீர்வு போக்கு',
  aiSpotlightTitle: 'AI முன்னுரிமை கவனம்',
  civicVitalsTitle: 'குடிமை ஈடுபாடு & புள்ளிவிவரம்',
  nextStepTitle: 'அடுத்த செயல்பாட்டு படி',
  rbacScopeTitle: 'RBAC அனுமதி வரம்பு',
  aiVaultTitle: 'Civic AI & பாதுகாப்பு',
  cadSpecBtn: 'UI விவரக்குறிப்பு (CAD)',
  footerNotice:
    'CivicResolve · துறை-வரம்பு RBAC · Google Gemini, Firebase Spark & Maps',
  citizenWorkspaceTag: 'குடிமக்கள் பணியிடம்',
  allDeptAdminTag: 'அனைத்து-துறை நிர்வாகி',
  onlyTag: 'மட்டும்',
};

export function getUiStrings(lang: AppLanguage): UiStrings {
  if (lang === 'hi') {
    return HI_STRINGS;
  }
  if (lang === 'ta') {
    return TA_STRINGS;
  }
  return EN_STRINGS;
}

export function translateStatus(status: IssueStatus, lang: AppLanguage): string {
  if (lang === 'en') {
    return status;
  }
  if (lang === 'hi') {
    switch (status) {
      case 'Reported':
        return 'दर्ज';
      case 'In Progress':
        return 'प्रगति पर';
      case 'Resolved':
        return 'हल हुआ';
    }
  }
  switch (status) {
    case 'Reported':
      return 'பதிவானது';
    case 'In Progress':
      return 'பணியில்';
    case 'Resolved':
      return 'தீர்வு';
  }
}

export function translatePriority(
  level: PriorityLevel,
  lang: AppLanguage,
): string {
  if (lang === 'en') {
    return level;
  }
  if (lang === 'hi') {
    switch (level) {
      case 'Critical':
        return 'अति गंभीर';
      case 'High':
        return 'उच्च';
      case 'Medium':
        return 'मध्यम';
      case 'Low':
        return 'सामान्य';
    }
  }
  switch (level) {
    case 'Critical':
      return 'மிக அவசரம்';
    case 'High':
      return 'அதிகம்';
    case 'Medium':
      return 'நடுத்தரம்';
    case 'Low':
      return 'குறைவு';
  }
}

export function translateDepartment(
  dept: Department,
  lang: AppLanguage,
): string {
  if (lang === 'en') {
    return dept;
  }
  if (lang === 'hi') {
    switch (dept) {
      case 'Roads & Infrastructure':
        return 'सड़क एवं बुनियादी ढांचा';
      case 'Sanitation & Waste':
        return 'स्वच्छता एवं कचरा प्रबंधन';
      case 'Electrical & Streetlights':
        return 'बिजली एवं स्ट्रीटलाइट';
      case 'Water & Sewage':
        return 'जल एवं सीवेज विभाग';
      case 'Public Safety':
        return 'जन सुरक्षा विभाग';
    }
  }
  switch (dept) {
    case 'Roads & Infrastructure':
      return 'சாலைகள் & உள்கட்டமைப்பு';
    case 'Sanitation & Waste':
      return 'சுகாதாரம் & கழிவு மேலாண்மை';
    case 'Electrical & Streetlights':
      return 'மின்சாரம் & தெருவிளக்குகள்';
    case 'Water & Sewage':
      return 'குடிநீர் & கழிவுநீர் துறை';
    case 'Public Safety':
      return 'பொதுப் பாதுகாப்பு துறை';
  }
}
