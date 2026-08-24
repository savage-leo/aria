export type { Goal, GoalArchive, GoalOrigin, GoalProgress, GoalStatus } from "./types.js";
export {
  appendGoal,
  findDuplicateGoal,
  loadGoalArchive,
  resolveGoalArchivePath,
  saveGoalArchive,
} from "./archive.js";
export { evaluateDomain, domainStats } from "./competence.js";
export { evaluateInterestingness, isGenericChore, restatesHeartbeat } from "./interestingness.js";
export {
  proposeAutotelicGoal,
  type ProposeAutotelicInput,
  type ProposeAutotelicResult,
} from "./propose.js";
export {
  runAutotelicTick,
  buildAutotelicPromptBlock,
  type AutotelicTickResult,
} from "./tick.js";
export { intentsMatch, normalizeIntent, tagDomain, tokenOverlap } from "./text.js";
