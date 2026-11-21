import type {
  Department,
  IssueStatus,
  PriorityLevel,
} from '../../../shared/types/civic.js';
import { EN_STRINGS } from './locales/en.js';
import { HI_STRINGS } from './locales/hi.js';
import { TA_STRINGS } from './locales/ta.js';
import type { AppLanguage, UiStrings } from './types.js';

export type { AppLanguage, UiStrings };

export function getNextAppLanguage(current: AppLanguage): AppLanguage {
  if (current === 'en') {
    return 'hi';
  }
  if (current === 'hi') {
    return 'ta';
  }
  return 'en';
}

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
