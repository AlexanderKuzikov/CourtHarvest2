/**
 * Типы данных для API DaData (Справочник судов)
 * https://dadata.ru/api/suggest/court/
 */

export type CourtType =
  | 'RS' // Районный, городской, межрайонный суд
  | 'MS' // Мировой суд
  | 'AS' // Арбитражный суд субъекта
  | 'AA' // Арбитражный апелляционный суд
  | 'AO' // Арбитражный суд округа
  | 'AI' // Суд по интеллектуальным правам
  | 'VS' // Верховный Суд РФ
  | 'KJ' // Кассационный суд общей юрисдикции
  | 'AJ' // Апелляционный суд общей юрисдикции
  | 'GV' // Гарнизонный военный суд
  | 'KV' // Кассационный военный суд
  | 'AV' // Апелляционный военный суд
  | 'OV' // Окружной (флотский) военный суд
  | 'OS'; // Областной и равный ему суд

/** Все 14 типов судов */
export const ALL_COURT_TYPES: CourtType[] = [
  'RS', 'MS', 'AS', 'OS', 'GV', 'OV', 'KV', 'AV',
  'KJ', 'AJ', 'AA', 'AO', 'VS', 'AI',
];

/** Типы, требующие полного блочного перебора (MS/RS) */
export const HEAVY_TYPES: CourtType[] = ['MS', 'RS'];

/** Типы, где 1 суд на префикс (достаточно RRTT0000) */
export const SINGLE_TYPES: CourtType[] = [
  'OS', 'AS', 'VS', 'GV', 'OV', 'KV', 'AV',
  'KJ', 'AJ', 'AA', 'AO',
];

export interface CourtData {
  /** Уникальный код суда (59RS0001, 59MS0022) */
  code: string;
  /** Полное наименование */
  name: string;
  /** ИНН (может быть null для мировых) */
  inn: string | null;
  /** Код типа суда */
  court_type: CourtType;
  /** Расшифровка типа суда */
  court_type_name: string;
  /** Фактический адрес */
  address: string;
  /** Юридический адрес */
  legal_address: string | null;
  /** Ссылка на сайт */
  website: string | null;
  /** Телефон */
  phone?: string | null;
  /** Код региона */
  region_code?: string;
  /** ОКАТО */
  okato?: string;
  /** ОКТМО */
  okmo?: string;
  /** ОКПО */
  okpo?: string;
}

export interface DaDataSuggestion<T> {
  value: string;
  unrestricted_value: string;
  data: T;
}

export interface DaDataResponse<T> {
  suggestions: DaDataSuggestion<T>[];
}

export interface DaDataRequest {
  query: string;
  count?: number;
  locations?: { region_code?: string }[];
  filters?: { court_type?: CourtType | CourtType[] }[];
}
