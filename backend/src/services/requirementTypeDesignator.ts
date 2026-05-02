import type { RequirementType, TypeCriteriaResult } from "../models/requirements";

/** Criteria labels per requirement type (what is needed for each) */
export const REQUIREMENT_TYPE_CRITERIA: Record<RequirementType, string[]> = {
  functional: [
    "Define what the system shall do (capability or behavior)",
    "Use \"shall\" for mandatory statements",
    "Be solution independent (unless allocated to lower level)",
    "Describe input, action, and output where applicable",
    "Include triggering conditions if required",
    "Be singular and atomic",
    "Be clear and unambiguous",
    "Be verifiable by test, inspection, or analysis (numeric values not required for pure behavior)",
    "Be traceable to stakeholder need",
  ],
  performance: [
    "Define how well a function is performed",
    "Include a measurable metric",
    "Include a numeric value",
    "Include units",
    "Include tolerance or bounds (min/max)",
    "Define operating conditions if applicable",
    "Be verifiable by test or analysis",
    "Be traceable to functional requirement or stakeholder need",
  ],
  interface: [
    "Identify both interfacing entities",
    "Define interface medium (physical, electrical, logical, data)",
    "Specify data content and format",
    "Specify timing, rate, or synchronization requirements",
    "Define signal characteristics or protocol",
    "Avoid ambiguity in responsibility",
    "Be verifiable",
    "Be traceable to architecture or system context",
  ],
  constraint: [
    "Restrict design space or implementation",
    "Clearly state imposed limitation",
    "Reference governing source when applicable (standard, policy, legacy system)",
    "Be explicitly bounded",
    "Not restate functional behavior",
    "Be verifiable",
    "Be traceable to source authority",
  ],
  safety: [
    "Traceable to hazard analysis or risk assessment",
    "Identify hazardous condition",
    "Define required mitigation or safe state",
    "Include detection and response requirements if applicable",
    "Include measurable thresholds where applicable",
    "Be verifiable",
    "Align with applicable safety standard",
  ],
  derived: [
    "Not directly stated by stakeholder",
    "Derived from analysis, decomposition, or design decisions",
    "Traceable to parent requirement or analysis artifact",
    "Justified and documented",
    "Do not introduce unintended scope",
    "Be verifiable",
  ],
  cybersecurity: [
    "Traceable to threat analysis or risk assessment",
    "Define protection, detection, response, or recovery action",
    "Include measurable or testable criteria",
    "Specify applicable security controls",
    "Avoid vague terms (secure, protected, robust)",
    "Be verifiable",
    "Align with applicable cybersecurity standard",
  ],
  verification: [
    "Identify verification method (test, analysis, inspection, demonstration)",
    "Define acceptance criteria",
    "Identify verification level (unit, subsystem, system)",
    "Be traceable to requirement being verified",
    "Be objective and measurable",
  ],
  environmental: [
    "Define operating and/or storage conditions",
    "Include measurable limits",
    "Include units",
    "Include duration where applicable",
    "Distinguish operating vs survival conditions",
    "Be verifiable",
    "Traceable to stakeholder or regulatory source",
  ],
  regulatory: [
    "Reference applicable law, regulation, or standard",
    "Avoid paraphrasing legal language when possible",
    "Be traceable to compliance matrix",
    "Identify scope of applicability",
    "Be verifiable by compliance evidence",
  ],
};

const unitRegex =
  /\b\d+(?:\.\d+)?\s*(ms|s|sec|hz|%|v|a|w|kw|bar|psi|c|°c|mm|m|in|kg|lb|kb|mb|gb)\b/i;
const minMaxRegex = /\b(min|max|minimum|maximum|tolerance|±|range)\b/i;

/** Keyword/pattern hints per type for classification */
function scoreType(text: string, lower: string): Partial<Record<RequirementType, number>> {
  const scores: Partial<Record<RequirementType, number>> = {};
  if (/\bshall\b/i.test(text) && !unitRegex.test(text) && !minMaxRegex.test(text)) {
    scores.functional = (scores.functional ?? 0) + 3;
  }
  if (/\b(memory|ram|cpu|latency|response time|throughput|accuracy|efficiency)\b/i.test(text)) {
    scores.performance = (scores.performance ?? 0) + 2;
  }
  if (unitRegex.test(text) && minMaxRegex.test(text)) scores.performance = (scores.performance ?? 0) + 2;
  if (unitRegex.test(text)) scores.performance = (scores.performance ?? 0) + 1;
  if (/\b(interface|protocol|signal|data format|api|message|communication)\b/i.test(text)) {
    scores.interface = (scores.interface ?? 0) + 2;
  }
  if (/\b(between\s+\w+\s+and\s+\w+|connector|electrical|physical)\b/i.test(text)) {
    scores.interface = (scores.interface ?? 0) + 1;
  }
  if (/\b(constraint|shall not exceed|limit|maximum|minimum|within)\b/i.test(text)) {
    scores.constraint = (scores.constraint ?? 0) + 1;
  }
  if (/\b(standard|policy|legacy|comply|per\s+[A-Z][a-z]+)\b/i.test(text) && !/regulatory|regulation|law/i.test(text)) {
    scores.constraint = (scores.constraint ?? 0) + 2;
  }
  if (/\b(safety|hazard|risk|fail-safe|safe state|sil|asil|mitigation|malfunction)\b/i.test(text)) {
    scores.safety = (scores.safety ?? 0) + 3;
  }
  if (/\b(derived|decomposition|allocated|parent requirement)\b/i.test(text)) {
    scores.derived = (scores.derived ?? 0) + 2;
  }
  if (/\b(security|cyber|authentication|encryption|access control|threat)\b/i.test(text)) {
    scores.cybersecurity = (scores.cybersecurity ?? 0) + 3;
  }
  if (/\b(verification|test|inspection|demonstration|analysis\s+shall)\b/i.test(text)) {
    scores.verification = (scores.verification ?? 0) + 2;
  }
  if (/\b(acceptance criteria|verify that|verified by)\b/i.test(text)) {
    scores.verification = (scores.verification ?? 0) + 1;
  }
  if (/\b(temperature|humidity|vibration|ip\s*rating|operating environment|storage|°c)\b/i.test(text)) {
    scores.environmental = (scores.environmental ?? 0) + 2;
  }
  if (/\b(regulatory|regulation|compliance|law|standard\s+[A-Z]{2,})\b/i.test(text)) {
    scores.regulatory = (scores.regulatory ?? 0) + 2;
  }
  return scores;
}

function evaluateFunctional(text: string, lower: string): TypeCriteriaResult {
  const met: string[] = [];
  const missing: string[] = [];
  const c = REQUIREMENT_TYPE_CRITERIA.functional;
  if (/\bshall\b/i.test(text)) met.push(c[1]!); else missing.push(c[1]!);
  if (text.split(/\s+/).length <= 25 && (text.match(/\bshall\b/gi) ?? []).length <= 1) met.push(c[5]!); else missing.push(c[5]!);
  if (!/\b(it|they|this|that)\s+(shall|must)/i.test(text)) met.push(c[6]!); else missing.push(c[6]!);
  if (/\bshall\b/i.test(text)) met.push(c[7]!); else missing.push(c[7]!);
  if (/REQ|SR|ID|trace/i.test(text) || text.length > 10) met.push(c[8]!); else missing.push(c[8]!);
  c.forEach((crit) => {
    if (!met.includes(crit) && !missing.includes(crit)) missing.push(crit);
  });
  return { met: [...new Set(met)], missing: [...new Set(missing)].filter((m) => !met.includes(m)) };
}

function evaluatePerformance(text: string): TypeCriteriaResult {
  const met: string[] = [];
  const missing: string[] = [];
  const c = REQUIREMENT_TYPE_CRITERIA.performance;
  if (/\d+(?:\.\d+)?/.test(text)) met.push(c[2]!); else missing.push(c[2]!);
  if (unitRegex.test(text)) met.push(c[3]!); else missing.push(c[3]!);
  if (minMaxRegex.test(text) || /tolerance|±|range/i.test(text)) met.push(c[4]!); else missing.push(c[4]!);
  c.forEach((crit) => {
    if (!met.includes(crit) && !missing.includes(crit)) missing.push(crit);
  });
  return { met: [...new Set(met)], missing: [...new Set(missing)].filter((m) => !met.includes(m)) };
}

function evaluateInterface(text: string): TypeCriteriaResult {
  const met: string[] = [];
  const missing: string[] = [];
  const c = REQUIREMENT_TYPE_CRITERIA.interface;
  if (/\b(between|from\s+\w+\s+to|interface|protocol|signal|data)\b/i.test(text)) met.push(c[0]!); else missing.push(c[0]!);
  if (/\b(physical|electrical|logical|data|message)\b/i.test(text)) met.push(c[1]!); else missing.push(c[1]!);
  c.forEach((crit) => {
    if (!met.includes(crit) && !missing.includes(crit)) missing.push(crit);
  });
  return { met: [...new Set(met)], missing: [...new Set(missing)].filter((m) => !met.includes(m)) };
}

function evaluateConstraint(text: string): TypeCriteriaResult {
  const met: string[] = [];
  const missing: string[] = [];
  const c = REQUIREMENT_TYPE_CRITERIA.constraint;
  if (/\b(shall not exceed|limit|maximum|minimum|within|per\s+)\b/i.test(text)) met.push(c[0]!); else missing.push(c[0]!);
  if (/\b(standard|policy|ISO|IEC|per)\b/i.test(text)) met.push(c[2]!); else missing.push(c[2]!);
  c.forEach((crit) => {
    if (!met.includes(crit) && !missing.includes(crit)) missing.push(crit);
  });
  return { met: [...new Set(met)], missing: [...new Set(missing)].filter((m) => !met.includes(m)) };
}

function evaluateSafety(text: string): TypeCriteriaResult {
  const met: string[] = [];
  const missing: string[] = [];
  const c = REQUIREMENT_TYPE_CRITERIA.safety;
  if (/\b(hazard|fail-safe|safe state|mitigation|detect|response)\b/i.test(text)) met.push(c[1]!); else missing.push(c[1]!);
  if (/\b(sil|asil|iec\s*61508|iso\s*26262)\b/i.test(text)) met.push(c[6]!); else missing.push(c[6]!);
  if (/\d+/.test(text) && unitRegex.test(text)) met.push(c[4]!); else missing.push(c[4]!);
  c.forEach((crit) => {
    if (!met.includes(crit) && !missing.includes(crit)) missing.push(crit);
  });
  return { met: [...new Set(met)], missing: [...new Set(missing)].filter((m) => !met.includes(m)) };
}

function evaluateDerived(text: string): TypeCriteriaResult {
  const missing = [...REQUIREMENT_TYPE_CRITERIA.derived];
  const met: string[] = [];
  if (/\b(derived|decomposition|allocated)\b/i.test(text)) met.push(REQUIREMENT_TYPE_CRITERIA.derived[0]!);
  return { met, missing: missing.filter((m) => !met.includes(m)) };
}

function evaluateCybersecurity(text: string): TypeCriteriaResult {
  const met: string[] = [];
  const missing: string[] = [];
  const c = REQUIREMENT_TYPE_CRITERIA.cybersecurity;
  if (/\b(authentication|encryption|access control|detection|response)\b/i.test(text)) met.push(c[1]!); else missing.push(c[1]!);
  if (/\d+/.test(text) || /(shall|must)\s+\w+/i.test(text)) met.push(c[2]!); else missing.push(c[2]!);
  c.forEach((crit) => {
    if (!met.includes(crit) && !missing.includes(crit)) missing.push(crit);
  });
  return { met: [...new Set(met)], missing: [...new Set(missing)].filter((m) => !met.includes(m)) };
}

function evaluateVerification(text: string): TypeCriteriaResult {
  const met: string[] = [];
  const missing: string[] = [];
  const c = REQUIREMENT_TYPE_CRITERIA.verification;
  if (/\b(test|inspection|demonstration|analysis)\b/i.test(text)) met.push(c[0]!); else missing.push(c[0]!);
  if (/\b(acceptance|pass|fail|criteria)\b/i.test(text)) met.push(c[1]!); else missing.push(c[1]!);
  if (/\b(unit|subsystem|system|integration)\b/i.test(text)) met.push(c[2]!); else missing.push(c[2]!);
  c.forEach((crit) => {
    if (!met.includes(crit) && !missing.includes(crit)) missing.push(crit);
  });
  return { met: [...new Set(met)], missing: [...new Set(missing)].filter((m) => !met.includes(m)) };
}

function evaluateEnvironmental(text: string): TypeCriteriaResult {
  const met: string[] = [];
  const missing: string[] = [];
  const c = REQUIREMENT_TYPE_CRITERIA.environmental;
  if (/\b(temperature|humidity|vibration|ip|operating|storage)\b/i.test(text)) met.push(c[0]!); else missing.push(c[0]!);
  if (unitRegex.test(text)) met.push(c[2]!); else missing.push(c[2]!);
  c.forEach((crit) => {
    if (!met.includes(crit) && !missing.includes(crit)) missing.push(crit);
  });
  return { met: [...new Set(met)], missing: [...new Set(missing)].filter((m) => !met.includes(m)) };
}

function evaluateRegulatory(text: string): TypeCriteriaResult {
  const met: string[] = [];
  const missing: string[] = [];
  const c = REQUIREMENT_TYPE_CRITERIA.regulatory;
  if (/\b(standard|regulation|compliance|law|iso|iec|en)\b/i.test(text)) met.push(c[0]!); else missing.push(c[0]!);
  c.forEach((crit) => {
    if (!met.includes(crit) && !missing.includes(crit)) missing.push(crit);
  });
  return { met: [...new Set(met)], missing: [...new Set(missing)].filter((m) => !met.includes(m)) };
}

export function classifyRequirementType(text: string): {
  type: RequirementType;
  criteria: TypeCriteriaResult;
} {
  const lower = text.toLowerCase();
  const scores = scoreType(text, lower);
  const types: RequirementType[] = [
    "functional",
    "performance",
    "interface",
    "constraint",
    "safety",
    "derived",
    "cybersecurity",
    "verification",
    "environmental",
    "regulatory",
  ];
  let best: RequirementType = "functional";
  let bestScore = 0;
  for (const t of types) {
    const s = scores[t] ?? 0;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }

  const evaluators: Record<RequirementType, () => TypeCriteriaResult> = {
    functional: () => evaluateFunctional(text, lower),
    performance: () => evaluatePerformance(text),
    interface: () => evaluateInterface(text),
    constraint: () => evaluateConstraint(text),
    safety: () => evaluateSafety(text),
    derived: () => evaluateDerived(text),
    cybersecurity: () => evaluateCybersecurity(text),
    verification: () => evaluateVerification(text),
    environmental: () => evaluateEnvironmental(text),
    regulatory: () => evaluateRegulatory(text),
  };

  const criteria = evaluators[best]!();
  return { type: best, criteria };
}
