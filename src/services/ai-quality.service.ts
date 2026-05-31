export type AuditSeverity = 'critical' | 'major' | 'minor';

export interface AuditIssue {
  code: string;
  severity: AuditSeverity;
  message: string;
}

export interface AuditResult {
  errorRate: number;
  score: number;
  issues: AuditIssue[];
}

const severityWeight: Record<AuditSeverity, number> = {
  critical: 35,
  major: 20,
  minor: 10,
};

const foreignJurisdictionPatterns = [
  /\bIRS\b/i,
  /\bEIN\b/i,
  /\bDelaware\b/i,
  /\bLLC\b/i,
  /налогов(ая|ую)\s+служб(а|у)\s+сша/i,
  /британск(ое|ая|ий)\s+право/i,
];

const overconfidencePatterns = [
  /\b100%\b.*\b(законно|безопасно|точно)\b/i,
  /гарантирую,?\s+что\s+это\s+(законно|разрешено)/i,
  /никаких\s+(налогов|обязательств|рисков)\s+не\s+будет/i,
];

const legalTopicPattern = /(налог|фнс|ип|ооо|самозан|нпд|усн|осн|патент|оквэд|касс|54-фз|регистрац|лиценз|договор|персональн|152-фз|маркировк|сертификац)/i;

const russianContextPatterns = [
  /(ФНС|nalog\.ru|Госуслуг|Роскомнадзор)/i,
  /(НК\s*РФ|54-ФЗ|129-ФЗ|422-ФЗ|152-ФЗ|2300-1|Честн(ый|ом)\s+знак)/i,
  /(ИП|ООО|НПД|УСН|ОСН|патент|ПСН)/i,
  /(ОКВЭД|онлайн-касс|ККТ|расч[её]тн(ый|ого) сч[её]т)/i,
];

const dangerousInaccuracyRules: Array<{ code: string; severity: AuditSeverity; pattern: RegExp; message: string }> = [
  {
    code: 'NPD_WRONG_RATE',
    severity: 'critical',
    pattern: /(НПД|самозанят)[\s\S]{0,100}(13%|15%|20%|6%\s+с\s+физлиц|4%\s+с\s+юрлиц)/i,
    message: 'Ставки НПД должны быть 4% с физлиц и 6% с юрлиц/ИП.',
  },
  {
    code: 'USN_6_PROFIT',
    severity: 'major',
    pattern: /УСН\s*6\s*%[^\n.!?]{0,50}((с|от|на)\s+прибыл|доходы\s+минус\s+расходы)/i,
    message: 'УСН 6% применяется к доходам, а не к прибыли.',
  },
  {
    code: 'USN_15_REVENUE_ONLY',
    severity: 'major',
    pattern: /УСН\s*15\s*%[\s\S]{0,80}(только\s+с\s+доход|со\s+всей\s+выручк)/i,
    message: 'УСН 15% обычно относится к объекту «доходы минус расходы».',
  },
  {
    code: 'IP_NO_PERSONAL_LIABILITY',
    severity: 'critical',
    pattern: /ИП[\s\S]{0,120}(не\s+отвечает|не\s+рискует)[\s\S]{0,80}(личн|имуществ)/i,
    message: 'ИП отвечает по обязательствам личным имуществом.',
  },
  {
    code: 'ONLINE_STORE_NO_KKT',
    severity: 'major',
    pattern: /(интернет-магазин|онлайн-продаж)[\s\S]{0,160}(касс|ККТ|54-ФЗ)[\s\S]{0,80}(не\s+нужн|никогда\s+не\s+нужн)/i,
    message: 'Для онлайн-продаж вопрос ККТ по 54-ФЗ нельзя обобщать как «никогда не нужна».',
  },
];

export function auditRussianBusinessAnswer(content: string): AuditResult {
  const issues: AuditIssue[] = [];
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return {
      errorRate: 100,
      score: 0,
      issues: [{ code: 'EMPTY_RESPONSE', severity: 'critical', message: 'Пустой ответ ИИ.' }],
    };
  }

  for (const pattern of foreignJurisdictionPatterns) {
    if (pattern.test(normalizedContent)) {
      issues.push({
        code: 'FOREIGN_JURISDICTION',
        severity: 'major',
        message: 'Ответ содержит признаки нероссийской юрисдикции без явного запроса пользователя.',
      });
      break;
    }
  }

  for (const pattern of overconfidencePatterns) {
    if (pattern.test(normalizedContent)) {
      issues.push({
        code: 'LEGAL_OVERCONFIDENCE',
        severity: 'major',
        message: 'Юридический/налоговый совет сформулирован чрезмерно уверенно без оговорок.',
      });
      break;
    }
  }

  for (const rule of dangerousInaccuracyRules) {
    if (rule.pattern.test(normalizedContent)) {
      issues.push({ code: rule.code, severity: rule.severity, message: rule.message });
    }
  }

  if (/(самозанят|НПД)[\s\S]{0,120}(может|можно|разрешено|допускается|подходит)[\s\S]{0,80}(нанять|нанимать|сотрудник|работник)/i.test(normalizedContent)
    && !/(нельзя|не\s+может|не\s+допускает|без\s+сотрудник|запрещ)/i.test(normalizedContent)) {
    issues.push({
      code: 'NPD_EMPLOYEES',
      severity: 'critical',
      message: 'НПД/самозанятый не должен подаваться как режим с наёмными сотрудниками.',
    });
  }

  const mentionsPatentForLlc = normalizedContent
    .split(/[.!?\n]+/)
    .some(sentence => {
      const directLlcPatent = /(ООО|общество\s+с\s+ограниченной)\s+(на|по)\s+(патент|ПСН)|(патент|ПСН)\s+(для|на)\s+(ООО|общество\s+с\s+ограниченной)/i.test(sentence);
      const actionLlcPatent = /(ООО|общество\s+с\s+ограниченной)[\s\S]{0,80}(может|выбрать|применя|использ|подходит|оформить|открыть)[\s\S]{0,80}(патент|ПСН)/i.test(sentence);
      const patentClearlyBelongsToIp = /ИП[\s\S]{0,40}(на|по)?\s*(патент|ПСН)|(патент|ПСН)[\s\S]{0,40}ИП/i.test(sentence);

      return (directLlcPatent || actionLlcPatent) && !patentClearlyBelongsToIp;
    });
  const correctlyRejectsPatentForLlc = /(патент|ПСН)[\s\S]{0,120}(доступн|подходит|применя)[\s\S]{0,80}(только\s+ИП|для\s+ИП)|(ООО|общество\s+с\s+ограниченной)[\s\S]{0,160}(патент|ПСН)[\s\S]{0,120}(нельзя|не\s+подходит|не\s+доступ|недоступ|не\s+может)|(патент|ПСН)[\s\S]{0,160}(ООО|общество\s+с\s+ограниченной)[\s\S]{0,120}(нельзя|не\s+подходит|не\s+доступ|недоступ|не\s+может)/i.test(normalizedContent);

  if (mentionsPatentForLlc && !correctlyRejectsPatentForLlc) {
    issues.push({
      code: 'PATENT_FOR_LLC',
      severity: 'critical',
      message: 'Патентная система налогообложения доступна ИП, но не ООО.',
    });
  }

  const mentionsIpCharterCapital = /ИП[\s\S]{0,120}(уставн(ый|ого)\s+капитал|10\s*000\s*руб)/i.test(normalizedContent);
  const correctlyRejectsIpCharterCapital = /ИП[\s\S]{0,120}(уставн(ый|ого)\s+капитал|10\s*000\s*руб)[\s\S]{0,80}(не\s+нуж|не\s+треб|не\s+формир|нет)|(ИП)[\s\S]{0,80}(не\s+нуж|не\s+треб)[\s\S]{0,80}(уставн(ый|ого)\s+капитал|10\s*000\s*руб)/i.test(normalizedContent);

  if (mentionsIpCharterCapital && !correctlyRejectsIpCharterCapital) {
    issues.push({
      code: 'IP_CHARTER_CAPITAL',
      severity: 'major',
      message: 'Для ИП не нужен уставный капитал.',
    });
  }

  if (legalTopicPattern.test(normalizedContent)) {
    const contextHits = russianContextPatterns.filter(pattern => pattern.test(normalizedContent)).length;

    if (contextHits < 1) {
      issues.push({
        code: 'WEAK_RUSSIAN_LEGAL_CONTEXT',
        severity: 'minor',
        message: 'В юридическом/налоговом ответе недостаточно российских правовых ориентиров.',
      });
    }

    if (!/(проверьте\s+актуальн|актуальн(ые|ость).*ФНС|nalog\.ru|консультац(ия|ией)\s+(бухгалтер|юрист)|профильн(ым|ого)\s+(бухгалтер|юрист)|зависит\s+от|по\s+конкретн|нужно\s+уточн|стоит\s+провер)/i.test(normalizedContent)) {
      issues.push({
        code: 'NO_CURRENT_LAW_DISCLAIMER',
        severity: 'minor',
        message: 'Нет рекомендации проверить актуальность норм или обратиться к специалисту для правового решения.',
      });
    }
  }

  const weightedError = issues.reduce((sum, issue) => sum + severityWeight[issue.severity], 0);
  const errorRate = Math.min(100, weightedError);

  return {
    errorRate,
    score: 100 - errorRate,
    issues,
  };
}

export function formatAuditIssues(issues: AuditIssue[]): string {
  if (issues.length === 0) return 'Ошибок не найдено.';

  return issues
    .map(issue => `- ${issue.code}: ${issue.message}`)
    .join('\n');
}
