export interface WorkedExample {
  problem: string;
  steps: string[];
}

export interface Lesson {
  explanation: string;
  workedExample: WorkedExample;
  misconceptionWarning: string;
}

export interface Concept {
  id: string;
  name: string;
  prerequisites: string[];
  lesson: Lesson;
  /** True for a concept that only appears in a user's graph once injected as a remedial node. */
  remedialOnly?: boolean;
}

export interface Misconception {
  id: string;
  conceptId: string;
  name: string;
  microExplanation: string;
  remedialConceptId: string | null;
}

export interface McqOption {
  id: string;
  text: string;
  correct: boolean;
  misconceptionId: string | null;
}

export interface McqQuestion {
  id: string;
  conceptId: string;
  gameType: "mcq";
  difficulty: 1 | 2 | 3;
  prompt: string;
  options: McqOption[];
}

export interface SequenceQuestion {
  id: string;
  conceptId: string;
  gameType: "sequence";
  difficulty: 1 | 2 | 3;
  prompt: string;
  items: string[];
  correctOrder: number[];
}

export type Question = McqQuestion | SequenceQuestion;

export interface ContentPack {
  subject: string;
  concepts: Concept[];
  misconceptions: Misconception[];
  questions: Question[];
}
