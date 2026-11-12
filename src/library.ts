/**
 * library.ts
 * What: tells the OpenUI CLI which component library our agent may use.
 * Why: `npm run spec` reads this file and writes a description of every
 * component (src/generated/spec.json). Gateway uses that description.
 * We use OpenUI's built-in library: charts, tables, forms, buttons and more.
 */
export {
  openuiLibrary as library,
  openuiPromptOptions as promptOptions,
} from "@openuidev/react-ui/genui-lib";