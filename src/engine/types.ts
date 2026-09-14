export type Person = "A" | "B";
export type Domain = "study" | "craft";
export type Work = "reduced" | "normal" | "heavy";
export interface Allocation {
  work: Work;
  care: number;
  bond: number;
  rest: number;
  self: number;
}
export interface Plan {
  parents: Record<Person, Allocation>;
  activity: { domain: Domain | "none"; level: number; sponsor: Person };
  style: "respect" | "coach" | "push";
  help: "none" | "grand" | "paid";
}
export interface Parent {
  age_months: number;
  stress: number;
  health: number;
  fulfillment: number;
  social: number;
  regret: number;
}
export interface Child {
  trust: Record<Person, number>;
  stress: number;
  autonomy: number;
  interest: Record<Domain, number>;
  ability: Record<Domain, number>;
  aptitude: Record<Domain, number>;
  adaptation: number;
}
export interface Observation {
  code: string;
  subject: string;
  text: string;
}
export interface GameEvent {
  instance_id: string;
  event_id: string;
  text: string;
  target: Domain;
}
export type EventOption = [
  id: string,
  label: string,
  cost: number,
  effects: Record<string, number | string>,
];
export type EventData = [text: string, options: EventOption[]];
export interface Reason {
  code: string;
  path: string;
  message: string;
}
export interface Forecast {
  income: number;
  cost: number;
  projected_cash: number;
  time_used: Record<Person, number>;
  time_limit: number;
  care_required: number;
  care_allocated: number;
  can_advance: boolean;
  reasons: Reason[];
  uncertain_expense_cap: number;
  fallback_plan: Plan;
}
export interface Money {
  scope: string;
  before: number;
  income: number;
  expense: number;
  cap_overflow: number;
  after: number;
}
export interface ChildResult {
  age: number;
  domain: Domain;
  route: "specialist" | "explorer" | "supported";
  social_success: number;
  residence: "far" | "near";
  happiness: number;
  autonomy: number;
}
export interface ParentResult {
  death_age: number;
  happiness: number;
  axes: {
    relationship: number;
    security: number;
    fulfillment: number;
    child_assurance: number;
    regret: number;
  };
  cash: number;
  health: number;
  label: string;
}
export interface Result {
  parents: Record<Person, ParentResult>;
  child: ChildResult;
  ending: { version: string; id: string; title: string; text: string };
  story: string[];
}
export interface History {
  index: number;
  kind: "turn" | "adult";
  turn: number | null;
  adult_step: number | null;
  ages: { child_months: number; A_months: number; B_months: number };
  actions: { plan: Plan; answers: { event_instance: string; option_id: string }[] } | null;
  events: { instance_id: string; event_id: string; option_id: string | null; text: string }[];
  money: Money[];
  observations: Observation[];
  text: string[];
  related: string[];
  adult_result: {
    alive: Record<Person, boolean>;
    parents: Record<Person, ParentResult | null>;
    child: ChildResult;
  } | null;
}
export interface NumericState {
  cash: number;
  parents: Record<Person, Parent>;
  couple: number;
  child: Child;
  grandparents: { health: number; relation: number; funds: number; network: boolean };
}
export interface State extends NumericState {
  versions: { rules: string; data: string; save: string };
  scenario: string;
  seed: number;
  phase: "childhood" | "finished";
  /** 育児編の確定済みターン数（0〜40）。save-2との互換性のためキー名を維持する。 */
  n: number;
  plan: Plan;
  previous_plan: Plan;
  answers: Record<string, string>;
  events: GameEvent[];
  seen: Record<string, number>;
  queue: { id: string; due_turn: number; source: string; target: Domain }[];
  history: History[];
  draws: { phase: string; index: number; slot: string; value: number }[];
  effects: { turn: number; before: NumericState; after: NumericState }[];
  deltas: number[];
  changed: boolean;
  paused: boolean;
  last_repair: boolean;
  repaired: boolean;
  oddity_count: number;
  observations: Observation[];
  result: Result | null;
}
export interface PublicState {
  versions: State["versions"];
  time: {
    completed_turns: number;
    next_turn: number | null;
    child_months: number;
    season: string | null;
    stage: string | null;
    school_label: string | null;
  };
  cash: number | null;
  parents: State["parents"];
  couple: number;
  grandparents: State["grandparents"];
  observations: Observation[];
  plan: Plan | null;
  answers: { event_instance: string; option_id: string }[];
  forecast: Forecast | null;
}
export interface Choice {
  instance_id: string;
  event_id: string;
  text: string;
  options: {
    option_id: string;
    label: string;
    cost: number;
    income: number;
    available: boolean;
    reasons: Reason[];
  }[];
}
