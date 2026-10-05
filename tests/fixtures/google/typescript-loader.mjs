import ts from "typescript";
export default function typescriptLoader(source) {
  return ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: this.resourcePath,
  }).outputText;
}
