import type { ApcSelfReported, FactorId, GoalType } from './types.js';

/**
 * Configuración del motor: pesos, umbrales y plantillas de misiones.
 * Es DATO, no lógica: en producción se carga desde la base de datos
 * (versionada) y se pasa a las funciones del motor.
 */
export interface GoalRecipe {
  /** Peso de cada factor. 0 = no aplica a esta meta. */
  weights: Record<FactorId, number>;
  /** DTI (con la nueva cuota) que da puntaje 1. */
  dtiGood: number;
  /** DTI a partir del cual el puntaje es 0. */
  dtiMax: number;
  /** Meses de antigüedad laboral que dan puntaje 1. */
  employmentMonthsTarget: number;
  /** Puntaje por historial APC autodeclarado. */
  apcScores: Record<ApcSelfReported, number>;
  /** Abono por defecto (%) si el catálogo no trae uno. */
  defaultDownPaymentPct: number;
  /** Plazo por defecto (meses) para estimar cuota. */
  defaultTermMonths: number;
  /** Pesos del ranking de productos. */
  rankingWeights: { cost: number; eligibility: number; benefits: number; affordability: number };
}

export interface EngineConfig {
  version: string;
  /** Un factor con puntaje menor genera un freno. */
  obstacleThreshold: number;
  /** Índice mínimo para "listo para comparar". */
  readyThreshold: number;
  maxObstaclesShown: number;
  topN: number;
  /** % del ingreso que se reserva como colchón al calcular capacidad de pago. */
  bufferPctOfIncome: number;
  /** Utilización de tarjetas que da puntaje 1 / 0. */
  utilizationGood: number;
  utilizationMax: number;
  goals: Record<GoalType, GoalRecipe>;
  /** Misiones sugeridas por factor (plantillas en español de Panamá). */
  missionTemplates: Record<FactorId, string[]>;
  /** Objetivo del mes cuando el freno principal es este factor. */
  objectiveTemplates: Record<FactorId, string> & { ready: string };
}

// Escala de la tabla del spec: Bajo=1, Medio=2, Alto=3, Muy alto=4.
const BAJO = 1, MEDIO = 2, ALTO = 3, MUY_ALTO = 4;

export const defaultConfig: EngineConfig = {
  version: 'weights-2026-10-v1',
  obstacleThreshold: 0.7,
  readyThreshold: 70,
  maxObstaclesShown: 4,
  topN: 3,
  bufferPctOfIncome: 0.1,
  utilizationGood: 0.3,
  utilizationMax: 0.9,
  goals: {
    credit_card: {
      weights: {
        income: ALTO, dti: MEDIO, employment: MEDIO, apc: ALTO,
        down_payment: 0, utilization: MEDIO, documents: BAJO,
      },
      dtiGood: 0.3,
      dtiMax: 0.5,
      employmentMonthsTarget: 6,
      apcScores: { good: 1, fair: 0.6, none: 0.6, unknown: 0.5, poor: 0.1 },
      defaultDownPaymentPct: 0,
      defaultTermMonths: 0,
      rankingWeights: { cost: 0.35, eligibility: 0.3, benefits: 0.35, affordability: 0 },
    },
    auto_loan: {
      weights: {
        income: ALTO, dti: ALTO, employment: ALTO, apc: ALTO,
        down_payment: ALTO, utilization: MEDIO, documents: MEDIO,
      },
      dtiGood: 0.3,
      dtiMax: 0.5,
      employmentMonthsTarget: 12,
      apcScores: { good: 1, fair: 0.6, none: 0.4, unknown: 0.4, poor: 0.05 },
      defaultDownPaymentPct: 10,
      defaultTermMonths: 72,
      rankingWeights: { cost: 0.4, eligibility: 0.25, benefits: 0.05, affordability: 0.3 },
    },
    mortgage: {
      weights: {
        income: ALTO, dti: MUY_ALTO, employment: ALTO, apc: MUY_ALTO,
        down_payment: MUY_ALTO, utilization: ALTO, documents: ALTO,
      },
      dtiGood: 0.3,
      dtiMax: 0.45,
      employmentMonthsTarget: 24,
      apcScores: { good: 1, fair: 0.5, none: 0.3, unknown: 0.3, poor: 0.0 },
      defaultDownPaymentPct: 10,
      defaultTermMonths: 360,
      rankingWeights: { cost: 0.45, eligibility: 0.25, benefits: 0.0, affordability: 0.3 },
    },
  },
  objectiveTemplates: {
    income: 'Documentar todos tus ingresos comprobables',
    dti: 'Bajar tus pagos de deuda frente a tu ingreso',
    employment: 'Completar la antigüedad laboral que piden los bancos',
    apc: 'Mejorar y verificar tu historial de crédito',
    down_payment: 'Ahorrar para el abono',
    utilization: 'Bajar el uso de tus tarjetas a menos del 30% del límite',
    documents: 'Tener listos tus documentos para aplicar',
    ready: 'Comparar las mejores opciones y elegir dónde aplicar',
  },
  missionTemplates: {
    income: [
      'Reúne tus últimos 3 talonarios o tu ficha de la CSS',
      'Si tienes ingresos extra comprobables, documéntalos',
    ],
    dti: [
      'Abona extra a la deuda con la cuota más alta',
      'Evita tomar nuevas deudas este mes',
    ],
    employment: [
      'Pide una carta de trabajo con fecha de ingreso y salario',
      'Si cambiaste de empleo hace poco, espera a cumplir la antigüedad mínima',
    ],
    apc: [
      'Solicita tu propio reporte de historial de crédito',
      'Ponte al día con cualquier pago atrasado',
    ],
    down_payment: [
      'Separa un monto fijo semanal para el abono',
      'Abre una cuenta de ahorro exclusiva para la meta',
    ],
    utilization: [
      'Baja el saldo de tus tarjetas por debajo del 30% del límite',
      'Paga la tarjeta antes de la fecha de corte',
    ],
    documents: [
      'Pide tu carta de trabajo',
      'Descarga tu ficha de la CSS',
      'Solicita tu reporte de historial de crédito',
    ],
  },
};
