import axios from 'axios';
import { config } from '../../config';
import { AppError } from '../../utils/errors';

/**
 * Сервис для работы с API ФНС (Федеральной Налоговой Службы).
 *
 * Поддерживает:
 * - Поиск ИП/ЮЛ по ИНН, ОГРН, наименованию
 * - Получение данных ЕГРЮЛ/ЕГРИП
 * - Проверка контрагентов
 *
 * Используется API: api-fns.ru (или альтернатива — dadata.ru)
 */

const fnsClient = axios.create({
  baseURL: config.fns.baseUrl,
  timeout: 15000,
});

export interface FnsSearchResult {
  inn: string;
  ogrn: string;
  name: string;
  fullName?: string;
  legalForm?: string;
  status?: string;
  registrationDate?: string;
  address?: string;
  okvedMain?: {
    code: string;
    name: string;
  };
  okvedAdditional?: Array<{
    code: string;
    name: string;
  }>;
  director?: string;
  authorizedCapital?: string;
}

export interface FnsCompanyDetails extends FnsSearchResult {
  taxSystem?: string;
  employees?: number;
  revenue?: string;
  registrationAuthority?: string;
  terminationDate?: string;
  terminationReason?: string;
}

/**
 * Поиск ЮЛ/ИП по ИНН.
 */
export async function searchByInn(inn: string): Promise<FnsSearchResult[]> {
  validateInn(inn);

  try {
    const response = await fnsClient.get('/egr', {
      params: {
        req: inn,
        key: config.fns.apiKey,
      },
    });

    return parseSearchResults(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return [];
    }
    throw new AppError('Ошибка при запросе к API ФНС', 502);
  }
}

/**
 * Поиск ЮЛ/ИП по ОГРН.
 */
export async function searchByOgrn(ogrn: string): Promise<FnsSearchResult[]> {
  try {
    const response = await fnsClient.get('/egr', {
      params: {
        req: ogrn,
        key: config.fns.apiKey,
      },
    });

    return parseSearchResults(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return [];
    }
    throw new AppError('Ошибка при запросе к API ФНС', 502);
  }
}

/**
 * Поиск по наименованию организации.
 */
export async function searchByName(name: string): Promise<FnsSearchResult[]> {
  if (!name || name.trim().length < 2) {
    throw new AppError('Название должно содержать минимум 2 символа', 400);
  }

  try {
    const response = await fnsClient.get('/egr', {
      params: {
        req: name.trim(),
        key: config.fns.apiKey,
      },
    });

    return parseSearchResults(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return [];
    }
    throw new AppError('Ошибка при запросе к API ФНС', 502);
  }
}

/**
 * Получить подробные данные о компании.
 */
export async function getCompanyDetails(inn: string): Promise<FnsCompanyDetails | null> {
  validateInn(inn);

  try {
    const response = await fnsClient.get('/egr', {
      params: {
        req: inn,
        key: config.fns.apiKey,
      },
    });

    const results = parseSearchResults(response.data);
    if (results.length === 0) return null;

    // Дополняем данные из BO API (бух. отчётность)
    let boData: any = null;
    try {
      const boResponse = await fnsClient.get('/bo', {
        params: {
          req: inn,
          key: config.fns.apiKey,
        },
      });
      boData = boResponse.data;
    } catch {
      // BO API может быть недоступен — это не критично
    }

    const details: FnsCompanyDetails = {
      ...results[0],
    };

    if (boData?.items?.[0]) {
      const bo = boData.items[0];
      details.revenue = bo.revenue || bo.ВыsearchByNameручка;
      details.employees = bo.employees || bo.СЧР;
    }

    return details;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw new AppError('Ошибка при запросе к API ФНС', 502);
  }
}

/**
 * Рекомендация кодов ОКВЭД по описанию бизнеса.
 * Это можно делать через LLM, т.к. ОКВЭД — справочник.
 */
export function getPopularOkvedCodes(): Array<{ code: string; name: string; description: string }> {
  return [
    { code: '62.01', name: 'Разработка ПО', description: 'Разработка компьютерного программного обеспечения' },
    { code: '62.02', name: 'ИТ-консалтинг', description: 'Деятельность консультативная в области компьютерных технологий' },
    { code: '47.91', name: 'Интернет-торговля', description: 'Торговля розничная по почте или по информационно-коммуникационной сети Интернет' },
    { code: '56.10', name: 'Общепит', description: 'Деятельность ресторанов и услуги по доставке продуктов питания' },
    { code: '73.11', name: 'Рекламное агентство', description: 'Деятельность рекламных агентств' },
    { code: '85.41', name: 'Образование', description: 'Образование дополнительное детей и взрослых' },
    { code: '96.02', name: 'Парикмахерская', description: 'Предоставление услуг парикмахерскими и салонами красоты' },
    { code: '68.20', name: 'Аренда недвижимости', description: 'Аренда и управление собственным или арендованным недвижимым имуществом' },
    { code: '49.41', name: 'Грузоперевозки', description: 'Деятельность автомобильного грузового транспорта' },
    { code: '41.20', name: 'Строительство', description: 'Строительство жилых и нежилых зданий' },
  ];
}

// ==================== Хелперы ====================

function validateInn(inn: string) {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) {
    throw new AppError('ИНН должен содержать 10 (ЮЛ) или 12 (ИП/ФЛ) цифр', 400);
  }
}

function parseSearchResults(data: any): FnsSearchResult[] {
  if (!data?.items?.length) return [];

  return data.items.map((item: any) => {
    const ul = item.ЮЛ || item.UL || {};
    const ip = item.ИП || item.IP || {};
    const entity = ul.ИНН ? ul : ip;

    return {
      inn: entity.ИНН || entity.INN || '',
      ogrn: entity.ОГРН || entity.ОГРНИП || entity.OGRN || '',
      name: entity.НаsearchByNameимКрат662 || entity.НаимПолworking || entity.ФИОПолworking || entity.name || 'Не указано',
      fullName: entity.НаимПолworking || entity.fullName || '',
      legalForm: entity.ОПФ?.Наим || entity.legalForm || '',
      status: entity.Статус?.Наим || entity.status || '',
      registrationDate: entity.ДатаОбр || entity.ДатаРег || entity.registrationDate || '',
      address: entity.Адрес?.Адрес || entity.address || '',
      okvedMain: entity.ОснВидДеят ? {
        code: entity.ОснВидДеят.Код || '',
        name: entity.ОснВидДеят.Наим || '',
      } : undefined,
      director: entity.Руководитель?.ФИОПолн || entity.director || '',
    };
  });
}
