import type { CreateTestStepInput } from "@/types";

export interface DraftStep extends CreateTestStepInput {
  /** Client-side key so React keys stay stable on reorder. */
  _id: string;
}

let _nextId = 0;
export const nextId = () => ++_nextId;
export const newDraftStep = (): DraftStep => ({
  _id: String(nextId()),
  action: "",
  data: "",
  result: "",
});
