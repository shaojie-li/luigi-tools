import type { Rule } from "eslint";

// ESLint's ESTree types do not include TypeScript expressions. Read only the
// small shared AST shape needed here; visitorKeys also covers TS wrappers.
interface AstNode {
  type: string;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  [key: string]: unknown;
}

function asNode(value: unknown): AstNode | undefined {
  return typeof value === "object" && value !== null && "type" in value
    ? (value as AstNode)
    : undefined;
}

function identifier(value: unknown): string | undefined {
  const node = asNode(value);
  return node?.type === "Identifier" && typeof node.name === "string"
    ? node.name
    : undefined;
}

const pascalCase = /^[A-Z][A-Za-z0-9]*$/;
const functions = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

export const reactNaming: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: { description: "约束 React 组件、文件和拆分组件入口的命名" },
    schema: [],
    messages: {
      filename:
        "React 文件应使用 PascalCase（如 TaskDialog.tsx）；仅 index.tsx 和 main.tsx 为入口例外。",
      folder: "React 源码目录「{{name}}」必须以小写字母开头。",
      component: "组件「{{name}}」必须使用 PascalCase（如 TaskDialog）。",
      entry:
        "组件目录「{{folder}}」的 index.tsx 应导出同名组件「{{expected}}」。",
      anonymous: "默认导出的组件必须有明确的 PascalCase 名称，便于调试和重构。",
      bootstrap:
        "main.tsx 只作为启动入口，请将组件定义移到 PascalCase 文件或组件目录中。",
    },
  },
  create(context) {
    const parts = context.filename.replaceAll("\\", "/").split("/");
    const filename = parts.at(-1) ?? "";
    if (!/\.[jt]sx$/.test(filename)) {
      return {};
    }
    const basename = filename.split(".")[0] ?? "";
    const isIndex = /^index\.[jt]sx$/.test(filename);
    const isMain = /^main\.[jt]sx$/.test(filename);
    const folder = parts.at(-2) ?? "";
    const expected = folder.charAt(0).toUpperCase() + folder.slice(1);

    function children(node: AstNode): AstNode[] {
      return (context.sourceCode.visitorKeys[node.type] ?? []).flatMap(
        (key) => {
          const value = node[key];
          return (Array.isArray(value) ? value : [value]).flatMap(
            (child: unknown) => {
              const found = asNode(child);
              return found ? [found] : [];
            },
          );
        },
      );
    }

    function hasJsx(node: AstNode): boolean {
      return (
        ["JSXElement", "JSXFragment"].includes(node.type) ||
        children(node).some(hasJsx)
      );
    }

    function returnsJsx(node: AstNode): boolean {
      if (node.type === "ReturnStatement") {
        const argument = asNode(node.argument);
        return argument !== undefined && hasJsx(argument);
      }
      // A nested callback returning JSX does not turn its outer function into a component.
      return !functions.has(node.type) && children(node).some(returnsJsx);
    }

    function componentValue(node: AstNode | undefined): boolean {
      if (!node) {
        return false;
      }
      if (
        [
          "TSAsExpression",
          "TSSatisfiesExpression",
          "TSNonNullExpression",
        ].includes(node.type)
      ) {
        return componentValue(asNode(node.expression));
      }
      if (functions.has(node.type)) {
        const body = asNode(node.body);
        return (
          body !== undefined &&
          (body.type === "BlockStatement" ? returnsJsx(body) : hasJsx(body))
        );
      }
      if (node.type === "CallExpression") {
        const callee = asNode(node.callee);
        const name = identifier(callee) ?? identifier(callee?.property);
        return name === "memo" || name === "forwardRef";
      }
      if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
        const parent = asNode(node.superClass);
        const name = identifier(parent) ?? identifier(parent?.property);
        return name === "Component" || name === "PureComponent";
      }
      return false;
    }

    return {
      Program(program) {
        const root = program as unknown as AstNode;
        if (!isIndex && !isMain && !pascalCase.test(basename)) {
          context.report({ node: root, messageId: "filename" });
        }
        const src = parts.lastIndexOf("src");
        for (const name of src < 0 ? [] : parts.slice(src + 1, -1)) {
          if (!/^[a-z]/.test(name)) {
            context.report({ node: root, messageId: "folder", data: { name } });
          }
        }

        const declarations = new Map<string, AstNode>();
        const exports: { local: string; publicName: string; node: AstNode }[] =
          [];
        let anonymousDefault: AstNode | undefined;
        for (const statement of children(root)) {
          const exported = [
            "ExportNamedDeclaration",
            "ExportDefaultDeclaration",
          ].includes(statement.type);
          const declaration = exported
            ? asNode(statement.declaration)
            : statement;
          if (declaration?.type === "VariableDeclaration") {
            for (const item of children(declaration)) {
              const name = identifier(item.id);
              const value = asNode(item.init);
              if (name && value) {
                declarations.set(name, value);
                if (exported) {
                  exports.push({ local: name, publicName: name, node: item });
                }
              }
            }
          } else if (declaration) {
            const name = identifier(declaration.id) ?? identifier(declaration);
            if (name) {
              if (declaration.type !== "Identifier") {
                declarations.set(name, declaration);
              }
              if (exported) {
                exports.push({
                  local: name,
                  publicName: name,
                  node: declaration,
                });
              }
            } else if (
              statement.type === "ExportDefaultDeclaration" &&
              componentValue(declaration)
            ) {
              anonymousDefault = declaration;
            }
          }
          if (statement.type === "ExportNamedDeclaration") {
            for (const specifier of children(statement).filter(
              (node) => node.type === "ExportSpecifier",
            )) {
              const local = identifier(specifier.local);
              const publicName = identifier(specifier.exported);
              if (
                local &&
                publicName &&
                specifier.exportKind !== "type" &&
                statement.exportKind !== "type"
              ) {
                exports.push({
                  local,
                  publicName: publicName === "default" ? local : publicName,
                  node: specifier,
                });
              }
            }
          }
        }

        if (anonymousDefault) {
          context.report({ node: anonymousDefault, messageId: "anonymous" });
        }
        let hasComponentExport = false;
        let hasExpectedExport = false;
        const checked = new Set<string>();
        for (const entry of exports) {
          // An uppercase re-export may be a component; imported bodies deliberately
          // aren't resolved, so the entry check stays local and deterministic.
          if (
            !componentValue(declarations.get(entry.local)) &&
            !(
              isIndex &&
              !declarations.has(entry.local) &&
              pascalCase.test(entry.local)
            )
          ) {
            continue;
          }
          hasComponentExport = true;
          hasExpectedExport ||= entry.publicName === expected;
          for (const name of new Set([entry.local, entry.publicName])) {
            if (!pascalCase.test(name) && !checked.has(name)) {
              context.report({
                node: entry.node,
                messageId: "component",
                data: { name },
              });
              checked.add(name);
            }
          }
        }
        if (isIndex && hasComponentExport && !hasExpectedExport) {
          context.report({
            node: root,
            messageId: "entry",
            data: { folder, expected },
          });
        }
        if (
          isMain &&
          (anonymousDefault || [...declarations.values()].some(componentValue))
        ) {
          context.report({ node: root, messageId: "bootstrap" });
        }
      },
    };
  },
};
