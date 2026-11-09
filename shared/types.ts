export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";

export interface Profile {
  name: string;
  sex: Sex;
  birthDate: string; // YYYY-MM-DD
  heightCm: number;
  activity: Activity;
  currentWeightKg: number;
  targetWeightKg: number;
  targetDate: string; // YYYY-MM-DD
  /** Days of week with higher consumption, 0 = Sunday ... 6 = Saturday */
  highDays: number[];
  /** How much more a "high" day gets compared to a regular day, in percent */
  highDayBoostPct: number;
  /** 0 = Sunday, 1 = Monday, 6 = Saturday */
  weekStartsOn: number;
  /** Safety floor for any single day */
  minCalories: number;
}

export interface Nutrients {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
}

export type FoodSource = "loseit-food" | "loseit-recipe" | "manual";

/** An item in the personal library (custom foods & recipes). Nutrients are per serving. */
export interface Food extends Nutrients {
  id: string;
  name: string;
  brand?: string;
  source: FoodSource;
  servingAmount: number;
  servingUnit: string;
  servingGrams?: number;
}

export type EntrySource = "user" | "library" | "web" | "reference" | "manual";

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export interface Entry extends Nutrients {
  id: string;
  date: string; // YYYY-MM-DD
  meal?: Meal;
  name: string;
  amount: number;
  unit: string;
  source: EntrySource;
  sourceNote?: string;
  createdAt: string;
}

export type NewEntry = Omit<Entry, "id" | "createdAt">;

export interface WeightLog {
  date: string;
  kg: number;
}

export interface ParsedItem extends Nutrients {
  name: string;
  amount: number;
  unit: string;
  meal: Meal | null;
  source: Exclude<EntrySource, "manual">;
  sourceNote: string;
}

export interface ParseResult {
  items: ParsedItem[];
  notes: string;
}

export interface AppState {
  profile: Profile | null;
  weights: WeightLog[];
  foodsCount: number;
  aiEnabled: boolean;
  /** How food text is parsed: through claude.ai, with the user's API key, or not at all. */
  ai: "claude" | "apikey" | null;
  /** Where data is stored: the claude.ai artifact database, or this browser. */
  storage: "cloud" | "local";
}
